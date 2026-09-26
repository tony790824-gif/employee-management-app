import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

// Virtual time, real transport + cloud adapter. No production/network access.
const apiSource = await readFile('postgres-api-client.js', 'utf8');
const cloudSource = await readFile('postgres-cloud.js', 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function fixture() {
  let now = 0, nextTimer = 0, stored = {};
  const timers = new Map(), listeners = new Map(), requests = [], wakeups = [];
  const workspaceId = `ws_${'a'.repeat(32)}`;
  const bootstrap = { ok: true, workspaceId, role: 'boss', employeeId: null,
    currentUser: { displayName: 'Fixture', workspaceId, role: 'boss', employeeId: null },
    data: { workspace: { id: workspaceId }, sync: { revision: 0 }, employees: [], shifts: [] } };
  const response = payload => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(payload) });
  const context = vm.createContext({ console, URL, TextEncoder, TextDecoder, AbortController, crypto: webcrypto,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    CustomEvent: class { constructor(type) { this.type = type; } },
    sessionStorage: { setItem() {}, removeItem() {}, getItem() { return null; } },
    document: { visibilityState: 'visible', querySelector() { return null; }, dispatchEvent() {},
      addEventListener(type, fn) { listeners.set(type, fn); } },
    fetch: async (url, options) => {
      const path = new URL(url).pathname;
      requests.push({ path, method: options.method, headers: options.headers });
      if (path.endsWith('/readiness')) return new Promise((resolve, reject) => {
        wakeups.push(() => resolve(response({ ok: true })));
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
      });
      return response(path.endsWith('/bootstrap') ? bootstrap : { ok: true });
    },
    window: { navigator: { onLine: true }, location: { href: 'https://fixture.example/' },
      shiftEnvironment: { name: 'production', dataBackend: 'postgres', postgresApiUrl: 'https://api.fixture.example/v1',
        postgresWorkspaceId: workspaceId, storageKey: key => key },
      shiftStateStore: { normalize: x => x, read: () => stored, write: value => { stored = value; }, clearSensitive() {} },
      addEventListener(type, fn) { listeners.set(type, fn); } }
  });
  vm.runInContext(apiSource, context);
  context.window.BankePostgresApi = context.BankePostgresApi;
  vm.runInContext(cloudSource, context);
  await flush();
  const stages = [];
  const options = { getAccessToken: async () => 'fixture-token',
    onReadinessPending: () => stages.push('pending'), onReadinessReady: () => stages.push('ready') };
  return { context, requests, timers, wakeups, stages,
    connect: extra => context.window.shiftPostgresCloud.connect({ ...options, ...extra }),
    async advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } await flush(); },
    async foreground() { listeners.get('blur')(); context.document.visibilityState = 'hidden'; listeners.get('visibilitychange')();
      context.document.visibilityState = 'visible'; listeners.get('visibilitychange')(); listeners.get('focus')(); await flush(); } };
}

for (const delay of [200, 20_000, 40_000]) {
  const f = await fixture();
  assert.equal(f.requests.length, 1, 'APP open starts readiness before token provider/login');
  assert.equal(f.requests[0].headers.Authorization, undefined);
  assert.deepEqual([...f.timers.values()].map(t => t.ms), [60_000]);
  const connection = f.connect();
  assert.equal(f.connect(), connection, 'login joins the exact connection single-flight');
  await f.foreground();
  await f.advance(delay);
  assert.equal(f.requests.length, 1, 'pending startup warmup shared, including beyond 15 seconds and focus');
  assert.deepEqual(f.stages, ['pending']);
  f.wakeups[0]();
  await connection;
  assert.deepEqual(f.stages, ['pending', 'ready']);
  assert.deepEqual(f.requests.map(r => r.path), ['/v1/readiness', '/v1/auth/session', '/v1/bootstrap']);
  assert.equal(f.requests.filter(r => r.path.endsWith('/readiness')).length, 1);
  assert.equal(f.timers.size, 0);
}

const alreadyWarm = await fixture();
alreadyWarm.wakeups[0]();
await flush();
await alreadyWarm.connect();
assert.equal(alreadyWarm.requests.filter(r => r.path.endsWith('/readiness')).length, 1,
  'readiness completed before token-ready is reused, not fetched again');

const preLoginTimeout = await fixture();
await preLoginTimeout.advance(60_000);
await assert.rejects(preLoginTimeout.connect(), { code: 'POSTGRES_API_TIMEOUT' });
assert.equal(preLoginTimeout.requests.length, 1,
  'background failure is handled without blocking SDK setup or silently starting another request');

const timeout = await fixture();
const failed = timeout.connect();
const rejected = assert.rejects(failed, error => error.code === 'POSTGRES_API_TIMEOUT' && error.operation === 'readiness');
await timeout.advance(59_999);
assert.equal(timeout.requests.length, 1);
assert.deepEqual(timeout.stages, ['pending']);
await timeout.advance(1);
await rejected;
assert.equal(timeout.timers.size, 0);
await timeout.foreground();
assert.equal(timeout.requests.length, 1, 'no automatic restart after timeout');
await assert.rejects(timeout.connect(), { code: 'POSTGRES_API_TIMEOUT' });
assert.equal(timeout.requests.length, 1, 'failed gate is not silently retried');
const retry = timeout.connect({ retryReadiness: true });
await flush();
assert.equal(timeout.requests.length, 2, 'explicit reconnect makes exactly one new attempt');
timeout.wakeups[1]();
await retry;
assert.equal(timeout.requests.filter(r => r.path.endsWith('/auth/session')).length, 1);
assert.equal(timeout.requests.filter(r => r.path.endsWith('/bootstrap')).length, 1);
assert.ok(timeout.requests.every(r => r.method === 'GET' || (r.path === '/v1/auth/session' && r.method === 'POST')),
  'only existing session establishment may POST; no business write is submitted or replayed');

// Existing authenticated transport still uses the original 15-second default.
const auth = await readFile('staging-auth.js', 'utf8');
assert.match(auth, /正在喚醒伺服器，首次連線可能需要較久…/);
assert.match(auth, /retryReadiness: run.reason === 'API_RETRY'/);
assert.match(apiSource, /DEFAULT_TIMEOUT_MS = 15_000/);
console.log('Production single-flight readiness warmup tests passed (200ms / 20s / 40s / 60s timeout).');
