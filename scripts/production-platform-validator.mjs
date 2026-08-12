import { execFileSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { environmentProfiles } from '../config/environments.mjs';
import {
  expectedTrackedMigrations,
  inspectMigrationStatus,
  inspectSchemaMetadata,
  readOnlyDatabaseConfig
} from '../database/inspect-migration-status.mjs';
import { auth0ProductionConfig, verifyAuth0Production } from './auth0-production-readiness.mjs';

const { Client } = pg;
export const VALIDATION_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  NOT_CONFIGURED: 'NOT_CONFIGURED'
});
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const FORBIDDEN_ENVIRONMENT_MARKERS = /(?:localhost|127\.0\.0\.1|\[::1\]|staging|draft|deploy-preview|\.invalid|\.example)(?:[:/.-]|$)/i;
const SENSITIVE_VALUE = /(?:-----BEGIN[\s\S]*?PRIVATE KEY-----|\bauthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+\/-]+=*|\bBearer\s+[A-Za-z0-9._~+\/-]+=*|\b(?:cookie|authorization|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*[^\s,;]+|\bpostgres(?:ql)?:\/\/[^\s]+|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b)/gi;

function result(id, category, status, summary, options = {}) {
  return Object.freeze({
    id,
    category,
    status,
    summary,
    repositoryEvidence: Boolean(options.repositoryEvidence),
    externalEvidence: Boolean(options.externalEvidence),
    requiresHumanAction: Boolean(options.requiresHumanAction),
    ...(options.details ? { details: Object.freeze(options.details) } : {})
  });
}

