import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createWebPushDispatcher, webPushConfig } from '../server/web-push.mjs';
import { createCommandService } from '../server/commands.mjs';
import { validateCommand } from '../server/validation.mjs';

const publicKey = 'B'.repeat(87);
const privateKey = 'C'.repeat(43);
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-endpoint-00000001';
const androidEndpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-android-endpoint-00000002';
const edgeEndpoint = 'https://wns2-by3p.notify.windows.com/w/?token=synthetic-edge-endpoint';
const firefoxEndpoint = 'https://updates.push.services.mozilla.com/wpush/v2/synthetic-firefox-endpoint';
const subscriptionInput = {
  endpoint,
  expirationTime: null,
  p256dh: 'D'.repeat(87),
  auth: 'E'.repeat(22),
  userAgent: 'Synthetic browser',
  platform: 'windows'
};

assert.deepEqual(webPushConfig({}), { enabled: false });
assert.throws(() => webPushConfig({ BANK_WEB_PUSH_ENABLED: 'true' }), /BANK_WEB_PUSH_PUBLIC_KEY/);
assert.deepEqual(webPushConfig({
  BANK_WEB_PUSH_ENABLED: 'true',
  BANK_WEB_PUSH_PUBLIC_KEY: publicKey,
  BANK_WEB_PUSH_PRIVATE_KEY: privateKey,
  BANK_WEB_PUSH_SUBJECT: 'mailto:security@banke.invalid'
}), {
  enabled: true,
  publicKey,
  privateKey,
  subject: 'mailto:security@banke.invalid'
});
assert.deepEqual(validateCommand('push.register', subscriptionInput), subscriptionInput);
assert.deepEqual(validateCommand('push.unregister', { endpoint }), { endpoint });
assert.deepEqual(validateCommand('push.test', { endpoint }), { endpoint });
assert.equal(
  validateCommand('push.register', {
    ...subscriptionInput,
    endpoint: androidEndpoint,
    platform: 'android'
  }).endpoint,
  androidEndpoint,
  'Chrome and Android use the standard Web Push FCM transport without Firebase SDK tokens.'
);
for (const approvedEndpoint of [edgeEndpoint, firefoxEndpoint]) {
  assert.equal(
    validateCommand('push.register', { ...subscriptionInput, endpoint: approvedEndpoint }).endpoint,
    approvedEndpoint
  );
  assert.deepEqual(
    validateCommand('push.unregister', { endpoint: approvedEndpoint }),
    { endpoint: approvedEndpoint }
  );
  assert.deepEqual(
    validateCommand('push.test', { endpoint: approvedEndpoint }),
    { endpoint: approvedEndpoint }
  );
}
for (const invalid of [
  { ...subscriptionInput, endpoint: 'not-a-url' },
  { ...subscriptionInput, endpoint: 'https://attacker.invalid/push/endpoint-that-is-long-enough' },
  {
    ...subscriptionInput,
    endpoint: 'https://notify.windows.com.attacker.invalid/push/endpoint-that-is-long-enough'
  },
  { ...subscriptionInput, p256dh: 'short' },
  { ...subscriptionInput, auth: 'bad value with spaces' },
  { ...subscriptionInput, platform: 'attacker' }
]) {
  assert.throws(() => validateCommand('push.register', invalid), error =>
    error?.code === 'COMMAND_INVALID' && error?.status === 400);
}

const delivery = {
  id: '00000000-0000-4000-8000-000000000027',
  endpoint,
  p256dh: subscriptionInput.p256dh,
  auth: subscriptionInput.auth,
  payload: {
    notificationId: '00000000-0000-4000-8000-000000000028',
    type: 'time_off_reviewed',
    title: 'Synthetic title',
    body: 'Synthetic body',
    url: '/?open=notifications'
  },
  attempt: 1
};

