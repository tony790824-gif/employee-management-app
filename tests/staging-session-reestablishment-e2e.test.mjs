import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { STAGING_TENANT_CONTEXT_KEY_ID } from '../database/staging-ui-bootstrap.mjs';
import { apiRoleTargetConfig } from '../database/apply-role-grants.mjs';

const target = apiRoleTargetConfig(process.env);
if (target.environment !== 'staging') {
  throw new Error('Live Session re-establishment E2E requires BANK_ENV=staging.');
}

const TEST_ORIGIN = 'https://session-reestablishment-e2e.staging.invalid';
const TEST_ISSUER = 'https://session-reestablishment-e2e.staging.invalid/';
const { Client } = pg;
const apiPool = createPool();
const owner = new Client({
  connectionString: target.connectionString,
  ssl: target.ssl,
  connectionTimeoutMillis: 10_000
});

function workspaceId() {
  return `ws_${randomUUID().replaceAll('-', '')}`;
}

function identity(subject, sessionId, issuedAt = Math.floor(Date.now() / 1000)) {
  return Object.freeze({
    issuer: TEST_ISSUER,
    subject,
    sessionId,
    tokenId: `jti-${randomUUID()}`,
    issuedAt,
    expiresAt: issuedAt + 300
  });
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

async function createFixture(fixture) {
  fixture.organization = (await owner.query(
    'INSERT INTO organizations(name) VALUES ($1) RETURNING id',
    ['Synthetic Session Re-establishment']
  )).rows[0].id;
  fixture.user = (await owner.query(
    "INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id",
    [`6${String(Date.now()).slice(-10)}`]
  )).rows[0].id;
  await inWorkspace(fixture.workspace, async () => {
    await owner.query(
      `INSERT INTO workspaces(id, organization_id, name, status)
       VALUES ($1, $2, $3, 'active')`,
      [fixture.workspace, fixture.organization, 'Synthetic Session Workspace']
    );
    fixture.workspaceCreated = true;
    await owner.query(
      `INSERT INTO workspace_members(
         workspace_id, user_id, role, status, auth_status, display_name
       ) VALUES ($1, $2, 'boss', 'active', 'active', $3)`,
      [fixture.workspace, fixture.user, 'Synthetic Session Boss']
    );
  });
  return fixture;
}

async function destroyFixture(fixture) {
  if (fixture.workspaceCreated) {
    await inWorkspace(fixture.workspace, async () => {
      await owner.query('DELETE FROM workspaces WHERE id = $1', [fixture.workspace]);
    });
  }
  if (fixture.user) await owner.query('DELETE FROM users WHERE id = $1', [fixture.user]);
  if (fixture.organization) {
    await owner.query('DELETE FROM organizations WHERE id = $1', [fixture.organization]);
  }
}

async function request(base, path, token, workspace, expected, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: TEST_ORIGIN,
      'X-Workspace-Id': workspace,
      ...(body === undefined ? {} : {
        'Content-Type': 'application/json',
        'Idempotency-Key': `session-e2e-${randomUUID()}`
      })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path} returned ${response.status} (${payload.code || 'no-code'})`
  );
  return { response, payload };
}

await owner.connect();
let api;
let fixture;
try {
  const expectedDatabase = decodeURIComponent(target.migratorUrl.pathname).replace(/^\//, '');
  assert.equal((await owner.query('SELECT current_database() AS name')).rows[0].name, expectedDatabase);
  assert.notEqual(target.apiUrl.username, target.migratorUrl.username);
  const upSql = await readFile(
    'database/migrations/0017_active_session_reestablishment.up.sql',
    'utf8'
  );
  const checksum = createHash('sha256').update(upSql, 'utf8').digest('hex');
  assert.deepEqual((await owner.query(
    `SELECT name, checksum FROM schema_migrations WHERE version = '0017'`
  )).rows[0], {
    name: 'active_session_reestablishment',
    checksum
  });

  fixture = {
    organization: null,
    workspace: workspaceId(),
    workspaceCreated: false,
    user: null
  };
  await createFixture(fixture);
  const subject = `auth0|session-${randomUUID()}`;
  await owner.query(
    `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
     VALUES ($1, $2, $3, 'active')`,
    [TEST_ISSUER, subject, fixture.user]
  );

  const key = (await owner.query(
    `SELECT secret FROM app_private.tenant_context_keys
      WHERE key_id = $1 AND status = 'active'
        AND not_before <= clock_timestamp() AND expires_at > clock_timestamp()`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  )).rows[0]?.secret;
  assert.ok(key?.length >= 32);

  const identities = new Map();
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

  const sessionId = `sid-${randomUUID()}`;
  identities.set('first-profile-login', identity(subject, sessionId));
  assert.equal((await request(
    base, '/v1/auth/session', 'first-profile-login', fixture.workspace, 201, { method: 'POST' }
  )).payload.ok, true);
  const original = (await owner.query(
    `SELECT id FROM app_private.auth_sessions
      WHERE issuer = $1 AND provider_session_id = $2`,
    [TEST_ISSUER, sessionId]
  )).rows[0];
  assert.ok(original?.id);

  const pushEndpoint = `https://fcm.googleapis.com/fcm/send/session-${randomUUID()}`;
  const push = await request(
    base,
    '/v1/commands/push.register',
    'first-profile-login',
    fixture.workspace,
    201,
    {
      method: 'POST',
      body: {
        endpoint: pushEndpoint,
        expirationTime: null,
        p256dh: 'A'.repeat(88),
        auth: 'B'.repeat(24),
        userAgent: 'Synthetic clean Windows Chrome Profile',
        platform: 'windows'
      }
    }
  );
  assert.equal(push.payload.data.registered, true);

  await owner.query(
    `UPDATE app_private.auth_sessions
        SET created_at = clock_timestamp() - interval '2 hours',
            valid_after = clock_timestamp() - interval '2 hours',
            expires_at = clock_timestamp() - interval '1 hour',
            last_seen_at = clock_timestamp() - interval '1 hour'
      WHERE id = $1`,
    [original.id]
  );
  const freshIssuedAt = Math.floor(Date.now() / 1000);
  identities.set('fresh-profile-login', identity(subject, sessionId, freshIssuedAt));
  const reestablished = await request(
    base, '/v1/auth/session', 'fresh-profile-login', fixture.workspace, 201, { method: 'POST' }
  );
  assert.equal(reestablished.payload.ok, true);
  const revision = await request(
    base, '/v1/bootstrap/revision', 'fresh-profile-login', fixture.workspace, 200
  );
  assert.equal(revision.payload.ok, true);

  const renewed = (await owner.query(
    `SELECT id, expires_at > clock_timestamp() AS valid
       FROM app_private.auth_sessions
      WHERE issuer = $1 AND provider_session_id = $2`,
    [TEST_ISSUER, sessionId]
  )).rows;
  assert.equal(renewed.length, 1);
  assert.equal(renewed[0].id, original.id);
  assert.equal(renewed[0].valid, true);
  assert.equal((await owner.query(
    'SELECT count(*)::integer AS count FROM push_subscriptions WHERE session_id = $1',
    [original.id]
  )).rows[0].count, 1);

  for (const status of ['revoked', 'compromised', 'expired']) {
    const blockedSessionId = `sid-${status}-${randomUUID()}`;
    const token = `blocked-${status}`;
    identities.set(token, identity(subject, blockedSessionId));
    await request(base, '/v1/auth/session', token, fixture.workspace, 201, { method: 'POST' });
    await owner.query(
      `UPDATE app_private.auth_sessions
          SET status = $1,
              revoked_at = CASE WHEN $1 = 'expired' THEN NULL ELSE clock_timestamp() END,
              revoke_reason = $1
        WHERE issuer = $2 AND provider_session_id = $3`,
      [status, TEST_ISSUER, blockedSessionId]
    );
    const blocked = await request(
      base, '/v1/auth/session', token, fixture.workspace, 401, { method: 'POST' }
    );
    assert.equal(blocked.payload.code, 'SESSION_INVALID');
  }

  await assert.rejects(
    () => apiPool.query('SELECT id FROM app_private.auth_sessions LIMIT 1'),
    error => error.code === '42501'
  );

  console.log(JSON.stringify({
    cleanWindowsProfileSessionEstablishment: 'passed',
    activeExpiredSessionRenewal: 'passed',
    bootstrapRevisionAfterRenewal: 'passed',
    sessionIdPreserved: 'passed',
    pushSubscriptionPreserved: 'passed',
    revokedCompromisedExpiredFailClosed: 'passed',
    apiRoleDirectSessionRead: 'denied'
  }));
} finally {
  if (api) {
    api.close();
    await once(api, 'close');
  }
  if (fixture) {
    await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    await destroyFixture(fixture);
    assert.equal((await owner.query(
      'SELECT count(*)::integer AS count FROM app_private.auth_sessions WHERE issuer = $1',
      [TEST_ISSUER]
    )).rows[0].count, 0);
    assert.equal((await owner.query(
      'SELECT count(*)::integer AS count FROM app_private.identity_principals WHERE issuer = $1',
      [TEST_ISSUER]
    )).rows[0].count, 0);
    if (fixture.user) {
      assert.equal((await owner.query(
        'SELECT count(*)::integer AS count FROM users WHERE id = $1',
        [fixture.user]
      )).rows[0].count, 0);
    }
    if (fixture.organization) {
      assert.equal((await owner.query(
        'SELECT count(*)::integer AS count FROM organizations WHERE id = $1',
        [fixture.organization]
      )).rows[0].count, 0);
    }
  }
  await owner.end();
  await apiPool.end();
}
