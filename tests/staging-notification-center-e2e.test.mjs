import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { API_FUNCTIONS } from '../database/apply-role-grants.mjs';
import { STAGING_TENANT_CONTEXT_KEY_ID } from '../database/staging-ui-bootstrap.mjs';

if (process.env.BANK_ENV !== 'staging') {
  throw new Error('Live Notification Center E2E requires BANK_ENV=staging.');
}

const EXPECTED_CHECKSUM = 'c966d0ee7ac3b09cfaffdb8ef8e92a126db411c5fa4ffcf719709dcf0d83c2bc';
const TEST_ORIGIN = 'https://notification-e2e.staging.invalid';
const TEST_ISSUER = 'https://notification-e2e.staging.invalid/';
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
  return `e_notification_${label}_${randomUUID().replaceAll('-', '')}`;
}

function phone(sequence) {
  return `8${String(Date.now()).slice(-10)}${sequence}`;
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
  assert.equal(response.status, expected,
    `${path} returned ${response.status} (${payload.code || 'no-code'})`);
  return { payload, revision: response.headers.get('x-bootstrap-revision') };
}

async function command(base, principal, name, body, expected = 201, idempotencyKey) {
  return request(base, `/v1/commands/${name}`, principal, expected, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || `notification-e2e-${name}-${randomUUID()}`
  });
}

