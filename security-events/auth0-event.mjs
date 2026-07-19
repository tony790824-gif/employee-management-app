import { createHash } from 'node:crypto';

const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const SUBJECT_PATTERN = /^[^\s]{3,256}$/;
const SESSION_PATTERN = /^[^\s]{8,256}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REFRESH_REUSE_TYPES = new Set(['ferrt', 'refresh_token.reuse_detected']);
const REFRESH_REVOKE_TYPES = new Set(['fertft', 'srrt', 'refresh_token.revoked', 'session_revoked']);
const ACCOUNT_REVOKE_TYPES = new Set(['limit_sul', 'user.blocked', 'user.deleted']);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    throw new SecurityEventError(code);
  }
}

function strictDate(value, code) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(text)) {
    throw new SecurityEventError(code);
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new SecurityEventError(code);
  return new Date(timestamp);
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function safeIdentifier(value, pattern, code, { optional = false } = {}) {
  const text = String(value || '').trim();
  if (!text && optional) return '';
  if (!pattern.test(text)) throw new SecurityEventError(code);
  return text;
}

function eventAction(type, detail) {
  if (REFRESH_REUSE_TYPES.has(type)) return 'compromise_session';
  if (REFRESH_REVOKE_TYPES.has(type)) return 'revoke_session';
  if (ACCOUNT_REVOKE_TYPES.has(type)) return 'revoke_user_sessions';
  if (type === 'user.updated' && object(object(detail.data).object).blocked === true) {
    return 'revoke_user_sessions';
  }
  return 'ignore';
}

export class SecurityEventError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SecurityEventError';
    this.code = code;
  }
}

export function parseAuth0SqsRecord(record, config, now = new Date()) {
  if (record?.eventSource !== 'aws:sqs' || record?.eventSourceARN !== config.queueArn) {
    throw new SecurityEventError('SQS_SOURCE_INVALID');
  }
  const body = String(record?.body || '');
  if (!body || Buffer.byteLength(body, 'utf8') > 262_144) {
    throw new SecurityEventError('EVENT_BODY_INVALID');
  }
  const envelope = object(parseJson(body, 'EVENT_ENVELOPE_INVALID'));
  if (envelope.version !== '0'
    || envelope.account !== config.awsAccountId
    || envelope.region !== config.awsRegion
    || envelope.source !== config.auth0EventSource) {
    throw new SecurityEventError('EVENT_SOURCE_INVALID');
  }
  const detail = object(typeof envelope.detail === 'string'
    ? parseJson(envelope.detail, 'EVENT_DETAIL_INVALID') : envelope.detail);
  const occurredAt = strictDate(firstString(detail.date, detail.time, envelope.time), 'EVENT_TIME_INVALID');
  const ageMs = now.getTime() - occurredAt.getTime();
  if (ageMs < -120_000 || ageMs > config.maxEventAgeSeconds * 1000) {
    throw new SecurityEventError('EVENT_TIME_OUT_OF_RANGE');
  }
  const eventId = safeIdentifier(firstString(detail.log_id, detail.id, envelope.id), EVENT_ID_PATTERN, 'EVENT_ID_INVALID');
  const type = firstString(detail.type, detail.event_type);
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(type)) throw new SecurityEventError('EVENT_TYPE_INVALID');
  const dataObject = object(object(detail.data).object);
  const details = object(detail.details);
  const subject = safeIdentifier(firstString(
    detail.user_id,
    object(detail.user).user_id,
    dataObject.user_id,
    details.user_id
  ), SUBJECT_PATTERN, 'EVENT_SUBJECT_INVALID', { optional: true });
  const providerSessionId = safeIdentifier(firstString(
    detail.session_id,
    details.session_id,
    details.sid,
    object(detail.session).id
  ), SESSION_PATTERN, 'EVENT_SESSION_INVALID', { optional: true });
  const action = eventAction(type, detail);
  if (action !== 'ignore' && !subject && !providerSessionId) {
    throw new SecurityEventError('EVENT_CORRELATION_MISSING');
  }
  if (action === 'revoke_user_sessions' && !subject) {
    throw new SecurityEventError('EVENT_SUBJECT_REQUIRED');
  }
  const payloadSha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  if (!HASH_PATTERN.test(payloadSha256)) throw new SecurityEventError('EVENT_HASH_INVALID');
  return {
    environment: 'staging',
    issuer: config.auth0Issuer,
    eventId,
    eventType: type,
    action,
    subject: subject || null,
    providerSessionId: providerSessionId || null,
    occurredAt: occurredAt.toISOString(),
    payloadSha256
  };
}

export function securityEventLog(error, record) {
  const code = error instanceof SecurityEventError ? error.code : 'SECURITY_EVENT_PROCESSING_FAILED';
  const fingerprint = createHash('sha256').update(String(record?.messageId || 'unknown')).digest('hex').slice(0, 12);
  return { level: 'error', code, messageFingerprint: fingerprint };
}
