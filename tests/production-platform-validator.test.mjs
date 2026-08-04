import assert from 'node:assert/strict';
import { inspectSchemaMetadata } from '../database/inspect-migration-status.mjs';
import {
  parseValidatorArguments,
  productionPlatformConfig,
  redactSensitive,
  renderMarkdownReport,
  VALIDATION_STATUS,
  validateProductionDatabase,
  validateProductionPlatform
} from '../scripts/production-platform-validator.mjs';

assert.throws(() => parseValidatorArguments([]), /--production --read-only/);
assert.throws(() => parseValidatorArguments(['--production', '--read-only', '--write']), /Unsupported/);
assert.equal(parseValidatorArguments(['--production', '--read-only', '--format=json']).format, 'json');
assert.throws(() => productionPlatformConfig({ BANK_ENV: 'staging' }), /BANK_ENV=production/);
assert.throws(() => productionPlatformConfig({
  BANK_ENV: 'production', BANK_PRODUCTION_FRONTEND_URL: 'https://staging.banke.tw'
}), /non-Production marker/);
assert.throws(() => productionPlatformConfig({
  BANK_ENV: 'production', BANK_PRODUCTION_FRONTEND_URL: 'https://app.banke.tw',
  BANK_PRODUCTION_API_URL: 'https://app.banke.tw'
}), /distinct origins/);

const redacted = redactSensitive([
  'Authorization: Bearer header.payload.signature',
  'postgresql://banke_owner:real-password@database.example/neondb',
  'client_secret=super-secret',
  'https://app.banke.tw/?token=sensitive-value'
].join('\n'));
assert.doesNotMatch(redacted, /real-password|super-secret|sensitive-value|header\.payload/);
assert.match(redacted, /\[REDACTED\]/);

const metadataSql = [];
const metadata = await inspectSchemaMetadata({
  async query(statement) {
    metadataSql.push(statement.trim());
    if (statement.includes('current_database')) return { rows: [{
      database_name: 'neondb', role_name: 'banke_readonly', transaction_read_only: 'on',
      server_version_num: 180000, can_create_public_schema: false, can_create_private_schema: false
    }] };
    if (statement.includes('pg_catalog.pg_roles')) return { rows: [{
      rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false
    }] };
    if (statement.includes('pg_catalog.pg_class')) return { rows: [{
      schema_name: 'public', object_name: 'workspaces', rls_enabled: true, rls_forced: true
    }] };
    if (statement.includes('pg_catalog.pg_indexes')) return { rows: [{
      schema_name: 'public', table_name: 'workspaces', object_name: 'workspaces_pkey'
    }] };
    if (statement.includes('pg_catalog.pg_constraint')) return { rows: [{
      schema_name: 'public', table_name: 'workspaces', object_name: 'workspaces_pkey', constraint_type: 'p'
    }] };
    if (statement.includes('information_schema.routines')) return { rows: [{
      schema_name: 'app_private', object_name: 'bootstrap'
    }] };
    if (statement.includes('information_schema.triggers')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_policies')) return { rows: [{
      schema_name: 'public', table_name: 'workspaces', object_name: 'workspace_isolation'
    }] };
    if (statement.includes('pg_catalog.pg_stat_activity')) return { rows: [{ max_connections: 100, observed_connections: 3 }] };
    throw new Error('Unexpected metadata SQL.');
  }
});
assert.equal(metadata.transactionReadOnly, true);
assert.equal(metadata.roleAttributes.superuser, false);
assert.equal(metadata.tables[0].rlsForced, true);
assert.equal(metadata.capacity.maxConnections, 100);
assert.equal(metadataSql.every(statement => statement.startsWith('SELECT')), true);
assert.equal(metadataSql.some(statement => /^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/i.test(statement)), false);

const blockedDatabase = await validateProductionDatabase({ BANK_ENV: 'production' });
assert.equal(blockedDatabase.status, VALIDATION_STATUS.BLOCKED);
assert.equal(blockedDatabase.requiresHumanAction, true);

const missingConfigReport = await validateProductionPlatform({
  env: { BANK_ENV: 'production' },
  now: () => new Date('2026-08-04T12:00:00.000Z')
});
assert.equal(missingConfigReport.overallStatus, VALIDATION_STATUS.BLOCKED);
assert.equal(missingConfigReport.productionMutation, false);
assert.equal(missingConfigReport.secretsEmitted, false);
assert.equal(missingConfigReport.checks.find(item => item.id === 'repository.gate').status, VALIDATION_STATUS.PASS);
assert.equal(missingConfigReport.checks.find(item => item.id === 'frontend.site').status, VALIDATION_STATUS.NOT_CONFIGURED);
assert.equal(missingConfigReport.checks.find(item => item.id === 'database.schema').status, VALIDATION_STATUS.BLOCKED);

