import assert from 'node:assert/strict';
import { createSecurityEventHandler } from '../security-events/handler.mjs';

const source = 'aws.partner/auth0.com/synthetic/staging';
const queueArn = 'arn:aws:sqs:ap-southeast-1:123456789012:banke-auth0-security-events-staging';
const now = new Date('2026-07-19T12:00:00.000Z');
const env = {
  BANK_ENV: 'staging',
  AUTH0_ISSUER: 'https://synthetic-staging.auth0.com/',
  AUTH0_EVENT_SOURCE: source,
  AUTH0_SECURITY_EVENT_QUEUE_ARN: queueArn,
  AWS_ACCOUNT_ID: '123456789012',
  AWS_PARTITION: 'aws',
  AWS_REGION: 'ap-southeast-1',
  DATABASE_EVENT_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:synthetic',
  BANK_STAGING_DATABASE_HOST: 'synthetic-staging.invalid',
  BANK_STAGING_DATABASE_NAME: 'banke_staging',
  AUTH0_EVENT_MAX_AGE_SECONDS: '86400'
};

function record({ messageId, type = 'ferrt', subject = 'auth0|synthetic-user', sid = 'synthetic-session-01', time = now.toISOString(), envelope = {} }) {
  return {
    messageId,
    eventSource: 'aws:sqs',
    eventSourceARN: queueArn,
    body: JSON.stringify({
      version: '0', id: `aws-event-${messageId}`, account: env.AWS_ACCOUNT_ID,
      region: env.AWS_REGION, source, time,
      detail: { log_id: `auth0-log-${messageId}`, type, date: time, user_id: subject, session_id: sid },
      ...envelope
    })
  };
}

const inbox = new Map();
const sessionState = new Map([
  ['auth0|synthetic-user:synthetic-session-01', 'active'],
  ['auth0|synthetic-user:synthetic-session-02', 'active'],
  ['auth0|unrelated:synthetic-session-03', 'active']
]);
let writeCount = 0;
const repository = {
  async ingest(event) {
    const key = `${event.environment}:${event.issuer}:${event.eventId}`;
    if (inbox.has(key)) return { ...inbox.get(key), duplicate: true };
    let affected = 0;
    for (const [session, status] of sessionState) {
      const [subject, sid] = session.split(':synthetic-session-');
      const fullSid = `synthetic-session-${sid}`;
      const subjectMatches = !event.subject || subject === event.subject;
      const sessionMatches = !event.providerSessionId || fullSid === event.providerSessionId;
      if (status === 'active' && subjectMatches && sessionMatches && event.action !== 'ignore') {
        sessionState.set(session, event.action === 'compromise_session' ? 'compromised' : 'revoked');
        affected += 1;
      }
    }
    const result = { status: event.action === 'ignore' ? 'ignored' : affected ? 'processed' : 'unmatched', sessionsAffected: affected, duplicate: false };
    inbox.set(key, result);
    writeCount += 1;
    return result;
  }
};
const logs = [];
const handler = createSecurityEventHandler({
  env, now: () => now, repositoryFactory: async () => repository,
  logger: { info: value => logs.push(value), error: value => logs.push(value) }
});

const first = record({ messageId: 'message-0001' });
assert.deepEqual(await handler({ Records: [first] }), { batchItemFailures: [] });
assert.equal(sessionState.get('auth0|synthetic-user:synthetic-session-01'), 'compromised');
assert.equal(sessionState.get('auth0|synthetic-user:synthetic-session-02'), 'active');
assert.equal(sessionState.get('auth0|unrelated:synthetic-session-03'), 'active');

assert.deepEqual(await handler({ Records: [first] }), { batchItemFailures: [] });
assert.equal(writeCount, 1, 'duplicate event must not repeat the database mutation');

const blocked = record({ messageId: 'message-0002', type: 'user.blocked', sid: '' });
assert.deepEqual(await handler({ Records: [blocked] }), { batchItemFailures: [] });
assert.equal(sessionState.get('auth0|synthetic-user:synthetic-session-02'), 'revoked');
assert.equal(sessionState.get('auth0|unrelated:synthetic-session-03'), 'active');

const invalidSource = record({ messageId: 'message-0003', envelope: { source: 'aws.partner/attacker.invalid' } });
const expired = record({ messageId: 'message-0004', time: '2026-07-17T12:00:00.000Z' });
const uncorrelated = record({ messageId: 'message-0005', subject: '', sid: '' });
assert.deepEqual(await handler({ Records: [invalidSource, expired, uncorrelated] }), {
  batchItemFailures: [
    { itemIdentifier: 'message-0003' },
    { itemIdentifier: 'message-0004' },
    { itemIdentifier: 'message-0005' }
  ]
});
assert.ok(logs.every(line => !line.includes('synthetic-session') && !line.includes('auth0|synthetic-user')));

await assert.rejects(
  async () => createSecurityEventHandler({ env: { ...env, BANK_ENV: 'production' } }),
  /BANK_ENV_INVALID/
);
await assert.rejects(
  async () => createSecurityEventHandler({ env: { ...env, AUTH0_EVENT_SOURCE: 'aws.partner/attacker.invalid/source' } }),
  /AUTH0_EVENT_SOURCE_INVALID/
);
await assert.rejects(
  async () => createSecurityEventHandler({ env: { ...env, AUTH0_SECURITY_EVENT_QUEUE_ARN: queueArn.replace('123456789012', '000000000000') } }),
  /AUTH0_SECURITY_EVENT_QUEUE_ARN_INVALID/
);
await assert.rejects(
  async () => createSecurityEventHandler({ env: { ...env, AWS_PARTITION: 'aws-attacker' } }),
  /AWS_IDENTITY_INVALID/
);

await assert.rejects(() => handler({ Records: [] }), /SQS_BATCH_INVALID/);
await assert.rejects(() => handler({ Records: Array.from({ length: 11 }, (_, index) => record({ messageId: `oversized-${index}` })) }), /SQS_BATCH_INVALID/);

let repositoryAttempts = 0;
const retryingHandler = createSecurityEventHandler({
  env,
  now: () => now,
  repositoryFactory: async () => {
    repositoryAttempts += 1;
    if (repositoryAttempts === 1) throw new Error('SYNTHETIC_TRANSIENT_DATABASE_ERROR');
    return repository;
  },
  logger: { info: value => logs.push(value), error: value => logs.push(value) }
});
assert.deepEqual(await retryingHandler({ Records: [record({ messageId: 'message-retry-01', type: 'unsupported.event' })] }), {
  batchItemFailures: [{ itemIdentifier: 'message-retry-01' }]
});
assert.deepEqual(await retryingHandler({ Records: [record({ messageId: 'message-retry-01', type: 'unsupported.event' })] }), {
  batchItemFailures: []
});
assert.equal(repositoryAttempts, 2, 'a transient repository initialization failure must be retryable in a warm Lambda');

console.log('Auth0 Staging security event handler tests passed.');
