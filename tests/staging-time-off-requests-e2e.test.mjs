import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { STAGING_TENANT_CONTEXT_KEY_ID } from '../database/staging-ui-bootstrap.mjs';

if (process.env.BANK_ENV !== 'staging') {
  throw new Error('Live time-off E2E requires BANK_ENV=staging.');
}

const TEST_ORIGIN = 'https://time-off-e2e.staging.invalid';
const TEST_ISSUER = 'https://time-off-e2e.staging.invalid/';
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

async function request(base, path, token, workspaceId, expected, {
  method = path === '/v1/auth/session' ? 'POST' : 'GET',
  body,
  idempotencyKey
} = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: TEST_ORIGIN,
      'X-Workspace-Id': workspaceId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.equal(response.status, expected,
    `${path} returned ${response.status} (${payload.code || 'no-code'})`);
  return payload;
}

async function command(base, principal, name, body, expected = 201,
  key = `time-off-e2e-${name}-${randomUUID()}`) {
  return request(base, `/v1/commands/${name}`, principal.token, principal.workspaceId, expected, {
    method: 'POST',
    body,
    idempotencyKey: key
  });
}

async function inWorkspace(workspaceId, callback) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const result = await callback();
    await owner.query('COMMIT');
    return result;
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

await owner.connect();
let api;
const created = {
  workspaceId: '',
  employeeId: `e_timeoff_${randomUUID().replaceAll('-', '')}`,
  userId: '',
  phone: `7${String(Date.now()).slice(-9)}`,
  principals: [],
  requestIds: []
};
try {
  const migration = (await owner.query(
    `SELECT checksum FROM schema_migrations
      WHERE version = '0013' AND name = 'time_off_requests'`
  )).rows[0];
  assert.match(migration?.checksum || '', /^[a-f0-9]{64}$/);

  const memberships = (await owner.query(
    `SELECT member.workspace_id, member.user_id, member.role, member.employee_id
       FROM workspace_members member
       JOIN users app_user ON app_user.id = member.user_id
       JOIN workspaces workspace ON workspace.id = member.workspace_id
      WHERE member.status = 'active'
        AND member.auth_status = 'active'
        AND app_user.status = 'active'
        AND workspace.status = 'active'
      ORDER BY member.workspace_id, member.role`
  )).rows;
  const bossA = memberships.find(row => ['boss', 'manager'].includes(row.role));
  const employeeA = memberships.find(row => row.workspace_id === bossA?.workspace_id
    && row.role === 'employee' && row.employee_id);
  const bossB = memberships.find(row => row.workspace_id !== bossA?.workspace_id
    && ['boss', 'manager'].includes(row.role));
  assert.ok(bossA && employeeA && bossB, 'two isolated workspace fixtures are required');
  created.workspaceId = bossA.workspace_id;

  created.userId = (await owner.query(
    `INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id`,
    [created.phone]
  )).rows[0].id;
  await inWorkspace(created.workspaceId, async () => {
    await owner.query(
      `INSERT INTO employees(workspace_id, id, name, phone, hourly_rate, leave_quota)
       VALUES ($1, $2, 'Synthetic coworker', $3, 0, 8)`,
      [created.workspaceId, created.employeeId, created.phone]
    );
    await owner.query(
      `INSERT INTO workspace_members(
         workspace_id, user_id, role, status, employee_id, auth_status
       ) VALUES ($1, $2, 'employee', 'active', $3, 'active')`,
      [created.workspaceId, created.userId, created.employeeId]
    );
  });

  const definitions = [
    { token: 'timeoff-boss-a', member: bossA, identity: syntheticIdentity('boss-a') },
    { token: 'timeoff-employee-a', member: employeeA, identity: syntheticIdentity('employee-a') },
    {
      token: 'timeoff-coworker-a',
      member: { workspace_id: created.workspaceId, user_id: created.userId, employee_id: created.employeeId },
      identity: syntheticIdentity('coworker-a')
    },
    { token: 'timeoff-boss-b', member: bossB, identity: syntheticIdentity('boss-b') }
  ];
  created.principals = definitions;
  for (const principal of definitions) {
    await owner.query(
      `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [TEST_ISSUER, principal.identity.subject, principal.member.user_id]
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
  const principals = definitions.map(item => ({
    ...item,
    workspaceId: item.member.workspace_id
  }));
  const [boss, employee, coworker, otherBoss] = principals;
  for (const principal of principals) {
    assert.equal((await request(
      base, '/v1/auth/session', principal.token, principal.workspaceId, 201
    )).ok, true);
  }

  const month = '2097-07';
  const scheduleKey = `time-off-e2e-schedule-submit-${randomUUID()}`;
  const submittedSchedule = await command(
    base, coworker, 'schedule-leave-requests.submit',
    { month, dates: [`${month}-03`, `${month}-10`] }, 201, scheduleKey
  );
  created.requestIds.push(submittedSchedule.data.id);
  assert.equal(submittedSchedule.data.status, 'pending');
  const replayedSchedule = await command(
    base, coworker, 'schedule-leave-requests.submit',
    { month, dates: [`${month}-03`, `${month}-10`] }, 200, scheduleKey
  );
  assert.equal(replayedSchedule.replayed, true);

  const employeeView = await request(
    base, '/v1/time-off-requests', coworker.token, coworker.workspaceId, 200
  );
  assert.equal(employeeView.ownRequests[0].status, 'pending');
  const coworkerBefore = await request(
    base, '/v1/time-off-requests', employee.token, employee.workspaceId, 200
  );
  assert.equal(coworkerBefore.approvedSchedule.some(
    row => row.employeeId === coworker.member.employee_id
  ), false, 'pending schedule leave must not be visible to coworkers');

  const adHoc = await command(base, coworker, 'leave-requests.submit', {
    startDate: `${month}-14`,
    endDate: `${month}-15`,
    leaveType: 'personal',
    reason: 'Synthetic private reason'
  });
  created.requestIds.push(adHoc.data.id);
  const employeeBeforeApproval = await request(
    base, '/v1/time-off-requests', employee.token, employee.workspaceId, 200
  );
  assert.equal(JSON.stringify(employeeBeforeApproval).includes('Synthetic private reason'), false);
  const bossPending = await request(
    base, '/v1/time-off-requests', boss.token, boss.workspaceId, 200
  );
  assert.ok(bossPending.pendingReview.some(
    row => row.id === adHoc.data.id && row.reason === 'Synthetic private reason'
  ));

  const employeeReviewDenied = await command(
    base, employee, 'time-off-requests.approve',
    { requestId: submittedSchedule.data.id, baseRevision: submittedSchedule.data.revision },
    403
  );
  assert.equal(employeeReviewDenied.code, 'COMMAND_FORBIDDEN');

  const approvedSchedule = await command(base, boss, 'time-off-requests.approve', {
    requestId: submittedSchedule.data.id,
    baseRevision: submittedSchedule.data.revision,
    reviewNote: 'Synthetic approval'
  });
  assert.equal(approvedSchedule.data.status, 'approved');
  const coworkerAfter = await request(
    base, '/v1/time-off-requests', coworker.token, coworker.workspaceId, 200
  );
  assert.ok(coworkerAfter.approvedSchedule.some(
    row => row.employeeId === coworker.member.employee_id && row.date === `${month}-03`
  ));
  const employeeAfterScheduleApproval = await request(
    base, '/v1/time-off-requests', employee.token, employee.workspaceId, 200
  );
  assert.equal(
    JSON.stringify(employeeAfterScheduleApproval).includes('Synthetic private reason'),
    false
  );

  const approvedAdHoc = await command(base, boss, 'time-off-requests.approve', {
    requestId: adHoc.data.id,
    baseRevision: adHoc.data.revision
  });
  assert.equal(approvedAdHoc.data.status, 'approved');
  const employeeCoverage = await request(
    base, '/v1/time-off-requests', employee.token, employee.workspaceId, 200
  );
  assert.ok(employeeCoverage.approvedLeaveCoverage.some(
    row => row.date === `${month}-14` && Number(row.approvedCount) === 1
  ));
  assert.equal(JSON.stringify(employeeCoverage).includes('Synthetic private reason'), false);

  const duplicateReview = await command(base, boss, 'time-off-requests.reject', {
    requestId: adHoc.data.id,
    baseRevision: approvedAdHoc.data.revision
  }, 409);
  assert.equal(duplicateReview.code, 'TIME_OFF_REQUEST_ALREADY_PROCESSED');

  const crossWorkspace = await request(
    base, '/v1/time-off-requests', boss.token, otherBoss.workspaceId, 403
  );
  assert.equal(crossWorkspace.code, 'WORKSPACE_ACCESS_DENIED');
  const isolatedView = await request(
    base, '/v1/time-off-requests', otherBoss.token, otherBoss.workspaceId, 200
  );
  assert.equal(JSON.stringify(isolatedView).includes('Synthetic coworker'), false);
  assert.equal(JSON.stringify(isolatedView).includes('Synthetic private reason'), false);

  await assert.rejects(
    () => apiPool.query('SELECT id FROM time_off_requests LIMIT 1'),
    error => error.code === '42501'
  );
  const apiRole = new URL(process.env.DATABASE_API_URL).username;
  const privileges = (await owner.query(
    `SELECT
       has_table_privilege($1, 'public.time_off_requests', 'SELECT') AS request_select,
       has_table_privilege($1, 'public.time_off_request_dates', 'SELECT') AS dates_select,
       has_function_privilege(
         $1,
         'app_private.api_list_time_off_requests(text,text,text)',
         'EXECUTE'
       ) AS read_execute,
       has_function_privilege(
         $1,
         'app_private.api_execute_time_off_command(text,text,text,text,jsonb,text,text,text)',
         'EXECUTE'
       ) AS command_execute`,
    [apiRole]
  )).rows[0];
  assert.deepEqual(privileges, {
    request_select: false,
    dates_select: false,
    read_execute: true,
    command_execute: true
  });

  console.log(JSON.stringify({
    employeeOwnRequests: 'passed',
    bossReview: 'passed',
    employeeReview: 'denied',
    approvedScheduleCoworkerVisibility: 'passed',
    pendingScheduleCoworkerVisibility: 'hidden',
    privateReasonCoworkerVisibility: 'hidden',
    approvedLeaveCoverage: 'minimal-only',
    idempotentSubmitReplay: 'passed',
    duplicateReview: 'denied',
    workspaceIsolation: 'passed',
    apiRoleDirectTables: 'denied'
  }));
} finally {
  if (api) {
    api.close();
    await once(api, 'close');
  }
  try {
    await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    if (created.workspaceId && created.userId) {
      await inWorkspace(created.workspaceId, async () => {
        if (created.requestIds.length) {
          await owner.query(
            `DELETE FROM outbox_events
              WHERE workspace_id = $1
                AND aggregate_type = 'time_off_request'
                AND aggregate_id = ANY($2::text[])`,
            [created.workspaceId, created.requestIds]
          );
          await owner.query(
            `DELETE FROM audit_logs
              WHERE workspace_id = $1
                AND resource_type = 'time_off_request'
                AND resource_id = ANY($2::text[])`,
            [created.workspaceId, created.requestIds]
          );
          await owner.query(
            `DELETE FROM time_off_requests
              WHERE workspace_id = $1
                AND id = ANY($2::uuid[])`,
            [created.workspaceId, created.requestIds]
          );
        }
        await owner.query('DELETE FROM audit_logs WHERE actor_user_id = $1', [created.userId]);
        await owner.query(
          `DELETE FROM command_receipts
            WHERE workspace_id = $1
              AND (
                idempotency_key LIKE 'time-off-e2e-%'
                OR actor_user_id = $2
              )`,
          [created.workspaceId, created.userId]
        );
        await owner.query(
          `DELETE FROM leave_selections
            WHERE workspace_id = $1
              AND employee_id = $2
              AND leave_date >= DATE '2097-07-01'
              AND leave_date < DATE '2097-08-01'`,
          [created.workspaceId, created.principals[2]?.member.employee_id]
        );
        await owner.query(
          'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
          [created.workspaceId, created.userId]
        );
        await owner.query(
          'DELETE FROM employees WHERE workspace_id = $1 AND id = $2',
          [created.workspaceId, created.employeeId]
        );
      });
      await owner.query('DELETE FROM users WHERE id = $1', [created.userId]);
    }
  } finally {
    await owner.end();
    await apiPool.end();
  }
}
