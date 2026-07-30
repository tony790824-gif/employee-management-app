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
  '#notificationList',
  '#pushNotificationSettings',
  '#pushNotificationStatus',
  '#pushNotificationHelp',
  '#pushNotificationEnable',
  '#pushNotificationDisable',
  '#pushNotificationRepair',
  '#pushNotificationTest'
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
const pushEndpoint = 'https://fcm.googleapis.com/fcm/send/fresh-profile-subscription-endpoint';
const pushSubscription = {
  endpoint: pushEndpoint,
  toJSON: () => ({
    endpoint: pushEndpoint,
    expirationTime: null,
    keys: {
      p256dh: 'a'.repeat(88),
      auth: 'b'.repeat(24)
    }
  }),
  unsubscribe: async () => true
};
let browserSubscription = null;
let pushServerCount = 0;
let pushTestError = null;
const registeredPushInputs = [];
const testedPushEndpoints = [];
let pushSubscribeCalls = 0;
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
  markAllNotificationsRead: async () => {},
  pushStatus: async () => ({
    ok: true,
    available: true,
    activeSubscriptionCount: pushServerCount
  }),
  registerPushSubscription: async input => {
    registeredPushInputs.push(structuredClone(input));
    pushServerCount = 1;
  },
  unregisterPushSubscription: async () => {
    pushServerCount = 0;
  },
  sendTestPush: async endpoint => {
    testedPushEndpoints.push(endpoint);
    if (pushTestError) throw pushTestError;
    return { ok: true };
  }
};
const serviceWorkerListeners = new Map();
const serviceWorker = {
  ready: Promise.resolve({
    pushManager: {
      getSubscription: async () => browserSubscription,
      subscribe: async () => {
        pushSubscribeCalls += 1;
        browserSubscription = pushSubscription;
        return browserSubscription;
      }
    }
  }),
  addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); }
};
const Notification = {
  permission: 'granted',
  requestPermission: async () => 'granted'
};
const sandbox = {
  Intl,
  Date,
  URLSearchParams,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  setTimeout,
  clearTimeout,
  structuredClone,
  navigator: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138.0.0.0',
    serviceWorker
  },
  Notification,
  window: {
    isSecureContext: true,
    PushManager: class PushManager {},
    Notification,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138.0.0.0',
      serviceWorker
    },
    location: { search: '' },
    matchMedia: () => ({ matches: false }),
    shiftEnvironment: { dataBackend: 'postgres', webPushPublicKey: 'AQ' },
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

serviceWorkerListeners.get('message')({
  data: { type: 'BANKE_OPEN_NOTIFICATION_CENTER', path: '/?open=notifications' }
});
assert.equal(elements.get('#notificationDialog').open, true,
  'A focused authenticated client opens Notification Center without reloading.');
elements.get('#notificationDialog').close();

elements.get('#notificationButton').dispatch('click');
assert.equal(elements.get('#notificationDialog').open, true);
await new Promise(resolve => setImmediate(resolve));
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(pushSubscribeCalls, 1, 'A clean Windows profile creates one browser subscription.');
assert.equal(registeredPushInputs.length, 1, 'The browser subscription is registered before testing.');
assert.equal(registeredPushInputs[0].endpoint, pushEndpoint);
assert.equal(elements.get('#pushNotificationTest').hidden, false);
elements.get('#pushNotificationTest').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(testedPushEndpoints, [pushEndpoint],
  'The first test request uses the endpoint registered by the clean profile.');
assert.equal(elements.get('#notificationMessage').textContent, '測試通知已排入傳送；請稍候查看系統通知。');

pushTestError = Object.assign(new Error('Authorization or command validation failed.'), {
  code: 'PUSH_RATE_LIMITED',
  status: 429
});
elements.get('#pushNotificationTest').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationMessage').textContent,
  '測試通知次數已達安全上限，請在 10 分鐘後再試。');
assert.doesNotMatch(elements.get('#notificationMessage').textContent,
  /Authorization or command validation failed/i);

for (const [code, expected] of [
  ['PUSH_SUBSCRIPTION_NOT_FOUND', '此裝置的推播註冊已失效，請按「重新註冊」後再試。'],
  ['COMMAND_INVALID', '測試通知資料格式無效，請重新註冊後再試。'],
  ['COMMAND_FORBIDDEN', '目前帳號沒有使用測試通知的權限。'],
  ['WORKSPACE_ACCESS_DENIED', '目前帳號無法在這個工作區使用測試通知。']
]) {
  pushTestError = Object.assign(new Error('Authorization or command validation failed.'), { code });
  elements.get('#pushNotificationTest').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('#notificationMessage').textContent, expected);
}

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
