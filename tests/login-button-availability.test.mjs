import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

// Local fixtures only: no identity provider, API, timers or business writes.
const source = await readFile('staging-auth.js', 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function scenario({ swallowedTimeout = false, callback = false } = {}) {
  let now = 1_800_000_000_000;
  let restored = callback;
  const restore = deferred(), redirect = deferred();
  const button = {}, hint = {}, events = [];
  const calls = { client: 0, restore: 0, redirect: 0, callback: 0, claims: 0, bootstrap: 0, enter: 0, foreground: 0 };
  const claim = 'https://banke.tw/session_id';
  const token = `header.${Buffer.from(JSON.stringify({ sub: 'fixture-user', exp: now / 1000 + 300,
    [claim]: 'fixture-session' })).toString('base64url')}.signature`;
  const sdk = {
    async checkSession(options) {
      calls.restore++; assert.equal(options.timeoutInSeconds, 8);
      try { restored = await restore.promise; }
      catch (error) { if (!swallowedTimeout) throw error; }
    },
    async handleRedirectCallback() { calls.callback++; },
    async isAuthenticated() { return restored; },
    async getTokenSilently() { return token; },
    async getIdTokenClaims() { calls.claims++; return { sid: 'fixture-session' }; },
    loginWithRedirect() { calls.redirect++; return redirect.promise; },
    async logout() {}
  };
  const window = {
    crypto: webcrypto,
    shiftEnvironment: { name: 'production', dataBackend: 'postgres', storageKey: x => x,
      auth: { domain: 'auth.fixture.example', clientId: 'fixture', audience: 'https://api.fixture.example' } },
    location: { href: 'https://app.fixture.example/', search: callback ? '?code=fixture&state=fixture' : '' },
    history: { replaceState() {} },
    auth0: { Auth0Client: function (options) {
      calls.client++; assert.equal(options.useRefreshTokens, false);
      assert.equal(options.cacheLocation, 'memory'); return sdk;
    } },
    shiftResumeDiagnostics: {
      mark: (event, data) => events.push({ event, timestamp: now, ...data }), intent() {},
      authError: error => ({ error_code: error?.code || error?.error || 'OTHER' })
    },
    shiftPostgresCloud: {
      async connect({ assertCurrent }) { assertCurrent(); calls.bootstrap++; return { role: 'boss' }; },
      activateForegroundSync() { calls.foreground++; }
    },
    shiftAppSession: { async enter(role, employee, { isCurrent }) { assert.ok(isCurrent()); calls.enter++; } }
  };
  const document = { visibilityState: 'visible', title: 'Fixture',
    querySelector: name => name === '#bossLogin' ? button : name === '#loginHint' ? hint : null };
  const context = vm.createContext({ window, document, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    Date: class extends Date { static now() { return now; } },
    sessionStorage: { removeItem() {} }, atob: x => Buffer.from(x, 'base64').toString('binary') });
  vm.runInContext(source, context);
  const initial = window.shiftAuth.ensureInitialized();
  return { window, button, hint, events, calls, restore, redirect, initial,
    advance(ms) { now += ms; }, reloadScript() { vm.runInContext(source, context); } };
}

for (const swallowedTimeout of [false, true]) {
  const page = scenario({ swallowedTimeout });
  assert.equal(page.button.disabled, false, 'button must be usable while restore is still pending');
  assert.equal(page.button.textContent, '使用 Auth0 登入');
  assert.equal(page.events.find(e => e.event === 'LOGIN_SCREEN_USABLE').elapsed_ms, 0,
    'availability must not wait for the simulated 8s timeout (not a Windows timing claim)');
  page.advance(8000);
  page.restore.reject(Object.assign(new Error('fixture timeout'), { error: 'timeout' }));
  await page.initial;
  assert.equal(page.button.disabled, false);
  assert.equal(page.button.textContent, '使用 Auth0 登入');
  assert.equal(page.calls.bootstrap, 0);
  assert.equal(page.calls.redirect, 0);
  assert.equal(page.events.some(e => e.event === 'SILENT_RENEW_PASS'), false,
    'SDK swallowing a timeout is not successful restoration');
}

for (const outcome of ['success', 'timeout', 'failure']) {
  const page = scenario();
  const clicked = page.button.onclick({ type: 'click' });
  assert.equal(page.calls.redirect, 1, 'interactive redirect starts without awaiting restore');
  assert.equal(page.button.onclick({ type: 'click' }), clicked, 'double click joins one redirect');
  assert.equal(page.window.shiftAuth.ensureInitialized(), clicked, 'initialization cannot overlap interactive login');
  page.reloadScript();
  assert.equal(page.calls.client, 1);
  const label = page.button.textContent, status = page.hint.textContent;
  if (outcome === 'success') page.restore.resolve(true);
  else page.restore.reject(Object.assign(new Error('late fixture'), { error: outcome === 'timeout' ? 'timeout' : 'login_required' }));
  await page.initial;
  assert.equal(page.button.textContent, label);
  assert.equal(page.hint.textContent, status);
  assert.equal(page.button.disabled, true);
  assert.equal(page.calls.bootstrap, 0);
  assert.equal(page.calls.claims, 0, 'stale restoration cannot bind an old identity');
  assert.equal(page.calls.enter, 0);
  assert.equal(page.events.findLast(e => e.event === 'AUTH_INIT_END').stale_result_ignored, true);
  assert.equal(page.events.filter(e => e.event === 'AUTHORIZE_REDIRECT_REQUESTED').length, 1);
  page.redirect.resolve(); await clicked;
  await page.button.onclick({ type: 'click' });
  assert.equal(page.calls.redirect, 1, 'successful redirect remains single-flight until document navigation');
}

const automatic = scenario();
automatic.restore.resolve(true); await automatic.initial;
assert.equal(automatic.calls.bootstrap, 1);
assert.equal(automatic.calls.enter, 1);
assert.equal(automatic.calls.foreground, 1);
assert.equal(automatic.calls.redirect, 0);
assert.equal(automatic.button.textContent, 'Auth0 已登入');
assert.equal(automatic.button.disabled, true);
await automatic.window.shiftAuth.ensureInitialized(); automatic.reloadScript();
assert.equal(automatic.calls.bootstrap, 1);

const callback = scenario({ callback: true });
assert.equal(callback.button.disabled, true, 'do not expose interactive login during callback validation');
await callback.initial;
assert.equal(callback.calls.restore, 0);
assert.equal(callback.calls.callback, 1);
assert.equal(callback.calls.bootstrap, 1);

const failedRedirect = scenario();
const failedClick = failedRedirect.button.onclick({ type: 'click' });
failedRedirect.redirect.reject(new Error('fixture navigation rejected'));
await failedClick;
assert.equal(failedRedirect.button.disabled, false);
const status = failedRedirect.hint.textContent;
failedRedirect.restore.resolve(true); await failedRedirect.initial;
assert.equal(failedRedirect.hint.textContent, status);
assert.equal(failedRedirect.calls.bootstrap, 0);
await failedRedirect.button.onclick({ type: 'click' });
assert.equal(failedRedirect.calls.redirect, 2, 'only an explicit second click retries a failed redirect');

const logout = scenario();
await logout.window.shiftAuth.logoutProvider();
logout.restore.resolve(true); await logout.initial;
assert.equal(logout.calls.bootstrap, 0);
assert.equal(logout.window.shiftAuth.getClaimVerification().checked, false);
assert.equal(logout.events.findLast(e => e.event === 'AUTH_INIT_END').stale_result_ignored, true);
console.log('Login button availability passed: immediate button, pending/8s restore, click priority, stale outcomes, redirect single flight, automatic login, callback, logout and explicit retry.');
