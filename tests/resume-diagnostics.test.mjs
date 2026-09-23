import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile('resume-diagnostics.js', 'utf8');
const storage = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
function boot({ shared = new Map(), tab = new Map(), now = 1000, type = 'navigate', discarded = false, failingStorage = false, path = '/' } = {}) {
  const listeners = { window: {}, document: {}, sw: {} };
  const on = target => (name, fn) => (listeners[target][name] ||= []).push(fn);
  const nodes = [];
  function node(tag) {
    const result = { tag, style: {}, children: [], handlers: {}, textContent: '', value: '',
      setAttribute() {}, append(...items) { this.children.push(...items); },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      querySelector(name) { return this.children.find(child => child.tag === name); },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, select() {} };
    nodes.push(result); return result;
  }
  let copied = '';
  const navigator = { onLine: true, serviceWorker: { controller: {}, addEventListener: on('sw') },
    clipboard: { async writeText(value) { copied = value; } } };
  const document = { visibilityState: 'visible', wasDiscarded: discarded, body: node('body'),
    addEventListener: on('document'), createElement: node };
  const window = { crypto: webcrypto, navigator, document, location: { pathname: path, search: '?code=DO_NOT_RECORD&state=DO_NOT_RECORD' },
    matchMedia: () => ({ matches: true }), addEventListener: on('window') };
  const localStorage = failingStorage ? { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } } : storage(shared);
  const sandbox = { window, document, navigator, performance: { getEntriesByType: () => [{ type }] },
    localStorage, sessionStorage: storage(tab), Date: class extends Date { static now() { return now; } }, queueMicrotask };
  vm.runInNewContext(source, sandbox);
  const emit = (target, event, data = {}) => listeners[target][event]?.forEach(fn => fn(data));
  return { shared, tab, window, document, nodes, emit, advance(ms) { now += ms; }, copied: () => copied,
    diag: window.shiftResumeDiagnostics, snapshot: () => JSON.parse(JSON.stringify(window.shiftResumeDiagnostics.snapshot())) };
}

const first = boot();
assert.equal(first.snapshot().analysis.classification, 'UNKNOWN');
const meta = first.snapshot().events[0];
assert.deepEqual(Object.keys(meta).sort(), ['boot_id','event','navigation_type','online','pathname','standalone','sw_controller','tab_id','timestamp','visibility','was_discarded'].sort());
assert.equal(meta.standalone, true);
first.emit('window', 'blur');
first.document.visibilityState = 'hidden'; first.emit('document', 'visibilitychange');
first.emit('document', 'freeze'); first.emit('window', 'pagehide', { persisted: true });
first.advance(5000);
first.emit('document', 'resume'); first.emit('window', 'pageshow', { persisted: true });
first.document.visibilityState = 'visible'; first.emit('document', 'visibilitychange');
first.emit('window', 'focus'); first.advance(125); first.diag.mark('UI_USABLE');
first.emit('window', 'offline'); first.emit('window', 'online'); first.emit('window', 'beforeunload');
assert.equal(first.snapshot().analysis.resume_to_ui_usable_ms, 125);
assert.equal(first.snapshot().analysis.new_boot, false);
assert.equal(first.snapshot().events.find(entry => entry.event === 'PAGEHIDE').persisted, true);
assert.equal(first.snapshot().events.find(entry => entry.event === 'PAGESHOW').persisted, true);

const reloaded = boot({ shared: first.shared, tab: first.tab, now: 7000, type: 'reload' });
assert.equal(reloaded.snapshot().analysis.classification, 'BROWSER_OR_PWA_RELOAD');
assert.equal(reloaded.snapshot().analysis.new_boot, true);
assert.equal(reloaded.snapshot().analysis.nav_intent, 'NONE');
assert.notEqual(reloaded.snapshot().current_boot_id, first.snapshot().current_boot_id);

