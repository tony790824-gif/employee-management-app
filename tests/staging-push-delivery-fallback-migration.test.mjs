import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pushDeliveryFallbackTargetConfig } from
  '../database/staging-push-delivery-fallback.mjs';

const up = await readFile('database/migrations/0021_push_delivery_fallback.up.sql', 'utf8');
const down = await readFile('database/migrations/0021_push_delivery_fallback.down.sql', 'utf8');
const runner = await readFile('database/staging-push-delivery-fallback.mjs', 'utf8');
const checksum = createHash('sha256').update(up, 'utf8').digest('hex');

assert.match(checksum, /^[a-f0-9]{64}$/);
assert.match(up, /target_client_mode = 'pwa'/);
assert.match(up, /subscription\.client_mode = 'browser'/);
assert.match(up, /preferred\.client_mode = 'pwa'/);
assert.match(up, /outcome = 'expired'/);
assert.match(up, /session\.status = 'active'/);
assert.match(up, /member\.auth_status = 'active'/);
assert.match(up, /ON CONFLICT \(workspace_id, notification_id, subscription_id\)/);
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.worker_complete_push_delivery/);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
assert.doesNotMatch(up, /BYPASSRLS|DISABLE ROW LEVEL SECURITY/i);

assert.doesNotMatch(down, /target_client_mode|client_mode = 'browser'/);
assert.match(down, /REVOKE ALL ON FUNCTION app_private\.worker_complete_push_delivery/);
assert.doesNotMatch(down, /TRUNCATE|DELETE FROM push_subscriptions|DELETE FROM push_deliveries/i);

assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /apiRoleTargetConfig/);
assert.match(runner, /ROLLBACK_BANKE_STAGING_PUSH_DELIVERY_FALLBACK/);
assert.match(runner, /pg_advisory_lock/);
assert.match(runner, /REQUIRED_VERSIONS[\s\S]*'0019', '0020'/);
assert.match(runner, /api_subscription_select_denied/);
assert.match(runner, /api_delivery_select_denied/);
assert.doesNotMatch(runner, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

const staging = pushDeliveryFallbackTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.equal(staging.apiRole, 'banke_api_staging');
assert.throws(() => pushDeliveryFallbackTargetConfig({
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);

console.log(`Staging 0021 Push delivery fallback safeguards passed (${checksum}).`);
