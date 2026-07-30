import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { databaseConfig, loadMigrations } from '../database/migrate.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const trackedUpFiles = new Set(execFileSync(
  'git',
  ['ls-files', '--', 'database/migrations/*.up.sql'],
  { cwd: projectRoot, encoding: 'utf8' }
).trim().split(/\r?\n/).filter(Boolean).map(file => file.split('/').pop()));
const sprintUpFiles = new Set([
  '0012_current_user_bootstrap.up.sql',
  '0013_time_off_requests.up.sql',
  '0014_notification_center.up.sql',
  '0015_notification_command_validation.up.sql',
  '0016_web_push_subscriptions.up.sql',
  '0017_active_session_reestablishment.up.sql'
]);
const migrations = (await loadMigrations()).filter(item =>
  trackedUpFiles.has(`${item.version}_${item.name}.up.sql`)
  || sprintUpFiles.has(`${item.version}_${item.name}.up.sql`)
);
assert.deepEqual(migrations.map(item => item.version), [
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0009', '0011', '0012', '0013', '0014', '0015', '0016', '0017'
]);
assert.equal(new Set(migrations.map(item => item.checksum)).size, migrations.length);
for (const migration of migrations) {
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);
  assert.ok(migration.upSql.trim().length > 0);
  assert.ok(migration.downSql.trim().length > 0);
}

const sql = (await Promise.all(migrations.map(item => item.upSql))).join('\n');
assert.match(sql, /FUNCTION app_private\.api_bootstrap\(/);
assert.match(sql, /verify_tenant_context\(signed_payload, signed_signature, signing_key_id, 'read', true\)/);
const tenantTables = [
  'workspaces', 'workspace_members', 'employees', 'shifts', 'leave_selections',
  'attendance_records', 'payroll_adjustments', 'command_receipts', 'audit_logs',
  'outbox_events', 'snapshot_imports'
  , 'time_off_requests', 'time_off_request_dates', 'notifications'
];
for (const table of tenantTables) {
  assert.match(sql, new RegExp(`(?:CREATE TABLE ${table}|ALTER TABLE ${table})`));
}
assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g) || []).length >= 4, true);
assert.match(sql, /app_private\.current_workspace_id\(\)/);
assert.match(sql, /PRIMARY KEY \(workspace_id,/);
assert.match(sql, /command_receipts/);
assert.match(sql, /outbox_events/);
assert.match(sql, /identity_principals/);
assert.match(sql, /auth_sessions/);
assert.match(sql, /tenant_context_keys/);
assert.match(sql, /api_execute_command/);
assert.match(sql, /SECURITY DEFINER/);
assert.match(sql, /TENANT_CONTEXT_REPLAYED/);
assert.match(sql, /app_private\.security_event_inbox/);
assert.match(sql, /PRIMARY KEY \(environment, issuer, event_id\)/);
assert.match(sql, /app_private\.ingest_auth0_security_event/);
assert.match(sql, /ON CONFLICT DO NOTHING/);
assert.match(sql, /status = 'compromised'/);
assert.match(sql, /status = 'revoked'/);
assert.match(sql, /api_execute_time_off_command/);
assert.match(sql, /api_list_time_off_requests/);
assert.match(sql, /request_kind IN \('schedule_leave', 'ad_hoc_leave'\)/);
assert.match(sql, /status IN \('pending', 'approved', 'rejected', 'cancelled', 'superseded'\)/);
assert.match(sql, /time_off_one_pending_schedule_month_idx/);
assert.match(sql, /time_off_one_approved_schedule_month_idx/);
assert.match(sql, /ALTER TABLE time_off_requests FORCE ROW LEVEL SECURITY/);
assert.match(sql, /ALTER TABLE time_off_request_dates FORCE ROW LEVEL SECURITY/);
assert.match(sql, /request\.request_kind = 'schedule_leave'[\s\S]*request\.status = 'approved'/);
assert.match(sql, /request\.request_kind = 'ad_hoc_leave'[\s\S]*request\.status = 'approved'/);
assert.match(sql, /api_list_notifications/);
assert.match(sql, /api_notification_revision/);
assert.match(sql, /api_execute_notification_command/);
assert.match(sql, /ALTER TABLE notifications FORCE ROW LEVEL SECURITY/);
assert.match(sql, /UNIQUE \(workspace_id, recipient_user_id, source_event_id\)/);
assert.match(sql, /outbox_events_create_notifications/);
assert.match(sql, /member\.workspace_id = NEW\.workspace_id/);
assert.match(sql, /notification\.recipient_user_id = auth_context\.authorized_user_id/);
assert.doesNotMatch(
  (await readFile(new URL('../database/migrations/0014_notification_center.up.sql', import.meta.url), 'utf8')),
  /reason|review_note|email|phone|token/i,
  'Notification storage and delivery must not copy sensitive request details'
);
assert.match(sql, /command_input - 'notificationId' - 'baseRevision' <> '\{\}'::jsonb/);

assert.throws(() => databaseConfig({ BANK_ENV: 'production', DATABASE_URL: 'postgres://db' }), /Production/);
assert.throws(() => databaseConfig({
  BANK_ENV: 'production', DATABASE_URL: 'postgres://db',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS', DATABASE_SSL: 'disable'
}), /TLS|Production/);
assert.throws(() => databaseConfig({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/db',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS', DATABASE_SSL: 'require'
}), /BANK_PRODUCTION_DATABASE_HOST/);
assert.throws(() => databaseConfig({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@other.example/db',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
}), /approved Production PostgreSQL host/);
const production = databaseConfig({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/db',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
});
assert.equal(production.environment, 'production');
assert.equal(new URL(production.connectionString).hostname, 'production.example');
const staging = databaseConfig({
  BANK_ENV: 'staging', DATABASE_URL: 'postgres://db', DATABASE_SSL: 'require', BANK_STAGING_DATABASE_HOST: 'db'
});
assert.equal(staging.environment, 'staging');
assert.deepEqual(staging.ssl, { rejectUnauthorized: true });
const separated = databaseConfig({
  BANK_ENV: 'staging', DATABASE_MIGRATOR_URL: 'postgres://owner@direct.example/db',
  DATABASE_URL: 'postgres://legacy@ignored.example/db', DATABASE_SSL: 'require', BANK_STAGING_DATABASE_HOST: 'direct.example'
});
assert.equal(new URL(separated.connectionString).username, 'owner');
assert.throws(() => databaseConfig({
  BANK_ENV: 'staging', DATABASE_MIGRATOR_URL: 'postgres://owner@host-pooler.example/db', DATABASE_SSL: 'require'
}), /direct|pooler/);
assert.throws(() => databaseConfig({
  BANK_ENV: 'staging', DATABASE_MIGRATOR_URL: 'postgres://owner@other.example/db', DATABASE_SSL: 'require',
  BANK_STAGING_DATABASE_HOST: 'staging.example'
}), /Staging PostgreSQL host/);

const importer = await readFile(new URL('../database/import-snapshot.mjs', import.meta.url), 'utf8');
const tenantContextPosition = importer.indexOf("set_config('app.current_workspace_id'");
const firstTenantReadPosition = importer.indexOf('SELECT imported_counts FROM snapshot_imports');
assert.ok(tenantContextPosition >= 0 && tenantContextPosition < firstTenantReadPosition,
  'snapshot import must bind RLS tenant context before reading tenant tables');

console.log('PostgreSQL migration structure and production gates passed');
