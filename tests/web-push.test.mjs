import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWebPushDispatcher, webPushConfig } from '../server/web-push.mjs';
import { createCommandService } from '../server/commands.mjs';
import { validateCommand } from '../server/validation.mjs';

const publicKey = 'B'.repeat(87);
const privateKey = 'C'.repeat(43);
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-endpoint-00000001';
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
for (const invalid of [
  { ...subscriptionInput, endpoint: 'not-a-url' },
  { ...subscriptionInput, endpoint: 'https://attacker.invalid/push/endpoint-that-is-long-enough' },
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
assert.match(worker, /addEventListener\('pushsubscriptionchange'/);
assert.doesNotMatch(worker, /Authorization|accessToken|refreshToken|privateKey/);

const serviceQueries = [];
let pushSchemaAvailable = true;
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
