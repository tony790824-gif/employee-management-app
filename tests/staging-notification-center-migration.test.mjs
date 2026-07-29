import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile('database/staging-notification-center.mjs', 'utf8');
const up = await readFile('database/migrations/0014_notification_center.up.sql', 'utf8');
const down = await readFile('database/migrations/0014_notification_center.down.sql', 'utf8');
const patchUp = await readFile(
  'database/migrations/0015_notification_command_validation.up.sql',
  'utf8'
);
const patchDown = await readFile(
  'database/migrations/0015_notification_command_validation.down.sql',
  'utf8'
);

assert.equal(
  createHash('sha256').update(up, 'utf8').digest('hex'),
  'c966d0ee7ac3b09cfaffdb8ef8e92a126db411c5fa4ffcf719709dcf0d83c2bc'
);
assert.match(source, /config\.environment !== 'staging'/);
assert.match(source, /ROLLBACK_BANKE_STAGING_NOTIFICATION_CENTER/);
assert.match(source, /pg_advisory_lock/);
assert.match(source, /BEGIN/);
assert.match(source, /ROLLBACK/);
assert.match(source, /REQUIRED_VERSIONS[\s\S]*'0011', '0012', '0013'/);
assert.match(source, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.match(source, /PATCH_VERSION = '0015'/);
assert.match(source, /PATCH_NAME = 'notification_command_validation'/);
assert.match(source, /ledger and database objects are inconsistent/);
assert.match(source, /publicExecuteGrants/);
assert.match(source, /publicTableGrants/);
assert.doesNotMatch(source, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

assert.match(up, /CREATE TABLE notifications/);
assert.match(up, /ALTER TABLE notifications FORCE ROW LEVEL SECURITY/);
assert.match(up, /CREATE POLICY notifications_tenant_isolation/);
assert.match(up, /CREATE TRIGGER outbox_events_create_notifications/);
assert.match(up, /SECURITY DEFINER/g);
assert.match(up, /REVOKE ALL ON TABLE notifications FROM PUBLIC/);
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.api_list_notifications/);
assert.match(down, /DROP TRIGGER IF EXISTS outbox_events_create_notifications/);
assert.match(down, /DROP TABLE IF EXISTS notifications/);
assert.match(patchUp, /command_input - 'notificationId' - 'baseRevision' <> '\{\}'::jsonb/);
assert.doesNotMatch(patchUp, /jsonb_object_length/);
assert.match(patchDown, /jsonb_object_length\(command_input\) <> 2/);
assert.doesNotMatch(patchUp, /CREATE TABLE|ALTER TABLE|DROP TABLE/);

console.log('Controlled Staging 0014 notification migration boundary tests passed.');
