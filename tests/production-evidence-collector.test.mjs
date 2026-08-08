import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  collectAuth0ManagementEvidence,
  collectNetlifyEvidence,
  collectProductionEvidence,
  collectRenderEvidence,
  EVIDENCE_STATUS,
  evidenceSha256,
  parseEvidenceArguments,
  productionEvidenceConfig,
  renderEvidenceMarkdown,
  stableJson
} from '../scripts/production-evidence-collector.mjs';
import { VALIDATION_STATUS } from '../scripts/production-platform-validator.mjs';

assert.throws(() => parseEvidenceArguments([]), /--production --read-only/);
assert.throws(() => parseEvidenceArguments(['--production', '--read-only', '--write']), /Unsupported/);
assert.equal(parseEvidenceArguments(['--production', '--read-only', '--format=markdown']).format, 'markdown');
assert.throws(() => productionEvidenceConfig({ BANK_ENV: 'staging' }), /BANK_ENV=production/);
assert.throws(() => productionEvidenceConfig({
  BANK_ENV: 'production', BANK_PRODUCTION_FRONTEND_URL: 'https://draft.example.invalid'
}), /outside Production/);
assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
assert.equal(evidenceSha256({ a: 1 }), evidenceSha256({ a: 1 }));
assert.match(evidenceSha256({ a: 1 }), /^[a-f0-9]{64}$/);

const blockedConfig = productionEvidenceConfig({ BANK_ENV: 'production' });
assert.equal((await collectNetlifyEvidence(blockedConfig)).status, EVIDENCE_STATUS.BLOCKED);
assert.equal((await collectRenderEvidence(blockedConfig)).status, EVIDENCE_STATUS.BLOCKED);
assert.equal((await collectAuth0ManagementEvidence(blockedConfig)).status, EVIDENCE_STATUS.BLOCKED);

const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const auth0ReadScopes = [
  'read:attack_protection', 'read:clients', 'read:connections', 'read:log_streams', 'read:resource_servers'
];
const auth0ReadToken = `${jwtPart({ alg: 'RS256', typ: 'JWT' })}.${jwtPart({ scope: auth0ReadScopes.join(' ') })}.synthetic-signature`;

const env = {
  BANK_ENV: 'production',
  BANK_PRODUCTION_FRONTEND_URL: 'https://app.banke.tw',
  BANK_PRODUCTION_API_URL: 'https://api.banke.tw',
  BANK_PRODUCTION_NETLIFY_SITE_ID: 'site-production-synthetic',
  NETLIFY_AUTH_TOKEN: 'netlify-sensitive-token',
  BANK_PRODUCTION_NETLIFY_READONLY_CONFIRM: 'CONFIRMED_READ_ONLY',
  BANK_PRODUCTION_RENDER_SERVICE_ID: 'srv-production-synthetic',
  RENDER_API_KEY: 'render-sensitive-token',
  BANK_PRODUCTION_RENDER_READONLY_CONFIRM: 'CONFIRMED_READ_ONLY',
  BANK_OIDC_ISSUER: 'https://bankeban.us.auth0.com/',
  BANK_OIDC_JWKS_URL: 'https://bankeban.us.auth0.com/.well-known/jwks.json',
  BANK_OIDC_AUDIENCE: 'https://bankeban-api',
  BANK_OIDC_SESSION_CLAIM: 'https://banke.tw/session_id',
  BANK_PRODUCTION_AUTH0_CLIENT_ID: 'production-client-synthetic',
  AUTH0_MANAGEMENT_TOKEN: auth0ReadToken
};
const config = productionEvidenceConfig(env);
assert.deepEqual(config.auth0ManagementScopes, auth0ReadScopes);
const unauthorizedNetlify = await collectNetlifyEvidence(config, async () => new Response('{}', { status: 403 }));
assert.equal(unauthorizedNetlify.status, EVIDENCE_STATUS.NOT_AUTHORIZED);
let unconfirmedCalls = 0;
const unconfirmed = productionEvidenceConfig({ ...env, BANK_PRODUCTION_NETLIFY_READONLY_CONFIRM: '' });
assert.equal((await collectNetlifyEvidence(unconfirmed, async () => { unconfirmedCalls += 1; })).status, EVIDENCE_STATUS.BLOCKED);
assert.equal(unconfirmedCalls, 0);
const writeScoped = productionEvidenceConfig({
  ...env,
  AUTH0_MANAGEMENT_TOKEN: `${jwtPart({ alg: 'RS256' })}.${jwtPart({ scope: `${auth0ReadScopes.join(' ')} update:clients` })}.synthetic`
});
assert.equal((await collectAuth0ManagementEvidence(writeScoped, async () => { unconfirmedCalls += 1; })).status, EVIDENCE_STATUS.BLOCKED);
assert.equal(unconfirmedCalls, 0);
const calls = [];
const jsonResponse = value => new Response(JSON.stringify(value), {
  status: 200, headers: { 'Content-Type': 'application/json' }
});
const fetcher = async (target, options) => {
  const url = new URL(target);
  calls.push({ method: options.method, url: url.href, authorizationPresent: Boolean(options.headers.Authorization) });
  assert.equal(options.method, 'GET');
  assert.match(options.headers.Authorization, /^Bearer /);
  if (url.hostname === 'api.netlify.com' && /\/deploys$/.test(url.pathname)) {
    return jsonResponse([{ id: 'deploy-sensitive-id', context: 'production', state: 'ready', commit_ref: 'a'.repeat(40), permalink: 'https://deploy.example.netlify.app' }]);
  }
  if (url.hostname === 'api.netlify.com') {
    return jsonResponse({ id: 'site-sensitive-id', ssl_url: 'https://app.banke.tw', custom_domain: 'app.banke.tw' });
  }
  if (url.hostname === 'api.render.com' && /\/deploys$/.test(url.pathname)) {
    return jsonResponse([{ deploy: { id: 'deploy-render-sensitive-id', commit: { id: 'b'.repeat(40) } } }]);
  }
  if (url.hostname === 'api.render.com' && /env-vars$/.test(url.pathname)) {
    return jsonResponse([
      ...['BANK_ENV', 'BANK_ALLOWED_ORIGINS', 'BANK_OIDC_ISSUER', 'BANK_OIDC_JWKS_URL', 'BANK_OIDC_AUDIENCE', 'BANK_OIDC_SESSION_CLAIM', 'BANK_PRODUCTION_DATABASE_HOST', 'DATABASE_API_URL']
        .map(key => ({ envVar: { key, value: `secret-${key}` } }))
    ]);
  }
  if (url.hostname === 'api.render.com') {
    return jsonResponse({ service: { id: 'render-sensitive-id', serviceDetails: { url: 'https://api.banke.tw', runtime: 'node' }, autoDeploy: false } });
  }
  if (url.pathname.includes('/api/v2/clients/')) {
    return jsonResponse({
      callbacks: ['https://app.banke.tw/'],
      allowed_logout_urls: ['https://app.banke.tw/'],
      web_origins: ['https://app.banke.tw'],
      allowed_origins: ['https://app.banke.tw'],
      oidc_conformant: true,
      token_endpoint_auth_method: 'none',
      refresh_token: { rotation_type: 'rotating', expiration_type: 'expiring' }
    });
  }
  if (url.pathname.includes('/api/v2/resource-servers')) {
    return jsonResponse([{ id: 'api-sensitive-id', identifier: 'https://bankeban-api', signing_alg: 'RS256' }]);
  }
  if (url.pathname.includes('/api/v2/connections')) {
    return jsonResponse([{ id: 'connection-sensitive-id', name: 'production-connection', strategy: 'auth0', enabled_clients: ['production-client-synthetic'] }]);
  }
  if (url.pathname.includes('/api/v2/attack-protection/')) {
    return jsonResponse({ enabled: true, mode: 'block' });
  }
  if (url.pathname.includes('/api/v2/log-streams')) {
    return jsonResponse([{ id: 'stream-sensitive-id', type: 'eventbridge', status: 'active', sink: { awsAccountId: 'sensitive-account' } }]);
  }
  throw new Error('Unexpected evidence URL.');
};

