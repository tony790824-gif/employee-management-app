import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { STAGING_TENANT_CONTEXT_KEY_ID } from '../database/staging-ui-bootstrap.mjs';

if (process.env.BANK_ENV !== 'staging') {
  throw new Error('Live Web Push E2E requires BANK_ENV=staging.');
}

const EXPECTED_CHECKSUM =
  '31816e7e710a2b806dac0aed34329a268201b37456105a2b45f147d74ee0a476';
const EXPECTED_EDGE_ALLOWLIST_CHECKSUM =
  '48a4c66b94806198e8974c687c764d4b27c271a31f1e05361d3acc73f109f277';
const EXPECTED_PRIORITY_CHECKSUM =
  '5accdcf763ef5bac72139d9cd8a5dc0d1ae49f70a3306467918f8154edc5733f';
const EXPECTED_FALLBACK_CHECKSUM =
  '7ec470b263bda1c0677432f1a0f5cb255cefcd25fdf4e256ea6b7fb35f3105f4';
const TEST_ORIGIN = 'https://web-push-e2e.staging.invalid';
const TEST_ISSUER = 'https://web-push-e2e.staging.invalid/';
const { Client } = pg;
const apiPool = createPool();
const owner = new Client({
  connectionString: process.env.DATABASE_MIGRATOR_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000
});

function syntheticIdentity(label) {
  const now = Math.floor(Date.now() / 1000);
  return Object.freeze({
    issuer: TEST_ISSUER,
    subject: `auth0|${label}-${randomUUID()}`,
    sessionId: `sid-${randomUUID()}`,
    tokenId: `jti-${randomUUID()}`,
    issuedAt: now,
    expiresAt: now + 300
  });
}

function workspaceId() {
  return `ws_${randomUUID().replaceAll('-', '')}`;
}

function employeeId(label) {
  return `e_push_${label}_${randomUUID().replaceAll('-', '')}`;
}

function phone(sequence) {
  return `8${String(Date.now()).slice(-10)}${sequence}`;
}

function endpoint(label) {
  return `https://fcm.googleapis.com/fcm/send/bankeban-${label}-${randomUUID()}`;
}

function edgeEndpoint(label) {
  return `https://wns2-by3p.notify.windows.com/w/?token=bankeban-${label}-${randomUUID()}`;
}

function subscriptionBody(targetEndpoint, platform = 'windows', clientMode = 'browser') {
  return {
    endpoint: targetEndpoint,
    expirationTime: null,
    p256dh: 'A'.repeat(88),
    auth: 'B'.repeat(24),
    userAgent: 'Synthetic Bankeban Staging E2E',
    platform,
    clientMode
  };
}

async function inWorkspace(id, callback) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.current_workspace_id', $1, true)", [id]);
    const result = await callback();
    await owner.query('COMMIT');
    return result;
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function request(base, path, principal, expected, {
  method = path === '/v1/auth/session' ? 'POST' : 'GET',
  body,
  idempotencyKey
} = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${principal.token}`,
      Origin: TEST_ORIGIN,
      'X-Workspace-Id': principal.workspaceId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path} returned ${response.status} (${payload.code || 'no-code'})`
  );
  return payload;
}

async function command(base, principal, name, body, expected = 201, idempotencyKey) {
  return request(base, `/v1/commands/${name}`, principal, expected, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || `push-e2e-${name}-${randomUUID()}`
  });
}

async function createWorkspaceFixture(label, sequence) {
  const organization = (await owner.query(
    'INSERT INTO organizations(name) VALUES ($1) RETURNING id',
    [`Synthetic Web Push ${label}`]
  )).rows[0].id;
  const workspace = workspaceId();
  const bossUser = (await owner.query(
    "INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id",
    [phone(sequence)]
  )).rows[0].id;
  const employeeUser = (await owner.query(
    "INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id",
    [phone(sequence + 1)]
  )).rows[0].id;
  const employee = employeeId(label.toLowerCase());
  await inWorkspace(workspace, async () => {
    await owner.query(
      `INSERT INTO workspaces(id, organization_id, name, status)
       VALUES ($1, $2, $3, 'active')`,
      [workspace, organization, `Synthetic Push Workspace ${label}`]
    );
    await owner.query(
      `INSERT INTO employees(workspace_id, id, name, phone, hourly_rate, leave_quota)
       VALUES ($1, $2, $3, $4, 0, 8)`,
      [workspace, employee, `Synthetic Push Employee ${label}`, phone(sequence + 2)]
    );
    await owner.query(
      `INSERT INTO workspace_members(
         workspace_id, user_id, role, status, employee_id, auth_status, display_name
       ) VALUES
         ($1, $2, 'boss', 'active', NULL, 'active', $3),
         ($1, $4, 'employee', 'active', $5, 'active', NULL)`,
      [workspace, bossUser, `Synthetic Push Boss ${label}`, employeeUser, employee]
    );
  });
  return { organization, workspace, bossUser, employeeUser, employee };
}

