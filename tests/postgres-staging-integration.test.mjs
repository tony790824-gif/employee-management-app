import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';
import { createOidcVerifier } from '../server/jwt-verifier.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';

if (process.env.BANK_ENV !== 'staging') throw new Error('Live integration tests require BANK_ENV=staging.');

const WORKSPACE_A = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WORKSPACE_B = 'ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TEST_ORIGIN = 'https://staging-integration.invalid';
const TEST_ISSUER = 'https://staging-identity.invalid/';
const SESSION_CLAIM = 'https://banke.tw/session_id';
const KEY_ID = `sprint3-${Date.now()}`;
const TENANT_KEY = randomBytes(32);
const pool = createPool();
const owner = new pg.Client({
  connectionString: process.env.DATABASE_MIGRATOR_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000
});
let originalMembershipAuth = [];
let insertedWorkspaceBMembership = false;
let insertedWorkspaceBUserId = null;

function oidcKey(kid) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...pair, kid, jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } };
}

function accessToken(pair, { subject, sessionId, nowSeconds, overrides = {} }) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: pair.kid });
  const payload = encode({
    iss: TEST_ISSUER, aud: 'banke-staging-api', sub: subject, [SESSION_CLAIM]: sessionId,
    jti: randomUUID(), iat: nowSeconds, nbf: nowSeconds - 1, exp: nowSeconds + 300, ...overrides
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), pair.privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function apiRequest(base, path, token, workspaceId, { method = 'GET', body, idempotencyKey, expected = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: TEST_ORIGIN, Authorization: `Bearer ${token}`, 'X-Workspace-Id': workspaceId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.equal(response.status, expected, `${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function ownerContext(workspaceId, callback) {
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
try {
  const ledger = await owner.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  assert.deepEqual(ledger.rows.map(row => row.version), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
  assert.ok(ledger.rows.every(row => /^[a-f0-9]{64}$/.test(row.checksum)));

  const membersA = await ownerContext(WORKSPACE_A, async () => (await owner.query(
    `SELECT workspace_id, role, user_id, employee_id, auth_status FROM workspace_members
      WHERE workspace_id = $1 AND role IN ('boss', 'employee') ORDER BY role`, [WORKSPACE_A]
  )).rows);
  const membersB = await ownerContext(WORKSPACE_B, async () => (await owner.query(
    `SELECT workspace_id, role, user_id, employee_id, auth_status FROM workspace_members
      WHERE workspace_id = $1 AND role = 'boss'`, [WORKSPACE_B]
  )).rows);
  const bossA = membersA.find(row => row.role === 'boss');
  const employeeA = membersA.find(row => row.role === 'employee');
  const bossB = membersB[0];
  assert.ok(bossA && employeeA && bossB, 'synthetic Sprint 2 identities are required');
  originalMembershipAuth = [bossA, employeeA, bossB].map(row => ({
    workspaceId: row.workspace_id, userId: row.user_id, authStatus: row.auth_status
  }));
  await ownerContext(WORKSPACE_A, () => owner.query(
    "UPDATE workspace_members SET auth_status='active' WHERE workspace_id=$1 AND user_id = ANY($2::uuid[])",
    [WORKSPACE_A, [bossA.user_id, employeeA.user_id]]
  ));
  await ownerContext(WORKSPACE_B, () => owner.query(
    "UPDATE workspace_members SET auth_status='active' WHERE workspace_id=$1 AND user_id=$2",
    [WORKSPACE_B, bossB.user_id]
  ));
  const existingWorkspaceBMembership = await ownerContext(WORKSPACE_B, async () => (await owner.query(
    'SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
    [WORKSPACE_B, employeeA.user_id]
  )).rowCount > 0);
  if (!existingWorkspaceBMembership) {
    await ownerContext(WORKSPACE_B, () => owner.query(
      `INSERT INTO workspace_members(workspace_id, user_id, role, status, auth_status)
       VALUES ($1, $2, 'manager', 'active', 'active')`,
      [WORKSPACE_B, employeeA.user_id]
    ));
    insertedWorkspaceBMembership = true;
    insertedWorkspaceBUserId = employeeA.user_id;
  }

  const principals = [
    { subject: 'auth0|synthetic-boss-a', userId: bossA.user_id, sessionId: `boss-a-${randomUUID()}` },
    { subject: 'auth0|synthetic-employee-a', userId: employeeA.user_id, sessionId: `employee-a-${randomUUID()}` },
    { subject: 'auth0|synthetic-boss-b', userId: bossB.user_id, sessionId: `boss-b-${randomUUID()}` }
  ];
  await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
  await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
  for (const principal of principals) {
    await owner.query(
      `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
       VALUES ($1, $2, $3, 'active')`, [TEST_ISSUER, principal.subject, principal.userId]
    );
  }
  await owner.query(
    `INSERT INTO app_private.tenant_context_keys(key_id, secret, expires_at)
     VALUES ($1, $2, clock_timestamp() + interval '2 hours')`, [KEY_ID, TENANT_KEY]
  );

  const oidc = oidcKey('staging-oidc-key-1');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const verifyAccessToken = createOidcVerifier({
    issuer: TEST_ISSUER, audience: 'banke-staging-api', jwksUri: 'https://staging-identity.invalid/.well-known/jwks.json',
    fetcher: async () => ({ ok: true, headers: { get: () => 'max-age=300' }, json: async () => ({ keys: [oidc.jwk] }) })
  });
  const tenantContextSigner = createTenantContextSigner({ key: TENANT_KEY.toString('base64url'), keyId: KEY_ID });
  const commandService = createCommandService({ pool, tenantContextSigner });
  const api = createApiServer({ commandService, verifyAccessToken, pool, allowedOrigins: [TEST_ORIGIN] });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const base = `http://127.0.0.1:${api.address().port}`;
  const [bossPrincipal, employeePrincipal, bossBPrincipal] = principals;
  const bossToken = accessToken(oidc, { ...bossPrincipal, nowSeconds });
  const employeeToken = accessToken(oidc, { ...employeePrincipal, nowSeconds });
  const bossBToken = accessToken(oidc, { ...bossBPrincipal, nowSeconds });

  try {
    for (const [token, workspace] of [[bossToken, WORKSPACE_A], [employeeToken, WORKSPACE_A], [bossBToken, WORKSPACE_B]]) {
      await apiRequest(base, '/v1/auth/session', token, workspace, { method: 'POST', expected: 201 });
    }
    await apiRequest(base, '/v1/auth/session', employeeToken, WORKSPACE_B, { method: 'POST', expected: 201 });

    const ownEmployees = await apiRequest(base, '/v1/employees', bossToken, WORKSPACE_A);
    assert.ok(ownEmployees.data.some(row => row.id === 'employee-a'));
    const workspaceBEmployees = await apiRequest(base, '/v1/employees', bossBToken, WORKSPACE_B);
    assert.deepEqual(workspaceBEmployees.data.map(row => row.id), ['employee-b']);
    const crossTenant = await apiRequest(base, '/v1/employees', bossToken, WORKSPACE_B, { expected: 403 });
    assert.equal(crossTenant.code, 'WORKSPACE_ACCESS_DENIED');

    const replayedContext = tenantContextSigner.sign({ identity: {
      issuer: TEST_ISSUER, subject: bossPrincipal.subject, sessionId: bossPrincipal.sessionId,
      tokenId: 'replay-probe', issuedAt: nowSeconds, expiresAt: nowSeconds + 300
    }, workspaceId: WORKSPACE_A, purpose: 'read' });
    await pool.query('SELECT app_private.api_list_employees($1, $2, $3) AS result',
      [replayedContext.payload, replayedContext.signature, replayedContext.keyId]);
    await assert.rejects(
      () => pool.query('SELECT app_private.api_list_employees($1, $2, $3) AS result',
        [replayedContext.payload, replayedContext.signature, replayedContext.keyId]),
      error => error.code === 'P0001' && error.message === 'TENANT_CONTEXT_REPLAYED'
    );

    await assert.rejects(() => pool.query('SELECT id FROM employees LIMIT 1'), error => error.code === '42501');
    const apiRole = new URL(process.env.DATABASE_API_URL).username;
    const privilegeAudit = await owner.query(
      `SELECT
        has_table_privilege($1, 'public.employees', 'SELECT') AS can_select_employees,
        has_table_privilege($1, 'public.workspace_members', 'UPDATE') AS can_update_members,
        has_function_privilege($1, 'app_private.api_list_employees(text,text,text)', 'EXECUTE') AS can_list,
        has_function_privilege($1, 'app_private.verify_tenant_context(text,text,text,text,boolean)', 'EXECUTE') AS can_verify_directly`,
      [apiRole]
    );
    assert.deepEqual(privilegeAudit.rows[0], {
      can_select_employees: false,
      can_update_members: false,
      can_list: true,
      can_verify_directly: false
    });
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.current_workspace_id', $1, false)", [WORKSPACE_B]);
      await assert.rejects(() => client.query('SELECT id FROM employees LIMIT 1'), error => error.code === '42501');
      await assert.rejects(() => client.query('SELECT * FROM app_private.verify_tenant_context($1,$2,$3,$4,$5)',
        ['forged', 'forged', KEY_ID, 'read', true]), error => error.code === '42501');
    } finally { client.release(); }

    const suffix = String(Date.now()).slice(-7);
    const created = await apiRequest(base, '/v1/commands/employees.create', bossToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `create-${randomUUID()}`,
      body: { name: 'Synthetic Sprint 3 employee', phone: `7${suffix}`, jobTitle: 'Tester', hourlyRate: 300, leaveQuota: 8 }
    });
    await apiRequest(base, '/v1/commands/shifts.create', bossToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `shift-${randomUUID()}`,
      body: { employeeId: created.data.id, date: '2027-01-20', startTime: '10:00', endTime: '18:00', note: 'Sprint 3' }
    });
    await apiRequest(base, '/v1/commands/leaves.replace-month', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `leave-${randomUUID()}`,
      body: { month: '2027-01', dates: ['2027-01-23', '2027-01-24'] }
    });
    const clockIn = await apiRequest(base, '/v1/commands/attendance.clock-in', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `clock-in-${randomUUID()}`, body: {}
    });
    assert.ok(clockIn.data.id);
    const clockOut = await apiRequest(base, '/v1/commands/attendance.clock-out', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `clock-out-${randomUUID()}`, body: {}
    });
    await apiRequest(base, '/v1/commands/attendance.approve-hours', bossToken, WORKSPACE_A, {
      method: 'POST', expected: 201, idempotencyKey: `approve-${randomUUID()}`,
      body: { attendanceId: clockOut.data.id, hours: 8, baseRevision: clockOut.data.revision }
    });

    await ownerContext(WORKSPACE_A, () => owner.query(
      "UPDATE workspace_members SET status='suspended' WHERE workspace_id=$1 AND user_id=$2", [WORKSPACE_A, employeeA.user_id]
    ));
    const removedMembership = await apiRequest(base, '/v1/commands/attendance.clock-in', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 403, idempotencyKey: `removed-${randomUUID()}`, body: {}
    });
    assert.equal(removedMembership.code, 'WORKSPACE_ACCESS_DENIED');
    const refreshedAfterRemoval = accessToken(oidc, { ...employeePrincipal, nowSeconds });
    const removedMembershipAfterRefresh = await apiRequest(
      base, '/v1/commands/attendance.clock-in', refreshedAfterRemoval, WORKSPACE_A,
      { method: 'POST', expected: 403, idempotencyKey: `removed-refreshed-${randomUUID()}`, body: {} }
    );
    assert.equal(removedMembershipAfterRefresh.code, 'WORKSPACE_ACCESS_DENIED');
    const retainedWorkspaceB = await apiRequest(base, '/v1/employees', refreshedAfterRemoval, WORKSPACE_B);
    assert.deepEqual(retainedWorkspaceB.data.map(row => row.id), ['employee-b']);
    await ownerContext(WORKSPACE_A, () => owner.query(
      "UPDATE workspace_members SET status='active' WHERE workspace_id=$1 AND user_id=$2", [WORKSPACE_A, employeeA.user_id]
    ));

    await owner.query("UPDATE users SET status='suspended' WHERE id=$1", [employeeA.user_id]);
    const suspendedUser = await apiRequest(base, '/v1/commands/attendance.clock-in', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 403, idempotencyKey: `suspended-${randomUUID()}`, body: {}
    });
    assert.equal(suspendedUser.code, 'IDENTITY_ACCESS_DENIED');
    const refreshedWhileSuspended = accessToken(oidc, { ...employeePrincipal, nowSeconds });
    const suspendedUserAfterRefresh = await apiRequest(
      base, '/v1/commands/attendance.clock-in', refreshedWhileSuspended, WORKSPACE_A,
      { method: 'POST', expected: 403, idempotencyKey: `suspended-refreshed-${randomUUID()}`, body: {} }
    );
    assert.equal(suspendedUserAfterRefresh.code, 'IDENTITY_ACCESS_DENIED');
    await owner.query("UPDATE users SET status='active' WHERE id=$1", [employeeA.user_id]);

    await owner.query(
      "UPDATE app_private.auth_sessions SET status='compromised', revoked_at=clock_timestamp(), revoke_reason='refresh_reuse' WHERE issuer=$1 AND provider_session_id=$2",
      [TEST_ISSUER, employeePrincipal.sessionId]
    );
    const refreshReplay = await apiRequest(base, '/v1/commands/attendance.clock-in', employeeToken, WORKSPACE_A, {
      method: 'POST', expected: 401, idempotencyKey: `replay-${randomUUID()}`, body: {}
    });
    assert.equal(refreshReplay.code, 'SESSION_INVALID');

    await apiRequest(base, '/v1/auth/logout', bossToken, WORKSPACE_A, { method: 'POST' });
    const afterLogout = await apiRequest(base, '/v1/employees', bossToken, WORKSPACE_A, { expected: 401 });
    assert.equal(afterLogout.code, 'SESSION_INVALID');
  } finally {
    api.close();
    await once(api, 'close');
  }

  console.log(JSON.stringify({
    migration0004: 'passed', oidcRs256Jwks: 'passed', controlledDatabaseFunctions: 'passed',
    apiRoleDirectTableAccess: 'denied', forgedCustomGuc: 'denied', workspaceAAndBIsolation: 'passed',
    membershipRemoval: 'denied', membershipRemovalAfterRefresh: 'denied', retainedOtherWorkspace: 'passed',
    suspendedUser: 'denied', suspendedUserAfterRefresh: 'denied', refreshReplaySessionRevocation: 'passed',
    logoutRevocation: 'passed', tenantContextReplay: 'denied', apiRoleLeastPrivilege: 'passed', commandApi: 'passed'
  }));
} finally {
  try {
    await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.tenant_context_keys WHERE key_id = $1', [KEY_ID]);
    for (const state of originalMembershipAuth) {
      await ownerContext(state.workspaceId, () => owner.query(
        'UPDATE workspace_members SET auth_status=$3 WHERE workspace_id=$1 AND user_id=$2',
        [state.workspaceId, state.userId, state.authStatus]
      ));
    }
    if (insertedWorkspaceBMembership) {
      await ownerContext(WORKSPACE_B, () => owner.query(
        'DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [WORKSPACE_B, insertedWorkspaceBUserId]
      ));
    }
  } catch { /* preserve the primary test failure */ }
  await owner.end();
  await pool.end();
}
