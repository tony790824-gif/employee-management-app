import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool, withTenantTransaction } from '../server/db.mjs';
import { createJwtVerifier } from '../server/jwt-verifier.mjs';

if (process.env.BANK_ENV !== 'staging') throw new Error('Live integration test 只允許 BANK_ENV=staging。');

const WORKSPACE_A = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WORKSPACE_B = 'ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TEST_ORIGIN = 'https://staging-integration.invalid';
const pool = createPool();
const owner = new pg.Client({
  connectionString: process.env.DATABASE_MIGRATOR_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000
});

async function contextFor(workspaceId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const result = await callback(client);
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function expectedFailure(callback, code) {
  await assert.rejects(callback, error => error.code === code);
}

function tokenFor(privateKey, principal, nowSeconds) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({
    iss: 'https://staging-identity.invalid',
    aud: 'banke-staging-api',
    sub: principal.userId,
    workspace_id: principal.workspaceId,
    exp: nowSeconds + 600
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function request(base, path, token, { method = 'GET', body, idempotencyKey } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: TEST_ORIGIN,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.ok(response.ok, `${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

await owner.connect();
try {
  const ledger = await owner.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  assert.deepEqual(ledger.rows.map(row => row.version), ['0001', '0002', '0003']);
  assert.ok(ledger.rows.every(row => /^[a-f0-9]{64}$/.test(row.checksum)));

  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE_A]);
  const reconciliation = await owner.query(`
    SELECT
      (SELECT count(*)::int FROM employees WHERE workspace_id = $1 AND id = 'employee-a') AS employees,
      (SELECT count(*)::int FROM shifts WHERE workspace_id = $1 AND id = 'shift-a') AS shifts,
      (SELECT count(*)::int FROM attendance_records WHERE workspace_id = $1 AND id = 'attendance-a') AS attendance,
      (SELECT count(*)::int FROM leave_selections WHERE workspace_id = $1 AND employee_id = 'employee-a' AND leave_date BETWEEN '2026-07-01' AND '2026-07-31') AS leaves,
      (SELECT count(*)::int FROM payroll_adjustments WHERE workspace_id = $1 AND employee_id = 'employee-a' AND amount = 500) AS payroll,
      (SELECT count(*)::int FROM snapshot_imports WHERE workspace_id = $1 AND source_revision = 7) AS imports
  `, [WORKSPACE_A]);
  const { leaves, ...stableReconciliation } = reconciliation.rows[0];
  assert.deepEqual(stableReconciliation, { employees: 1, shifts: 1, attendance: 1, payroll: 1, imports: 1 });
  assert.ok([1, 2].includes(leaves), 'staging leave state must be either the imported snapshot or the idempotent API result');
  const initialLeaveDates = await owner.query(`
    SELECT to_char(leave_date, 'YYYY-MM-DD') AS date
      FROM leave_selections
     WHERE workspace_id = $1 AND employee_id = 'employee-a'
       AND leave_date BETWEEN '2026-07-01' AND '2026-07-31'
     ORDER BY leave_date
  `, [WORKSPACE_A]);
  assert.ok(
    JSON.stringify(initialLeaveDates.rows.map(row => row.date)) === JSON.stringify(['2026-07-22'])
      || JSON.stringify(initialLeaveDates.rows.map(row => row.date)) === JSON.stringify(['2026-07-23', '2026-07-24']),
    'staging leave dates must match the imported snapshot or the prior idempotent API result'
  );
  const identities = await owner.query(`
    SELECT wm.role, wm.user_id, wm.employee_id
      FROM workspace_members wm
     WHERE wm.workspace_id = $1
     ORDER BY wm.role
  `, [WORKSPACE_A]);
  await owner.query('ROLLBACK');
  const bossA = identities.rows.find(row => row.role === 'boss');
  const employeeA = identities.rows.find(row => row.role === 'employee');
  assert.ok(bossA && employeeA);

  const principalBossA = { workspaceId: WORKSPACE_A, userId: bossA.user_id };
  const principalEmployeeA = { workspaceId: WORKSPACE_A, userId: employeeA.user_id };
  const principalBossB = { workspaceId: WORKSPACE_B, userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001' };

  const visibleA = await withTenantTransaction(pool, principalBossA, ({ client }) => client.query('SELECT workspace_id, id FROM employees ORDER BY id'));
  assert.ok(visibleA.rows.length >= 1 && visibleA.rows.every(row => row.workspace_id === WORKSPACE_A));
  assert.ok(!visibleA.rows.some(row => row.id === 'employee-b'));
  const visibleB = await withTenantTransaction(pool, principalBossB, ({ client }) => client.query('SELECT workspace_id, id FROM employees ORDER BY id'));
  assert.deepEqual(visibleB.rows, [{ workspace_id: WORKSPACE_B, id: 'employee-b' }]);

  const noContext = await pool.query('SELECT count(*)::int AS count FROM employees');
  assert.equal(noContext.rows[0].count, 0, 'direct SQL without tenant context must see no tenant rows');
  await expectedFailure(() => pool.query("INSERT INTO employees (workspace_id,id,name,phone) VALUES ($1,'forbidden-no-context','Forbidden','00000999')", [WORKSPACE_A]), '42501');
  const crossRead = await withTenantTransaction(pool, principalBossA, ({ client }) => client.query('SELECT id FROM employees WHERE workspace_id = $1', [WORKSPACE_B]));
  assert.equal(crossRead.rowCount, 0);
  await expectedFailure(() => withTenantTransaction(pool, principalBossA, ({ client }) => client.query(
    "INSERT INTO employees (workspace_id,id,name,phone) VALUES ($1,'forbidden-cross-tenant','Forbidden','00000998')",
    [WORKSPACE_B]
  )), '42501');
  const crossMutation = await withTenantTransaction(pool, principalBossA, async ({ client }) => {
    const updated = await client.query("UPDATE employees SET name='Forbidden' WHERE workspace_id=$1 AND id='employee-b'", [WORKSPACE_B]);
    const deleted = await client.query("DELETE FROM employees WHERE workspace_id=$1 AND id='employee-b'", [WORKSPACE_B]);
    return { updated: updated.rowCount, deleted: deleted.rowCount };
  });
  assert.deepEqual(crossMutation, { updated: 0, deleted: 0 });
  await expectedFailure(() => withTenantTransaction(pool, principalBossA, ({ client }) => client.query(
    "INSERT INTO shifts (workspace_id,id,employee_id,work_date,start_time,end_time) VALUES ($1,'invalid-composite-fk','employee-b','2026-07-25','09:00','18:00')",
    [WORKSPACE_A]
  )), '23503');

  const ids = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103'
  ];
  const times = [new Date('2026-07-26T01:00:00.000Z'), new Date('2026-07-26T09:00:00.000Z')];
  const commandService = createCommandService({ pool, idFactory: () => ids.shift(), clock: () => times.shift() });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const verifyAccessToken = createJwtVerifier({
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    issuer: 'https://staging-identity.invalid',
    audience: 'banke-staging-api'
  });
  const api = createApiServer({ commandService, verifyAccessToken, pool, allowedOrigins: [TEST_ORIGIN] });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const base = `http://127.0.0.1:${api.address().port}`;
  try {
    const bossToken = tokenFor(privateKey, principalBossA, nowSeconds);
    const employeeToken = tokenFor(privateKey, principalEmployeeA, nowSeconds);
    const created = await request(base, '/v1/commands/employees.create', bossToken, {
      method: 'POST', idempotencyKey: 'staging-employee-create-v1',
      body: { name: 'API Staging Employee', phone: '00000004', jobTitle: 'Tester', hourlyRate: 300, leaveQuota: 8 }
    });
    await request(base, '/v1/commands/shifts.create', bossToken, {
      method: 'POST', idempotencyKey: 'staging-shift-create-v1',
      body: { employeeId: created.data.id, date: '2026-07-21', startTime: '10:00', endTime: '18:00', note: 'API staging shift' }
    });
    await request(base, '/v1/commands/leaves.replace-month', employeeToken, {
      method: 'POST', idempotencyKey: 'staging-leave-replace-v1',
      body: { month: '2026-07', dates: ['2026-07-23', '2026-07-24'] }
    });
    const savedLeaveDates = await withTenantTransaction(pool, principalEmployeeA, ({ client }) => client.query(`
      SELECT to_char(leave_date, 'YYYY-MM-DD') AS date
        FROM leave_selections
       WHERE workspace_id = $1 AND employee_id = $2
         AND leave_date BETWEEN '2026-07-01' AND '2026-07-31'
       ORDER BY leave_date
    `, [WORKSPACE_A, employeeA.employee_id]));
    assert.deepEqual(savedLeaveDates.rows.map(row => row.date), ['2026-07-23', '2026-07-24']);
    await request(base, '/v1/commands/attendance.clock-in', employeeToken, {
      method: 'POST', idempotencyKey: 'staging-clock-in-v1', body: {}
    });
    const clockedOut = await request(base, '/v1/commands/attendance.clock-out', employeeToken, {
      method: 'POST', idempotencyKey: 'staging-clock-out-v1', body: {}
    });
    await request(base, '/v1/commands/attendance.approve-hours', bossToken, {
      method: 'POST', idempotencyKey: 'staging-hours-approve-v1',
      body: { attendanceId: clockedOut.data.id, hours: 8, baseRevision: clockedOut.data.revision }
    });
    const employees = await request(base, '/v1/employees', bossToken);
    assert.ok(employees.data.some(row => row.id === 'employee-a'));
    assert.ok(employees.data.some(row => row.id === created.data.id));
  } finally {
    api.close();
    await once(api, 'close');
  }

  const plans = await contextFor(WORKSPACE_A, async client => {
    await client.query('SET LOCAL enable_seqscan = off');
    const employees = await client.query("EXPLAIN (FORMAT JSON) SELECT id,name FROM employees WHERE workspace_id=$1 AND status='active' ORDER BY created_at,id", [WORKSPACE_A]);
    const shifts = await client.query("EXPLAIN (FORMAT JSON) SELECT id FROM shifts WHERE workspace_id=$1 AND work_date BETWEEN '2026-07-01' AND '2026-07-31' ORDER BY work_date,employee_id", [WORKSPACE_A]);
    return { employees: employees.rows[0]['QUERY PLAN'][0].Plan, shifts: shifts.rows[0]['QUERY PLAN'][0].Plan };
  });
  assert.match(JSON.stringify(plans.employees), /Index|Bitmap/);
  assert.match(JSON.stringify(plans.shifts), /Index|Bitmap/);

  console.log(JSON.stringify({
    migrationLedger: 'passed',
    snapshotReconciliation: 'passed',
    workspaceAVisibleRows: visibleA.rowCount,
    workspaceBVisibleRows: visibleB.rowCount,
    rlsPositiveAndNegative: 'passed',
    compositeForeignKey: 'passed',
    commandApi: 'passed',
    queryPlanIndexEligibility: 'passed'
  }));
} finally {
  await owner.end();
  await pool.end();
}