function transition(action, extra = {}) {
  const a = boot(); action(a);
  return boot({ shared: a.shared, tab: a.tab, now: 2000, ...extra }).snapshot();
}
assert.equal(transition(a => a.diag.intent('AUTH_AUTHORIZE_RENEWAL', 'staging-auth')).analysis.classification, 'AUTH0_FULL_PAGE_REDIRECT');
assert.equal(transition(a => a.diag.mark('AUTHORIZE_REDIRECT_REQUESTED')).analysis.classification, 'AUTH0_FULL_PAGE_REDIRECT');
assert.equal(transition(a => a.diag.intent('USER_LOGIN', 'staging-auth')).analysis.classification, 'AUTH0_FULL_PAGE_REDIRECT');
assert.equal(transition(a => a.diag.intent('LEGACY_STORAGE_ATTENDANCE', 'boss-hours')).analysis.classification, 'APP_NAVIGATION');
assert.equal(transition(a => a.diag.intent('SERVICE_WORKER_UPDATE_RELOAD', 'pwa')).analysis.classification, 'SERVICE_WORKER_RELOAD');
const sw = transition(a => a.emit('sw', 'controllerchange'), { type: 'reload' });
assert.equal(sw.analysis.classification, 'SERVICE_WORKER_RELOAD');
assert.equal(sw.analysis.evidence, 'CONTROLLERCHANGE_CORRELATION_NOT_CAUSATION');
assert.equal(transition(a => a.emit('sw', 'controllerchange')).analysis.classification, 'UNKNOWN', 'controllerchange alone is not proof');
assert.equal(transition(() => {}, { discarded: true }).analysis.classification, 'BROWSER_OR_PWA_RELOAD');
assert.equal(transition(() => {}, { type: 'back_forward' }).analysis.classification, 'UNKNOWN');
assert.equal(transition(a => { a.diag.intent('USER_LOGIN', 'staging-auth'); a.diag.mark('NAV_CANCELLED'); }).analysis.classification, 'UNKNOWN');
assert.equal(transition(a => { a.diag.intent('USER_LOGIN', 'staging-auth'); a.diag.mark('UI_USABLE'); }).analysis.classification, 'UNKNOWN');
const otherTab = boot({ shared: first.shared });
assert.equal(otherTab.snapshot().analysis.new_boot, false, 'other windows must not create a false reload diagnosis');

const privacy = boot({ path: '/private@example.test/DO_NOT_RECORD' });
privacy.diag.mark('SILENT_RENEW_FAIL', privacy.diag.authError({ name: 'DO_NOT_RECORD', code: 'DO_NOT_RECORD', message: 'DO_NOT_RECORD' }));
privacy.diag.mark('TOKEN_CHECK', { has_token: true, seconds_to_expiry: 60.8, token: 'DO_NOT_RECORD', cookie: 'DO_NOT_RECORD', code: 'DO_NOT_RECORD' });
privacy.diag.intent('DO_NOT_RECORD', 'DO_NOT_RECORD');
privacy.diag.mark('DO_NOT_RECORD', { value: 'DO_NOT_RECORD' });
privacy.diag.mark('API_REQUEST_TIMEOUT', { run_id: 7, auth_run_id: 7, generation: 3,
  request_id: 2, elapsed_ms: 15000, reason: 'API_REQUEST', caller: 'postgres-api-client',
  operation: 'readiness', error_stage: 'api-request', stale_result_ignored: false,
  ...privacy.diag.authError({ name: 'PostgresApiError', code: 'POSTGRES_API_TIMEOUT', message: 'DO_NOT_RECORD' }) });
privacy.diag.mark('AUTH_SESSION_INIT_END', { run_id: 'DO_NOT_RECORD', generation: -1,
  operation: '/employees/DO_NOT_RECORD', caller: 'DO_NOT_RECORD', error_stage: 'DO_NOT_RECORD',
  elapsed_ms: Infinity, token: 'DO_NOT_RECORD' });