async function createWorkspaceFixture(label, sequence) {
  const organization = (await owner.query(
    'INSERT INTO organizations(name) VALUES ($1) RETURNING id',
    [`Synthetic Notification ${label}`]
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
      [workspace, organization, `Synthetic Workspace ${label}`]
    );
    await owner.query(
      `INSERT INTO employees(workspace_id, id, name, phone, hourly_rate, leave_quota)
       VALUES ($1, $2, $3, $4, 0, 8)`,
      [workspace, employee, `Synthetic Employee ${label}`, phone(sequence + 2)]
    );
    await owner.query(
      `INSERT INTO workspace_members(
         workspace_id, user_id, role, status, employee_id, auth_status, display_name
       ) VALUES
         ($1, $2, 'boss', 'active', NULL, 'active', $3),
         ($1, $4, 'employee', 'active', $5, 'active', NULL)`,
      [workspace, bossUser, `Synthetic Boss ${label}`, employeeUser, employee]
    );
  });
  return { organization, workspace, bossUser, employeeUser, employee };
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
const principals = [];
try {
  const migration = (await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0014'`
  )).rows[0];
  assert.deepEqual(migration, { name: 'notification_center', checksum: EXPECTED_CHECKSUM });
  assert.equal((await owner.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
  assert.notEqual(new URL(process.env.DATABASE_API_URL).username,
    new URL(process.env.DATABASE_MIGRATOR_URL).username);

  const [workspaceA, workspaceB] = await Promise.all([
    createWorkspaceFixture('A', 1),
    createWorkspaceFixture('B', 4)
  ]);
  fixtures.push(workspaceA, workspaceB);
  const definitions = [
    {
      token: 'notification-boss-a',
      workspaceId: workspaceA.workspace,
      userId: workspaceA.bossUser,
      employeeId: null,
      identity: syntheticIdentity('boss-a')
    },
    {
      token: 'notification-employee-a',
      workspaceId: workspaceA.workspace,
      userId: workspaceA.employeeUser,
      employeeId: workspaceA.employee,
      identity: syntheticIdentity('employee-a')
    },
    {
      token: 'notification-boss-b',
      workspaceId: workspaceB.workspace,
      userId: workspaceB.bossUser,
      employeeId: null,
      identity: syntheticIdentity('boss-b')
    },
    {
      token: 'notification-employee-b',
      workspaceId: workspaceB.workspace,
      userId: workspaceB.employeeUser,
      employeeId: workspaceB.employee,
      identity: syntheticIdentity('employee-b')
    }
  ];
  principals.push(...definitions);
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
  const [bossA, employeeA, bossB, employeeB] = definitions;
  for (const principal of definitions) {
    assert.equal((await request(base, '/v1/auth/session', principal, 201)).payload.ok, true);
  }

  const bossRevisionBefore = (await request(
    base, '/v1/bootstrap/revision', bossA, 200
  )).payload.revision;
  const employeeRevisionBefore = (await request(
    base, '/v1/bootstrap/revision', employeeA, 200
  )).payload.revision;

  const submitKey = `notification-e2e-submit-${randomUUID()}`;
  const submitted = (await command(
    base,
    employeeA,
    'schedule-leave-requests.submit',
    { month: '2097-09', dates: ['2097-09-03', '2097-09-10'] },
    201,
    submitKey
  )).payload;
  assert.equal(submitted.data.status, 'pending');
  const replayedSubmit = (await command(
    base,
    employeeA,
    'schedule-leave-requests.submit',
    { month: '2097-09', dates: ['2097-09-03', '2097-09-10'] },
    200,
    submitKey
  )).payload;
  assert.equal(replayedSubmit.replayed, true);

  const bossNotifications = (await request(base, '/v1/notifications', bossA, 200)).payload;
  assert.equal(bossNotifications.unreadCount, 1);
  assert.equal(bossNotifications.items.length, 1, 'idempotent replay must not duplicate a notification');
  assert.equal(bossNotifications.items[0].type, 'time_off_submitted');
  assert.equal(bossNotifications.items[0].resourceId, submitted.data.id);
  assert.equal(JSON.stringify(bossNotifications).includes('reason'), false);
  const bossNotification = bossNotifications.items[0];

  const bossRevisionAfter = (await request(
    base, '/v1/bootstrap/revision', bossA, 200
  )).payload.revision;
  assert.notEqual(bossRevisionAfter, bossRevisionBefore,
    'recipient-visible notification must change bootstrap revision');

  assert.equal((await request(base, '/v1/notifications', employeeA, 200)).payload.unreadCount, 0);
  assert.equal((await request(base, '/v1/notifications', bossB, 200)).payload.unreadCount, 0);
  assert.equal((await request(base, '/v1/notifications', employeeB, 200)).payload.unreadCount, 0);

  const crossWorkspaceRead = await request(
    base,
    '/v1/notifications',
    { ...bossA, workspaceId: workspaceB.workspace },
    403
  );
  assert.equal(crossWorkspaceRead.payload.code, 'WORKSPACE_ACCESS_DENIED');
  const crossRecipientMark = await command(base, employeeA, 'notifications.mark-read', {
    notificationId: bossNotification.id,
    baseRevision: bossNotification.revision
  }, 404);
  assert.equal(crossRecipientMark.payload.code, 'NOTIFICATION_NOT_FOUND');
  const crossWorkspaceMark = await command(base, bossB, 'notifications.mark-read', {
    notificationId: bossNotification.id,
    baseRevision: bossNotification.revision
  }, 404);
  assert.equal(crossWorkspaceMark.payload.code, 'NOTIFICATION_NOT_FOUND');

  const marked = await command(base, bossA, 'notifications.mark-read', {
    notificationId: bossNotification.id,
    baseRevision: bossNotification.revision
  });
  assert.equal(marked.payload.data.revision, 1);
  assert.equal((await request(base, '/v1/notifications', bossA, 200)).payload.unreadCount, 0);

  const privateReason = 'Synthetic reason must never enter a notification';
  const adHoc = (await command(base, employeeA, 'leave-requests.submit', {
    startDate: '2097-09-14',
    endDate: '2097-09-15',
    leaveType: 'personal',
    reason: privateReason
  })).payload;
  const sortedBoss = (await request(base, '/v1/notifications', bossA, 200)).payload;
  assert.equal(sortedBoss.items[0].readAt, null,
    'unread notifications must sort before read notifications');
  assert.notEqual(sortedBoss.items[1].readAt, null);
  assert.equal(JSON.stringify(sortedBoss).includes(privateReason), false);

  const approved = (await command(base, bossA, 'time-off-requests.approve', {
    requestId: submitted.data.id,
    baseRevision: submitted.data.revision
  })).payload;
  assert.equal(approved.data.status, 'approved');
  const employeeNotifications = (await request(base, '/v1/notifications', employeeA, 200)).payload;
  assert.equal(employeeNotifications.unreadCount, 1);
  assert.equal(employeeNotifications.items[0].type, 'time_off_approved');
  assert.equal(employeeNotifications.items[0].resourceId, submitted.data.id);
  const employeeRevisionAfter = (await request(
    base, '/v1/bootstrap/revision', employeeA, 200
  )).payload.revision;
  assert.notEqual(employeeRevisionAfter, employeeRevisionBefore,
    'approval notification must change the employee bootstrap revision');

  const markAllKey = `notification-e2e-mark-all-${randomUUID()}`;
  const markAll = (await command(
    base, employeeA, 'notifications.mark-all-read', {}, 201, markAllKey
  )).payload;
  assert.equal(markAll.data.updatedCount, 1);
  const replayedMarkAll = (await command(
    base, employeeA, 'notifications.mark-all-read', {}, 200, markAllKey
  )).payload;
  assert.equal(replayedMarkAll.replayed, true);
  assert.equal((await request(base, '/v1/notifications', employeeA, 200)).payload.unreadCount, 0);

  const rejected = (await command(base, bossA, 'time-off-requests.reject', {
    requestId: adHoc.data.id,
    baseRevision: adHoc.data.revision
  })).payload;
  assert.equal(rejected.data.status, 'rejected');
  const afterReject = (await request(base, '/v1/notifications', employeeA, 200)).payload;
  assert.equal(afterReject.items[0].type, 'time_off_rejected');
  assert.equal(JSON.stringify(afterReject).includes(privateReason), false);

  const invalidInput = await command(base, bossA, 'notifications.mark-read', {
    notificationId: "' OR 1=1 --",
    baseRevision: 0
  }, 400);
  assert.equal(invalidInput.payload.code, 'COMMAND_INVALID');
  const invalidCommand = await command(
    base, bossA, 'notifications.mark-read.drop-table', {}, 404
  );
  assert.equal(invalidCommand.payload.code, 'COMMAND_NOT_FOUND');

  await assert.rejects(
    () => apiPool.query('SELECT id FROM notifications LIMIT 1'),
    error => error.code === '42501'
  );
  await assert.rejects(
    () => apiPool.query('UPDATE notifications SET read_at = clock_timestamp()'),
    error => error.code === '42501'
  );
  const apiRole = new URL(process.env.DATABASE_API_URL).username;
  const privileges = (await owner.query(
    `SELECT
       has_table_privilege($1, 'public.notifications', 'SELECT') AS table_select,
       has_table_privilege($1, 'public.notifications', 'INSERT') AS table_insert,
       has_table_privilege($1, 'public.notifications', 'UPDATE') AS table_update,
       has_table_privilege($1, 'public.notifications', 'DELETE') AS table_delete,
       has_function_privilege(
         $1, 'app_private.api_list_notifications(text,text,text)', 'EXECUTE'
       ) AS read_execute,
       has_function_privilege(
         $1, 'app_private.api_notification_revision(text,text,text)', 'EXECUTE'
       ) AS revision_execute,
       has_function_privilege(
         $1,
         'app_private.api_execute_notification_command(text,text,text,text,jsonb,text,text,text)',
         'EXECUTE'
       ) AS command_execute,
       has_function_privilege(
         $1, 'app_private.create_notifications_from_outbox()', 'EXECUTE'
       ) AS projection_execute`,
    [apiRole]
  )).rows[0];
  assert.deepEqual(privileges, {
    table_select: false,
    table_insert: false,
    table_update: false,
    table_delete: false,
    read_execute: true,
    revision_execute: true,
    command_execute: true,
    projection_execute: false
  });
  const attributes = (await owner.query(
    `SELECT rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = $1`,
    [apiRole]
  )).rows[0];
  assert.deepEqual(attributes, {
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false
  });
  const executable = (await owner.query(
    `SELECT procedure.oid::regprocedure::text AS signature
       FROM pg_proc procedure
       JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'app_private'
        AND has_function_privilege($1, procedure.oid, 'EXECUTE')
      ORDER BY signature`,
    [apiRole]
  )).rows.map(row => row.signature);
  assert.deepEqual(executable.sort(), [...API_FUNCTIONS].sort(),
    'Staging API Role may execute only the reviewed controlled-function allowlist');

  console.log(JSON.stringify({
    migrationChecksum: 'passed',
    bossSubmissionNotification: 'passed',
    employeeApprovalNotification: 'passed',
    employeeRejectionNotification: 'passed',
    unreadBadgeState: 'passed',
    unreadFirstNewestOrdering: 'passed',
    idempotentEventProjection: 'passed',
    idempotentReadCommands: 'passed',
    bootstrapRevision: 'passed',
    secondClientRefreshContract: 'passed',
    privateReasonExcluded: 'passed',
    workspaceIsolation: 'passed',
    crossRecipientMutation: 'denied',
    sqlInjection: 'denied',
    apiRoleDirectTableAccess: 'denied',
    apiRoleControlledFunctions: 'passed'
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
      "SELECT count(*)::integer AS count FROM organizations WHERE name LIKE 'Synthetic Notification %'"
    )).rows[0].count, 0);
    assert.equal((await owner.query(
      'SELECT count(*)::integer AS count FROM app_private.auth_sessions WHERE issuer = $1',
      [TEST_ISSUER]
    )).rows[0].count, 0);
  } finally {
    await owner.end();
    await apiPool.end();
  }
}
