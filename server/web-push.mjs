import webPush from 'web-push';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_PAYLOAD_BYTES = 3_072;
const VAPID_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{80,120}$/;
const VAPID_PRIVATE_KEY_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required when Web Push is enabled.`);
  return normalized;
}

function validSubject(value) {
  if (value.startsWith('mailto:')) {
    return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value);
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function webPushConfig(env = process.env) {
  const enabled = String(env.BANK_WEB_PUSH_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return Object.freeze({ enabled: false });
  const publicKey = required(env.BANK_WEB_PUSH_PUBLIC_KEY, 'BANK_WEB_PUSH_PUBLIC_KEY');
  const privateKey = required(env.BANK_WEB_PUSH_PRIVATE_KEY, 'BANK_WEB_PUSH_PRIVATE_KEY');
  const subject = required(env.BANK_WEB_PUSH_SUBJECT, 'BANK_WEB_PUSH_SUBJECT');
  if (!VAPID_PUBLIC_KEY_PATTERN.test(publicKey)
    || !VAPID_PRIVATE_KEY_PATTERN.test(privateKey)
    || !validSubject(subject)) {
    throw new Error('Web Push VAPID configuration is invalid.');
  }
  return Object.freeze({ enabled: true, publicKey, privateKey, subject });
}

function safeStatusCode(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : null;
}

function classifyFailure(error) {
  const statusCode = safeStatusCode(error);
  if ([404, 410].includes(statusCode)) {
    return { outcome: 'expired', statusCode, errorCode: 'SUBSCRIPTION_EXPIRED' };
  }
  if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
    return { outcome: 'retry', statusCode, errorCode: statusCode === 429 ? 'PUSH_RATE_LIMITED' : 'PUSH_SERVICE_ERROR' };
  }
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    return { outcome: 'retry', statusCode, errorCode: 'PUSH_TIMEOUT' };
  }
  return { outcome: 'dead', statusCode, errorCode: 'PUSH_REJECTED' };
}

function validDelivery(value) {
  return value
    && typeof value === 'object'
    && /^[a-f0-9-]{36}$/i.test(String(value.id || ''))
    && typeof value.endpoint === 'string'
    && typeof value.p256dh === 'string'
    && typeof value.auth === 'string'
    && value.payload
    && typeof value.payload === 'object'
    && !Array.isArray(value.payload);
}

function normalizedPayload(payload) {
  if (payload.type !== 'announcement_created') return payload;
  const announcementId = String(payload.resourceId || '');
  if (!UUID_PATTERN.test(announcementId)
    || payload.url !== `/announcements/${announcementId}`) {
    const error = new Error('Announcement push payload is invalid.');
    error.code = 'PUSH_PAYLOAD_INVALID';
    throw error;
  }
  return {
    ...payload,
    eventType: 'ANNOUNCEMENT_CREATED',
    announcementId
  };
}

export function createWebPushDispatcher({
  pool,
  config,
  client = webPush,
  workerId = `banke-push-${process.pid}`,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  logger = console
}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('Web Push worker database pool is required.');
  if (!config?.enabled) throw new Error('Web Push worker requires enabled VAPID configuration.');
  if (!/^[A-Za-z0-9._:-]{8,64}$/.test(workerId)) throw new Error('Web Push worker ID is invalid.');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1_000 || pollIntervalMs > 60_000) {
    throw new Error('Web Push polling interval is invalid.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error('Web Push batch size is invalid.');
  }

  let timer = null;
  let inFlight = null;
  let stopped = true;

  async function complete(id, outcome, statusCode, errorCode) {
    await pool.query(
      'SELECT app_private.worker_complete_push_delivery($1, $2, $3, $4) AS result',
      [id, outcome, statusCode, errorCode]
    );
  }

  async function deliver(item) {
    let serialized;
    try {
      serialized = JSON.stringify(normalizedPayload(item.payload));
    } catch {
      await complete(item.id, 'dead', null, 'PUSH_PAYLOAD_INVALID');
      logger.warn(JSON.stringify({
        level: 'warn',
        event: 'web_push_delivery',
        deliveryId: item.id,
        outcome: 'dead',
        statusCode: null,
        errorCode: 'PUSH_PAYLOAD_INVALID'
      }));
      return;
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
      await complete(item.id, 'dead', null, 'PAYLOAD_TOO_LARGE');
      return;
    }
    try {
      const response = await client.sendNotification({
        endpoint: item.endpoint,
        keys: { p256dh: item.p256dh, auth: item.auth }
      }, serialized, {
        TTL: 300,
        urgency: 'normal',
        timeout: 5_000,
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey
        }
      });
      const statusCode = safeStatusCode(response) || 201;
      await complete(item.id, 'delivered', statusCode, '');
      logger.info(JSON.stringify({
        level: 'info',
        event: 'web_push_delivery',
        deliveryId: item.id,
        outcome: 'delivered',
        statusCode
      }));
    } catch (error) {
      const failure = classifyFailure(error);
      await complete(item.id, failure.outcome, failure.statusCode, failure.errorCode);
      logger.warn(JSON.stringify({
        level: 'warn',
        event: 'web_push_delivery',
        deliveryId: item.id,
        outcome: failure.outcome,
        statusCode: failure.statusCode,
        errorCode: failure.errorCode
      }));
    }
  }

  async function drainOnce() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const claim = await pool.query(
        'SELECT app_private.worker_claim_push_deliveries($1, $2) AS result',
        [workerId, batchSize]
      );
      const result = claim.rows[0]?.result;
      const items = Array.isArray(result?.items) ? result.items : [];
      if (!result || result.ok !== true || items.some(item => !validDelivery(item))) {
        throw new Error('Web Push delivery claim returned an invalid response.');
      }
      for (const item of items) await deliver(item);
      return items.length;
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await drainOnce();
      } catch {
        logger.warn(JSON.stringify({
          level: 'warn',
          event: 'web_push_worker_cycle',
          outcome: 'failed'
        }));
      } finally {
        schedule();
      }
    }, pollIntervalMs);
    timer.unref?.();
  }

  return Object.freeze({
    async start() {
      stopped = false;
      await drainOnce();
      schedule();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await inFlight?.catch(() => {});
    },
    drainOnce,
    isRunning: () => !stopped
  });
}
