import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  redactSensitive,
  validateProductionPlatform,
  VALIDATION_STATUS
} from './production-platform-validator.mjs';

export const EVIDENCE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  NOT_AUTHORIZED: 'NOT AUTHORIZED'
});

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const ALLOWED_MANAGEMENT_HOSTS = new Set(['api.netlify.com', 'api.render.com']);
const FORBIDDEN_MARKER = /(?:localhost|127\.0\.0\.1|\[::1\]|staging|draft|deploy-preview|\.invalid|\.example)(?:[:/.-]|$)/i;
const REQUIRED_RENDER_VARIABLES = Object.freeze([
  'BANK_ENV',
  'BANK_ALLOWED_ORIGINS',
  'BANK_OIDC_ISSUER',
  'BANK_OIDC_JWKS_URL',
  'BANK_OIDC_AUDIENCE',
  'BANK_OIDC_SESSION_CLAIM',
  'BANK_PRODUCTION_DATABASE_HOST',
  'DATABASE_API_URL'
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function evidenceSha256(value) {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function safeOrigin(value, name) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a credential-free HTTPS origin.`);
  }
  if (FORBIDDEN_MARKER.test(url.hostname)) throw new Error(`${name} points outside Production.`);
  return url.origin;
}

export function productionEvidenceConfig(env = process.env) {
  if (String(env.BANK_ENV || '').trim().toLowerCase() !== 'production') {
    throw new Error('Production evidence collection requires BANK_ENV=production.');
  }
  const issuer = String(env.BANK_OIDC_ISSUER || '').trim();
  const issuerOrigin = issuer ? safeOrigin(issuer, 'BANK_OIDC_ISSUER') : null;
  return Object.freeze({
    frontendOrigin: safeOrigin(env.BANK_PRODUCTION_FRONTEND_URL, 'BANK_PRODUCTION_FRONTEND_URL'),
    apiOrigin: safeOrigin(env.BANK_PRODUCTION_API_URL, 'BANK_PRODUCTION_API_URL'),
    netlifySiteId: String(env.BANK_PRODUCTION_NETLIFY_SITE_ID || '').trim(),
    netlifyToken: String(env.NETLIFY_AUTH_TOKEN || '').trim(),
    renderServiceId: String(env.BANK_PRODUCTION_RENDER_SERVICE_ID || '').trim(),
    renderToken: String(env.RENDER_API_KEY || '').trim(),
    auth0IssuerOrigin: issuerOrigin,
    auth0ClientId: String(env.BANK_PRODUCTION_AUTH0_CLIENT_ID || '').trim(),
    auth0Audience: String(env.BANK_OIDC_AUDIENCE || '').trim(),
    auth0ManagementToken: String(env.AUTH0_MANAGEMENT_TOKEN || '').trim(),
    databaseReadOnlyConfigured: Boolean(String(env.DATABASE_READONLY_URL || '').trim())
  });
}

export function parseEvidenceArguments(argv = process.argv.slice(2)) {
  const allowed = new Set(['--production', '--read-only', '--format=json', '--format=markdown']);
  if (argv.some(item => !allowed.has(item))) throw new Error('Unsupported evidence collector argument.');
  if (!argv.includes('--production') || !argv.includes('--read-only')) {
    throw new Error('Evidence collection requires explicit --production --read-only confirmation.');
  }
  const formats = argv.filter(item => item.startsWith('--format='));
  if (formats.length > 1) throw new Error('Choose one evidence report format.');
  return Object.freeze({ format: formats[0]?.slice('--format='.length) || 'json' });
}

function providerEvidence(id, platform, status, summary, details = {}) {
  const safe = Object.freeze({ id, platform, status, summary, details: Object.freeze(details) });
  return Object.freeze({ ...safe, sha256: evidenceSha256(safe) });
}

async function readJson(fetcher, target, token, allowedAuth0Origin = null) {
  const url = new URL(target);
  const auth0Allowed = allowedAuth0Origin && url.origin === allowedAuth0Origin && url.hostname.endsWith('.auth0.com');
  if (url.protocol !== 'https:' || (!ALLOWED_MANAGEMENT_HOSTS.has(url.hostname) && !auth0Allowed)) {
    throw new Error('Evidence request target is not an approved management API.');
  }
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) return { ok: false, status: response.status, data: null };
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Evidence response exceeded the safe limit.');
  return { ok: true, status: response.status, data: JSON.parse(text) };
}

function identifierHash(value) {
  return evidenceSha256(String(value || '')).slice(0, 16);
}

function isProductionUrl(value, expectedOrigin) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !FORBIDDEN_MARKER.test(url.hostname)
      && (!expectedOrigin || url.origin === expectedOrigin);
  } catch {
    return false;
  }
}

export async function collectNetlifyEvidence(config, fetcher = fetch) {
  if (!config.netlifyToken) {
    return providerEvidence('netlify.production', 'Netlify Production', EVIDENCE_STATUS.BLOCKED,
      'No protected Netlify read-only authorization is available.');
  }
  if (!config.netlifySiteId || !config.frontendOrigin) {
    return providerEvidence('netlify.production', 'Netlify Production', EVIDENCE_STATUS.BLOCKED,
      'Approved Production Site ID and frontend origin are required.');
  }
  try {
    const sitePath = encodeURIComponent(config.netlifySiteId);
    const [siteResponse, deployResponse] = await Promise.all([
      readJson(fetcher, `https://api.netlify.com/api/v1/sites/${sitePath}`, config.netlifyToken),
      readJson(fetcher, `https://api.netlify.com/api/v1/sites/${sitePath}/deploys?per_page=1`, config.netlifyToken)
    ]);
    if (!siteResponse.ok || !deployResponse.ok) {
      const unauthorized = [siteResponse.status, deployResponse.status].some(status => status === 401 || status === 403);
      return providerEvidence('netlify.production', 'Netlify Production', unauthorized ? EVIDENCE_STATUS.NOT_AUTHORIZED : EVIDENCE_STATUS.FAIL,
        'Netlify read-only metadata request failed.', {
          siteHttpStatus: siteResponse.status, deployHttpStatus: deployResponse.status
        });
    }
    const site = siteResponse.data || {};
    const latest = Array.isArray(deployResponse.data) ? deployResponse.data[0] : null;
    const siteUrl = site.ssl_url || site.url || '';
    const customDomain = site.custom_domain || '';
    const context = latest?.context || '';
    const state = latest?.state || '';
    const passed = isProductionUrl(siteUrl, config.frontendOrigin)
      && Boolean(customDomain) && isProductionUrl(`https://${customDomain}`, config.frontendOrigin)
      && context === 'production' && state === 'ready' && Boolean(latest?.commit_ref);
    return providerEvidence('netlify.production', 'Netlify Production', passed ? EVIDENCE_STATUS.PASS : EVIDENCE_STATUS.FAIL,
      passed ? 'Production site, custom domain, latest deploy and deploy context are verified.'
        : 'Netlify metadata does not match the approved Production profile.', {
        siteIdentifierHash: identifierHash(site.id || config.netlifySiteId),
        siteOrigin: isProductionUrl(siteUrl) ? new URL(siteUrl).origin : null,
        customDomainMatches: Boolean(customDomain) && isProductionUrl(`https://${customDomain}`, config.frontendOrigin),
        deployIdentifierHash: identifierHash(latest?.id),
        deployContext: context,
        deployState: state,
        commitSha: String(latest?.commit_ref || '').slice(0, 40) || null,
        rollbackAliasAvailable: Boolean(latest?.permalink)
      });
  } catch {
    return providerEvidence('netlify.production', 'Netlify Production', EVIDENCE_STATUS.FAIL,
      'Netlify read-only evidence collection failed safely.');
  }
}

