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
  throw new Error('Live ui_bootstrap E2E requires BANK_ENV=staging.');
}

const TEST_ORIGIN = 'https://ui-bootstrap-e2e.staging.invalid';
const TEST_ISSUER = 'https://ui-bootstrap-e2e.staging.invalid/';
const TOKEN_TTL_SECONDS = 300;
const { Client } = pg;
const apiPool = createPool();
const migrator = new Client({
  connectionString: process.env.DATABASE_MIGRATOR_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000
});

function identity(subject) {
  const now = Math.floor(Date.now() / 1000);
  return Object.freeze({
    issuer: TEST_ISSUER,
    subject,
    sessionId: `sid-${randomUUID()}`,
    tokenId: `jti-${randomUUID()}`,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_SECONDS
  });
}

async function apiRequest(baseUrl, path, token, workspaceId, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: TEST_ORIGIN,
      'X-Workspace-Id': workspaceId
    },
    method: path === '/v1/auth/session' ? 'POST' : 'GET'
  });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status} (${body.code || 'no-code'})`);
  return body;
}

function assertEmployeeScope(data, employeeId) {
  assert.ok(data.employees.length > 0, 'employee bootstrap must contain the signed-in employee');
  assert.ok(data.employees.every(row => row.id === employeeId));
  assert.ok(data.shifts.every(row => row.employeeId === employeeId));
  assert.ok(data.attendance.every(row => row.employeeId === employeeId));
  assert.ok(Object.keys(data.leaves).every(key => key.startsWith(`${employeeId}-`)));
  assert.ok(Object.keys(data.payrollAdjustments).every(key => key.startsWith(`${employeeId}-`)));
}

await migrator.connect();
let api;
let originalMembershipAuth = [];
try {
  const databaseState = await migrator.query(
    `SELECT current_database() AS database,
            current_user AS role,
            to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL AS bootstrap_exists`
  );
  assert.equal(databaseState.rows[0].database, new URL(process.env.DATABASE_MIGRATOR_URL).pathname.slice(1));
  assert.equal(databaseState.rows[0].bootstrap_exists, true, '0011 must be applied before the E2E test');

  const keyResult = await migrator.query(
    `SELECT secret, status, not_before, expires_at
       FROM app_private.tenant_context_keys
      WHERE key_id = $1
        AND status = 'active'
        AND not_before <= clock_timestamp()
        AND expires_at > clock_timestamp()`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  );
  assert.equal(keyResult.rowCount, 1, 'the approved synchronized Staging key must be active');
  assert.ok(keyResult.rows[0].secret.length >= 32);
  const originalKeyState = {
    status: keyResult.rows[0].status,
    notBefore: keyResult.rows[0].not_before.toISOString(),
    expiresAt: keyResult.rows[0].expires_at.toISOString(),
    bytes: keyResult.rows[0].secret.length
  };

  const memberships = await migrator.query(
    `SELECT member.workspace_id, member.user_id, member.role, member.employee_id, member.auth_status
       FROM workspace_members member
       JOIN workspaces workspace ON workspace.id = member.workspace_id
       JOIN users app_user ON app_user.id = member.user_id
      WHERE member.status = 'active'
        AND workspace.status = 'active'
        AND app_user.status = 'active'
      ORDER BY member.workspace_id, member.role`
  );
  const bossA = memberships.rows.find(row => ['boss', 'manager'].includes(row.role));
  const employeeA = memberships.rows.find(row => row.workspace_id === bossA?.workspace_id
    && row.role === 'employee' && row.employee_id);
  const bossB = memberships.rows.find(row => row.workspace_id !== bossA?.workspace_id
    && ['boss', 'manager'].includes(row.role));
  assert.ok(bossA && employeeA && bossB, 'two isolated workspaces with boss/employee fixtures are required');
  originalMembershipAuth = [bossA, employeeA, bossB].map(member => ({
    workspaceId: member.workspace_id,
    userId: member.user_id,
    authStatus: member.auth_status
  }));
  for (const member of originalMembershipAuth) {
    await migrator.query(
      'UPDATE workspace_members SET auth_status = $3 WHERE workspace_id = $1 AND user_id = $2',
      [member.workspaceId, member.userId, 'active']
    );
  }

  const principals = [
    { token: 'synthetic-boss-a', member: bossA, identity: identity(`auth0|bootstrap-boss-a-${randomUUID()}`) },
    { token: 'synthetic-employee-a', member: employeeA, identity: identity(`auth0|bootstrap-employee-a-${randomUUID()}`) },
    { token: 'synthetic-boss-b', member: bossB, identity: identity(`auth0|bootstrap-boss-b-${randomUUID()}`) }
  ];
  for (const principal of principals) {
    await migrator.query(
      `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [TEST_ISSUER, principal.identity.subject, principal.member.user_id]
    );
  }

  const identities = new Map(principals.map(principal => [principal.token, principal.identity]));
  const verifyAccessToken = async token => {
    const verified = identities.get(token);
    if (!verified) throw new Error('Synthetic E2E bearer was not recognized.');
    return verified;
  };
  const tenantContextSigner = createTenantContextSigner({
    key: keyResult.rows[0].secret.toString('base64url'),
    keyId: STAGING_TENANT_CONTEXT_KEY_ID
  });
  const commandService = createCommandService({ pool: apiPool, tenantContextSigner });
  api = createApiServer({ commandService, verifyAccessToken, pool: apiPool, allowedOrigins: [TEST_ORIGIN] });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const baseUrl = `http://127.0.0.1:${api.address().port}`;

  for (const principal of principals) {
    const session = await apiRequest(baseUrl, '/v1/auth/session', principal.token,
      principal.member.workspace_id, 201);
    assert.equal(session.ok, true);
  }

  const bossBootstrap = await apiRequest(baseUrl, '/v1/bootstrap', principals[0].token,
    bossA.workspace_id, 200);
  assert.equal(bossBootstrap.ok, true);
  assert.equal(bossBootstrap.workspaceId, bossA.workspace_id);
  assert.equal(bossBootstrap.role, 'boss');
  assert.equal(bossBootstrap.employeeId, null);
  assert.ok(bossBootstrap.data.employees.some(row => row.id === employeeA.employee_id));

  const employeeBootstrap = await apiRequest(baseUrl, '/v1/bootstrap', principals[1].token,
    employeeA.workspace_id, 200);
  assert.equal(employeeBootstrap.ok, true);
  assert.equal(employeeBootstrap.role, 'employee');
  assert.equal(employeeBootstrap.employeeId, employeeA.employee_id);
  assertEmployeeScope(employeeBootstrap.data, employeeA.employee_id);

  const bossBBootstrap = await apiRequest(baseUrl, '/v1/bootstrap', principals[2].token,
    bossB.workspace_id, 200);
  assert.equal(bossBBootstrap.workspaceId, bossB.workspace_id);
  assert.equal(JSON.stringify(bossBootstrap).includes(bossB.workspace_id), false);
  assert.equal(JSON.stringify(bossBBootstrap).includes(bossA.workspace_id), false);

  const crossBoss = await apiRequest(baseUrl, '/v1/bootstrap', principals[0].token, bossB.workspace_id, 403);
  assert.equal(crossBoss.code, 'WORKSPACE_ACCESS_DENIED');
  const crossEmployee = await apiRequest(baseUrl, '/v1/bootstrap', principals[1].token, bossB.workspace_id, 403);
  assert.equal(crossEmployee.code, 'WORKSPACE_ACCESS_DENIED');

  await assert.rejects(() => apiPool.query('SELECT id FROM employees LIMIT 1'), error => error.code === '42501');
  const apiRole = new URL(process.env.DATABASE_API_URL).username;
  const grants = (await migrator.query(
    `SELECT has_table_privilege($1, 'public.employees', 'SELECT') AS table_select,
            has_table_privilege($1, 'app_private.auth_sessions', 'SELECT') AS session_select,
            has_function_privilege($1, 'app_private.api_bootstrap(text,text,text)', 'EXECUTE') AS bootstrap_execute,
            has_function_privilege($1, 'app_private.verify_tenant_context(text,text,text,text,boolean)', 'EXECUTE') AS verifier_execute`,
    [apiRole]
  )).rows[0];
  assert.deepEqual(grants, {
    table_select: false,
    session_select: false,
    bootstrap_execute: true,
    verifier_execute: false
  });

  const keyAfter = (await migrator.query(
    `SELECT status, not_before, expires_at, octet_length(secret) AS bytes
       FROM app_private.tenant_context_keys WHERE key_id = $1`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  )).rows[0];
  assert.deepEqual({
    status: keyAfter.status,
    notBefore: keyAfter.not_before.toISOString(),
    expiresAt: keyAfter.expires_at.toISOString(),
    bytes: keyAfter.bytes
  }, originalKeyState, 'the synchronized key must remain unchanged');

  console.log(JSON.stringify({
    bossBootstrap: 'passed',
    employeeBootstrap: 'passed',
    sessionMembershipRoleIsolation: 'passed',
    crossWorkspaceBoss: 'denied',
    crossWorkspaceEmployee: 'denied',
    apiRoleDirectTables: 'denied',
    approvedKeyId: STAGING_TENANT_CONTEXT_KEY_ID,
    approvedKeyUnchanged: true
  }));
} finally {
  if (api) {
    api.close();
    await once(api, 'close');
  }
  try {
    await migrator.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    for (const member of originalMembershipAuth) {
      await migrator.query(
        'UPDATE workspace_members SET auth_status = $3 WHERE workspace_id = $1 AND user_id = $2',
        [member.workspaceId, member.userId, member.authStatus]
      );
    }
  } catch {
    // Preserve the primary test result while keeping cleanup best-effort.
  }
  await migrator.end();
  await apiPool.end();
}