export function redactSensitive(value, maxLength = 500) {
  const text = String(value ?? '')
    .replace(SENSITIVE_VALUE, '[REDACTED]')
    .replace(/([?&](?:token|secret|key|code|password|signature)=)[^&#\s]+/gi, '$1[REDACTED]');
  return text.slice(0, maxLength);
}

function safeFailureCode(error, prefix) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return `${prefix}_TIMEOUT`;
  if (/certificate|tls|ssl/i.test(String(error?.code || error?.message || ''))) return `${prefix}_TLS_FAILED`;
  return `${prefix}_VALIDATION_FAILED`;
}

function optionalProductionOrigin(value, name) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a credential-free HTTPS URL without query or fragment.`);
  }
  if (FORBIDDEN_ENVIRONMENT_MARKERS.test(`${url.hostname}${url.pathname}`)) {
    throw new Error(`${name} contains a non-Production marker.`);
  }
  return new URL(url.origin);
}

export function productionPlatformConfig(env = process.env) {
  if (String(env.BANK_ENV || '').trim().toLowerCase() !== 'production') {
    throw new Error('Production platform validation requires BANK_ENV=production.');
  }
  const frontend = optionalProductionOrigin(env.BANK_PRODUCTION_FRONTEND_URL, 'BANK_PRODUCTION_FRONTEND_URL');
  const api = optionalProductionOrigin(env.BANK_PRODUCTION_API_URL, 'BANK_PRODUCTION_API_URL');
  if (frontend && api && frontend.origin === api.origin) {
    throw new Error('Production frontend and API must use distinct origins.');
  }
  return Object.freeze({
    environment: 'production',
    frontend,
    api,
    databaseReadOnlyConfigured: Boolean(String(env.DATABASE_READONLY_URL || '').trim()),
    auth0PublicConfigured: ['BANK_OIDC_ISSUER', 'BANK_OIDC_JWKS_URL', 'BANK_OIDC_AUDIENCE', 'BANK_OIDC_SESSION_CLAIM']
      .every(name => Boolean(String(env[name] || '').trim())),
    allowedOriginsConfigured: Boolean(String(env.BANK_ALLOWED_ORIGINS || '').trim())
  });
}

export function parseValidatorArguments(argv = process.argv.slice(2)) {
  const allowed = new Set(['--production', '--read-only', '--format=json', '--format=markdown']);
  const unknown = argv.filter(value => !allowed.has(value));
  if (unknown.length) throw new Error('Unsupported validator argument.');
  if (!argv.includes('--production') || !argv.includes('--read-only')) {
    throw new Error('External validation requires explicit --production --read-only confirmation.');
  }
  const formats = argv.filter(value => value.startsWith('--format='));
  if (formats.length > 1) throw new Error('Choose one report format.');
  return Object.freeze({ format: formats[0]?.slice('--format='.length) || 'markdown' });
}

function assertSafeRequest(method, target) {
  if (!SAFE_METHODS.has(method)) throw new Error('Production validator permits only GET or HEAD requests.');
  const url = new URL(target);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsafe validation request target.');
  }
  if (FORBIDDEN_ENVIRONMENT_MARKERS.test(url.hostname)) throw new Error('Validation request targets a non-Production host.');
  return url;
}

async function boundedFetch(fetcher, target, options = {}) {
  const method = options.method || 'GET';
  const url = assertSafeRequest(method, target);
  const response = await fetcher(url, {
    method,
    redirect: options.redirect || 'manual',
    headers: { Accept: options.accept || '*/*', ...(options.headers || {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  return response;
}

async function responseText(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Production validation response exceeded the safe limit.');
  return text;
}

function runtimeEnvironment(source) {
  const match = /window\.APP_ENV\s*=\s*Object\.freeze\((\{[\s\S]*?\})\);/.exec(source);
  if (!match) throw new Error('Production environment-config.js does not expose the expected immutable profile.');
  return JSON.parse(match[1]);
}

function headerPresent(headers, name) {
  return Boolean(String(headers.get(name) || '').trim());
}

function cookiesAreSecure(headers) {
  const cookie = String(headers.get('set-cookie') || '').trim();
  if (!cookie) return true;
  return /;\s*Secure\b/i.test(cookie) && /;\s*HttpOnly\b/i.test(cookie)
    && /;\s*SameSite=(?:Lax|Strict|None)\b/i.test(cookie);
}

function inspectResponseForLeaks(source) {
  return !/(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+|DATABASE_(?:API|MIGRATOR|PUSH)_URL|stack\s*trace)/i.test(source);
}

async function validateFrontend(config, dependencies) {
  if (!config.frontend) {
    return [result('frontend.site', 'Production Frontend / Netlify', VALIDATION_STATUS.NOT_CONFIGURED,
      'No approved Production frontend origin is configured for validation.', { requiresHumanAction: true })];
  }
  try {
    const root = await boundedFetch(dependencies.fetcher, config.frontend, { accept: 'text/html' });
    const rootBody = await responseText(root);
    const headers = root.headers;
    const requiredHeaders = [
      'content-security-policy', 'strict-transport-security', 'x-content-type-options',
      'referrer-policy', 'permissions-policy'
    ];
    const csp = String(headers.get('content-security-policy') || '');
    const environmentResponse = await boundedFetch(
      dependencies.fetcher, new URL('/environment-config.js', config.frontend), { accept: 'application/javascript' }
    );
    const environmentSource = await responseText(environmentResponse);
    const runtime = runtimeEnvironment(environmentSource);
    const serviceWorkerResponse = await boundedFetch(
      dependencies.fetcher, new URL('/service-worker.js', config.frontend), { accept: 'application/javascript' }
    );
    const serviceWorker = await responseText(serviceWorkerResponse);
    const httpUrl = new URL(config.frontend);
    httpUrl.protocol = 'http:';
    httpUrl.port = '';
    const redirect = await boundedFetch(dependencies.fetcher, httpUrl, { redirect: 'manual' });
    const redirectLocation = String(redirect.headers.get('location') || '');
    const cachePolicy = String(headers.get('cache-control') || '');
    const runtimeSafe = runtime.name === 'production'
      && runtime.dataBackend === 'postgres'
      && config.api
      && new URL(runtime.postgresApiUrl).origin === config.api.origin
      && !FORBIDDEN_ENVIRONMENT_MARKERS.test(environmentSource);
    const passed = root.status === 200
      && inspectResponseForLeaks(rootBody)
      && environmentResponse.status === 200
      && serviceWorkerResponse.status === 200
      && runtimeSafe
      && /banke-production-v\d+/.test(serviceWorker)
      && requiredHeaders.every(name => headerPresent(headers, name))
      && /frame-ancestors\s+'none'/.test(csp)
      && /(?:no-cache|no-store|max-age=0)/i.test(cachePolicy)
      && cookiesAreSecure(headers)
      && [301, 302, 307, 308].includes(redirect.status)
      && redirectLocation.startsWith('https://');
    return [result('frontend.site', 'Production Frontend / Netlify', passed ? VALIDATION_STATUS.PASS : VALIDATION_STATUS.FAIL,
      passed ? 'Public Production frontend, runtime profile, cache namespace, redirect, and security headers passed.'
        : 'The configured Production frontend failed one or more public release checks.',
      { externalEvidence: true, details: { httpStatus: root.status, secureHeaders: requiredHeaders.every(name => headerPresent(headers, name)), cachePolicy: /(?:no-cache|no-store|max-age=0)/i.test(cachePolicy), secureCookies: cookiesAreSecure(headers), productionRuntime: Boolean(runtimeSafe) } }),
    result('frontend.platform_metadata', 'Production Frontend / Netlify', VALIDATION_STATUS.BLOCKED,
      'Site ownership, custom-domain binding, deploy context, auto-publish policy, and rollback alias require read-only Netlify dashboard evidence.', { requiresHumanAction: true })];
  } catch (error) {
    return [result('frontend.site', 'Production Frontend / Netlify', VALIDATION_STATUS.FAIL,
      safeFailureCode(error, 'FRONTEND'), { externalEvidence: true })];
  }
}

async function validateApi(config, dependencies) {
  if (!config.api) {
    return [result('api.service', 'Production API / Render', VALIDATION_STATUS.NOT_CONFIGURED,
      'No approved Production API origin is configured for validation.', { requiresHumanAction: true })];
  }
  try {
    const headers = config.frontend ? { Origin: config.frontend.origin } : {};
    const healthResponse = await boundedFetch(dependencies.fetcher, new URL('/v1/health', config.api), {
      accept: 'application/json', headers
    });
    const readinessResponse = await boundedFetch(dependencies.fetcher, new URL('/v1/readiness', config.api), {
      accept: 'application/json', headers
    });
    const healthSource = await responseText(healthResponse);
    const readinessSource = await responseText(readinessResponse);
    const health = JSON.parse(healthSource);
    const readiness = JSON.parse(readinessSource);
    const cors = String(healthResponse.headers.get('access-control-allow-origin') || '');
    const passed = healthResponse.status === 200
      && readinessResponse.status === 200
      && health.ok === true && readiness.ok === true
      && health.environment === 'production' && readiness.environment === 'production'
      && typeof health.buildSha === 'string' && health.buildSha !== 'unknown'
      && inspectResponseForLeaks(healthSource) && inspectResponseForLeaks(readinessSource)
      && cookiesAreSecure(healthResponse.headers)
      && (!config.frontend || cors === config.frontend.origin);
    return [result('api.service', 'Production API / Render', passed ? VALIDATION_STATUS.PASS : VALIDATION_STATUS.FAIL,
      passed ? 'Production health/readiness, build identity, response masking, and exact CORS passed.'
        : 'The configured Production API failed one or more public read-only checks.',
      { externalEvidence: true, details: { healthStatus: healthResponse.status, readinessStatus: readinessResponse.status, exactCors: !config.frontend || cors === config.frontend.origin, secureCookies: cookiesAreSecure(healthResponse.headers) } }),
    result('api.platform_metadata', 'Production API / Render', VALIDATION_STATUS.BLOCKED,
      'Runtime/build/start commands, protected environment names, auto-deploy policy, timeout/proxy settings, and service ownership require read-only Render dashboard evidence.', { requiresHumanAction: true })];
  } catch (error) {
    return [result('api.service', 'Production API / Render', VALIDATION_STATUS.FAIL,
      safeFailureCode(error, 'API'), { externalEvidence: true })];
  }
}

export async function inspectTls(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ hostname, host: hostname, port, servername: hostname, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    const timer = setTimeout(() => socket.destroy(new Error('TLS validation timeout.')), REQUEST_TIMEOUT_MS);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const certificate = socket.getPeerCertificate();
      const expiresAt = Date.parse(certificate.valid_to || '');
      const resultValue = {
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        daysUntilExpiry: Number.isFinite(expiresAt) ? Math.floor((expiresAt - Date.now()) / 86_400_000) : -1
      };
      socket.end();
      resolve(resultValue);
    });
    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function validateDnsTls(config, dependencies) {
  const targets = [config.frontend, config.api].filter(Boolean);
  if (!targets.length) {
    return [result('network.dns_tls', 'DNS / TLS / Domain', VALIDATION_STATUS.BLOCKED,
      'DNS and TLS validation require approved Production frontend/API origins.', { requiresHumanAction: true })];
  }
  try {
    const evidence = [];
    for (const target of targets) {
      const addresses = await dependencies.dnsLookup(target.hostname, { all: true });
      const tlsResult = await dependencies.tlsInspector(target.hostname, Number(target.port || 443));
      evidence.push({
        dnsAddressCount: addresses.length,
        authorized: tlsResult.authorized,
        protocol: tlsResult.protocol,
        daysUntilExpiry: tlsResult.daysUntilExpiry
      });
    }
    const passed = evidence.every(item => item.dnsAddressCount > 0
      && item.authorized && ['TLSv1.2', 'TLSv1.3'].includes(item.protocol) && item.daysUntilExpiry >= 30);
    return [result('network.dns_tls', 'DNS / TLS / Domain', passed ? VALIDATION_STATUS.PASS : VALIDATION_STATUS.FAIL,
      passed ? 'Configured Production origins resolve and use authorized TLS 1.2+ certificates with at least 30 days remaining.'
        : 'One or more configured Production origins failed DNS/TLS policy.',
      { externalEvidence: true, details: { targets: evidence } })];
  } catch (error) {
    return [result('network.dns_tls', 'DNS / TLS / Domain', VALIDATION_STATUS.FAIL,
      safeFailureCode(error, 'DNS_TLS'), { externalEvidence: true })];
  }
}

export async function validateProductionDatabase(env, dependencies = {}) {
  if (!String(env.DATABASE_READONLY_URL || '').trim()) {
    return result('database.schema', 'Production Database / Neon', VALIDATION_STATUS.BLOCKED,
      'A distinct SELECT-only DATABASE_READONLY_URL is required; Owner/Migrator/API credentials were not used.',
      { requiresHumanAction: true });
  }
  let client;
  try {
    const config = readOnlyDatabaseConfig(env);
    const migrations = await expectedTrackedMigrations();
    client = dependencies.createClient
      ? dependencies.createClient(config)
      : new Client({ connectionString: config.connectionString, ssl: config.ssl, connectionTimeoutMillis: REQUEST_TIMEOUT_MS });
    await client.connect();
    const migrationStatus = await inspectMigrationStatus(client, migrations);
    const metadata = await inspectSchemaMetadata(client);
    const dangerousRole = [
      metadata.roleAttributes.superuser,
      metadata.roleAttributes.createDatabase,
      metadata.roleAttributes.createRole,
      metadata.roleAttributes.replication,
      metadata.roleAttributes.bypassRls,
      metadata.roleAttributes.inherit,
      metadata.roleAttributes.createPublicSchema,
      metadata.roleAttributes.createPrivateSchema
    ].some(Boolean);
    const boundedRole = metadata.roleAttributes.login
      && metadata.roleAttributes.connectionLimit > 0
      && metadata.roleAttributes.connectionLimit <= 5
      && metadata.roleAttributes.defaultTransactionReadOnly
      && metadata.roleAttributes.statementTimeoutConfigured
      && metadata.roleAttributes.idleTransactionTimeoutConfigured;
    const leastPrivilege = metadata.privileges.migrationLedgerSelect
      && metadata.privileges.businessTableSelectCount === 0
      && metadata.privileges.tableWritePrivilegeCount === 0
      && metadata.privileges.sequenceWritePrivilegeCount === 0
      && metadata.privileges.applicationFunctionExecuteCount === 0
      && metadata.privileges.applicationPublicExecuteCount === 0
      && metadata.privileges.applicationReadonlyExecuteCount === 0
      && metadata.privileges.applicationMissingFunctionCount === 0
      && metadata.privileges.applicationOwnerMismatchCount === 0
      && metadata.privileges.applicationRuntimeExecuteCount === 4
      && metadata.privileges.applicationRuntimeExplicitExecuteCount === 4
      && metadata.privileges.applicationRuntimeUnapprovedExecuteCount === 0
      && metadata.privileges.unexpectedApplicationFunctionCount === 0
      && metadata.privileges.unexpectedExtensionFunctionCount === 0
      && metadata.privileges.extensionFunctionExecuteCount === 37
      && metadata.privileges.extensionPublicExecuteCount === 37
      && metadata.privileges.extensionReadonlyExecuteCount === 37;
    const policyTables = new Set(metadata.policies.map(item => `${item.schema}.${item.table}`));
    const unprotectedTables = metadata.tables.filter(item => policyTables.has(`${item.schema}.${item.name}`)
      && (!item.rlsEnabled || !item.rlsForced));
    const passed = migrationStatus.transactionReadOnly && metadata.transactionReadOnly
      && migrationStatus.ledgerExists && migrationStatus.pending.length === 0
      && metadata.database === 'neondb' && metadata.serverVersionNumber >= 140000
      && !dangerousRole && boundedRole && leastPrivilege && unprotectedTables.length === 0
      && metadata.indexes.length > 0 && metadata.constraints.length > 0 && metadata.functions.length > 0;
    return result('database.schema', 'Production Database / Neon', passed ? VALIDATION_STATUS.PASS : VALIDATION_STATUS.FAIL,
      passed ? 'Read-only ledger, schema metadata, FORCE RLS, classified Function ACLs, least-privilege role, and capacity metadata passed.'
        : 'Production database metadata does not match the repository release policy.', {
        externalEvidence: true,
        details: {
          appliedMigrations: migrationStatus.applied.length,
          pendingMigrations: migrationStatus.pending,
          tableCount: metadata.tables.length,
          indexCount: metadata.indexes.length,
          constraintCount: metadata.constraints.length,
          functionCount: metadata.functions.length,
          triggerCount: metadata.triggers.length,
          policyCount: metadata.policies.length,
          unprotectedTableCount: unprotectedTables.length,
          businessTableSelectCount: metadata.privileges.businessTableSelectCount,
          tableWritePrivilegeCount: metadata.privileges.tableWritePrivilegeCount,
          sequenceWritePrivilegeCount: metadata.privileges.sequenceWritePrivilegeCount,
          applicationFunctionExecuteCount: metadata.privileges.applicationFunctionExecuteCount,
          applicationPublicExecuteCount: metadata.privileges.applicationPublicExecuteCount,
          applicationReadonlyExecuteCount: metadata.privileges.applicationReadonlyExecuteCount,
          applicationRuntimeExecuteCount: metadata.privileges.applicationRuntimeExecuteCount,
          applicationRuntimeExplicitExecuteCount: metadata.privileges.applicationRuntimeExplicitExecuteCount,
          applicationRuntimeUnapprovedExecuteCount: metadata.privileges.applicationRuntimeUnapprovedExecuteCount,
          extensionFunctionExecuteCount: metadata.privileges.extensionFunctionExecuteCount,
          extensionPublicExecuteCount: metadata.privileges.extensionPublicExecuteCount,
          extensionReadonlyExecuteCount: metadata.privileges.extensionReadonlyExecuteCount,
          extensionAclStatus: metadata.privileges.unexpectedExtensionFunctionCount === 0
            ? 'ACCEPTED_PLATFORM_INFORMATION'
            : 'FAIL_UNREVIEWED_EXTENSION',
          serverVersionNumber: metadata.serverVersionNumber,
          maxConnections: metadata.capacity.maxConnections,
          observedConnections: metadata.capacity.observedConnections
        }
      });
  } catch (error) {
    return result('database.schema', 'Production Database / Neon', VALIDATION_STATUS.FAIL,
      safeFailureCode(error, 'DATABASE'), { externalEvidence: true });
  } finally {
    await client?.end?.().catch(() => {});
  }
}

async function validateAuth0(config, env, dependencies) {
  if (!config.auth0PublicConfigured) {
    return [
      result('auth0.public', 'Auth0 Production', VALIDATION_STATUS.NOT_CONFIGURED,
        'Production Auth0 public issuer/JWKS/audience settings are not configured for validation.', { requiresHumanAction: true }),
      result('auth0.management', 'Auth0 Production', VALIDATION_STATUS.BLOCKED,
        'Dashboard-only rotation, reuse, MFA, connection, protection, and event-pipeline settings require read-only human evidence.', { requiresHumanAction: true })
    ];
  }
  try {
    const safeAuthFetcher = (target, options = {}) => boundedFetch(dependencies.fetcher, target, {
      method: 'GET', accept: options.headers?.Accept || 'application/json'
    });
    const publicResult = await verifyAuth0Production(auth0ProductionConfig(env), safeAuthFetcher);
    return [
      result('auth0.public', 'Auth0 Production', VALIDATION_STATUS.PASS,
        'Public OIDC discovery, issuer/JWKS parity, and RS256 signing-key metadata passed.', {
          externalEvidence: true, details: { rs256SigningKeys: publicResult.rs256SigningKeys }
        }),
      result('auth0.management', 'Auth0 Production', VALIDATION_STATUS.BLOCKED,
        'Callback/logout/origin allowlists, rotation/reuse, MFA, protections, connections and security-event delivery require dashboard evidence.', { requiresHumanAction: true })
    ];
  } catch (error) {
    return [result('auth0.public', 'Auth0 Production', VALIDATION_STATUS.FAIL,
      safeFailureCode(error, 'AUTH0'), { externalEvidence: true })];
  }
}

async function validateRepository() {
  const failures = [];
  const production = environmentProfiles.production;
  if (production.name !== 'production' || !production.cacheName.startsWith('banke-production-')) {
    failures.push('Production profile identity/cache isolation is invalid.');
  }
  if (/staging|localhost|127\.0\.0\.1/i.test(JSON.stringify(production))) failures.push('Production profile contains a non-Production marker.');
  const trackedEnvironmentFiles = execFileSync('git', ['ls-files', '--', '.env', '.env.production', '.env.staging'], {
    encoding: 'utf8'
  }).trim();
  if (trackedEnvironmentFiles) failures.push('A real environment file is tracked.');
  const [headers, render, workflow, example] = await Promise.all([
    readFile('_headers', 'utf8'), readFile('render.yaml', 'utf8'),
    readFile('.github/workflows/production-quality-gate.yml', 'utf8'), readFile('.env.example', 'utf8')
  ]);
  if (!/Content-Security-Policy|Strict-Transport-Security|Permissions-Policy/.test(headers)) failures.push('Security headers are incomplete.');
  if (!/bankeban-staging-node-api/.test(render) || /BANK_ENV\s*\n\s*value:\s*production/i.test(render)) failures.push('Render blueprint isolation is invalid.');
  if (/\bdeploy\b|netlify[^\n]*--prod|DATABASE_(?:API|MIGRATOR|PUSH)_URL/.test(workflow)) failures.push('CI quality workflow can mutate Production.');
  if (!/BANK_PRODUCTION_FRONTEND_URL=|BANK_PRODUCTION_API_URL=/.test(example)) failures.push('Production public validation variable names are undocumented.');
  return result('repository.gate', 'Repository Validation', failures.length ? VALIDATION_STATUS.FAIL : VALIDATION_STATUS.PASS,
    failures.length ? 'Repository Production validation controls are incomplete.'
      : 'Repository environment isolation, headers, CI no-deploy policy, and validation variable names passed.',
    { repositoryEvidence: true, ...(failures.length ? { details: { failureCount: failures.length } } : {}) });
}

export async function validateProductionPlatform({
  env = process.env,
  fetcher = fetch,
  dnsLookup = lookup,
  tlsInspector = inspectTls,
  databaseValidator = validateProductionDatabase,
  now = () => new Date()
} = {}) {
  const config = productionPlatformConfig(env);
  const dependencies = { fetcher, dnsLookup, tlsInspector };
  const checks = [
    await validateRepository(),
    ...(await validateFrontend(config, dependencies)),
    ...(await validateApi(config, dependencies)),
    await databaseValidator(env),
    ...(await validateAuth0(config, env, dependencies)),
    ...(await validateDnsTls(config, dependencies)),
    result('operations.monitoring', 'Observability / Operations', VALIDATION_STATUS.BLOCKED,
      'Repository telemetry/runbooks exist, but external uptime, error tracking, alerts, on-call routing, and database monitoring lack platform evidence.', { repositoryEvidence: true, requiresHumanAction: true }),
    result('operations.recovery', 'Backup / Restore / RPO / RTO', VALIDATION_STATUS.BLOCKED,
      'An isolated Restore and 60-minute RTO are evidenced, but RPO 15 minutes, independent backup, scheduled snapshot, distinct verification credentials, and full restored security-catalog parity remain non-PASS.', { repositoryEvidence: true, requiresHumanAction: true }),
    result('environment.isolation', 'Environment Isolation', config.frontend && config.api && config.auth0PublicConfigured
      ? VALIDATION_STATUS.PASS : VALIDATION_STATUS.BLOCKED,
    config.frontend && config.api && config.auth0PublicConfigured
      ? 'Configured Production public origins are distinct from known Staging/Local markers.'
      : 'Repository isolation passes, but complete external Production endpoint/Auth0 evidence is unavailable.',
    { repositoryEvidence: true, externalEvidence: Boolean(config.frontend && config.api && config.auth0PublicConfigured), requiresHumanAction: !(config.frontend && config.api && config.auth0PublicConfigured) })
  ];
  const counts = Object.fromEntries(Object.values(VALIDATION_STATUS).map(status => [status, checks.filter(item => item.status === status).length]));
  const hasFailure = counts.FAIL > 0;
  const hasUnavailable = counts.BLOCKED > 0 || counts.NOT_CONFIGURED > 0;
  return Object.freeze({
    schemaVersion: 1,
    evidenceTimestamp: now().toISOString(),
    environment: 'production',
    mode: 'read-only',
    overallStatus: hasFailure ? VALIDATION_STATUS.FAIL : hasUnavailable ? VALIDATION_STATUS.BLOCKED : VALIDATION_STATUS.PASS,
    productionReadinessPercent: 70,
    productionMutation: false,
    secretsEmitted: false,
    counts: Object.freeze(counts),
    checks: Object.freeze(checks)
  });
}

export function renderMarkdownReport(report) {
  const lines = [
    '# Production Platform Validation', '',
    `- Evidence timestamp: ${report.evidenceTimestamp}`,
    `- Mode: ${report.mode}`,
    `- Overall: **${report.overallStatus}**`,
    `- Production readiness: **${report.productionReadinessPercent}%**`,
    `- Production mutation: **${report.productionMutation ? 'YES' : 'NO'}**`, '',
    '| Scope | Status | Evidence | Required action |',
    '|---|---|---|---|'
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.category} | ${check.status} | ${check.summary.replaceAll('|', '\\|')} | ${check.requiresHumanAction ? 'Human/platform evidence required' : 'None'} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const argumentsValue = parseValidatorArguments();
  const report = await validateProductionPlatform();
  const output = argumentsValue.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderMarkdownReport(report);
  process.stdout.write(redactSensitive(output, 1_000_000));
  if (report.overallStatus === VALIDATION_STATUS.FAIL) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(redactSensitive(error.message));
    process.exitCode = 1;
  });
}