function unwrapRender(value) {
  return value?.service || value?.deploy || value?.envVar || value || {};
}

export async function collectRenderEvidence(config, fetcher = fetch) {
  if (!config.renderToken) {
    return providerEvidence('render.production', 'Render Production', EVIDENCE_STATUS.BLOCKED,
      'No protected Render read-only authorization is available.');
  }
  if (!config.renderServiceId || !config.apiOrigin) {
    return providerEvidence('render.production', 'Render Production', EVIDENCE_STATUS.BLOCKED,
      'Approved Production Service ID and API origin are required.');
  }
  try {
    const serviceId = encodeURIComponent(config.renderServiceId);
    const [serviceResponse, deployResponse, variablesResponse] = await Promise.all([
      readJson(fetcher, `https://api.render.com/v1/services/${serviceId}`, config.renderToken),
      readJson(fetcher, `https://api.render.com/v1/services/${serviceId}/deploys?limit=1`, config.renderToken),
      readJson(fetcher, `https://api.render.com/v1/services/${serviceId}/env-vars`, config.renderToken)
    ]);
    if (!serviceResponse.ok || !deployResponse.ok || !variablesResponse.ok) {
      const unauthorized = [serviceResponse.status, deployResponse.status, variablesResponse.status]
        .some(status => status === 401 || status === 403);
      return providerEvidence('render.production', 'Render Production', unauthorized ? EVIDENCE_STATUS.NOT_AUTHORIZED : EVIDENCE_STATUS.FAIL,
        'Render read-only metadata request failed.', {
          serviceHttpStatus: serviceResponse.status,
          deployHttpStatus: deployResponse.status,
          environmentHttpStatus: variablesResponse.status
        });
    }
    const service = unwrapRender(serviceResponse.data);
    const latest = unwrapRender(Array.isArray(deployResponse.data) ? deployResponse.data[0] : null);
    const variableNames = (Array.isArray(variablesResponse.data) ? variablesResponse.data : [])
      .map(item => String(unwrapRender(item).key || '').trim()).filter(Boolean).sort();
    const variablePresence = Object.fromEntries(REQUIRED_RENDER_VARIABLES.map(name => [name, variableNames.includes(name)]));
    const serviceUrl = service.serviceDetails?.url || service.url || '';
    const runtime = service.serviceDetails?.runtime || service.runtime || service.type || '';
    const autoDeploy = service.autoDeploy ?? service.auto_deploy;
    const passed = isProductionUrl(serviceUrl, config.apiOrigin)
      && Boolean(runtime) && Boolean(latest?.commit?.id || latest?.commitId || latest?.commit?.commitId)
      && Object.values(variablePresence).every(Boolean);
    return providerEvidence('render.production', 'Render Production', passed ? EVIDENCE_STATUS.PASS : EVIDENCE_STATUS.FAIL,
      passed ? 'Production service, runtime, deploy metadata and required environment names are verified.'
        : 'Render metadata does not match the approved Production profile.', {
        serviceIdentifierHash: identifierHash(service.id || config.renderServiceId),
        apiOriginMatches: isProductionUrl(serviceUrl, config.apiOrigin),
        runtime: String(runtime).slice(0, 40) || null,
        autoDeploy: typeof autoDeploy === 'boolean' ? autoDeploy : null,
        deployIdentifierHash: identifierHash(latest?.id),
        commitSha: String(latest?.commit?.id || latest?.commitId || latest?.commit?.commitId || '').slice(0, 40) || null,
        requiredEnvironmentVariables: variablePresence
      });
  } catch {
    return providerEvidence('render.production', 'Render Production', EVIDENCE_STATUS.FAIL,
      'Render read-only evidence collection failed safely.');
  }
}

