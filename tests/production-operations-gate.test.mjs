import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSecurityHeaders } from '../config/security-headers.mjs';
import { inspectMigrationStatus, readOnlyDatabaseConfig } from '../database/inspect-migration-status.mjs';
import { createRateLimiter, rateLimitConfig } from '../server/rate-limit.mjs';
import { auth0ProductionConfig, verifyAuth0Production } from '../scripts/auth0-production-readiness.mjs';
import { capacityConfig, runCapacitySmoke } from '../scripts/capacity-smoke.mjs';
import { embeddedVapidPublicKey, vapidFingerprint } from '../scripts/vapid-parity.mjs';

const productionHeaders = createSecurityHeaders({
  profile: {
    dataBackend: 'google_sheets',
    backendUrl: 'https://script.google.com/macros/s/production/exec',
    postgresApiUrl: ''
  }
});
assert.match(productionHeaders, /Content-Security-Policy:/);
assert.match(productionHeaders, /Strict-Transport-Security:/);
assert.match(productionHeaders, /connect-src 'self' https:\/\/script\.google\.com/);
assert.doesNotMatch(productionHeaders, /auth0|bankeban-staging-node-api/);

const stagingHeaders = createSecurityHeaders({
  profile: {
    dataBackend: 'postgres', backendUrl: '', postgresApiUrl: 'https://api.staging.example/v1',
    auth: { domain: 'dev-synthetic.us.auth0.com' }
  },
  auth0SdkUrl: 'https://cdn.auth0.com/js/auth0-spa-js/2.11/auth0-spa-js.production.js'
});
assert.match(stagingHeaders, /https:\/\/api\.staging\.example/);
assert.match(stagingHeaders, /https:\/\/dev-synthetic\.us\.auth0\.com/);
assert.doesNotMatch(stagingHeaders, /script\.google\.com/);

let now = 0;
const limiter = createRateLimiter({ enabled: true, limits: { session: 1, read: 2, command: 1 }, now: () => now });
const identity = { issuer: 'https://issuer.example/', subject: 'auth0|synthetic', sessionId: 'synthetic-session' };
limiter.consume(identity, 'read');
limiter.consume(identity, 'read');
assert.throws(() => limiter.consume(identity, 'read'), error =>
  error.status === 429 && error.code === 'RATE_LIMITED' && error.details.retryAfterSeconds === 60);
limiter.consume(identity, 'command');
assert.throws(() => limiter.consume(identity, 'command'), error => error.code === 'RATE_LIMITED');
now = 60_001;
limiter.consume(identity, 'read');
assert.equal(limiter.size() <= 2, true);
assert.equal(rateLimitConfig({ BANK_ENV: 'local' }).enabled, false);
assert.equal(rateLimitConfig({ BANK_ENV: 'production' }).enabled, true);
assert.throws(() => rateLimitConfig({ BANK_ENV: 'staging', BANK_RATE_LIMIT_ENABLED: 'false' }), /cannot be disabled/);

assert.throws(() => readOnlyDatabaseConfig({ BANK_ENV: 'production' }), /DATABASE_READONLY_URL/);
assert.throws(() => readOnlyDatabaseConfig({
  BANK_ENV: 'production', DATABASE_READONLY_URL: 'postgres://reader@prod.example/other',
  BANK_PRODUCTION_READONLY_ROLE: 'reader',
  BANK_PRODUCTION_DATABASE_HOST: 'prod.example', DATABASE_SSL: 'require'
}), /neondb/);
assert.throws(() => readOnlyDatabaseConfig({
  BANK_ENV: 'production', DATABASE_READONLY_URL: 'postgres://owner@prod.example/neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'owner',
  DATABASE_MIGRATOR_URL: 'postgres://owner@prod.example/neondb',
  BANK_PRODUCTION_DATABASE_HOST: 'prod.example', DATABASE_SSL: 'require'
}), /rejects privileged/);
const readOnlyConfig = readOnlyDatabaseConfig({
  BANK_ENV: 'production', DATABASE_READONLY_URL: 'postgres://reader@prod.example/neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'reader',
  DATABASE_MIGRATOR_URL: 'postgres://owner@prod.example/neondb',
  BANK_PRODUCTION_DATABASE_HOST: 'prod.example', DATABASE_SSL: 'require'
});
assert.equal(readOnlyConfig.environment, 'production');
const expectedMigrations = [
  { version: '0001', name: 'core', checksum: 'a'.repeat(64) },
  { version: '0002', name: 'business', checksum: 'b'.repeat(64) }
];
const sql = [];
const inspected = await inspectMigrationStatus({
  async query(statement) {
    sql.push(statement);
    if (statement === 'BEGIN TRANSACTION READ ONLY' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] };
    if (statement.includes('current_database')) return { rows: [{
      database_name: 'neondb', role_name: 'banke_readonly', transaction_read_only: 'on', ledger_exists: true
    }] };
    return { rows: [{ version: '0001', name: 'core', checksum: 'a'.repeat(64) }] };
  }
}, expectedMigrations);
assert.deepEqual(inspected.applied, ['0001']);
assert.deepEqual(inspected.pending, ['0002']);
assert.equal(sql[0], 'BEGIN TRANSACTION READ ONLY');
assert.equal(sql.at(-1), 'COMMIT');
assert.equal(sql.includes('ROLLBACK'), false);
assert.equal(sql.every(statement => /^(?:BEGIN TRANSACTION READ ONLY|COMMIT|SELECT)/.test(statement.trim())), true);

