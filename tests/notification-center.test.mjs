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
    expirationTime: 0,
    keys: {
      p256dh: 'a'.repeat(88),
      auth: 'b'.repeat(24)
    }
  }),
  unsubscribe: async () => {
    browserSubscription = null;
    return true;
  }
};
let browserSubscription = null;
let pushSubscribePending = false;
let pushServerCount = 0;
let pushTestError = null;
const registeredPushInputs = [];
const unregisteredPushEndpoints = [];
const testedPushEndpoints = [];
let pushSubscribeCalls = 0;
let markAllCalls = 0;
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
  markAllNotificationsRead: async () => {
    markAllCalls += 1;
    payload = {
      ...payload,
      items: payload.items.map(item => ({
        ...item,
        readAt: item.readAt || '2026-07-29T00:02:00.000Z',
        revision: Number(item.revision) + 1
      })),
      unreadCount: 0
    };
  },
  pushStatus: async () => ({
    ok: true,
    available: true,
    activeSubscriptionCount: pushServerCount
  }),
  registerPushSubscription: async input => {
    registeredPushInputs.push(structuredClone(input));
    pushServerCount = 1;
  },
  unregisterPushSubscription: async endpoint => {
    unregisteredPushEndpoints.push(endpoint);
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
        if (pushSubscribePending) return new Promise(() => {});
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
const pushDiagnostics = [];
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
    platform: 'Win32',
    maxTouchPoints: 0,
    userActivation: { isActive: true },
    serviceWorker
  },
  Notification,
  window: {
    isSecureContext: true,
    PushManager: class PushManager {},
    ServiceWorkerRegistration: class ServiceWorkerRegistration {},
    Notification,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138.0.0.0',
      platform: 'Win32',
      maxTouchPoints: 0,
      userActivation: { isActive: true },
      serviceWorker
    },
    location: { search: '' },
    matchMedia: () => ({ matches: false }),
    shiftEnvironment: {
      name: 'staging',
      dataBackend: 'postgres',
      webPushPublicKey: 'AQ',
      pushOperationTimeoutMs: 5
    },
    console: {
      info(label, detail) {
        pushDiagnostics.push({ label, detail: structuredClone(detail) });
      }
    },
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
const initialSupportDiagnostic = pushDiagnostics.find(
  item => item.label === '[Bankeban push support]'
);
assert.deepEqual(initialSupportDiagnostic?.detail, {
  'support.Notification': true,
  'support.ServiceWorker': true,
  'support.PushManager': true,
  'support.ServiceWorkerRegistration': true,
  'support.SecureContext': true,
  'support.WebPushPublicKey': true,
  'support.registrationPushManager': true
}, 'Staging logs every push capability as safe booleans without subscription data.');
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(pushSubscribeCalls, 1, 'A clean Windows profile creates one browser subscription.');
assert.equal(registeredPushInputs.length, 1, 'The browser subscription is registered before testing.');
assert.equal(registeredPushInputs[0].endpoint, pushEndpoint);
assert.equal(registeredPushInputs[0].expirationTime, null,
  'Edge expirationTime=0 is normalized to the database no-expiration representation.');
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

pushTestError = null;
elements.get('#pushNotificationDisable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(unregisteredPushEndpoints, [pushEndpoint],
  'Disabling Push removes the current server registration before browser cleanup.');
assert.equal(browserSubscription, null, 'Disabling Push removes the browser subscription.');
pushSubscribePending = true;
const subscribeCallsBeforeDuplicateActivation = pushSubscribeCalls;
elements.get('#pushNotificationEnable').dispatch('click');
assert.match(elements.get('#notificationMessage').textContent, /^正在(?:啟用背景推播|連接瀏覽器推播服務)…$/,
  'Edge activation immediately shows progress instead of appearing unresponsive.');
assert.equal(elements.get('#pushNotificationEnable').disabled, true,
  'The activation button is locked while Edge is creating the subscription.');
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setTimeout(resolve, 15));
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationMessage').textContent,
  '瀏覽器未能完成推播訂閱，請確認 Windows 通知服務與網路後再試。');
assert.equal(registeredPushInputs.length, 1,
  'A browser subscription timeout occurs before any push.register API request.');