const frontendOrigin = 'https://app.banke.tw';
const apiOrigin = 'https://api.banke.tw';
const issuer = 'https://bankeban.us.auth0.com/';
const calls = [];
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers });
const fetcher = async (target, options) => {
  const url = new URL(target);
  calls.push({ url: url.href, method: options.method });
  assert.equal(['GET', 'HEAD'].includes(options.method), true);
  if (url.protocol === 'http:') return response('', 308, { Location: frontendOrigin });
  if (url.hostname === 'app.banke.tw' && url.pathname === '/') {
    return response('<!doctype html><title>Bankeban</title>', 200, {
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=()',
      'Cache-Control': 'no-cache, must-revalidate'
    });
  }
  if (url.hostname === 'app.banke.tw' && url.pathname === '/environment-config.js') {
    return response(`window.APP_ENV=Object.freeze({"name":"production","dataBackend":"postgres","postgresApiUrl":"${apiOrigin}/v1"});`);
  }
  if (url.hostname === 'app.banke.tw' && url.pathname === '/service-worker.js') {
    return response("const CACHE='banke-production-v9';");
  }
  if (url.hostname === 'api.banke.tw' && ['/v1/health', '/v1/readiness'].includes(url.pathname)) {
    return response('{"ok":true,"environment":"production","buildSha":"abcdef1234567890"}', 200, {
      'Access-Control-Allow-Origin': frontendOrigin
    });
  }
  if (url.pathname.endsWith('/.well-known/openid-configuration')) {
    return response(JSON.stringify({ issuer, jwks_uri: `${issuer}.well-known/jwks.json` }));
  }
  if (url.pathname.endsWith('/.well-known/jwks.json')) {
    return response('{"keys":[{"kty":"RSA","use":"sig","alg":"RS256","kid":"key-1"}]}');
  }
  throw new Error('Unexpected public validation URL.');
};
const externalReport = await validateProductionPlatform({
  env: {
    BANK_ENV: 'production',
    BANK_PRODUCTION_FRONTEND_URL: frontendOrigin,
    BANK_PRODUCTION_API_URL: apiOrigin,
    BANK_OIDC_ISSUER: issuer,
    BANK_OIDC_JWKS_URL: `${issuer}.well-known/jwks.json`,
    BANK_OIDC_AUDIENCE: 'https://bankeban-api',
    BANK_OIDC_SESSION_CLAIM: 'https://banke.tw/session_id'
  },
  fetcher,
  dnsLookup: async () => [{ address: '203.0.113.10', family: 4 }],
  tlsInspector: async () => ({ authorized: true, protocol: 'TLSv1.3', daysUntilExpiry: 90 }),
  databaseValidator: async () => ({
    id: 'database.schema', category: 'Production Database / Neon', status: VALIDATION_STATUS.PASS,
    summary: 'Synthetic read-only metadata passed.', repositoryEvidence: false, externalEvidence: true,
    requiresHumanAction: false
  }),
  now: () => new Date('2026-08-04T12:00:00.000Z')
});
assert.equal(externalReport.checks.find(item => item.id === 'frontend.site').status, VALIDATION_STATUS.PASS);
assert.equal(externalReport.checks.find(item => item.id === 'api.service').status, VALIDATION_STATUS.PASS);
assert.equal(externalReport.checks.find(item => item.id === 'network.dns_tls').status, VALIDATION_STATUS.PASS);
assert.equal(externalReport.checks.find(item => item.id === 'auth0.public').status, VALIDATION_STATUS.PASS);
assert.equal(externalReport.overallStatus, VALIDATION_STATUS.BLOCKED);
assert.equal(calls.every(call => ['GET', 'HEAD'].includes(call.method)), true);
const markdown = renderMarkdownReport(externalReport);
assert.match(markdown, /Production Platform Validation/);
assert.doesNotMatch(markdown, /203\.0\.113\.10|Bearer|postgresql:\/\//);

console.log('Production platform validator read-only, isolation, redaction, and evidence-status tests passed.');