const rejectedSql = [];
await assert.rejects(() => inspectMigrationStatus({
  async query(statement) {
    rejectedSql.push(statement);
    if (statement.includes('current_database')) return { rows: [{
      database_name: 'neondb', role_name: 'banke_readonly', transaction_read_only: 'off', ledger_exists: true
    }] };
    return { rows: [] };
  }
}, expectedMigrations), /did not accept read-only/);
assert.equal(rejectedSql.at(-1), 'ROLLBACK');

const readonlyStatusSource = await readFile('database/inspect-migration-status.mjs', 'utf8');
const readonlyStatusMain = readonlyStatusSource.slice(readonlyStatusSource.indexOf('async function main()'));
assert.match(readonlyStatusMain, /inspectMigrationStatus/);
assert.doesNotMatch(readonlyStatusMain, /inspectSchemaMetadata/);
assert.doesNotMatch(readonlyStatusMain, /pg_stat_ssl/);

const authConfig = auth0ProductionConfig({
  BANK_ENV: 'production', BANK_OIDC_ISSUER: 'https://bankeban.us.auth0.com/',
  BANK_OIDC_JWKS_URL: 'https://bankeban.us.auth0.com/.well-known/jwks.json',
  BANK_OIDC_AUDIENCE: 'https://bankeban-api', BANK_OIDC_SESSION_CLAIM: 'https://banke.tw/session_id'
});
assert.throws(() => auth0ProductionConfig({
  BANK_ENV: 'production', BANK_OIDC_ISSUER: 'https://dev-test.us.auth0.com/',
  BANK_OIDC_JWKS_URL: 'https://dev-test.us.auth0.com/.well-known/jwks.json',
  BANK_OIDC_AUDIENCE: 'https://bankeban-staging-api', BANK_OIDC_SESSION_CLAIM: 'https://banke.tw/session_id'
}), /non-development|Staging/);
let authFetches = 0;
const authResult = await verifyAuth0Production(authConfig, async url => {
  authFetches += 1;
  return {
    ok: true,
    async json() {
      return String(url).includes('openid-configuration')
        ? { issuer: authConfig.issuer, jwks_uri: authConfig.jwks }
        : { keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: 'production-key' }] };
    }
  };
});
assert.equal(authFetches, 2);
assert.equal(authResult.rs256SigningKeys, 1);

assert.throws(() => capacityConfig({
  BANK_ENV: 'production', BANK_CAPACITY_TARGET_URL: 'https://api.production.example',
  BANK_CAPACITY_STAGING_HOST: 'api.production.example'
}), /staging/);
const capacity = capacityConfig({
  BANK_ENV: 'staging', BANK_CAPACITY_TARGET_URL: 'https://api.staging.example',
  BANK_CAPACITY_STAGING_HOST: 'api.staging.example', BANK_CAPACITY_REQUESTS: '5',
  BANK_CAPACITY_CONCURRENCY: '2'
});
let capacityCalls = 0;
const capacityResult = await runCapacitySmoke(capacity, async () => {
  capacityCalls += 1;
  return { ok: true };
});
assert.equal(capacityCalls, 5);
assert.equal(capacityResult.failures, 0);
assert.throws(() => capacityConfig({
  BANK_ENV: 'staging', BANK_CAPACITY_TARGET_URL: 'https://api.staging.example',
  BANK_CAPACITY_STAGING_HOST: 'api.staging.example', BANK_CAPACITY_ROUTE: '/v1/bootstrap/revision'
}), /protected token/);
const authenticatedCapacity = capacityConfig({
  BANK_ENV: 'staging', BANK_CAPACITY_TARGET_URL: 'https://api.staging.example',
  BANK_CAPACITY_STAGING_HOST: 'api.staging.example', BANK_CAPACITY_ROUTE: '/v1/bootstrap/revision',
  BANK_CAPACITY_ACCESS_TOKEN: 'synthetic-token', BANK_CAPACITY_WORKSPACE_ID: `ws_${'a'.repeat(32)}`,
  BANK_CAPACITY_REQUESTS: '1'
});
await runCapacitySmoke(authenticatedCapacity, async (_url, options) => {
  assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(options.headers['X-Workspace-Id'], `ws_${'a'.repeat(32)}`);
  return { ok: true };
});

