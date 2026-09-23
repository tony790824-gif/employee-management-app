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
