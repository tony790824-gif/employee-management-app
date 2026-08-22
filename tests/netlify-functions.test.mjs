import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequestHandler } from '../server/app.mjs';
import { createNetlifyApiHandler } from '../server/netlify-adapter.mjs';
import { createScheduledPushDrain } from '../server/netlify-push-drain.mjs';

const workspaceId = `ws_${'a'.repeat(32)}`;
const identity = Object.freeze({
  issuer: 'https://identity.example/',
  subject: 'employee-1',
  sessionId: '11111111-1111-4111-8111-111111111111'
});
let readinessQueries = 0;
const pool = {
  async query(sql) {
    if (sql === 'SELECT 1') readinessQueries += 1;
    return { rows: [{ '?column?': 1 }] };
  }
};
const requestHandler = createRequestHandler({
  pool,
  allowedOrigins: ['https://app.example'],
  environment: 'production',
  buildSha: 'abcdef1234567890',
  verifyAccessToken: async () => identity,
  commandService: {
    listNotifications: async () => ({ ok: true, items: [], unreadCount: 0 })
  }
});
let runtimeReadinessChecks = 0;
const api = createNetlifyApiHandler({
  runtimeFactory: () => ({
    requestHandler,
    async ensureReady() { runtimeReadinessChecks += 1; }
  }),
  logger: { error() {} }
});

const health = await api(new Request('https://app.example/v1/health'));
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  ok: true,
  environment: 'production',
  buildSha: 'abcdef1234567890'
});
assert.equal(health.headers.get('cache-control'), 'no-store');

const readiness = await api(new Request('https://app.example/.netlify/functions/api/readiness'));
assert.equal(readiness.status, 200, 'rewritten Netlify function path maps back to /v1');
assert.equal(readinessQueries, 1);
assert.equal(runtimeReadinessChecks, 1, 'warm function runtime verifies its database target once');

const notifications = await api(new Request('https://app.example/v1/notifications', {
  headers: {
    Origin: 'https://app.example',
    Authorization: 'Bearer a.b.c',
    'X-Workspace-Id': workspaceId
  }
}));
assert.equal(notifications.status, 200);
assert.deepEqual(await notifications.json(), { ok: true, items: [], unreadCount: 0 });

const forbiddenOrigin = await api(new Request('https://app.example/v1/notifications', {
  headers: { Origin: 'https://evil.example' }
}));
assert.equal(forbiddenOrigin.status, 403);
assert.equal((await forbiddenOrigin.json()).code, 'ORIGIN_NOT_ALLOWED');

let disabledPoolCreates = 0;
const disabledDrain = createScheduledPushDrain({
  env: { BANK_WEB_PUSH_ENABLED: 'false' },
  poolFactory: () => { disabledPoolCreates += 1; },
  logger: { info() {}, error() {} }
});
assert.deepEqual(await disabledDrain(), { enabled: false, claimed: 0 });
assert.equal(disabledPoolCreates, 0, 'disabled schedule never opens a database connection');

const pushEnv = {
  BANK_WEB_PUSH_ENABLED: 'true',
  BANK_WEB_PUSH_PUBLIC_KEY: 'B'.repeat(87),
  BANK_WEB_PUSH_PRIVATE_KEY: 'C'.repeat(43),
  BANK_WEB_PUSH_SUBJECT: 'mailto:security@banke.invalid'
};
let targetChecks = 0;
let poolEnds = 0;
let observedBatchSize = 0;
let drains = 0;
const scheduledDrain = createScheduledPushDrain({
  env: pushEnv,
  poolFactory: () => ({ async end() { poolEnds += 1; } }),
  targetVerifier: async () => { targetChecks += 1; },
  dispatcherFactory: options => {
    observedBatchSize = options.batchSize;
    return { async drainOnce() { drains += 1; return 3; } };
  },
  logger: { info() {}, error() {} }
});
assert.deepEqual(await scheduledDrain(), { enabled: true, claimed: 3 });
assert.equal(targetChecks, 1);
assert.equal(drains, 1, 'scheduled invocation performs exactly one drain cycle');
assert.equal(observedBatchSize, 4, 'batch stays within the 30-second scheduled-function budget');
assert.equal(poolEnds, 1, 'scheduled invocation always closes its pool');

const failingDrain = createScheduledPushDrain({
  env: pushEnv,
  poolFactory: () => ({ async end() { poolEnds += 1; } }),
  targetVerifier: async () => { throw new Error('sensitive provider detail'); },
  logger: { info() {}, error(value) { assert.doesNotMatch(value, /sensitive provider detail/); } }
});
await assert.rejects(failingDrain, error => error.code === 'NETLIFY_PUSH_DRAIN_FAILED');
assert.equal(poolEnds, 2, 'failed invocation also closes its pool');

const [netlifyConfig, redirects] = await Promise.all([
  readFile('netlify.toml', 'utf8'),
  readFile('_redirects', 'utf8')
]);
assert.match(netlifyConfig, /directory = "netlify\/functions"/);
assert.doesNotMatch(netlifyConfig, /schedule\s*=/,
  'Initial Production launch must defer scheduled push drains to avoid unnecessary Free-plan usage.');
assert.match(netlifyConfig, /publish = "dist"/);
assert.match(netlifyConfig, /NODE_VERSION = "22\.14\.0"/,
  'Netlify must use Node 22.14 or newer Corepack keys with pnpm 11.9');
assert.ok(redirects.indexOf('/v1/*') < redirects.indexOf('/* /index.html'),
  'API function rewrite must precede the SPA fallback');

const apiFunction = await import('../netlify/functions/api.mjs');
const pushFunction = await import('../netlify/functions/push-drain.mjs');
assert.equal(typeof apiFunction.default, 'function');
assert.equal(typeof pushFunction.default, 'function');

console.log('Netlify Functions API adapter and scheduled Push drain regression tests passed.');
