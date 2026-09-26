import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Offline only. Exercise the real API timeout + auth lifecycle together.
const authSource = await readFile('staging-auth.js', 'utf8');
const apiSource = await readFile('postgres-api-client.js', 'utf8');
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 2)); };
async function scenario({ search = '?code=fixture&state=fixture', gate, claimsGate, callbackError } = {}) {
  let now = 1_800_000_000_000;
  let callbackCalls = 0, checks = 0, connects = 0, enters = 0, active = 0, logoutCalls = 0;
  let hang = true;
  const events = [], requests = [], timers = new Map();
  let nextTimer = 0;
  const button = {}, hint = {};
  const payload = { sub: 'fixture-user', exp: now / 1000 + 300, 'https://banke.tw/session_id': 'fixture-session' };
  const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  const sdk = {
    async handleRedirectCallback() { callbackCalls++; if (callbackError) throw callbackError; },
    async checkSession() { checks++; }, async isAuthenticated() { return true; },
    async getTokenSilently() { return token; },
    async getIdTokenClaims() { if (claimsGate) await claimsGate.promise; return { sid: 'fixture-session' }; },
    async logout() { logoutCalls++; },
    async loginWithRedirect() { throw new Error('This test must never redirect'); }
  };
  const browser = {
    crypto: webcrypto, location: { href: `https://fixture.example/${search}`, search },
    history: { replaceState() { browser.location.search = ''; } },
    shiftEnvironment: { name: 'production', dataBackend: 'postgres', storageKey: x => x,
      auth: { domain: 'auth.fixture.example', clientId: 'fixture-client', audience: 'https://api.fixture.example' } },
    auth0: { Auth0Client: function () { return sdk; } },
    shiftResumeDiagnostics: { intent() {}, mark: (event, data = {}) => events.push({ event, ...data }),
      authError: error => ({ error_code: error?.code || error?.error || 'OTHER', error_type: error?.name || 'OTHER' }) },
    shiftAppSession: { async enter(role, employee, { isCurrent }) { if (isCurrent()) enters++; } },
    shiftStateStore: { clearSensitive() {} }
  };
  const document = { title: 'Fixture', visibilityState: 'visible', querySelector: s => s === '#bossLogin' ? button : s === '#loginHint' ? hint : null };
  const context = vm.createContext({ window: browser, document, URL, URLSearchParams, TextEncoder, TextDecoder,
    Uint8Array, AbortController, sessionStorage: { removeItem() {} },
    Date: class extends Date { static now() { return now; } },
    atob: x => Buffer.from(x, 'base64').toString('binary'),
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(apiSource, context);
  browser.shiftPostgresCloud = {
    async connect({ getAccessToken, assertCurrent, diagnosticContext, onReadinessPending, onReadinessReady }) {
      connects++;
      if (gate) { await gate.promise; assertCurrent(); return { role: 'boss' }; }
      const client = context.BankePostgresApi.createClient({ baseUrl: 'https://api.fixture.example/v1',
        getAccessToken, getWorkspaceId: async () => `ws_${'a'.repeat(32)}`, cryptoImpl: webcrypto, diagnosticContext,
        fetchImpl: async (url, options) => {
          requests.push({ operation: new URL(url).pathname, method: options.method });
          if (hang) return new Promise((resolve, reject) => options.signal.addEventListener('abort',
            () => reject(Object.assign(new Error('fixture abort'), { name: 'AbortError' }))));
          return { ok: true, headers: { get: () => null }, text: async () => '{"ok":true}' };
        } });
      onReadinessPending();
      await client.readiness(); assertCurrent();
      onReadinessReady();
      return { role: 'boss' };
    }, activateForegroundSync() { active++; }
  };
  vm.runInContext(authSource, context);
  await flush();
  return { browser, button, hint, document, events, requests, timers,
    stats: () => ({ callbackCalls, checks, connects, enters, active, logoutCalls }),
    finish: () => browser.shiftAuth.ensureInitialized(),
    succeed() { hang = false; },
    timeout() { now += 15_000; for (const timer of [...timers.values()]) { assert.equal(timer.ms, 15_000); timer.fn(); } },
    duplicateScript() { vm.runInContext(authSource, context); } };
}

const timeout = await scenario();
assert.equal(timeout.events.filter(e => e.event === 'AUTH_INIT_END').length, 0, 'callback completion is not whole initialization completion');
assert.equal(timeout.events.filter(e => e.event === 'AUTH_SESSION_INIT_END' && e.success).length, 1);
assert.equal(timeout.events.filter(e => e.event === 'AUTH_CALLBACK_END' && e.success).length, 1);
assert.equal(timeout.button.textContent, '正在喚醒伺服器…');
assert.equal(timeout.hint.textContent, '正在喚醒伺服器，首次連線可能需要較久…');
const inFlight = timeout.finish();
assert.equal(timeout.finish(), inFlight, 'concurrent initialization must return the exact same Promise');
timeout.duplicateScript();
timeout.timeout();
await inFlight;
assert.equal(timeout.timers.size, 0, 'AbortController timeout must be cleared after rejection');
assert.equal(timeout.button.textContent, '重新連線');
assert.equal(timeout.button.disabled, false);
assert.equal(timeout.hint.textContent, '伺服器連線未完成，請確認網路後按「重新連線」。');
assert.equal(timeout.browser.shiftAuth.getClaimVerification().matchesAuth0SessionId, true, 'API timeout does not invalidate authenticated identity');
assert.equal(timeout.stats().logoutCalls, 0);
assert.equal(timeout.events.filter(e => e.event === 'AUTH_INIT_END').length, 1, 'one terminal completion per run');
const apiTimeout = timeout.events.find(e => e.event === 'API_REQUEST_TIMEOUT');
assert.equal(apiTimeout.operation, 'readiness');
assert.equal(apiTimeout.elapsed_ms, 15_000);
assert.equal(apiTimeout.error_stage, 'api-request');
assert.equal(apiTimeout.error_code, 'POSTGRES_API_TIMEOUT');
assert.equal(timeout.events.find(e => e.event === 'API_BOOTSTRAP_TIMEOUT').operation, 'readiness');
assert.equal(timeout.events.find(e => e.event === 'API_BOOTSTRAP_END').success, false);
assert.ok(timeout.events.filter(e => /INIT|CALLBACK|API_BOOTSTRAP/.test(e.event)).every(e => e.run_id === 1 && e.generation === 1));
timeout.succeed();
const retried = timeout.button.onclick();
assert.equal(timeout.button.onclick(), retried, 'repeated retry clicks join one API initialization');
await retried;
assert.equal(timeout.button.textContent, 'Auth0 已登入');
assert.deepEqual(timeout.stats(), { callbackCalls: 1, checks: 0, connects: 2, enters: 1, active: 1, logoutCalls: 0 });
assert.equal(timeout.events.filter(e => e.event === 'AUTH_INIT_END').length, 2);
assert.equal(timeout.events.at(-1).run_id, 2);
assert.equal(timeout.events.at(-1).success, true);
await timeout.finish();
assert.equal(timeout.stats().connects, 2, 'completed initialization must not bootstrap again');
assert.ok(timeout.requests.every(r => r.method === 'GET'), 'connection retry must never replay a business write');

for (const rejectLate of [false, true]) {
  const gate = defer();
  const stale = await scenario({ gate });
  const completion = stale.finish();
  await stale.browser.shiftAuth.logoutProvider();
  const label = stale.button.textContent, message = stale.hint.textContent;
  if (rejectLate) gate.reject(Object.assign(new Error('late API timeout'), { code: 'POSTGRES_API_TIMEOUT' }));
  else gate.resolve();
  await completion;
  assert.equal(stale.stats().enters, 0);
  assert.equal(stale.stats().active, 0);
  assert.equal(stale.button.textContent, label);
  assert.equal(stale.hint.textContent, message);
  assert.equal(stale.browser.shiftAuth.getClaimVerification().checked, false);
  assert.equal(stale.events.at(-1).stale_result_ignored, true);
  assert.equal(stale.events.filter(e => e.event === 'AUTH_INIT_END').length, 1);
}
const claimsGate = defer();
const staleClaims = await scenario({ claimsGate });
const claimsDone = staleClaims.finish();
await staleClaims.browser.shiftAuth.logoutProvider();
claimsGate.resolve();
await claimsDone;
assert.equal(staleClaims.browser.shiftAuth.getClaimVerification().checked, false, 'late token claims cannot resurrect logout');
assert.equal(staleClaims.stats().connects, 0);

for (const search of ['', '?state=fixture', '?code=&state=fixture']) {
  const gate = defer(); gate.resolve();
  const ordinary = await scenario({ search, gate }); await ordinary.finish();
  assert.equal(ordinary.stats().callbackCalls, 0, 'ordinary boot/stale flag/empty query is not an Auth0 callback');
  assert.equal(ordinary.stats().checks, 1);
}
const invalid = await scenario({ callbackError: Object.assign(new Error('fixture mismatch'), { error: 'state_mismatch' }) });
await invalid.finish();
assert.equal(invalid.stats().connects, 0, 'SDK callback rejection must stay fail-closed');
assert.equal(invalid.events.find(e => e.event === 'AUTH_CALLBACK_END').success, false);
assert.notEqual(invalid.button.textContent, '正在連接 Auth0…');

// Attribute each timeout to a fixed operation label; neither reads nor writes
// are retried by the transport itself. Foreground recovery is tested separately.
for (const [method, operation, args] of [
  ['readiness', 'readiness', []], ['establishSession', 'session-establish', []],
  ['bootstrap', 'bootstrap', []], ['listEmployees', 'employees', []],
  ['listAnnouncements', 'announcements', []], ['listNotifications', 'notifications', []],
  ['executeCommand', 'command', ['shifts.create', { privateFixture: 'DO_NOT_RECORD' }]]
]) {
  const records = [], timeouts = new Map(); let calls = 0;
  const transport = vm.createContext({ URL, TextEncoder, AbortController,
    window: { shiftRuntimeTiming: { mark() {} }, shiftResumeDiagnostics: {
      mark: (event, data) => records.push({ event, ...data }),
      authError: error => ({ error_code: error.code, error_type: error.name }) } },
    setTimeout(fn) { timeouts.set(1, fn); return 1; }, clearTimeout(id) { timeouts.delete(id); } });
  vm.runInContext(apiSource, transport);
  const client = transport.BankePostgresApi.createClient({ baseUrl: 'https://fixture.example/v1',
    getAccessToken: async () => 'DO_NOT_RECORD', getWorkspaceId: async () => `ws_${'a'.repeat(32)}`,
    cryptoImpl: webcrypto, fetchImpl: async (url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) => signal.addEventListener('abort',
        () => reject(Object.assign(new Error('fixture abort'), { name: 'AbortError' }))));
    } });
  const request = client[method](...args);
  const rejected = assert.rejects(request, error => error.code === 'POSTGRES_API_TIMEOUT');
  await flush();
  timeouts.get(1)();
  await rejected; await flush();
  assert.equal(calls, 1, 'timeout must not replay the request, especially a business write');
  assert.equal(timeouts.size, 0);
  assert.equal(records.find(e => e.event === 'API_REQUEST_TIMEOUT').operation, operation);
  assert.doesNotMatch(JSON.stringify(records), /DO_NOT_RECORD|Authorization|fixture.example/);
}
console.log('Auth initialization completion passed: real 15s API timeout, phased telemetry, single flight, explicit retry, stale success/rejection/logout, callback validation.');
