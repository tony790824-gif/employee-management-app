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
  throw new Error('Live Announcement Center E2E requires BANK_ENV=staging.');
}

const EXPECTED_CHECKSUM = 'e5056c193598a4dcabcee961ce924caf428ca1207d059ed4448ae85dc9cfc8d3';
const TEST_ORIGIN = 'https://announcement-e2e.staging.invalid';
const TEST_ISSUER = 'https://announcement-e2e.staging.invalid/';
const { Client } = pg;
const apiPool = createPool();
const owner = new Client({
  connectionString: process.env.DATABASE_MIGRATOR_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000
});

const workspaceId = () => `ws_${randomUUID().replaceAll('-', '')}`;
const phone = sequence => `7${String(Date.now()).slice(-10)}${sequence}`;
const identity = label => {
  const now = Math.floor(Date.now() / 1000);
  return Object.freeze({
    issuer: TEST_ISSUER,
    subject: `auth0|announcement-${label}-${randomUUID()}`,
    sessionId: `sid-${randomUUID()}`,
    tokenId: `jti-${randomUUID()}`,
    issuedAt: now,
    expiresAt: now + 300
  });
};

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

async function createFixture(label, sequence) {
  const organization = (await owner.query(
    'INSERT INTO organizations(name) VALUES ($1) RETURNING id',
    [`Synthetic Announcement ${label}`]
  )).rows[0].id;
  const workspace = workspaceId();
  const boss = (await owner.query(
    "INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id", [phone(sequence)]
  )).rows[0].id;
  const employee = (await owner.query(
    "INSERT INTO users(phone, status) VALUES ($1, 'active') RETURNING id", [phone(sequence + 1)]
  )).rows[0].id;
  const employeeRecord = `e_announcement_${label.toLowerCase()}_${randomUUID().replaceAll('-', '')}`;
  await inWorkspace(workspace, async () => {
    await owner.query(
      "INSERT INTO workspaces(id, organization_id, name, status) VALUES ($1, $2, $3, 'active')",
      [workspace, organization, `Synthetic Announcement Workspace ${label}`]
    );
    await owner.query(
      `INSERT INTO employees(workspace_id, id, name, phone, hourly_rate, leave_quota)
       VALUES ($1, $2, $3, $4, 0, 8)`,
      [workspace, employeeRecord, `Synthetic Employee ${label}`, phone(sequence + 2)]
    );
    await owner.query(
      `INSERT INTO workspace_members(
         workspace_id, user_id, role, status, employee_id, auth_status, display_name
       ) VALUES
         ($1, $2, 'boss', 'active', NULL, 'active', $3),
         ($1, $4, 'employee', 'active', $5, 'active', NULL)`,
      [workspace, boss, `Synthetic Boss ${label}`, employee, employeeRecord]
    );
  });
  return { organization, workspace, boss, employee, employeeRecord };
}

async function destroyFixture(fixture) {
  await inWorkspace(fixture.workspace, async () => {
    await owner.query('DELETE FROM workspaces WHERE id = $1', [fixture.workspace]);
  });
  await owner.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[fixture.boss, fixture.employee]]);
  await owner.query('DELETE FROM organizations WHERE id = $1', [fixture.organization]);
}