const requestTimeout = privacy.snapshot().events.find(e => e.event === 'API_REQUEST_TIMEOUT');
assert.equal(requestTimeout.operation, 'readiness');
assert.equal(requestTimeout.error_code, 'POSTGRES_API_TIMEOUT');
assert.equal(requestTimeout.run_id, 7);
assert.equal(requestTimeout.elapsed_ms, 15000);
assert.equal(requestTimeout.stale_result_ignored, false);
assert.equal(privacy.snapshot().events[0].pathname, '/[redacted]');
assert.equal(privacy.snapshot().events.find(e => e.event === 'TOKEN_CHECK').seconds_to_expiry, 60);
assert.doesNotMatch(JSON.stringify(privacy.snapshot()), /DO_NOT_RECORD|private@example|\?code|\?state/);
// Sanitize persisted records again, not just incoming events (storage may be tampered with).
const key = 'banke:resume-diagnostics:v1';
const tainted = JSON.parse(privacy.shared.get(key)); tainted[0].token = 'DO_NOT_RECORD'; tainted[0].pathname = '/DO_NOT_RECORD';
privacy.shared.set(key, JSON.stringify(tainted));
assert.doesNotMatch(JSON.stringify(privacy.snapshot()), /DO_NOT_RECORD/);
for (let i = 0; i < 250; i++) privacy.diag.mark('FOCUS');
assert.equal(privacy.snapshot().events.length, 200);
assert.equal(JSON.parse(privacy.shared.get(key)).length, 200);
assert.equal(boot({ failingStorage: true }).snapshot().persistence, 'UNAVAILABLE');

let prevented = false;
reloaded.emit('document', 'keydown', { ctrlKey: true, shiftKey: true, key: 'D', preventDefault() { prevented = true; }, stopPropagation() {} });
assert.equal(prevented, true);
const dialog = reloaded.nodes.find(n => n.tag === 'dialog');
assert.equal(dialog.open, true, 'diagnostics must work before auth and above the login overlay');
await dialog.children.find(n => n.textContent === '複製診斷紀錄').handlers.click();
assert.deepEqual(JSON.parse(reloaded.copied()), JSON.parse(dialog.querySelector('textarea').value));
assert.doesNotMatch(reloaded.copied(), /DO_NOT_RECORD/);
dialog.children.find(n => n.textContent === '關閉').handlers.click();
assert.equal(dialog.open, false);

const index = await readFile('index.html', 'utf8');
const loginCss = await readFile('login-screen.css', 'utf8');
assert.match(loginCss, /body:not\(\.app-authenticated\)>dialog#resumeDiagnosticsDialog\[open\]\{display:block!important\}/,
  'only the sanitized diagnostic dialog must remain visible above the unauthenticated screen');