const syntheticVapid = `B${'a'.repeat(86)}`;
assert.equal(embeddedVapidPublicKey(`{"webPushPublicKey":"${syntheticVapid}"}`), syntheticVapid);
assert.match(vapidFingerprint(syntheticVapid), /^[a-f0-9]{16}$/);
assert.throws(() => embeddedVapidPublicKey('{"webPushPublicKey":"short"}'), /does not contain/);

const workflow = await readFile('.github/workflows/production-quality-gate.yml', 'utf8');
assert.match(workflow, /contents: read/);
assert.match(workflow, /pnpm run release:check/);
assert.doesNotMatch(workflow, /DATABASE_(?:API|MIGRATOR|PUSH)_URL|netlify[^\n]*--prod/);

const platformReport = await readFile('docs/PRODUCTION_PLATFORM_VALIDATION_REPORT.md', 'utf8');
assert.match(platformReport, /PARTIAL - EXTERNAL PLATFORM EVIDENCE BLOCKED/);
assert.match(platformReport, /Production readiness: \*\*70% - NOT READY\*\*/);
assert.match(platformReport, /No Production deployment/);
const productionChecklist = await readFile('docs/PRODUCTION_RELEASE_CHECKLIST.md', 'utf8');
assert.match(productionChecklist, /Netlify/);
assert.match(productionChecklist, /Render/);
assert.match(productionChecklist, /Neon/);
assert.match(productionChecklist, /Auth0/);
const evidenceReport = await readFile('docs/PRODUCTION_EVIDENCE_REPORT.md', 'utf8');
assert.match(evidenceReport, /Sprint 33D/);
assert.match(evidenceReport, /NOT AUTHORIZED/);
assert.match(evidenceReport, /Production mutation: \*\*none\*\*/);
const evidenceHashes = JSON.parse(await readFile('docs/PRODUCTION_EVIDENCE_HASHES.json', 'utf8'));
assert.equal(evidenceHashes.algorithm, 'SHA-256');
assert.equal(evidenceHashes.entries.length, 24);
assert.equal(evidenceHashes.manualNetlifyBillingEvidence.plan, 'FREE');
assert.equal(evidenceHashes.manualNetlifyBillingEvidence.currentFixedMonthlyUsd, 0);
assert.equal(evidenceHashes.publicProductionCostEvidence.knownFixedMonthlyUsd, 49);
assert.equal(evidenceHashes.publicProductionCostEvidence.recommendedProduction.fixedMonthlyUsd, 67);
assert.equal(evidenceHashes.publicProductionCostEvidence.growthTotalStatus, 'UNKNOWN');
assert.equal(evidenceHashes.manualNeonBillingUsageEvidence.currentPlan, 'FREE');
assert.equal(evidenceHashes.manualNeonBillingUsageEvidence.currentFixedMonthlyUsd, 0);
assert.equal(evidenceHashes.manualNeonBillingUsageEvidence.usageScope, 'ORGANIZATION_ALL_PROJECTS');
assert.equal(evidenceHashes.manualNeonBillingUsageEvidence.productionOnly.computeCuHours, 'UNKNOWN');
assert.equal(evidenceHashes.manualNeonBillingUsageEvidence.productionOnly.estimatedOrChargedAmount, 'UNKNOWN');
assert.equal(evidenceHashes.publicProductionCostEvidence.neon.productionAccountPlanStatus, 'EVIDENCED_CURRENT_FREE');
assert.equal(evidenceHashes.publicProductionCostEvidence.neon.productionOnlyCostStatus, 'UNKNOWN');
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.approvedDomainSelected, true);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.domain, 'bankeban.com');
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.availability, 'AVAILABLE_AT_QUOTE_TIME');
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.initialPriceStatus, 'EVIDENCED_PUBLIC_QUOTE');
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.initialRegistrationPrice, 11.08);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.domain.renewalPrice, 11.08);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.monitoringAlertingLogging.betterStackFree.monthlyUsd, 0);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.monitoringAlertingLogging.providerConfigured, false);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.backupRestore.isolatedRestoreExecuted, false);
assert.equal(evidenceHashes.publicDomainOperationsCostEvidence.productionMutation, false);
const productionCost = await readFile('docs/PRODUCTION_TOTAL_COST_GATE_A.md', 'utf8');
assert.match(productionCost, /Netlify current Free plan/);
assert.match(productionCost, /US\$49\/月/);
assert.match(productionCost, /US\$67\/月/);
assert.match(productionCost, /C\. Growth Production \| \*\*UNKNOWN\*\*/);
assert.match(productionCost, /Gate A：\*\*DEFER/);
assert.match(productionCost, /Sprint 43 Neon actual-plan evidence/);
assert.match(productionCost, /Sprint 44 domain and operations cost evidence addendum/);
assert.match(productionCost, /Sprint 45 exact domain quote addendum/);
assert.match(productionCost, /bankeban\.com/);
assert.match(productionCost, /US\$599\.08/);
assert.match(productionCost, /Current actual Neon organization plan is \*\*Free \/ US\$0 fixed monthly plan fee\*\*/);
assert.match(productionCost, /Production-only compute, billing storage, network transfer, snapshot storage and estimated\/charged amount remain UNKNOWN/);
assert.doesNotMatch(productionCost, /Netlify Personal candidate/);
assert.match(productionCost, /70% \/ NOT READY/);
const blockerClosure = await readFile('docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md', 'utf8');
for (const heading of [
  'CURRENT STATUS', 'REQUIRED ACTION', 'EXTERNAL / REPOSITORY', 'COST IMPACT',
  'RISK', 'EVIDENCE REQUIRED', 'OWNER / HUMAN ACTION'
]) {
  assert.match(blockerClosure, new RegExp(heading.replace('/', '\\/')));
}
for (const area of [
  'Auth0 Production', 'Neon Production', 'Render Production API',
  'Netlify Production Frontend', 'Domain / DNS / TLS',
  'Monitoring / Alerting / Logging', 'Backup / Restore / DR',
  'Secrets / Credentials', 'Schema / Migration parity',
  'Production Web Push', 'Cost / Billing'
]) {
  assert.match(blockerClosure, new RegExp(area.replaceAll('/', '\\/')));
}
assert.match(blockerClosure, /Zero-resource closure/);
assert.match(blockerClosure, /Gate A approval required/);
assert.match(blockerClosure, /Gate A：\*\*DEFER\*\*/);
assert.match(blockerClosure, /Production Provisioning：\*\*NO-GO\*\*/);
assert.match(blockerClosure, /Production Readiness：\*\*70% \/ NOT READY\*\*/);
assert.match(blockerClosure, /Sprint 43.*Neon Production Billing \/ Usage Evidence Closure/);
assert.match(blockerClosure, /Sprint 44.*Domain and Operations Cost Evidence Closure/);
assert.match(blockerClosure, /Production.*billing.*platform mutation：\*\*NONE\*\*/);
assert.doesNotMatch(blockerClosure, /Gate A：\*\*(?:GO|CONDITIONAL GO)\*\*/);
assert.equal(evidenceHashes.manualEvidence.status, 'PASS');
assert.equal(evidenceHashes.manualEvidence.codexProductionConnection, false);
const readonlyAccess = await readFile('docs/PRODUCTION_READONLY_ACCESS.md', 'utf8');
assert.match(readonlyAccess, /NEON PROVISION AND VERIFY PASS/);
assert.match(readonlyAccess, /DATABASE_READONLY_URL/);
assert.match(readonlyAccess, /CONFIRMED_READ_ONLY/);
assert.match(readonlyAccess, /Neon evidence re-run: \*\*PERFORMED BY HUMAN \/ PASS \/ HASHED\*\*/);
for (const file of [
  'database/operator/production-readonly-role.provision.sql',
  'database/operator/production-readonly-role.verify.sql',
  'database/operator/production-readonly-role.disable.sql'
]) {
  const sql = await readFile(file, 'utf8');
  assert.doesNotMatch(sql, /(?:postgres(?:ql)?:\/\/|password\s*=|BEGIN (?:RSA|PRIVATE))/i);
}

const productionGateSource = await readFile('scripts/production-readiness-gate.mjs', 'utf8');
assert.match(productionGateSource, /Owner is the nominated Recovery Commander/);
assert.match(productionGateSource, /This nomination does not authorize a Restore/);
assert.doesNotMatch(productionGateSource, /Recovery Commander status is \*\*NOT_CONFIGURED\*\*/);

console.log('Production security and operations repository gates passed.');