assert.equal(pushSubscribeCalls, subscribeCallsBeforeDuplicateActivation + 1,
  'Rapid duplicate activation clicks share one in-flight browser subscription request.');
assert.equal(elements.get('#pushNotificationEnable').disabled, false,
  'The activation button becomes actionable again after a browser timeout.');
assert.deepEqual(
  pushDiagnostics
    .filter(item => item.label === '[Bankeban push setup]')
    .map(item => item.detail.stage)
    .filter(stage => ['subscribe-start', 'subscribe-complete', 'subscribe-failed'].includes(stage))
    .slice(-2),
  ['subscribe-start', 'subscribe-failed'],
  'Staging diagnostics record only the safe browser subscription stages.'
);

pushSubscribePending = false;
Notification.permission = 'default';
let pendingPermissionRequestCalls = 0;
Notification.requestPermission = () => {
  pendingPermissionRequestCalls += 1;
  return new Promise(() => {});
};
const subscribeCallsBeforePermissionTimeout = pushSubscribeCalls;
elements.get('#pushNotificationEnable').dispatch('click');
assert.equal(pendingPermissionRequestCalls, 1,
  'Notification.requestPermission is invoked synchronously by the direct click handler.');
assert.equal(elements.get('#notificationMessage').textContent,
  '正在確認此測試網址的通知權限…');
assert.equal(elements.get('#pushNotificationEnable').disabled, true);
await new Promise(resolve => setTimeout(resolve, 15));
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationMessage').textContent,
  'Edge 尚未完成此測試網址的通知授權。請點網址列左側圖示 →「此網站的權限」→「通知」→「允許」，再重新整理。');
assert.equal(pushSubscribeCalls, subscribeCallsBeforePermissionTimeout,
  'A pending Edge permission request times out before PushManager.subscribe is called.');
assert.equal(elements.get('#pushNotificationEnable').disabled, false,
  'The activation button is unlocked after an Edge permission timeout.');
const permissionDiagnostics = pushDiagnostics
  .map(item => item.detail)
  .filter(detail => ['permission-before', 'permission-after'].includes(detail.stage))
  .slice(-2);
assert.deepEqual(permissionDiagnostics.map(detail => detail.stage),
  ['permission-before', 'permission-after']);
assert.equal(permissionDiagnostics[0].permission, 'default');
assert.equal(permissionDiagnostics[0].userActivation, true);
assert.equal(permissionDiagnostics[1].permission, 'default');
assert.equal(permissionDiagnostics[1].errorCode, 'PUSH_PERMISSION_TIMEOUT');

Notification.permission = 'default';
Notification.requestPermission = () => {
  setTimeout(() => { Notification.permission = 'granted'; }, 1);
  return new Promise(() => {});
};
const registrationsBeforeLateGrant = registeredPushInputs.length;
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setTimeout(resolve, 20));
await new Promise(resolve => setImmediate(resolve));
for (let attempt = 0; attempt < 5 && elements.get('#pushNotificationEnable').disabled; attempt += 1) {
  await new Promise(resolve => setImmediate(resolve));
}
assert.equal(registeredPushInputs.length, registrationsBeforeLateGrant + 1,
  'If Edge grants permission but leaves requestPermission pending, activation continues to subscribe.');
assert.equal(elements.get('#notificationMessage').textContent, '此裝置已啟用背景推播。');

Notification.permission = 'denied';
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
for (let attempt = 0; attempt < 5 && elements.get('#pushNotificationEnable').disabled; attempt += 1) {
  await new Promise(resolve => setImmediate(resolve));
}
assert.equal(elements.get('#notificationMessage').textContent,
  'Edge 已拒絕此測試網址的通知權限。請點網址列左側圖示 →「此網站的權限」→「通知」→「允許」，再重新整理。');

assert.deepEqual(
  [...new Set(pushDiagnostics.map(item => item.detail.stage).filter(Boolean))].sort(),
  ['permission-after', 'permission-before', 'subscribe-complete', 'subscribe-failed', 'subscribe-start'],
  'Staging Console diagnostics are restricted to the five approved stage names.'
);

sandbox.window.shiftEnvironment.webPushPublicKey = '';
elements.get('#notificationButton').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
assert.match(elements.get('#pushNotificationStatus').textContent,
  /support\.WebPushPublicKey = false/,
  'A missing Staging public VAPID key is identified instead of blaming browser support.');