async function createSyntheticNotification(workspaceId, recipientUserId, label) {
  return inWorkspace(workspaceId, async () => {
    const sourceEventId = (await owner.query(
      `INSERT INTO outbox_events(workspace_id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, 'synthetic.priority.test', 'notification_priority_test', $2, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, label]
    )).rows[0].id;
    return (await owner.query(
      `INSERT INTO notifications(
         workspace_id, recipient_user_id, source_event_id, notification_type,
         title, body, resource_type, resource_id
       ) VALUES ($1, $2, $3, 'schedule_updated', 'Synthetic priority',
         'Synthetic priority body', 'notification_priority_test', $4)
       RETURNING id`,
      [workspaceId, recipientUserId, sourceEventId, label]
    )).rows[0].id;
  });
}

async function destroyWorkspaceFixture(fixture) {
  await inWorkspace(fixture.workspace, async () => {
    await owner.query('DELETE FROM workspaces WHERE id = $1', [fixture.workspace]);
  });
  await owner.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
    [fixture.bossUser, fixture.employeeUser]
  ]);
  await owner.query('DELETE FROM organizations WHERE id = $1', [fixture.organization]);
}

await owner.connect();
let api;
const fixtures = [];
try {
  const migration = (await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0016'`
  )).rows[0];
  assert.deepEqual(migration, {
    name: 'web_push_subscriptions',
    checksum: EXPECTED_CHECKSUM
  });
  const edgeAllowlistMigration = (await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0018'`
  )).rows[0];
  assert.deepEqual(edgeAllowlistMigration, {
    name: 'edge_web_push_provider_allowlist',
    checksum: EXPECTED_EDGE_ALLOWLIST_CHECKSUM
  });
  const priorityMigration = (await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0020'`
  )).rows[0];
  assert.deepEqual(priorityMigration, {
    name: 'push_subscription_priority',
    checksum: EXPECTED_PRIORITY_CHECKSUM
  });
  const fallbackMigration = (await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0021'`
  )).rows[0];
  assert.deepEqual(fallbackMigration, {
    name: 'push_delivery_fallback',
    checksum: EXPECTED_FALLBACK_CHECKSUM
  });
  assert.equal((await owner.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
  assert.notEqual(
    new URL(process.env.DATABASE_API_URL).username,
    new URL(process.env.DATABASE_MIGRATOR_URL).username
  );

  const [workspaceA, workspaceB] = await Promise.all([
    createWorkspaceFixture('A', 1),
    createWorkspaceFixture('B', 4)
  ]);
  fixtures.push(workspaceA, workspaceB);
  const definitions = [
    {
      token: 'push-boss-a',
      workspaceId: workspaceA.workspace,
      userId: workspaceA.bossUser,
      identity: syntheticIdentity('boss-a')
    },
    {
      token: 'push-employee-a',
      workspaceId: workspaceA.workspace,
      userId: workspaceA.employeeUser,
      identity: syntheticIdentity('employee-a')
    },
    {
      token: 'push-boss-b',
      workspaceId: workspaceB.workspace,
      userId: workspaceB.bossUser,
      identity: syntheticIdentity('boss-b')
    }
  ];
  for (const principal of definitions) {
    await owner.query(
      `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [TEST_ISSUER, principal.identity.subject, principal.userId]
    );
  }

  const key = (await owner.query(
    `SELECT secret FROM app_private.tenant_context_keys
      WHERE key_id = $1 AND status = 'active'
        AND not_before <= clock_timestamp() AND expires_at > clock_timestamp()`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  )).rows[0]?.secret;
  assert.ok(key?.length >= 32);
  const identities = new Map(definitions.map(item => [item.token, item.identity]));
  const verifyAccessToken = async token => {
    const value = identities.get(token);
    if (!value) throw new Error('Synthetic bearer is unknown.');
    return value;
  };
  const signer = createTenantContextSigner({
    key: key.toString('base64url'),
    keyId: STAGING_TENANT_CONTEXT_KEY_ID
  });
  const service = createCommandService({ pool: apiPool, tenantContextSigner: signer });
  api = createApiServer({
    commandService: service,
    verifyAccessToken,
    pool: apiPool,
    allowedOrigins: [TEST_ORIGIN],
    environment: 'staging'
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const base = `http://127.0.0.1:${api.address().port}`;
  const [bossA, employeeA, bossB] = definitions;
  for (const principal of definitions) {
    assert.equal((await request(base, '/v1/auth/session', principal, 201)).ok, true);
  }

  const edgeBossAEndpoint = edgeEndpoint('boss-a');
  assert.equal((await command(
    base, bossA, 'push.register', subscriptionBody(edgeBossAEndpoint)
  )).data.registered, true);
  assert.equal((await command(
    base, bossA, 'push.unregister', { endpoint: edgeBossAEndpoint }
  )).data.unregistered, true);
  assert.equal((await request(base, '/v1/push/status', bossA, 200)).activeSubscriptionCount, 0);

  const bossAEndpoint = endpoint('boss-a');
  const bossAPwaEndpoint = endpoint('boss-a-pwa');
  const bossBEndpoint = endpoint('boss-b');
  assert.equal((await command(
    base, bossA, 'push.register', subscriptionBody(bossAEndpoint)
  )).data.registered, true);
  assert.equal((await command(
    base,
    bossA,
    'push.register',
    {
      ...subscriptionBody(bossAEndpoint),
      p256dh: 'C'.repeat(88),
      userAgent: 'Synthetic Bankeban Staging E2E Updated'
    }
  )).data.registered, true);
  const updatedBossSubscription = (await owner.query(
    `SELECT count(*)::integer AS count, min(user_agent) AS user_agent
       FROM push_subscriptions
      WHERE endpoint_hash = digest($1, 'sha256')
        AND revoked_at IS NULL`,
    [bossAEndpoint]
  )).rows[0];
  assert.deepEqual(updatedBossSubscription, {
    count: 1,
    user_agent: 'Synthetic Bankeban Staging E2E Updated'
  });
  assert.equal((await command(
    base, bossA, 'push.unregister', { endpoint: bossAEndpoint }
  )).data.unregistered, true);
  assert.equal((await request(base, '/v1/push/status', bossA, 200)).activeSubscriptionCount, 0);
  assert.equal((await command(
    base, bossA, 'push.register', subscriptionBody(bossAEndpoint)
  )).data.registered, true);
  assert.equal((await command(
    base, bossA, 'push.register', subscriptionBody(bossAPwaEndpoint, 'windows', 'pwa')
  )).data.registered, true);
  assert.equal((await command(
    base, bossB, 'push.register', subscriptionBody(bossBEndpoint, 'android')
  )).data.registered, true);
  assert.equal((await request(base, '/v1/push/status', bossA, 200)).activeSubscriptionCount, 2);
  assert.equal(new URL(bossAEndpoint).hostname, 'fcm.googleapis.com');
  assert.equal(new URL(bossBEndpoint).hostname, 'fcm.googleapis.com');

  const browserOnlyNotification = await createSyntheticNotification(
    workspaceB.workspace, workspaceB.bossUser, `browser-only-${randomUUID()}`
  );
  assert.deepEqual((await owner.query(
    `SELECT subscription.endpoint
       FROM push_deliveries delivery
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE delivery.workspace_id = $1 AND delivery.notification_id = $2`,
    [workspaceB.workspace, browserOnlyNotification]
  )).rows.map(row => row.endpoint), [bossBEndpoint]);
  const workspaceBDeliveryCountBefore = (await owner.query(
    `SELECT count(*)::integer AS count FROM push_deliveries WHERE workspace_id = $1`,
    [workspaceB.workspace]
  )).rows[0].count;

  const crossWorkspace = await request(
    base,
    '/v1/push/status',
    { ...bossA, workspaceId: workspaceB.workspace },
    403
  );
  assert.equal(crossWorkspace.code, 'WORKSPACE_ACCESS_DENIED');
  const endpointConflict = await command(
    base, bossA, 'push.register', subscriptionBody(bossBEndpoint), 409
  );
  assert.equal(endpointConflict.code, 'PUSH_SUBSCRIPTION_CONFLICT');
  const invalidEndpoint = await command(
    base,
    bossA,
    'push.register',
    subscriptionBody('https://attacker.invalid/push/subscription'),
    400
  );
  assert.equal(invalidEndpoint.code, 'COMMAND_INVALID');

  for (const statusCode of [404, 410]) {
    const staleEndpoint = endpoint(`expired-${statusCode}`);
    assert.equal((await command(
      base, employeeA, 'push.register', subscriptionBody(staleEndpoint, 'android')
    )).data.registered, true);
    assert.equal((await command(
      base, employeeA, 'push.test', { endpoint: staleEndpoint }
    )).data.queued, true);
    const staleDelivery = (await owner.query(
      `UPDATE push_deliveries delivery
          SET status = 'processing', attempt_count = delivery.attempt_count + 1,
              claimed_at = clock_timestamp()
         FROM push_subscriptions subscription
        WHERE subscription.workspace_id = delivery.workspace_id
          AND subscription.id = delivery.subscription_id
          AND subscription.endpoint_hash = digest($1, 'sha256')
          AND delivery.delivery_type = 'push_test'
          AND delivery.status = 'pending'
      RETURNING delivery.id, subscription.endpoint`,
      [staleEndpoint]
    )).rows[0];
    assert.ok(staleDelivery, `The ${statusCode} synthetic FCM delivery must be claimed.`);
    const completion = (await owner.query(
      `SELECT app_private.worker_complete_push_delivery(
         $1, 'expired', $2, 'SUBSCRIPTION_EXPIRED'
       ) AS result`,
      [staleDelivery.id, statusCode]
    )).rows[0].result;
    assert.deepEqual(completion, { ok: true, status: 'dead' });
    const staleState = (await owner.query(
      `SELECT subscription.revoked_at IS NOT NULL AS revoked,
              delivery.status,
              delivery.last_status_code,
              delivery.last_error_code
         FROM push_subscriptions subscription
         JOIN push_deliveries delivery
           ON delivery.workspace_id = subscription.workspace_id
          AND delivery.subscription_id = subscription.id
        WHERE subscription.endpoint_hash = digest($1, 'sha256')
          AND delivery.id = $2`,
      [staleEndpoint, staleDelivery.id]
    )).rows[0];
    assert.deepEqual(staleState, {
      revoked: true,
      status: 'dead',
      last_status_code: statusCode,
      last_error_code: 'SUBSCRIPTION_EXPIRED'
    });
  }

  const submitted = (await command(
    base,
    employeeA,
    'schedule-leave-requests.submit',
    { month: '2097-11', dates: ['2097-11-03'] }
  )).data;
  assert.equal(submitted.status, 'pending');

  const bossADelivery = (await owner.query(
    `SELECT delivery.id, delivery.notification_id, delivery.status, delivery.delivery_type, delivery.payload,
            subscription.endpoint
       FROM push_deliveries delivery
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE delivery.workspace_id = $1
        AND delivery.recipient_user_id = $2
        AND delivery.notification_id IS NOT NULL`,
    [workspaceA.workspace, workspaceA.bossUser]
  )).rows;
  assert.equal(bossADelivery.length, 1);
  assert.equal(bossADelivery[0].status, 'pending');
  assert.equal(bossADelivery[0].delivery_type, 'notification');
  assert.equal(bossADelivery[0].endpoint, bossAPwaEndpoint);
  assert.equal(JSON.stringify(bossADelivery[0].payload).includes('reason'), false);
  assert.equal((await owner.query(
    `SELECT count(*)::integer AS count
       FROM push_deliveries
      WHERE workspace_id = $1`,
    [workspaceB.workspace]
  )).rows[0].count, workspaceBDeliveryCountBefore);

  await owner.query(
    `UPDATE push_deliveries
        SET status = 'processing', attempt_count = attempt_count + 1,
            claimed_at = clock_timestamp()
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceA.workspace, bossADelivery[0].id]
  );
  const pwaExpiry = (await owner.query(
    `SELECT app_private.worker_complete_push_delivery(
       $1, 'expired', 410, 'SUBSCRIPTION_EXPIRED'
     ) AS result`,
    [bossADelivery[0].id]
  )).rows[0].result;
  assert.deepEqual(pwaExpiry, { ok: true, status: 'dead' });
  const fallbackDeliveries = (await owner.query(
    `SELECT subscription.endpoint, delivery.status
       FROM push_deliveries delivery
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE delivery.workspace_id = $1 AND delivery.notification_id = $2
      ORDER BY delivery.created_at, delivery.id`,
    [workspaceA.workspace, bossADelivery[0].notification_id]
  )).rows;
  assert.deepEqual(fallbackDeliveries, [
    { endpoint: bossAPwaEndpoint, status: 'dead' },
    { endpoint: bossAEndpoint, status: 'pending' }
  ], 'An expired PWA delivery safely falls back to the active browser subscription.');
  assert.equal((await owner.query(
    `SELECT count(*)::integer AS count
       FROM notifications
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceA.workspace, bossADelivery[0].notification_id]
  )).rows[0].count, 1, 'Push fallback never duplicates the Notification Center event.');
  assert.equal((await command(
    base, bossA, 'push.register', subscriptionBody(bossAPwaEndpoint, 'windows', 'pwa')
  )).data.registered, true);

  const androidBrowserEndpoint = endpoint('employee-a-android-browser');
  const androidPwaEndpoint = endpoint('employee-a-android-pwa');
  await command(base, employeeA, 'push.register',
    subscriptionBody(androidBrowserEndpoint, 'android', 'browser'));
  await command(base, employeeA, 'push.register',
    subscriptionBody(androidPwaEndpoint, 'android', 'pwa'));
  const androidNotification = await createSyntheticNotification(
    workspaceA.workspace, workspaceA.employeeUser, `android-pwa-${randomUUID()}`
  );
  assert.deepEqual((await owner.query(
    `SELECT subscription.endpoint
       FROM push_deliveries delivery
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE delivery.workspace_id = $1 AND delivery.notification_id = $2`,
    [workspaceA.workspace, androidNotification]
  )).rows.map(row => row.endpoint), [androidPwaEndpoint]);

  const iosBrowserEndpoint = endpoint('boss-b-ios-browser');
  const iosPwaEndpoint = endpoint('boss-b-ios-pwa');
  await command(base, bossB, 'push.register', subscriptionBody(iosBrowserEndpoint, 'ios', 'browser'));
  await command(base, bossB, 'push.register', subscriptionBody(iosPwaEndpoint, 'ios', 'pwa'));
  const iosNotification = await createSyntheticNotification(
    workspaceB.workspace, workspaceB.bossUser, `ios-pwa-${randomUUID()}`
  );
  assert.deepEqual((await owner.query(
    `SELECT subscription.endpoint
       FROM push_deliveries delivery
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE delivery.workspace_id = $1 AND delivery.notification_id = $2`,
    [workspaceB.workspace, iosNotification]
  )).rows.map(row => row.endpoint), [iosPwaEndpoint]);

  const testPush = await command(base, bossA, 'push.test', { endpoint: bossAEndpoint });
  assert.equal(testPush.data.queued, true);
  assert.equal(testPush.data.queuedCount, 1);
  const testKey = `push-e2e-replay-${randomUUID()}`;
  await command(base, bossA, 'push.test', { endpoint: bossAEndpoint }, 201, testKey);
  const replayed = await command(base, bossA, 'push.test', { endpoint: bossAEndpoint }, 200, testKey);
  assert.equal(replayed.replayed, true);
  await command(base, bossA, 'push.test', { endpoint: bossAEndpoint });
  const limited = await command(
    base, bossA, 'push.test', { endpoint: bossAEndpoint }, 429
  );
  assert.equal(limited.code, 'PUSH_RATE_LIMITED');

  await owner.query('BEGIN');
  try {
    const claimed = (await owner.query(
      `SELECT app_private.worker_claim_push_deliveries($1, 50) AS result`,
      ['push-e2e-worker']
    )).rows[0].result;
    const claimedBossA = claimed.items.filter(item =>
      item.endpoint === bossAEndpoint
    );
    assert.ok(claimedBossA.length >= 1);
    assert.ok(claimedBossA.every(item => !JSON.stringify(item.payload).includes('reason')));
  } finally {
    await owner.query('ROLLBACK');
  }

  await inWorkspace(workspaceA.workspace, async () => {
    await owner.query(
      `UPDATE workspace_members
          SET auth_status = 'disabled'
        WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceA.workspace, workspaceA.bossUser]
    );
  });
  await owner.query('BEGIN');
  try {
    await owner.query(
      `SELECT app_private.worker_claim_push_deliveries($1, 50)`,
      ['push-e2e-revocation']
    );
    const unauthorized = (await owner.query(
      `SELECT count(*)::integer AS count
         FROM push_deliveries
        WHERE workspace_id = $1
          AND recipient_user_id = $2
          AND status = 'dead'
          AND last_error_code = 'AUTHORIZATION_INVALID'`,
      [workspaceA.workspace, workspaceA.bossUser]
    )).rows[0].count;
    assert.ok(unauthorized >= 1);
  } finally {
    await owner.query('ROLLBACK');
  }
  await inWorkspace(workspaceA.workspace, async () => {
    await owner.query(
      `UPDATE workspace_members
          SET auth_status = 'active'
        WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceA.workspace, workspaceA.bossUser]
    );
  });

  await assert.rejects(
    () => apiPool.query('SELECT id FROM push_subscriptions LIMIT 1'),
    error => error.code === '42501'
  );
  await assert.rejects(
    () => apiPool.query('SELECT id FROM push_deliveries LIMIT 1'),
    error => error.code === '42501'
  );
  const apiRole = new URL(process.env.DATABASE_API_URL).username;
  const privilege = (await owner.query(
    `SELECT
       has_table_privilege($1, 'public.push_subscriptions', 'SELECT') AS subscription_select,
       has_table_privilege($1, 'public.push_deliveries', 'SELECT') AS delivery_select,
       has_function_privilege(
         $1, 'app_private.api_push_status(text,text,text)', 'EXECUTE'
       ) AS status_execute,
       has_function_privilege(
         $1,
         'app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)',
         'EXECUTE'
       ) AS command_execute,
       has_function_privilege(
         $1, 'app_private.worker_claim_push_deliveries(text,integer)', 'EXECUTE'
       ) AS worker_execute`,
    [apiRole]
  )).rows[0];
  assert.deepEqual(privilege, {
    subscription_select: false,
    delivery_select: false,
    status_execute: true,
    command_execute: true,
    worker_execute: false
  });

  assert.equal((await command(
    base, bossA, 'push.unregister', { endpoint: bossAEndpoint }
  )).data.unregistered, true);
  assert.equal((await request(base, '/v1/push/status', bossA, 200)).activeSubscriptionCount, 1);
  const endpointDigest = createHash('sha256').update(bossAEndpoint).digest();
  const revoked = (await owner.query(
    `SELECT revoked_at IS NOT NULL AS revoked
       FROM push_subscriptions
      WHERE endpoint_hash = $1`,
    [endpointDigest]
  )).rows[0];
  assert.equal(revoked.revoked, true);

  console.log(JSON.stringify({
    migrationChecksum: 'passed',
    registrationUpdateUnregisterReregister: 'passed',
    chromeAndroidFcmTransport: 'passed',
    expired404Cleanup: 'passed',
    expired410Cleanup: 'passed',
    endpointConflict: 'denied',
    invalidEndpoint: 'denied',
    notificationQueue: 'passed',
    payloadPrivacy: 'passed',
    rateLimit: 'passed',
    idempotency: 'passed',
    workerClaim: 'passed',
    revokedMembershipDelivery: 'denied',
    workspaceIsolation: 'passed',
    apiRoleDirectTableAccess: 'denied',
    apiRoleWorkerAccess: 'denied',
    unregister: 'passed'
  }));
} finally {
  if (api) {
    api.close();
    await once(api, 'close');
  }
  try {
    await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    for (const fixture of fixtures.reverse()) {
      await destroyWorkspaceFixture(fixture);
    }
    assert.equal((await owner.query(
      "SELECT count(*)::integer AS count FROM organizations WHERE name LIKE 'Synthetic Web Push %'"
    )).rows[0].count, 0);
  } finally {
    await owner.end();
    await apiPool.end();
  }
}
