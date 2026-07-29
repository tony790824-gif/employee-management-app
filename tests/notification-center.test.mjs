import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('notification-center.js', 'utf8');
const css = await readFile('notification-center.css', 'utf8');
const html = await readFile('index.html', 'utf8');
const login = await readFile('login.js', 'utf8');
const worker = await readFile('service-worker.js', 'utf8');

assert.match(html, /id="notificationButton"[\s\S]*id="notificationBadge"/);
assert.match(html, /id="notificationDialog"[\s\S]*id="notificationMarkAllRead"[\s\S]*id="notificationList"/);
assert.match(login, /'notification-center\.js'/);
assert.match(worker, /notification-center\.css/);
assert.match(worker, /notification-center\.js/);
assert.match(worker, /BANKE_BOOTSTRAP_REVISION_AVAILABLE/);
assert.match(css, /\.notification-trigger\[hidden\]\{display:none!important\}/);
assert.match(css, /min-height:44px/);
assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
assert.doesNotMatch(source, /localStorage|sessionStorage|Authorization|accessToken|Cookie/);

function node() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    open: false,
    textContent: '',
    children: [],
    attributes: new Map(),
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type, event = {}) { return listeners.get(type)?.({ target: this, ...event }); },
    showModal() { this.open = true; },
    close() { this.open = false; }
  };
}

const selectors = [
  '#notificationButton',
  '#notificationBadge',
  '#notificationDialog',
  '#notificationClose',
  '#notificationMarkAllRead',
  '#notificationSummary',
  '#notificationMessage',
  '#notificationList'
];
const elements = new Map(selectors.map(selector => [selector, node()]));
elements.get('#notificationButton').hidden = true;
elements.get('#notificationBadge').hidden = true;
elements.get('#notificationMessage').hidden = true;
const documentListeners = new Map();
const notification = {
  id: '00000000-0000-4000-8000-000000000014',
  type: 'time_off_approved',
  title: '排休審核結果',
  body: '您的申請已核准。',
  resourceType: 'time_off_request',
  resourceId: '00000000-0000-4000-8000-000000000013',
  readAt: null,
  createdAt: '2026-07-29T00:00:00.000Z',
  revision: 0
};
let payload = { ok: true, items: [notification], unreadCount: 1 };
let listCalls = 0;
const marked = [];
const dom = {
  element(tag, options = {}, children = []) {
    const item = node();
    item.tag = tag;
    item.textContent = options.text ?? '';
    item.className = options.className ?? '';
    Object.entries(options.attributes || {}).forEach(([name, value]) => item.setAttribute(name, value));
    item.append(...children);
    return item;
  },
  replace(target, ...children) {
    target.replaceChildren(...children);
  }
};
const cloud = {
  isConnected: () => true,
  listNotifications: async () => {
    listCalls += 1;
    return structuredClone(payload);
  },
  markNotificationRead: async (id, revision) => {
    marked.push({ id, revision });
    payload = {
      ok: true,
      items: [{ ...notification, readAt: '2026-07-29T00:01:00.000Z', revision: 1 }],
      unreadCount: 0
    };
  },
  markAllNotificationsRead: async () => {}
};
const sandbox = {
  Intl,
  Date,
  setTimeout,
  clearTimeout,
  structuredClone,
  window: {
    shiftEnvironment: { dataBackend: 'postgres' },
    shiftPostgresCloud: cloud,
    shiftDomSafety: dom
  },
  document: {
    querySelector: selector => elements.get(selector) || null,
    addEventListener(type, listener) { documentListeners.set(type, listener); }
  }
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(source, sandbox, { filename: 'notification-center.js' });
await new Promise(resolve => setImmediate(resolve));

assert.equal(listCalls, 1, 'Authenticated initialization loads recipient notifications once.');
assert.equal(elements.get('#notificationButton').hidden, false);
assert.equal(elements.get('#notificationBadge').hidden, false);
assert.equal(elements.get('#notificationBadge').textContent, '1');
assert.equal(elements.get('#notificationList').children.length, 1);

elements.get('#notificationButton').dispatch('click');
assert.equal(elements.get('#notificationDialog').open, true);
elements.get('#notificationList').children[0].dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(marked, [{ id: notification.id, revision: 0 }]);
assert.equal(elements.get('#notificationBadge').hidden, true);
assert.equal(elements.get('#notificationSummary').textContent, '沒有未讀通知');

payload = { ok: true, items: [], unreadCount: 0 };
documentListeners.get('postgres-bootstrap-refreshed')();
await new Promise(resolve => setImmediate(resolve));
assert.equal(listCalls >= 3, true, 'Bootstrap revision refresh reloads recipient notifications.');

payload = { ok: true, workspaceId: 'ws_0123456789abcdef0123456789abcdef', items: [], unreadCount: 0, available: false };
documentListeners.get('postgres-bootstrap-refreshed')();
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationButton').hidden, true,
  'Before Migration 0014 is applied, the optional Notification Center remains hidden.');

documentListeners.get('postgres-session-cleared')();
assert.equal(elements.get('#notificationButton').hidden, true);
assert.equal(elements.get('#notificationDialog').open, false);
assert.equal(elements.get('#notificationList').children.length, 1, 'Logged-out UI renders only the empty state.');

console.log('Notification Center UI, badge, read state and revision refresh tests passed.');
