import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pushSubscriptionPriorityTargetConfig } from
  '../database/staging-push-subscription-priority.mjs';

const up = await readFile(
  'database/migrations/0020_push_subscription_priority.up.sql',
  'utf8'
);
const down = await readFile(
  'database/migrations/0020_push_subscription_priority.down.sql',
  'utf8'
);
const runner = await readFile('database/staging-push-subscription-priority.mjs', 'utf8');
const checksum = createHash('sha256').update(up, 'utf8').digest('hex');

assert.match(checksum, /^[a-f0-9]{64}$/);
assert.match(up, /ADD COLUMN client_mode text NOT NULL DEFAULT 'browser'/);
assert.match(up, /CHECK \(client_mode IN \('pwa', 'browser'\)\)/);
assert.match(up, /push_subscriptions_recipient_mode_active_idx/);
assert.match(up, /WITH eligible AS MATERIALIZED/);
assert.match(up, /subscription\.client_mode = 'pwa'/);
assert.match(up, /NOT EXISTS \(SELECT 1 FROM eligible preferred WHERE preferred\.client_mode = 'pwa'\)/);
assert.match(up, /coalesce\(command_input->>'clientMode', 'browser'\)/);
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.enqueue_notification_push\(\) FROM PUBLIC/);
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.api_execute_push_command/);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
assert.doesNotMatch(up, /TRUNCATE|DELETE FROM push_subscriptions/i);

assert.match(down, /DROP INDEX push_subscriptions_recipient_mode_active_idx/);
assert.match(down, /DROP COLUMN client_mode/);
assert.match(down, /FROM push_subscriptions subscription[\s\S]*ON CONFLICT/);
assert.match(down, /REVOKE ALL ON FUNCTION app_private\.enqueue_notification_push\(\) FROM PUBLIC/);
assert.doesNotMatch(down, /TRUNCATE|DELETE FROM push_subscriptions/i);

assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /apiRoleTargetConfig/);
assert.match(runner, /ROLLBACK_BANKE_STAGING_PUSH_SUBSCRIPTION_PRIORITY/);
assert.match(runner, /pg_advisory_lock/);
assert.match(runner, /REQUIRED_VERSIONS[\s\S]*'0018', '0019'/);
assert.match(runner, /has_table_privilege/);
assert.match(runner, /api_table_select_denied/);
assert.match(runner, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.doesNotMatch(runner, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

const staging = pushSubscriptionPriorityTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.equal(staging.apiRole, 'banke_api_staging');
assert.throws(() => pushSubscriptionPriorityTargetConfig({
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);

console.log(`Staging 0020 Push Subscription Priority safeguards passed (${checksum}).`);