function productionOnlyList(values, expectedOrigin) {
  return Array.isArray(values) && values.length > 0 && values.every(value => isProductionUrl(value, expectedOrigin));
}

export async function collectAuth0ManagementEvidence(config, fetcher = fetch) {
  if (!config.auth0ManagementToken) {
    return providerEvidence('auth0.production.management', 'Auth0 Production', EVIDENCE_STATUS.BLOCKED,
      'No protected Auth0 Management read-only authorization is available.');
  }
  if (!config.auth0IssuerOrigin || !config.auth0ClientId || !config.auth0Audience || !config.frontendOrigin) {
    return providerEvidence('auth0.production.management', 'Auth0 Production', EVIDENCE_STATUS.BLOCKED,
      'Approved Production issuer, SPA Client ID, audience and frontend origin are required.');
  }
  try {
    const fields = 'name,callbacks,allowed_logout_urls,web_origins,allowed_origins,oidc_conformant,token_endpoint_auth_method';
    const clientUrl = `${config.auth0IssuerOrigin}/api/v2/clients/${encodeURIComponent(config.auth0ClientId)}?fields=${fields}&include_fields=true`;
    const resourceUrl = `${config.auth0IssuerOrigin}/api/v2/resource-servers?identifier=${encodeURIComponent(config.auth0Audience)}&fields=id,identifier,signing_alg&include_fields=true`;
    const [clientResponse, resourceResponse] = await Promise.all([
      readJson(fetcher, clientUrl, config.auth0ManagementToken, config.auth0IssuerOrigin),
      readJson(fetcher, resourceUrl, config.auth0ManagementToken, config.auth0IssuerOrigin)
    ]);
    if (!clientResponse.ok || !resourceResponse.ok) {
      const unauthorized = [clientResponse.status, resourceResponse.status].some(status => status === 401 || status === 403);
      return providerEvidence('auth0.production.management', 'Auth0 Production', unauthorized ? EVIDENCE_STATUS.NOT_AUTHORIZED : EVIDENCE_STATUS.FAIL,
        'Auth0 Management read-only metadata request failed.', {
          clientHttpStatus: clientResponse.status, apiHttpStatus: resourceResponse.status
        });
    }
    const client = clientResponse.data || {};
    const api = Array.isArray(resourceResponse.data)
      ? resourceResponse.data.find(item => item.identifier === config.auth0Audience)
      : null;
    const callbackPass = productionOnlyList(client.callbacks, config.frontendOrigin);
    const logoutPass = productionOnlyList(client.allowed_logout_urls, config.frontendOrigin);
    const webOriginsPass = productionOnlyList(client.web_origins, config.frontendOrigin);
    const corsPass = !client.allowed_origins?.length || productionOnlyList(client.allowed_origins, config.frontendOrigin);
    const passed = callbackPass && logoutPass && webOriginsPass && corsPass
      && client.oidc_conformant === true && api?.signing_alg === 'RS256';
    return providerEvidence('auth0.production.management', 'Auth0 Production', passed ? EVIDENCE_STATUS.PASS : EVIDENCE_STATUS.FAIL,
      passed ? 'Production SPA allowlists and RS256 API metadata are verified.'
        : 'Auth0 Production metadata does not match the approved profile.', {
        clientIdentifierHash: identifierHash(config.auth0ClientId),
        callbackCount: Array.isArray(client.callbacks) ? client.callbacks.length : 0,
        logoutCount: Array.isArray(client.allowed_logout_urls) ? client.allowed_logout_urls.length : 0,
        webOriginCount: Array.isArray(client.web_origins) ? client.web_origins.length : 0,
        corsOriginCount: Array.isArray(client.allowed_origins) ? client.allowed_origins.length : 0,
        allowlistsProductionOnly: callbackPass && logoutPass && webOriginsPass && corsPass,
        oidcConformant: client.oidc_conformant === true,
        apiSigningAlgorithm: api?.signing_alg || null,
        callbackAllowlistSha256: evidenceSha256((client.callbacks || []).slice().sort()),
        logoutAllowlistSha256: evidenceSha256((client.allowed_logout_urls || []).slice().sort()),
        webOriginsSha256: evidenceSha256((client.web_origins || []).slice().sort())
      });
  } catch {
    return providerEvidence('auth0.production.management', 'Auth0 Production', EVIDENCE_STATUS.FAIL,
      'Auth0 Management read-only evidence collection failed safely.');
  }
}

