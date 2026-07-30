import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { edgePushAllowlistTargetConfig } from
  '../database/staging-edge-web-push-provider-allowlist.mjs';

const up = await readFile(
  'database/migrations/0018_edge_web_push_provider_allowlist.up.sql',
  'utf8'
);
const down = await readFile(
  'database/migrations/0018_edge_web_push_provider_allowlist.down.sql',
  'utf8'
);
const runner = await readFile(
  'database/staging-edge-web-push-provider-allowlist.mjs',
  'utf8'
);

assert.match(up, /notify\\\.windows\\\.com/);
assert.match(up, /push_subscriptions_endpoint_check/);
assert.match(up, /unregister_replacement/);
assert.match(up, /target_endpoint !~/);
assert.match(up, /SELECT count\(\*\)/);
assert.match(
  up,
  /REVOKE ALL ON FUNCTION app_private\.api_execute_push_command\([\s\S]*FROM PUBLIC/
);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
assert.doesNotMatch(up, /DELETE FROM|TRUNCATE/i);

assert.match(down, /notify\\\.windows\\\.com/);
assert.match(down, /rollback requires Edge subscriptions to be revoked and removed first/);
assert.match(down, /push_subscriptions_endpoint_check/);
assert.match(down, /fcm\\\.googleapis\\\.com/);
assert.match(down, /updates\\\.push\\\.services\\\.mozilla\\\.com/);
assert.match(down, /push\\\.apple\\\.com/);
assert.doesNotMatch(down, /DELETE FROM|TRUNCATE/i);

assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /apiRoleTargetConfig/);
assert.match(runner, /ROLLBACK_BANKE_STAGING_EDGE_WEB_PUSH_PROVIDER_ALLOWLIST/);
assert.match(runner, /pg_advisory_lock/);
assert.match(runner, /REQUIRED_VERSIONS[\s\S]*'0016', '0017'/);
assert.match(runner, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.match(runner, /function_acl\.grantee = 0/);
assert.match(runner, /api_execute/);
assert.doesNotMatch(runner, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

const staging = edgePushAllowlistTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.equal(staging.apiRole, 'banke_api_staging');
assert.throws(() => edgePushAllowlistTargetConfig({
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);
assert.throws(() => edgePushAllowlistTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://same_role@staging.example/banke',
  DATABASE_API_URL: 'postgres://same_role@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
}), /separate database roles/);

console.log('Staging Edge Web Push provider allowlist migration safeguards passed.');
