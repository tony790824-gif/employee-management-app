import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUSH_WORKER_FUNCTIONS, pushRoleTargetConfig } from '../database/apply-web-push-role-grants.mjs';

const stagingSource = await readFile('database/staging-web-push.mjs', 'utf8');
const up = await readFile('database/migrations/0016_web_push_subscriptions.up.sql', 'utf8');
const down = await readFile('database/migrations/0016_web_push_subscriptions.down.sql', 'utf8');
const roleScript = await readFile('database/apply-web-push-role-grants.mjs', 'utf8');

for (const table of ['push_subscriptions', 'push_deliveries']) {
  assert.match(up, new RegExp(`CREATE TABLE ${table}`));
  assert.match(up, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
  assert.match(up, new RegExp(`REVOKE ALL ON TABLE[\\s\\S]*${table}`));
  assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
}
assert.match(up, /FOREIGN KEY \(workspace_id, user_id\)[\s\S]*workspace_members/);
assert.match(up, /FOREIGN KEY \(workspace_id, subscription_id\)[\s\S]*push_subscriptions/);
assert.match(up, /CREATE TRIGGER notifications_enqueue_web_push/);
assert.match(up, /session\.status = 'active'/);
assert.match(up, /app_user\.status = 'active'/);
assert.match(up, /member\.status = 'active'/);
assert.match(up, /member\.auth_status = 'active'/);
assert.match(up, /ON CONFLICT \(workspace_id, notification_id, subscription_id\)[\s\S]*DO NOTHING/);
assert.match(up, /FOR UPDATE SKIP LOCKED/);
assert.match(up, /WHEN outcome = 'expired'/);
assert.match(up, /PUSH_RATE_LIMITED/);
assert.match(up, /attempt_count < 3/);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
assert.match(stagingSource, /config\.environment !== 'staging'/);
assert.match(stagingSource, /ROLLBACK_BANKE_STAGING_WEB_PUSH/);
assert.match(stagingSource, /pg_advisory_lock/);
assert.match(stagingSource, /REQUIRED_VERSIONS[\s\S]*'0014', '0015'/);
assert.match(stagingSource, /deliberatelyPendingEarlierMigrations: \['0009', '0010'\]/);
assert.doesNotMatch(stagingSource, /BANK_ALLOW_PRODUCTION_MIGRATIONS|DATABASE_PRODUCTION_URL/);

assert.deepEqual(PUSH_WORKER_FUNCTIONS, [
  'app_private.worker_claim_push_deliveries(text,integer)',
  'app_private.worker_complete_push_delivery(uuid,text,integer,text)'
]);
const staging = pushRoleTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator:secret@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging:secret@staging-pooler.example/banke',
  DATABASE_PUSH_URL: 'postgres://banke_push_staging:secret@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.pushUrl.username, 'banke_push_staging');
assert.throws(() => pushRoleTargetConfig({
  BANK_ENV: 'production',
  DATABASE_MIGRATOR_URL: 'postgres://migrator:secret@production.example/neondb',
  DATABASE_API_URL: 'postgres://api:secret@production.example/neondb',
  DATABASE_PUSH_URL: 'postgres://push:secret@production.example/neondb',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
}), /BANK_ENV=staging/);
assert.throws(() => pushRoleTargetConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator:secret@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging:secret@staging-pooler.example/banke',
  DATABASE_PUSH_URL: 'postgres://banke_api_staging:secret@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
}), /separate database roles/);

for (const capability of ['NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION', 'NOBYPASSRLS']) {
  assert.match(roleScript, new RegExp(capability));
}
assert.match(roleScript, /REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private/);
assert.match(roleScript, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, app_private/);
assert.doesNotMatch(roleScript, /GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON/);

console.log('Staging Web Push migration and least-privilege role boundaries passed.');
