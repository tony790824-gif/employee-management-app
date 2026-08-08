import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectSchemaMetadata, readOnlyDatabaseConfig } from '../database/inspect-migration-status.mjs';

const provision = await readFile('database/operator/production-readonly-role.provision.sql', 'utf8');
const verify = await readFile('database/operator/production-readonly-role.verify.sql', 'utf8');
const disable = await readFile('database/operator/production-readonly-role.disable.sql', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

assert.match(provision, /PROVISION_BANKE_PRODUCTION_READONLY/);
assert.match(provision, /role\.rolsuper[\s\S]*role\.rolcreatedb[\s\S]*role\.rolcreaterole[\s\S]*role\.rolreplication[\s\S]*role\.rolbypassrls/);
assert.match(provision, /AS dangerous_attributes_are_false[\s\S]*\\if :dangerous_attributes_are_false[\s\S]*\\quit[\s\S]*\\endif/);
assert.match(provision, /membership\.admin_option[\s\S]*AS operator_has_admin_option[\s\S]*\\if :operator_has_admin_option/);
assert.match(provision, /ALTER ROLE :"readonly_role" NOINHERIT CONNECTION LIMIT 3;/);
assert.doesNotMatch(provision, /ALTER ROLE[\s\S]{0,180}\b(?:NOSUPERUSER|NOCREATEDB|NOCREATEROLE|NOREPLICATION|NOBYPASSRLS)\b/);
assert.match(provision, /default_transaction_read_only = on/);
assert.match(provision, /statement_timeout = '10s'/);
assert.match(provision, /idle_in_transaction_session_timeout = '10s'/);
assert.match(provision, /GRANT CONNECT ON DATABASE neondb/);
assert.match(provision, /GRANT USAGE ON SCHEMA public, app_private/);
assert.match(provision, /GRANT SELECT ON TABLE public\.schema_migrations/);
assert.match(provision, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app_private/);
assert.match(provision, /ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner"/);
assert.doesNotMatch(provision, /PASSWORD\s+|postgres(?:ql)?:\/\/|BEGIN (?:RSA |EC )?PRIVATE KEY/);

const firstMutation = provision.search(/^(?:ALTER|GRANT|REVOKE)\b/m);
const dangerousGuard = provision.indexOf('AS dangerous_attributes_are_false');
const membershipGuard = provision.indexOf('AS has_no_memberships');
const ownershipGuard = provision.indexOf('AS owns_no_objects');
assert.equal(provision.includes('\\set ON_ERROR_STOP on'), true);
assert.equal(dangerousGuard > 0 && dangerousGuard < firstMutation, true);
assert.equal(membershipGuard > 0 && membershipGuard < firstMutation, true);
assert.equal(ownershipGuard > 0 && ownershipGuard < firstMutation, true);

const dangerousAttributesAreFalse = role => !(
  role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls
);
assert.equal(dangerousAttributesAreFalse({
  rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false
}), true, 'A safe SQL-created Neon role may proceed to provisioning.');
for (const dangerous of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
  assert.equal(dangerousAttributesAreFalse({
    rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
    [dangerous]: true
  }), false, `A pre-existing ${dangerous} attribute must fail closed.`);
}

assert.match(verify, /SET default_transaction_read_only = on/);
assert.match(verify, /business_table_select_count/);
assert.match(verify, /table_write_privilege_count/);
assert.match(verify, /sequence_write_privilege_count/);
assert.match(verify, /function_execute_privilege_count/);
assert.doesNotMatch(verify, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)\s+(?:INTO|TABLE|SCHEMA|DATABASE|ROLE|ON|FROM|TO)\b/i);

assert.match(disable, /DISABLE_BANKE_PRODUCTION_READONLY/);
assert.match(disable, /ALTER ROLE :"readonly_role" NOLOGIN/);
assert.match(disable, /REVOKE CONNECT ON DATABASE neondb/);
assert.doesNotMatch(disable, /DROP ROLE|DROP OWNED|PASSWORD\s+|postgres(?:ql)?:\/\//);

for (const script of ['db:status:readonly', 'auth:readiness:production', 'production:platform:validate', 'production:evidence:collect']) {
  assert.doesNotMatch(packageJson.scripts[script], /--env-file(?:-if-exists)?=\.env\.production/);
}

const base = {
  BANK_ENV: 'production',
  BANK_PRODUCTION_DATABASE_HOST: 'prod.example',
  DATABASE_SSL: 'require'
};
assert.throws(() => readOnlyDatabaseConfig({
  ...base, DATABASE_READONLY_URL: 'postgres://reader@prod.example/neondb'
}), /BANK_PRODUCTION_READONLY_ROLE/);
assert.throws(() => readOnlyDatabaseConfig({
  ...base, BANK_PRODUCTION_READONLY_ROLE: 'banke_owner_production',
  DATABASE_READONLY_URL: 'postgres://banke_owner_production@prod.example/neondb'
}), /rejects privileged/);
assert.throws(() => readOnlyDatabaseConfig({
  ...base, BANK_PRODUCTION_READONLY_ROLE: 'banke_evidence_reader',
  DATABASE_READONLY_URL: 'postgres://different_reader@prod.example/neondb'
}), /must match/);
assert.equal(readOnlyDatabaseConfig({
  ...base, BANK_PRODUCTION_READONLY_ROLE: 'banke_evidence_reader',
  DATABASE_READONLY_URL: 'postgres://banke_evidence_reader@prod.example/neondb'
}).environment, 'production');

const sql = [];
const metadata = await inspectSchemaMetadata({
  async query(statement) {
    sql.push(statement.trim());
    if (statement.includes('current_database')) return { rows: [{
      database_name: 'neondb', role_name: 'banke_evidence_reader', transaction_read_only: 'on',
      server_version_num: 180000, can_create_public_schema: false, can_create_private_schema: false
    }] };
    if (statement.includes('pg_catalog.pg_roles')) return { rows: [{
      rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
      rolcanlogin: true, rolinherit: false, rolconnlimit: 3,
      role_config: ['default_transaction_read_only=on', 'statement_timeout=10s', 'idle_in_transaction_session_timeout=10s']
    }] };
    if (statement.includes('pg_catalog.pg_class AS relation') && statement.includes('relrowsecurity')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_indexes')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_constraint')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_proc AS procedure') && statement.includes('ORDER BY')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_trigger')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_policies')) return { rows: [] };
    if (statement.includes('pg_catalog.pg_stat_activity')) return { rows: [{ max_connections: 100, observed_connections: 2 }] };
    if (statement.includes('can_read_migration_ledger')) return { rows: [{
      can_read_migration_ledger: true, business_table_select_count: 0, table_write_privilege_count: 0,
      sequence_write_privilege_count: 0, function_execute_privilege_count: 0
    }] };
    throw new Error('Unexpected metadata query.');
  }
});
assert.equal(metadata.roleAttributes.defaultTransactionReadOnly, true);
assert.equal(metadata.roleAttributes.statementTimeoutConfigured, true);
assert.equal(metadata.roleAttributes.inherit, false);
assert.equal(metadata.privileges.migrationLedgerSelect, true);
assert.equal(metadata.privileges.businessTableSelectCount, 0);
assert.equal(sql.every(statement => statement.startsWith('SELECT')), true);

console.log('Production read-only provisioning, process-environment, role-isolation and no-write tests passed.');