function mapPlatformEvidence(platformReport) {
  return platformReport.checks.map(check => providerEvidence(
    `public.${check.id}`,
    check.category,
    check.status === VALIDATION_STATUS.PASS ? EVIDENCE_STATUS.PASS
      : check.status === VALIDATION_STATUS.FAIL ? EVIDENCE_STATUS.FAIL
        : EVIDENCE_STATUS.BLOCKED,
    check.summary,
    check.details || {}
  ));
}

export async function collectProductionEvidence({
  env = process.env,
  fetcher = fetch,
  platformValidator = validateProductionPlatform,
  now = () => new Date()
} = {}) {
  const config = productionEvidenceConfig(env);
  const [platformReport, netlify, render, auth0] = await Promise.all([
    platformValidator({ env, fetcher, now }),
    collectNetlifyEvidence(config, fetcher),
    collectRenderEvidence(config, fetcher),
    collectAuth0ManagementEvidence(config, fetcher)
  ]);
  const records = Object.freeze([...mapPlatformEvidence(platformReport), netlify, render, auth0]);
  const statuses = records.map(record => record.status);
  const overallStatus = statuses.includes(EVIDENCE_STATUS.FAIL) ? EVIDENCE_STATUS.FAIL
    : statuses.includes(EVIDENCE_STATUS.BLOCKED) ? EVIDENCE_STATUS.BLOCKED
      : statuses.includes(EVIDENCE_STATUS.NOT_AUTHORIZED) ? EVIDENCE_STATUS.NOT_AUTHORIZED
        : EVIDENCE_STATUS.PASS;
  const hashEntries = records.map(record => Object.freeze({ id: record.id, sha256: record.sha256 }));
  const hashManifestSha256 = evidenceSha256(hashEntries);
  return Object.freeze({
    schemaVersion: 1,
    evidenceTimestamp: now().toISOString(),
    environment: 'production',
    mode: 'read-only',
    overallStatus,
    productionReadinessPercent: 70,
    productionMutation: false,
    secretsEmitted: false,
    records,
    hashManifest: Object.freeze({ algorithm: 'SHA-256', entries: Object.freeze(hashEntries), sha256: hashManifestSha256 })
  });
}

export function renderEvidenceMarkdown(report) {
  const lines = [
    '# Production Evidence Report', '',
    `- Evidence timestamp: ${report.evidenceTimestamp}`,
    `- Overall: **${report.overallStatus}**`,
    `- Mode: ${report.mode}`,
    `- Production readiness: **${report.productionReadinessPercent}%**`,
    `- Hash manifest: \`${report.hashManifest.sha256}\``, '',
    '| Evidence | Status | Summary | SHA-256 |',
    '|---|---|---|---|'
  ];
  for (const record of report.records) {
    lines.push(`| ${record.platform} | ${record.status} | ${record.summary.replaceAll('|', '\\|')} | \`${record.sha256}\` |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseEvidenceArguments();
  const report = await collectProductionEvidence();
  const output = args.format === 'markdown' ? renderEvidenceMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(redactSensitive(output, 2_000_000));
  if (report.overallStatus === EVIDENCE_STATUS.FAIL) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(redactSensitive(error.message));
    process.exitCode = 1;
  });
}