assert.equal(
  pushDiagnostics.filter(item => item.label === '[Bankeban push support]').at(-1)
    .detail['support.WebPushPublicKey'],
  false
);
sandbox.window.shiftEnvironment.webPushPublicKey = 'AQ';

const activePushManager = {
  getSubscription: async () => browserSubscription,
  subscribe: async () => {
    pushSubscribeCalls += 1;
    browserSubscription = pushSubscription;
    return browserSubscription;
  }
};
serviceWorker.ready = Promise.resolve({ pushManager: activePushManager });
sandbox.navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15';
sandbox.navigator.platform = 'MacIntel';
sandbox.navigator.maxTouchPoints = 5;
sandbox.window.matchMedia = () => ({ matches: false });
Notification.permission = 'granted';
pushServerCount = 0;
browserSubscription = null;
elements.get('#notificationButton').dispatch('click');
await new Promise(resolve => setTimeout(resolve, 10));
await new Promise(resolve => setImmediate(resolve));
const registrationsBeforeIpadTab = registeredPushInputs.length;
assert.equal(elements.get('#pushNotificationEnable').disabled, false,
  'Previous Push activation has settled before the isolated iPadOS scenario.');
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationMessage').textContent,
  'iPhone／iPad 必須先加入主畫面，再從主畫面開啟才能啟用推播。');
assert.equal(registeredPushInputs.length, registrationsBeforeIpadTab,
  'An iPadOS desktop-style Safari tab cannot be mistaken for a Home Screen PWA.');

sandbox.window.matchMedia = () => ({ matches: true });
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(registeredPushInputs.length, registrationsBeforeIpadTab + 1);
assert.equal(registeredPushInputs.at(-1).platform, 'ipados',
  'A desktop-style iPadOS user agent is registered as ipados, not macos.');
Notification.permission = 'denied';
elements.get('#pushNotificationEnable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
assert.match(elements.get('#notificationMessage').textContent, /^iPhone／iPad 已拒絕通知權限/);
Notification.permission = 'granted';
elements.get('#pushNotificationDisable').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));

serviceWorker.ready = Promise.resolve({ pushManager: null });
elements.get('#notificationButton').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
assert.match(elements.get('#pushNotificationStatus').textContent,
  /support\.registrationPushManager = false/,
  'A missing registration.pushManager is reported as the precise failed capability.');
assert.equal(
  pushDiagnostics.filter(item => item.label === '[Bankeban push support]').at(-1)
    .detail['support.registrationPushManager'],
  false
);

elements.get('#notificationList').children[0].dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(marked, [{ id: notification.id, revision: 0 }]);
assert.equal(elements.get('#notificationBadge').hidden, true);
assert.equal(elements.get('#notificationSummary').textContent, '沒有未讀通知');

payload = {
  ok: true,
  items: [
    { ...notification, readAt: null, revision: 2 },
    {
      ...notification,
      id: '00000000-0000-4000-8000-000000000015',
      title: '另一則通知',
      readAt: null,
      revision: 0
    }
  ],
  unreadCount: 2
};
documentListeners.get('postgres-bootstrap-refreshed')();
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#notificationBadge').textContent, '2');
elements.get('#notificationMarkAllRead').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(markAllCalls, 1);
assert.equal(elements.get('#notificationBadge').hidden, true,
  'Mark-all keeps the badge and Notification Center unread count consistent.');

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

const registrationsBeforeAccountSwitch = registeredPushInputs.length;
payload = { ok: true, items: [], unreadCount: 0 };
pushServerCount = 0;
browserSubscription = pushSubscription;
serviceWorker.ready = Promise.resolve({ pushManager: activePushManager });
documentListeners.get('postgres-bootstrap-refreshed')();
await new Promise(resolve => setImmediate(resolve));
elements.get('#notificationButton').dispatch('click');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('#pushNotificationRepair').hidden, false,
  'A browser subscription left by another Session requires controlled re-registration.');
assert.equal(elements.get('#pushNotificationEnable').hidden, true);
assert.equal(registeredPushInputs.length, registrationsBeforeAccountSwitch,
  'Account switching never silently binds an existing browser subscription to the new Session.');

console.log('Notification Center UI, badge, read state and revision refresh tests passed.');