assert.equal((await collectNetlifyEvidence(config, fetcher)).status, EVIDENCE_STATUS.PASS);
assert.equal((await collectRenderEvidence(config, fetcher)).status, EVIDENCE_STATUS.PASS);
assert.equal((await collectAuth0ManagementEvidence(config, fetcher)).status, EVIDENCE_STATUS.PASS);
assert.equal(calls.every(item => item.method === 'GET' && item.authorizationPresent), true);

const platformValidator = async () => ({
  checks: [
    { id: 'repository.gate', category: 'Repository Validation', status: VALIDATION_STATUS.PASS, summary: 'Repository passed.' },
    { id: 'database.schema', category: 'Production Database / Neon', status: VALIDATION_STATUS.BLOCKED, summary: 'Read-only role missing.' }
  ]
});
const report = await collectProductionEvidence({
  env,
  fetcher,
  platformValidator,
  now: () => new Date('2026-08-04T12:00:00.000Z')
});
assert.equal(report.overallStatus, EVIDENCE_STATUS.BLOCKED);
assert.equal(report.productionMutation, false);
assert.equal(report.secretsEmitted, false);
assert.match(report.hashManifest.sha256, /^[a-f0-9]{64}$/);
assert.equal(report.hashManifest.entries.length, report.records.length);
const serialized = JSON.stringify(report);
assert.doesNotMatch(serialized, /netlify-sensitive-token|render-sensitive-token|synthetic-signature|secret-BANK_ENV|site-sensitive-id|render-sensitive-id|connection-sensitive-id|stream-sensitive-id|sensitive-account/);
const markdown = renderEvidenceMarkdown(report);
assert.match(markdown, /Production Evidence Report/);
assert.match(markdown, /SHA-256/);
assert.doesNotMatch(markdown, /sensitive-token|Authorization|DATABASE_READONLY_URL=/);

const committedHashes = JSON.parse(await readFile('docs/PRODUCTION_EVIDENCE_HASHES.json', 'utf8'));
assert.equal(committedHashes.algorithm, 'SHA-256');
assert.equal(committedHashes.entries.length, 13);
assert.equal(evidenceSha256(committedHashes.entries), committedHashes.sha256);
assert.equal(new Set(committedHashes.entries.map(item => item.id)).size, committedHashes.entries.length);
assert.equal(committedHashes.entries.every(item => /^[a-f0-9]{64}$/.test(item.sha256)), true);

console.log('Production evidence authorization, GET-only collection, hash manifest and redaction tests passed.');
