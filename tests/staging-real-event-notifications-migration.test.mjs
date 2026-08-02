import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { realEventNotificationTargetConfig } from '../database/staging-real-event-notifications.mjs';

const up = await readFile('database/migrations/0019_real_event_notifications.up.sql', 'utf8');
const down = await readFile('database/migrations/0019_real_event_notifications.down.sql', 'utf8');
const runner = await readFile('database/staging-real-event-notifications.mjs', 'utf8');
const checksum = createHash('sha256').update(up, 'utf8').digest('hex');

assert.match(checksum, /^[a-f0-9]{64}$/);
assert.match(up, /CREATE TABLE notification_preferences/);
assert.match(up, /FORCE ROW LEVEL SECURITY/);
assert.match(up, /resolve_notification_recipients/);
assert.match(up, /attendance\.clock-in\.completed/);
assert.match(up, /attendance\.clock-out\.completed/);
assert.match(up, /member\.role IN \('boss', 'manager'\)/);
assert.match(up, /member\.user_id IS DISTINCT FROM actor_user_id/);
assert.match(up, /notifications_recipient_deduplication_uidx/);
assert.match(up, /metadata - 'eventType' - 'entityType' - 'entityId'/);
assert.match(up, /coalesce\(preference\.clock_events, true\)/);
assert.match(up, /coalesce\(preference\.leave_events, true\)/);
assert.match(up, /coalesce\(preference\.shift_events, true\)/);
assert.match(up, /notifications\.update-preferences/);
assert.match(up, /api_update_notification_preferences/);
assert.doesNotMatch(up, /reason|email|phone|token|session_id/i);
assert.match(down, /rollback requires Sprint 31 notifications/);
assert.match(down, /RENAME TO create_notifications_from_outbox/);
assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.match(runner, /filter\(signature => !signature\.includes\('api_update_notification_preferences'\)\)/);
assert.doesNotMatch(runner, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

const staging = realEventNotificationTargetConfig({
  BANK_ENV: 'staging', BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.throws(() => realEventNotificationTargetConfig({
  BANK_ENV: 'production', BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);

console.log(`Staging 0019 real-event notification migration safeguards passed (${checksum}).`);
