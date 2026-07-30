import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sessionReestablishmentTargetConfig } from '../database/staging-session-reestablishment.mjs';

const up = await readFile(
  'database/migrations/0017_active_session_reestablishment.up.sql',
  'utf8'
);
const down = await readFile(
  'database/migrations/0017_active_session_reestablishment.down.sql',
  'utf8'
);
const runner = await readFile('database/staging-session-reestablishment.mjs', 'utf8');

assert.match(up, /CREATE OR REPLACE FUNCTION app_private\.api_establish_session/);
assert.match(up, /pg_advisory_xact_lock/);
assert.match(up, /FOR UPDATE/);
assert.match(up, /local_session\.status <> 'active'/);
assert.match(up, /local_session\.user_id <> auth_context\.authorized_user_id/);
assert.match(up, /local_session\.subject <> context->>'subject'/);
assert.match(up, /local_session\.valid_after > to_timestamp\(token_issued_at\)/);
assert.match(
  up,
  /session_was_expired[\s\S]*to_timestamp\(token_issued_at\) < local_session\.expires_at[\s\S]*SESSION_INVALID/
);
assert.match(up, /valid_after = CASE[\s\S]*WHEN session_was_expired/);
assert.match(up, /expires_at = greatest\(/);
assert.match(up, /RETURNING \* INTO local_session/);
assert.match(
  up,
  /REVOKE ALL ON FUNCTION app_private\.api_establish_session\(text,text,text\) FROM PUBLIC/
);
assert.doesNotMatch(up, /DELETE FROM app_private\.auth_sessions/);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/i);

assert.match(down, /CREATE OR REPLACE FUNCTION app_private\.api_establish_session/);
assert.doesNotMatch(down, /pg_advisory_xact_lock/);
assert.match(down, /SET last_seen_at = clock_timestamp\(\)/);
assert.match(
  down,
  /REVOKE ALL ON FUNCTION app_private\.api_establish_session\(text,text,text\) FROM PUBLIC/
);

assert.match(runner, /config\.environment !== 'staging'/);
assert.match(runner, /apiRoleTargetConfig/);
assert.match(runner, /ROLLBACK_BANKE_STAGING_SESSION_REESTABLISHMENT/);
assert.match(runner, /pg_advisory_lock/);
assert.match(runner, /REQUIRED_VERSIONS[\s\S]*'0015', '0016'/);
assert.match(runner, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.match(runner, /aclexplode\(coalesce\(/);
assert.match(runner, /function_acl\.grantee = 0/);
assert.match(runner, /api_execute/);
assert.doesNotMatch(runner, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

const staging = sessionReestablishmentTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');
assert.equal(staging.apiRole, 'banke_api_staging');
assert.throws(() => sessionReestablishmentTargetConfig({
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
}), /BANK_ENV=staging/);
assert.throws(() => sessionReestablishmentTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://same_role@staging.example/banke',
  DATABASE_API_URL: 'postgres://same_role@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
}), /separate database roles/);
assert.throws(() => sessionReestablishmentTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging@production-pooler.example/banke',
  DATABASE_SSL: 'require'
}), /same approved database/);

console.log('Staging active Session re-establishment migration safeguards passed.');
