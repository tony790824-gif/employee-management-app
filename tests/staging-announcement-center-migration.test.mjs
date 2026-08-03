import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { announcementCenterTargetConfig } from '../database/staging-announcement-center.mjs';

const [up, down, runner, grants] = await Promise.all([
  readFile('database/migrations/0022_announcement_center.up.sql', 'utf8'),
  readFile('database/migrations/0022_announcement_center.down.sql', 'utf8'),
  readFile('database/staging-announcement-center.mjs', 'utf8'),
  readFile('database/apply-role-grants.mjs', 'utf8')
]);
const checksum = createHash('sha256').update(up, 'utf8').digest('hex');
assert.match(checksum, /^[a-f0-9]{64}$/);
assert.match(up, /CREATE TABLE announcement \(/);
assert.match(up, /CREATE TABLE announcement_read \(/);
assert.match(up, /audience IN \('ALL', 'MANAGER', 'EMPLOYEE'\)/);
assert.match(up, /deleted_at timestamptz/);
assert.match(up, /FORCE ROW LEVEL SECURITY/g);
assert.match(up, /announcement_tenant_isolation/);
assert.match(up, /announcement_read_tenant_isolation/);
assert.match(up, /api_list_announcements/);
assert.match(up, /api_get_announcement/);
assert.match(up, /api_execute_announcement_command/);
assert.match(up, /api_mark_announcement_read/);
assert.match(up, /auth_context\.authorized_role NOT IN \('boss', 'manager'\)/,
  'Only managers may mutate announcements.');
assert.match(up, /target_role = 'employee'.*target_audience IN \('ALL', 'EMPLOYEE'\)/s,
  'Employees only read employee-visible audiences.');
assert.match(up, /NEW\.event_type <> 'ANNOUNCEMENT_CREATED'/);
assert.match(up, /'announcement_created'/);
assert.match(up, /'📢 新公告'/);
assert.match(up, /INSERT INTO notifications/);
assert.match(up, /INSERT INTO push_deliveries/);
assert.match(up, /'url', NEW\.destination/);
assert.match(up, /notification\.resource_type = 'announcement'/,
  'Announcement read state must also update the existing Notification Badge source.');
assert.match(up, /REVOKE ALL ON TABLE announcement, announcement_read FROM PUBLIC/);
assert.doesNotMatch(up, /token|cookie|authorization header|email|phone|reason/i,
  'Announcement migration must not persist credentials or unrelated personal data.');
assert.match(down, /rollback requires announcement data to be archived explicitly/);
assert.match(down, /DROP TABLE IF EXISTS announcement_read/);
assert.match(down, /DROP TABLE IF EXISTS announcement/);
assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.match(runner, /applyApiRoleGrants/);
assert.match(grants, /api_list_announcements/);
assert.match(grants, /api_mark_announcement_read/);

const staging = announcementCenterTargetConfig({
  BANK_ENV: 'staging', BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.throws(() => announcementCenterTargetConfig({
  BANK_ENV: 'production', BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);

console.log(`Staging 0022 Announcement Center migration safeguards passed (${checksum}).`);