function dispatcherScenario(sendNotification) {
  const queries = [];
  const logs = [];
  let claimed = false;
  const pool = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (sql.includes('worker_claim_push_deliveries')) {
        if (claimed) return { rows: [{ result: { ok: true, items: [] } }] };
        claimed = true;
        return { rows: [{ result: { ok: true, items: [structuredClone(delivery)] } }] };
      }
      if (sql.includes('worker_complete_push_delivery')) {
        return { rows: [{ result: { ok: true } }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const dispatcher = createWebPushDispatcher({
    pool,
    config: webPushConfig({
      BANK_WEB_PUSH_ENABLED: 'true',
      BANK_WEB_PUSH_PUBLIC_KEY: publicKey,
      BANK_WEB_PUSH_PRIVATE_KEY: privateKey,
      BANK_WEB_PUSH_SUBJECT: 'https://staging.banke.invalid'
    }),
    client: { sendNotification },
    workerId: 'banke-push-test-01',
    logger: {
      info: value => logs.push(value),
      warn: value => logs.push(value)
    }
  });
  return { dispatcher, queries, logs };
}

const success = dispatcherScenario(async (subscription, payload, options) => {
  assert.equal(subscription.endpoint, endpoint);
  assert.deepEqual(subscription.keys, { p256dh: subscriptionInput.p256dh, auth: subscriptionInput.auth });
  assert.equal(JSON.parse(payload).notificationId, delivery.payload.notificationId);
  assert.equal(options.TTL, 300);
  assert.equal(options.vapidDetails.privateKey, privateKey);
  return { statusCode: 201 };
});
assert.equal(await success.dispatcher.drainOnce(), 1);
const successCompletion = success.queries.find(item => item.sql.includes('worker_complete_push_delivery'));
assert.deepEqual(successCompletion.parameters, [delivery.id, 'delivered', 201, '']);
assert.doesNotMatch(success.logs.join('\n'), new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(success.logs.join('\n'), new RegExp(privateKey));
assert.doesNotMatch(success.logs.join('\n'), new RegExp(subscriptionInput.auth));

const expired = dispatcherScenario(async () => {
  throw Object.assign(new Error('synthetic expired'), { statusCode: 410 });
});
await expired.dispatcher.drainOnce();
assert.deepEqual(
  expired.queries.find(item => item.sql.includes('worker_complete_push_delivery')).parameters,
  [delivery.id, 'expired', 410, 'SUBSCRIPTION_EXPIRED']
);

const missing = dispatcherScenario(async () => {
  throw Object.assign(new Error('synthetic missing'), { statusCode: 404 });
});
await missing.dispatcher.drainOnce();
assert.deepEqual(
  missing.queries.find(item => item.sql.includes('worker_complete_push_delivery')).parameters,
  [delivery.id, 'expired', 404, 'SUBSCRIPTION_EXPIRED']
);

const retry = dispatcherScenario(async () => {
  throw Object.assign(new Error('synthetic unavailable'), { statusCode: 503 });
});
await retry.dispatcher.drainOnce();
assert.deepEqual(
  retry.queries.find(item => item.sql.includes('worker_complete_push_delivery')).parameters,
  [delivery.id, 'retry', 503, 'PUSH_SERVICE_ERROR']
);

const ui = await readFile('notification-center.js', 'utf8');
const login = await readFile('login.js', 'utf8');
const worker = await readFile('service-worker.js', 'utf8');
const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(packageManifest.dependencies?.['web-push'], '3.6.7');
assert.equal(packageManifest.dependencies?.firebase, undefined);
assert.equal(packageManifest.devDependencies?.firebase, undefined);
assert.match(ui, /Notification\.requestPermission\(\)/);
assert.match(ui, /pushManager\.subscribe\(/);
assert.match(ui, /userVisibleOnly:\s*true/);
assert.match(ui, /registerPushSubscription\(subscriptionInput\(subscription\)\)/);
assert.match(ui, /unregisterPushSubscription\(subscription\.endpoint\)/);
assert.match(ui, /unregisterCurrentPushForLogout/);
assert.match(ui, /iPhone／iPad 必須先加入主畫面/);
assert.doesNotMatch(ui, /BANK_WEB_PUSH_PRIVATE_KEY|privateKey/);
assert.match(login, /shiftNotificationCenter\?\.unregisterCurrentPushForLogout/);
assert.match(login, /PUSH_UNREGISTER_FAILED/);
assert.match(worker, /addEventListener\('push'/);
assert.match(worker, /showNotification/);
assert.match(worker, /addEventListener\('notificationclick'/);
assert.match(worker, /openWindow/);
assert.match(worker, /BANKE_OPEN_NOTIFICATION_CENTER/);
assert.doesNotMatch(worker, /client\.navigate\(target\)/);
assert.match(worker, /addEventListener\('pushsubscriptionchange'/);
assert.doesNotMatch(worker, /Authorization|accessToken|refreshToken|privateKey/);

const workerListeners = new Map();
const focusedMessages = [];
const openedWindows = [];
const shownNotifications = [];
let focusedClients = 0;
let matchedClients = [{
  url: 'https://draft.staging.example/employee',
  async focus() {
    focusedClients += 1;
    return this;
  },
  postMessage(message) {
    focusedMessages.push(structuredClone(message));
  },
  async navigate() {
    throw new Error('Existing authenticated clients must not be navigated.');
  }
}];
const workerSandbox = {
  self: {
    location: { origin: 'https://draft.staging.example' },
    addEventListener: (type, listener) => workerListeners.set(type, listener),
    skipWaiting: async () => {},
    registration: {
      showNotification: async (title, options) => {
        shownNotifications.push({ title, options: structuredClone(options) });
      }
    },
    clients: {
      claim: async () => {},
      matchAll: async () => matchedClients,
      openWindow: async url => { openedWindows.push(url); }
    }
  },
  caches: {
    open: async () => ({
      addAll: async () => {},
      match: async () => null,
      put: async () => {}
    }),
    keys: async () => [],
    delete: async () => true
  },
  fetch: async () => new Response('{}'),
  Response,
  URL,
  JSON,
  Number,
  Promise,
  structuredClone
};
vm.runInContext(worker, vm.createContext(workerSandbox), { filename: 'service-worker.js' });

let pushWork;
workerListeners.get('push')({
  data: {
    json: () => ({
      notificationId: delivery.payload.notificationId,
      title: delivery.payload.title,
      body: delivery.payload.body,
      url: '/?open=notifications'
    })
  },
  waitUntil: promise => { pushWork = promise; }
});
await pushWork;
assert.deepEqual(shownNotifications, [{
  title: delivery.payload.title,
  options: {
    body: delivery.payload.body,
    icon: './app-icon.svg',
    badge: './app-icon.svg',
    tag: `banke-${delivery.payload.notificationId}`,
    renotify: false,
    data: {
      notificationId: delivery.payload.notificationId,
      url: '/?open=notifications'
    }
  }
}], 'A standard Web Push event renders one bounded background system notification.');

let notificationClickWork;
workerListeners.get('notificationclick')({
  notification: {
    data: { url: '/?open=notifications' },
    close() {}
  },
  waitUntil: promise => { notificationClickWork = promise; }
});
await notificationClickWork;
assert.equal(focusedClients, 1);
assert.deepEqual(focusedMessages, [{
  type: 'BANKE_OPEN_NOTIFICATION_CENTER',
  path: '/?open=notifications'
}]);
assert.deepEqual(openedWindows, [],
  'An existing same-origin authenticated client must be focused instead of opening a new window.');

matchedClients = [];
workerListeners.get('notificationclick')({
  notification: {
    data: { url: '/?open=notifications' },
    close() {}
  },
  waitUntil: promise => { notificationClickWork = promise; }
});
await notificationClickWork;
assert.deepEqual(openedWindows, ['https://draft.staging.example/?open=notifications'],
  'A new window is opened only when no same-origin client exists.');

matchedClients = [{
  url: 'https://draft.staging.example/employee',
  postMessage(message) {
    focusedMessages.push(structuredClone(message));
  }
}];
let subscriptionChangeWork;
workerListeners.get('pushsubscriptionchange')({
  waitUntil: promise => { subscriptionChangeWork = promise; }
});
await subscriptionChangeWork;
assert.deepEqual(focusedMessages.at(-1), { type: 'BANKE_PUSH_SUBSCRIPTION_CHANGED' },
  'Browser-managed subscription rotation notifies the existing app to re-register safely.');

const serviceQueries = [];
let pushSchemaAvailable = true;
let pushDatabaseError = null;
const commandService = createCommandService({
  pool: {
    async query(sql) {
      serviceQueries.push(sql);
      if (sql.includes('api_push_status')) {
        if (!pushSchemaAvailable) throw Object.assign(new Error('undefined function'), { code: '42883' });
        return { rows: [{ result: { ok: true, workspaceId: 'ws_0123456789abcdef0123456789abcdef', activeSubscriptionCount: 1 } }] };
      }
      if (sql.includes('api_execute_push_command')) {
        if (!pushSchemaAvailable) throw Object.assign(new Error('undefined function'), { code: '42883' });
        if (pushDatabaseError) throw pushDatabaseError;
        return { rows: [{ result: { ok: true, data: { registered: true } } }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  },
  tenantContextSigner: {
    sign: () => ({ payload: 'synthetic-payload', signature: 'synthetic-signature', keyId: 'synthetic-key' })
  },
  idFactory: () => '00000000-0000-4000-8000-000000000029'
});
const identity = Object.freeze({ subject: 'auth0|synthetic', sessionId: 'synthetic-session' });
const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
assert.equal((await commandService.pushStatus({ identity, workspaceId })).activeSubscriptionCount, 1);
await commandService.execute({
  identity,
  workspaceId,
  commandName: 'push.register',
  input: subscriptionInput,
  idempotencyKey: 'push-register-0001',
  requestId: 'request-push-register-0001'
});
assert.ok(serviceQueries.some(sql => sql.includes('api_execute_push_command')));
pushDatabaseError = Object.assign(new Error('PUSH_RATE_LIMITED'), { code: 'P0001' });
await assert.rejects(commandService.execute({
  identity,
  workspaceId,
  commandName: 'push.test',
  input: { endpoint },
  idempotencyKey: 'push-test-rate-limited-0001',
  requestId: 'request-push-test-rate-limited-0001'
}), error => error?.code === 'PUSH_RATE_LIMITED'
  && error?.status === 429
  && error?.message === 'The test-notification rate limit has been reached.');
pushDatabaseError = null;
pushSchemaAvailable = false;
assert.deepEqual(await commandService.pushStatus({ identity, workspaceId }), {
  ok: true,
  workspaceId,
  activeSubscriptionCount: 0,
  available: false
});
await assert.rejects(commandService.execute({
  identity,
  workspaceId,
  commandName: 'push.test',
  input: { endpoint },
  idempotencyKey: 'push-test-unavailable-0001',
  requestId: 'request-push-test-unavailable-0001'
}), error => error?.code === 'WEB_PUSH_UNAVAILABLE' && error?.status === 503);

console.log('Web Push validation, dispatcher, privacy, and browser wiring tests passed.');