assert.ok(index.indexOf('resume-diagnostics.js') < index.indexOf('postgres-api-client.js'), 'capture boot before authentication');
for (const file of ['access.js','boss-hours.js','enhancements.js','google-sheets-cloud.js','login.js','management-actions.js']) {
  const code = await readFile(file, 'utf8');
  for (const match of code.matchAll(/location\.reload\(\)/g)) {
    assert.match(code.slice(Math.max(0, match.index - 180), match.index), /shiftResumeDiagnostics\?\.intent\(/, `${file}: persist before reload`);
  }
}
const auth = await readFile('staging-auth.js', 'utf8');
for (const match of auth.matchAll(/await client\.(?:loginWithRedirect|logout)\(/g)) {
  assert.match(auth.slice(Math.max(0, match.index - 180), match.index), /shiftResumeDiagnostics\?\.intent\(/, 'record intent before Auth0 navigation');
}
const worker = await readFile('service-worker.js', 'utf8');
assert.match(worker, /await diagnostics\.put[\s\S]*reason:'SW_NOTIFICATION_OPEN'[\s\S]*await self\.clients\.openWindow/);
assert.doesNotMatch(source, /fetch\(|sendBeacon\(|console\.|innerHTML|location\.search|localStorage\.clear/);
console.log('Persistent resume diagnostics passed: reload continuity, navigation attribution, lifecycle, privacy, bounded storage, keyboard and copy.');

// Dedicated login summaries survive noisy polling, redirects and reloads. No network access.
const loginKey = 'banke:login-performance:v1';
const summary = page => page.snapshot().login_performance.summaries.at(-1);
function loginMark(page, event, data = {}) {
  page.diag.mark(event, { caller: 'staging-auth', run_id: 1, stale_result_ignored: false, ...data });
}
function apiStage(page, operation, duration, success = true) {
  loginMark(page, 'API_REQUEST_START', { operation }); page.advance(duration);
  loginMark(page, 'API_REQUEST_END', { operation, success });
}
const login = boot();
login.advance(100);
loginMark(login, 'AUTH_INIT_START');
login.advance(400);
loginMark(login, 'AUTH_CALLBACK_START');
login.advance(200);
loginMark(login, 'AUTH_CALLBACK_END', { success: true });
login.advance(100);
loginMark(login, 'TOKEN_READY', { success: true });
apiStage(login, 'readiness', 231);
apiStage(login, 'session-establish', 210);
apiStage(login, 'bootstrap', 250);
loginMark(login, 'HOME_RENDER_START'); login.advance(800);
loginMark(login, 'HOME_RENDER_END', { success: true });
loginMark(login, 'UI_USABLE');
const measured = summary(login);
assert.equal(measured.status, 'PASS');
assert.deepEqual(measured.durations_ms, { app_open_to_usable: 2291, readiness: 231,
  auth0_and_claim_validation: 700, api_session_tenant_bootstrap: 210,
  first_home_data: 250, home_scripts_and_render: 800, other_frontend_and_user_wait: 900 });
assert.deepEqual(measured.phase_breakdown_ms, { pre_auth_and_user_wait: 100,
  auth_interactive_roundtrip_including_user_wait: 400, auth_callback_processing: 200,
  token_and_claim_processing_after_callback: 100, system_after_callback_to_usable: 1791,
  token_ready_to_usable: 1491 });
assert.equal(measured.temperature, 'WARM_AT_READINESS');
assert.equal(measured.temperature_at_app_open, 'UNKNOWN', 'fast post-login readiness cannot prove warmth before login');
assert.equal(Object.keys(measured.stages).length, 14);
const saved = login.shared.get(loginKey);
for (let i = 0; i < 350; i++) {
  login.diag.mark('TOKEN_CHECK', { has_token: true });
  login.diag.mark('UI_USABLE'); // Foreground polling is not another login.
  login.diag.mark('API_REQUEST_END', { operation: 'bootstrap-revision', success: true });
}
assert.equal(login.snapshot().analysis.reason, 'BOOT_NOT_RETAINED');
assert.equal(login.shared.get(loginKey), saved);
assert.deepEqual(summary(login), measured);

const interactive = boot();
loginMark(interactive, 'AUTH_INIT_START');
interactive.advance(500);
loginMark(interactive, 'AUTHORIZE_REDIRECT_REQUESTED', { reason: 'USER_LOGIN' });
const callback = boot({ shared: interactive.shared, tab: interactive.tab, now: 3500 });
loginMark(callback, 'AUTH_INIT_START'); loginMark(callback, 'AUTH_CALLBACK_START');
callback.advance(100); loginMark(callback, 'AUTH_CALLBACK_END', { success: true });
callback.advance(100); loginMark(callback, 'TOKEN_READY', { success: true });
assert.equal(callback.snapshot().login_performance.summaries.length, 1, 'callback joins only a pending same-tab redirect');
assert.equal(summary(callback).durations_ms.auth0_and_claim_validation, 2200);
assert.equal(summary(callback).stages.TOKEN_READY.elapsed_ms, 2700, 'total retains original document start across redirect');
const separateTab = boot({ shared: interactive.shared, now: 4000 });
loginMark(separateTab, 'AUTH_INIT_START'); loginMark(separateTab, 'AUTH_CALLBACK_START');
assert.equal(summary(separateTab).stages.AUTH_START.elapsed_ms, 0, 'different tabs cannot adopt another login');

const slow = boot(); loginMark(slow, 'AUTH_INIT_START');
apiStage(slow, 'readiness', 6000);
assert.equal(summary(slow).temperature, 'UNKNOWN', 'slow request alone does not prove Render cold start');
const failed = boot(); loginMark(failed, 'AUTH_INIT_START');
apiStage(failed, 'readiness', 15000, false);
assert.equal(summary(failed).status, 'FAIL');
assert.equal(summary(failed).stages.READINESS_END.success, false);
assert.equal(summary(failed).durations_ms.app_open_to_usable, null, 'failure must not invent usable time');
loginMark(failed, 'AUTH_INIT_START', { reason: 'API_RETRY', run_id: 2 });
const retryBefore = failed.shared.get(loginKey);
loginMark(failed, 'AUTH_INIT_END', { run_id: 1, success: false, stale_result_ignored: true });
assert.equal(failed.shared.get(loginKey), retryBefore, 'stale completion cannot corrupt a new attempt');
assert.equal(summary(failed).kind, 'API_RETRY', 'retry is not reported as an initial login');
assert.equal(summary(failed).stages.READINESS_END.status, 'NOT_OBSERVED');
assert.equal(summary(failed).phase_breakdown_ms.auth_interactive_roundtrip_including_user_wait, null,
  'API retry without callback must not invent an interactive wait');
assert.equal(summary(failed).phase_breakdown_ms.system_after_callback_to_usable, null);

// Reproduce the supplied Windows timing without changing any authentication behavior.
const windowsTiming = boot();
windowsTiming.advance(5727); loginMark(windowsTiming, 'AUTH_INIT_START');
windowsTiming.advance(17159); loginMark(windowsTiming, 'AUTH_CALLBACK_START');
windowsTiming.advance(655); loginMark(windowsTiming, 'AUTH_CALLBACK_END', { success: true });
windowsTiming.advance(3); loginMark(windowsTiming, 'TOKEN_READY', { success: true });
windowsTiming.advance(1614); loginMark(windowsTiming, 'UI_USABLE');
assert.deepEqual(summary(windowsTiming).phase_breakdown_ms, {
  pre_auth_and_user_wait: 5727, auth_interactive_roundtrip_including_user_wait: 17159,
  auth_callback_processing: 655, token_and_claim_processing_after_callback: 3,
  system_after_callback_to_usable: 2272, token_ready_to_usable: 1614
});
assert.equal(summary(windowsTiming).durations_ms.app_open_to_usable, 25158);
assert.equal(summary(windowsTiming).durations_ms.auth0_and_claim_validation, 17817,
  'legacy v1 totals remain unchanged for existing consumers');
assert.match(windowsTiming.snapshot().login_performance.phase_measurement, /ROUNDTRIP_INCLUDES_USER_WAIT_AND_NETWORK/);

const bounded = new Map();
for (let i = 0; i < 15; i++) boot({ shared: bounded, now: 1000 + i });
assert.equal(JSON.parse(bounded.get(loginKey)).length, 10);
const poisoned = JSON.parse(login.shared.get(loginKey));
poisoned[0].token = 'DO_NOT_RECORD'; poisoned[0].error_code = 'DO_NOT_RECORD';
poisoned[0].stages.APP_BOOT.secret = 'DO_NOT_RECORD';
poisoned[0].stages.DO_NOT_RECORD = { timestamp: 1000, success: true };
login.shared.set(loginKey, JSON.stringify(poisoned));
assert.doesNotMatch(JSON.stringify(login.snapshot()), /DO_NOT_RECORD/);
const unavailable = boot({ failingStorage: true });
loginMark(unavailable, 'AUTH_INIT_START'); loginMark(unavailable, 'TOKEN_READY', { success: true });
assert.equal(unavailable.snapshot().login_performance.persistence, 'UNAVAILABLE');
assert.equal(summary(unavailable).stages.TOKEN_READY.success, true);
login.diag.open();
await login.nodes.find(n => n.textContent === '複製登入效能摘要').handlers.click();
assert.equal(JSON.parse(login.copied()).summaries[0].durations_ms.readiness, 231);
assert.doesNotMatch(login.copied(), /DO_NOT_RECORD/);
assert.match(auth, /diagnostic\('TOKEN_READY'/);
assert.match(auth, /diagnostic\('HOME_RENDER_START'/);
assert.match(auth, /finally\s*\{\s*diagnostic\('HOME_RENDER_END'/);
console.log('Login performance summaries passed: independent capacity, exact stage durations, same-tab redirects, stale isolation, warm evidence, failures and secret-free copy.');
