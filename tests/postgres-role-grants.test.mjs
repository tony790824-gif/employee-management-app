import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { API_FUNCTIONS, apiRoleGrantConfig } from '../database/apply-role-grants.mjs';
import { databaseTargetConfig } from '../database/migrate.mjs';

const productionBase = {
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/neondb',
  DATABASE_API_URL: 'postgres://banke_api_production:secret@production-pooler.example/neondb',
  DATABASE_SSL: 'require'
};

assert.equal(databaseTargetConfig(productionBase).environment, 'production');
assert.throws(() => apiRoleGrantConfig(productionBase), /explicit confirmation/);
const production = apiRoleGrantConfig({
  ...productionBase,
  BANK_ALLOW_PRODUCTION_ROLE_GRANTS: 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS'
});
assert.equal(production.environment, 'production');
assert.equal(production.apiUrl.username, 'banke_api_production');
assert.throws(() => apiRoleGrantConfig({
  ...productionBase,
  BANK_ALLOW_PRODUCTION_ROLE_GRANTS: 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS',
  DATABASE_API_URL: 'postgres://other_api:secret@production-pooler.example/neondb'
}), /banke_api_production/);
assert.throws(() => apiRoleGrantConfig({
  ...productionBase,
  BANK_ALLOW_PRODUCTION_ROLE_GRANTS: 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS',
  DATABASE_API_URL: 'postgres://banke_api_production:secret@other-pooler.example/neondb'
}), /same approved database/);
assert.throws(() => apiRoleGrantConfig({
  ...productionBase,
  BANK_ALLOW_PRODUCTION_ROLE_GRANTS: 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS',
  DATABASE_API_URL: 'postgres://migrator:secret@production-pooler.example/neondb'
}), /separate database roles/);
assert.throws(() => apiRoleGrantConfig({
  ...productionBase,
  BANK_ALLOW_PRODUCTION_ROLE_GRANTS: 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@production.example/other',
  DATABASE_API_URL: 'postgres://banke_api_production:secret@production-pooler.example/other'
}), /explicitly target neondb/);

const staging = apiRoleGrantConfig({
  BANK_ENV: 'staging',
  BANK_STAGING_DATABASE_HOST: 'staging.example',
  DATABASE_MIGRATOR_URL: 'postgres://migrator@staging.example/banke',
  DATABASE_API_URL: 'postgres://banke_api_staging:secret@staging-pooler.example/banke',
  DATABASE_SSL: 'require'
});
assert.equal(staging.environment, 'staging');

assert.deepEqual(API_FUNCTIONS, [
  'app_private.api_establish_session(text,text,text)',
  'app_private.api_logout_session(text,text,text)',
  'app_private.api_list_employees(text,text,text)',
  'app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'
]);

const source = await readFile(new URL('../database/apply-role-grants.mjs', import.meta.url), 'utf8');
for (const capability of ['NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION', 'NOBYPASSRLS']) {
  assert.match(source, new RegExp(capability));
}
assert.match(source, /REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private/);
assert.match(source, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC/);
assert.doesNotMatch(source, /GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON/);
assert.doesNotMatch(source, /REVOKE CONNECT ON DATABASE %I FROM PUBLIC/,
  'Role provisioning must not modify Neon platform maintenance-database ACLs.');

console.log('PostgreSQL Production API role grant gates passed');