async function request(base, path, principal, expected, { method = 'GET', body, key } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${principal.token}`,
      Origin: TEST_ORIGIN,
      'X-Workspace-Id': principal.workspaceId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.equal(response.status, expected,
    `${method} ${path} returned ${response.status} (${payload.code || 'no-code'})`);
  return payload;
}

await owner.connect();
let api;
const fixtures = [];
try {
  const staleFixtures = (await owner.query(
    `SELECT organization.id AS organization_id, workspace.id AS workspace_id,
            array_agg(member.user_id) FILTER (WHERE member.user_id IS NOT NULL) AS user_ids
       FROM organizations organization
       JOIN workspaces workspace ON workspace.organization_id = organization.id
       LEFT JOIN workspace_members member ON member.workspace_id = workspace.id
      WHERE organization.name LIKE 'Synthetic Announcement %'
      GROUP BY organization.id, workspace.id`
  )).rows;
  for (const stale of staleFixtures) {
    await inWorkspace(stale.workspace_id, async () => {
      await owner.query('DELETE FROM workspaces WHERE id = $1', [stale.workspace_id]);
    });
    if (stale.user_ids?.length) {
      await owner.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [stale.user_ids]);
    }
    await owner.query('DELETE FROM organizations WHERE id = $1', [stale.organization_id]);
  }
  const migration = (await owner.query(
    "SELECT name, checksum FROM schema_migrations WHERE version = '0022'"
  )).rows[0];
  assert.deepEqual(migration, { name: 'announcement_center', checksum: EXPECTED_CHECKSUM });
  assert.equal((await owner.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
  assert.notEqual(new URL(process.env.DATABASE_API_URL).username,
    new URL(process.env.DATABASE_MIGRATOR_URL).username);

  const workspaceA = await createFixture('A', 1);
  const workspaceB = await createFixture('B', 5);
  fixtures.push(workspaceA, workspaceB);
  const definitions = [
    { token: 'announcement-boss-a', workspaceId: workspaceA.workspace,
      userId: workspaceA.boss, identity: identity('boss-a') },
    { token: 'announcement-employee-a', workspaceId: workspaceA.workspace,
      userId: workspaceA.employee, identity: identity('employee-a') },
    { token: 'announcement-boss-b', workspaceId: workspaceB.workspace,
      userId: workspaceB.boss, identity: identity('boss-b') },
    { token: 'announcement-employee-b', workspaceId: workspaceB.workspace,
      userId: workspaceB.employee, identity: identity('employee-b') }
  ];
  for (const principal of definitions) {
    await owner.query(
      `INSERT INTO app_private.identity_principals(issuer, subject, user_id, status)
       VALUES ($1, $2, $3, 'active')`,
      [TEST_ISSUER, principal.identity.subject, principal.userId]
    );
  }
  const secret = (await owner.query(
    `SELECT secret FROM app_private.tenant_context_keys
      WHERE key_id = $1 AND status = 'active'
        AND not_before <= clock_timestamp() AND expires_at > clock_timestamp()`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  )).rows[0]?.secret;
  assert.ok(secret?.length >= 32);
  const identities = new Map(definitions.map(value => [value.token, value.identity]));
  const service = createCommandService({
    pool: apiPool,
    tenantContextSigner: createTenantContextSigner({
      key: secret.toString('base64url'), keyId: STAGING_TENANT_CONTEXT_KEY_ID
    })
  });
  api = createApiServer({
    commandService: service,
    verifyAccessToken: async token => {
      const resolved = identities.get(token);
      if (!resolved) throw new Error('Synthetic bearer is unknown.');
      return resolved;
    },
    pool: apiPool,
    allowedOrigins: [TEST_ORIGIN],
    environment: 'staging'
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const base = `http://127.0.0.1:${api.address().port}`;
  const [bossA, employeeA, bossB, employeeB] = definitions;
  for (const principal of definitions) {
    const established = await request(base, '/v1/auth/session', principal, 201, { method: 'POST' });
    assert.equal(established.ok, true);
  }

  const employeePushEndpoint = `https://fcm.googleapis.com/fcm/send/announcement-${randomUUID()}`;
  const registeredPush = await request(
    base, '/v1/commands/push.register', employeeA, 201, {
      method: 'POST', key: `announcement-live-push-${randomUUID()}`,
      body: {
        endpoint: employeePushEndpoint,
        expirationTime: null,
        p256dh: 'A'.repeat(88),
        auth: 'B'.repeat(24),
        userAgent: 'Synthetic Announcement Staging PWA',
        platform: 'windows',
        clientMode: 'pwa'
      }
    }
  );
  assert.equal(registeredPush.data.registered, true);

  const revisionBefore = (await request(base, '/v1/bootstrap/revision', employeeA, 200)).revision;
  const createKey = `announcement-live-create-${randomUUID()}`;
  const created = await request(base, '/v1/announcements', bossA, 201, {
    method: 'POST', key: createKey,
    body: { title: 'Synthetic Staging Announcement', content: 'Synthetic content only.', audience: 'ALL' }
  });
  const announcement = created.data;
  assert.equal(created.ok, true);
  const replay = await request(base, '/v1/announcements', bossA, 200, {
    method: 'POST', key: createKey,
    body: { title: 'Synthetic Staging Announcement', content: 'Synthetic content only.', audience: 'ALL' }
  });
  assert.equal(replay.replayed, true);

  const bossList = await request(base, '/v1/announcements', bossA, 200);
  const employeeList = await request(base, '/v1/announcements', employeeA, 200);
  assert.equal(bossList.items.length, 1);
  assert.equal(employeeList.items.length, 1);
  assert.equal(employeeList.items[0].id, announcement.id);
  assert.equal((await request(base, '/v1/announcements', employeeB, 200)).items.length, 0);
  assert.notEqual((await request(base, '/v1/bootstrap/revision', employeeA, 200)).revision,
    revisionBefore, 'Visible announcement and notification must change employee revision.');

  const employeeNotifications = await request(base, '/v1/notifications', employeeA, 200);
  assert.equal(employeeNotifications.items.length, 1);
  assert.equal(employeeNotifications.items[0].type, 'announcement_created');
  assert.equal(employeeNotifications.items[0].destination, `/announcements/${announcement.id}`);
  assert.equal(employeeNotifications.unreadCount, 1);
  assert.equal((await request(base, '/v1/notifications', employeeB, 200)).items.length, 0);

  const announcementDeliveries = (await owner.query(
    `SELECT delivery.payload, subscription.client_mode
       FROM push_deliveries delivery
       JOIN notifications notification
         ON notification.workspace_id = delivery.workspace_id
        AND notification.id = delivery.notification_id
       JOIN push_subscriptions subscription
         ON subscription.workspace_id = delivery.workspace_id
        AND subscription.id = delivery.subscription_id
      WHERE notification.workspace_id = $1
        AND notification.recipient_user_id = $2
        AND notification.notification_type = 'announcement_created'
        AND notification.resource_id = $3`,
    [workspaceA.workspace, employeeA.userId, announcement.id]
  )).rows;
  assert.equal(announcementDeliveries.length, 1,
    'A published announcement creates one Push delivery for the eligible Employee PWA.');
  assert.equal(announcementDeliveries[0].client_mode, 'pwa');
  assert.deepEqual(announcementDeliveries[0].payload, {
    notificationId: employeeNotifications.items[0].id,
    type: 'announcement_created',
    title: '📢 新公告',
    body: 'Synthetic Staging Announcement',
    resourceId: announcement.id,
    url: `/announcements/${announcement.id}`
  });
  assert.equal((await owner.query(
    `SELECT count(*)::integer AS count
       FROM push_deliveries delivery
       JOIN notifications notification
         ON notification.workspace_id = delivery.workspace_id
        AND notification.id = delivery.notification_id
      WHERE notification.workspace_id = $1
        AND notification.recipient_user_id = $2
        AND notification.notification_type = 'announcement_created'
        AND notification.resource_id = $3`,
    [workspaceA.workspace, bossA.userId, announcement.id]
  )).rows[0].count, 0, 'A recipient without an active subscription is skipped safely.');

  await request(base, `/v1/announcements/${announcement.id}/read`, employeeA, 200, {
    method: 'POST', key: `announcement-live-read-${randomUUID()}`, body: {}
  });
  assert.equal((await request(base, '/v1/announcements', employeeA, 200)).unreadCount, 0);
  assert.equal((await request(base, '/v1/notifications', employeeA, 200)).unreadCount, 0,
    'Announcement read marker must keep Notification Center badge consistent.');

  const employeeCreate = await request(base, '/v1/announcements', employeeA, 403, {
    method: 'POST', key: `announcement-live-forbidden-${randomUUID()}`,
    body: { title: 'Forbidden', content: 'Forbidden', audience: 'ALL' }
  });
  assert.equal(employeeCreate.code, 'COMMAND_FORBIDDEN');
  const crossWorkspaceDetail = await request(
    base, `/v1/announcements/${announcement.id}`, bossB, 404
  );
  assert.equal(crossWorkspaceDetail.code, 'ANNOUNCEMENT_NOT_FOUND');

  const updated = await request(base, `/v1/announcements/${announcement.id}`, bossA, 200, {
    method: 'PUT', key: `announcement-live-update-${randomUUID()}`,
    body: { title: 'Updated Synthetic Announcement', content: 'Updated synthetic content.',
      audience: 'MANAGER', baseRevision: announcement.revision }
  });
  assert.equal(updated.data.revision, announcement.revision + 1);
  assert.equal((await request(base, '/v1/announcements', employeeA, 200)).items.length, 0,
    'Employee cannot read manager-only announcements.');
  assert.equal((await request(base, '/v1/announcements', bossA, 200)).items.length, 1);

  await request(base, `/v1/announcements/${announcement.id}`, bossA, 200, {
    method: 'DELETE', key: `announcement-live-delete-${randomUUID()}`,
    body: { baseRevision: updated.data.revision }
  });
  assert.equal((await request(base, '/v1/announcements', bossA, 200)).items.length, 0,
    'Soft-deleted announcement is hidden from reads.');

  await assert.rejects(() => apiPool.query('SELECT id FROM announcement LIMIT 1'),
    error => error.code === '42501');
  await assert.rejects(() => apiPool.query('UPDATE announcement SET title = title'),
    error => error.code === '42501');

  console.log(JSON.stringify({
    migrationChecksum: 'passed', managerCrud: 'passed', employeeRead: 'passed',
    employeeMutation: 'denied', audience: 'passed', workspaceIsolation: 'passed',
    notificationPipeline: 'passed', webPushDelivery: 'passed', badgeConsistency: 'passed', idempotency: 'passed',
    softDelete: 'passed', apiRoleDirectTableAccess: 'denied'
  }));
} finally {
  if (api) {
    api.close();
    await once(api, 'close');
  }
  try {
    await owner.query('DELETE FROM app_private.auth_sessions WHERE issuer = $1', [TEST_ISSUER]);
    await owner.query('DELETE FROM app_private.identity_principals WHERE issuer = $1', [TEST_ISSUER]);
    for (const fixture of fixtures.reverse()) await destroyFixture(fixture);
  } finally {
    await owner.end();
    await apiPool.end();
  }
}
