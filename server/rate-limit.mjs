import { createHash } from 'node:crypto';
import { ApiError } from './errors.mjs';

const DEFAULT_LIMITS = Object.freeze({ session: 20, read: 180, command: 60 });
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error(`${name} must be an integer from 1 to 10000.`);
  }
  return parsed;
}

function principalKey(identity, category) {
  const source = [identity?.issuer, identity?.subject, identity?.sessionId, category]
    .map(value => String(value || '').trim()).join('\0');
  if (!identity?.subject || !identity?.sessionId) throw new Error('Rate limiting requires verified identity and Session.');
  return createHash('sha256').update(source).digest('hex');
}

export function rateLimitConfig(env = process.env) {
  const environment = String(env.BANK_ENV || 'local').trim().toLowerCase();
  const requestedEnabled = String(env.BANK_RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false';
  if (environment !== 'local' && !requestedEnabled) {
    throw new Error('Staging/Production authenticated rate limiting cannot be disabled.');
  }
  return Object.freeze({
    enabled: environment !== 'local',
    limits: Object.freeze({
      session: positiveInteger(env.BANK_RATE_LIMIT_SESSION_PER_MINUTE, DEFAULT_LIMITS.session,
        'BANK_RATE_LIMIT_SESSION_PER_MINUTE'),
      read: positiveInteger(env.BANK_RATE_LIMIT_READ_PER_MINUTE, DEFAULT_LIMITS.read,
        'BANK_RATE_LIMIT_READ_PER_MINUTE'),
      command: positiveInteger(env.BANK_RATE_LIMIT_COMMAND_PER_MINUTE, DEFAULT_LIMITS.command,
        'BANK_RATE_LIMIT_COMMAND_PER_MINUTE')
    })
  });
}

export function createRateLimiter({ enabled = true, limits = DEFAULT_LIMITS, now = Date.now } = {}) {
  const buckets = new Map();
  let lastCleanupWindow = -1;

  function cleanup(currentWindow) {
    if (currentWindow !== lastCleanupWindow) {
      lastCleanupWindow = currentWindow;
      for (const [key, bucket] of buckets) {
        if (bucket.window < currentWindow) buckets.delete(key);
      }
    }
  }

  return Object.freeze({
    consume(identity, category) {
      if (!enabled) return;
      if (!Object.hasOwn(DEFAULT_LIMITS, category)) throw new Error('Unknown rate-limit category.');
      const limit = positiveInteger(limits[category], DEFAULT_LIMITS[category], `rate limit ${category}`);
      const timestamp = now();
      const currentWindow = Math.floor(timestamp / WINDOW_MS);
      cleanup(currentWindow);
      const key = principalKey(identity, category);
      while (!buckets.has(key) && buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
      const existing = buckets.get(key);
      const bucket = existing?.window === currentWindow ? existing : { window: currentWindow, count: 0 };
      bucket.count += 1;
      buckets.set(key, bucket);
      if (bucket.count <= limit) return;
      const retryAfterSeconds = Math.max(1, Math.ceil(((currentWindow + 1) * WINDOW_MS - timestamp) / 1000));
      throw new ApiError(429, 'RATE_LIMITED', '請求過於頻繁，請稍後再試。', { retryAfterSeconds });
    },
    size() { return buckets.size; }
  });
}
