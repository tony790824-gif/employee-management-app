import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectSchemaMetadata, readOnlyDatabaseConfig } from '../database/inspect-migration-status.mjs';

const provision = await readFile('database/operator/production-readonly-role.provision.sql', 'utf8');
const verify = await readFile('database/operator/production-readonly-role.verify.sql', 'utf8');
const disable = await readFile('database/operator/production-readonly-role.disable.sql', 'utf8');
const functionOwnerDiagnostic = await readFile('database/operator/production-function-owner.diagnostic.sql', 'utf8');
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
assert.match(provision, /runtime_role=<existing Bankeban Production API login role>/);
assert.match(provision, /AS runtime_role_is_safe[\s\S]*\\if :runtime_role_is_safe[\s\S]*\\quit/);
assert.match(provision, /:'runtime_role' = 'banke_api_production'[\s\S]*role\.rolname = current_user[\s\S]*AS approved_roles_are_exact/);
assert.match(provision, /AS runtime_has_explicit_allowlist[\s\S]*\\if :runtime_has_explicit_allowlist[\s\S]*PUBLIC EXECUTE was not changed/);
assert.match(provision, /AS runtime_has_no_unapproved_function_grant[\s\S]*\\if :runtime_has_no_unapproved_function_grant/);
assert.match(provision, /AS public_functions_are_owned_by_object_owner[\s\S]*\\if :public_functions_are_owned_by_object_owner[\s\S]*PUBLIC EXECUTE was not changed/);
assert.match(provision, /'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'[\s\S]*has_function_privilege\('public', procedure\.oid, 'EXECUTE'\)[\s\S]*\\gexec/);
assert.match(provision, /ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner"\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
assert.doesNotMatch(provision, /ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA [^\n]+\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
assert.match(provision, /AS readonly_function_execute_is_zero[\s\S]*rolling back all provisioning changes/);
assert.match(provision, /AS runtime_function_allowlist_preserved[\s\S]*rolling back all provisioning changes/);
assert.match(provision, /BEGIN;[\s\S]*'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'[\s\S]*COMMIT;/);
assert.doesNotMatch(provision, /PASSWORD\s+|postgres(?:ql)?:\/\/|BEGIN (?:RSA |EC )?PRIVATE KEY/);

const firstMutation = provision.search(/^(?:ALTER|GRANT|REVOKE)\b/m);
const dangerousGuard = provision.indexOf('AS dangerous_attributes_are_false');
const membershipGuard = provision.indexOf('AS has_no_memberships');
const ownershipGuard = provision.indexOf('AS owns_no_objects');
const runtimeGuard = provision.indexOf('AS runtime_has_explicit_allowlist');
const exactRoleGuard = provision.indexOf('AS approved_roles_are_exact');
const publicOwnerGuard = provision.indexOf('AS public_functions_are_owned_by_object_owner');
const publicRevoke = provision.indexOf("'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'");
assert.equal(provision.includes('\\set ON_ERROR_STOP on'), true);
assert.equal(dangerousGuard > 0 && dangerousGuard < firstMutation, true);
assert.equal(membershipGuard > 0 && membershipGuard < firstMutation, true);
assert.equal(ownershipGuard > 0 && ownershipGuard < firstMutation, true);
assert.equal(runtimeGuard > ownershipGuard && runtimeGuard < firstMutation, true);
assert.equal(exactRoleGuard > ownershipGuard && exactRoleGuard < runtimeGuard, true);
assert.equal(publicOwnerGuard > runtimeGuard && publicOwnerGuard < firstMutation, true);
assert.equal(publicRevoke > firstMutation, true);

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

// PostgreSQL ACLs are additive: a direct REVOKE cannot negate EXECUTE granted
// through PUBLIC. The safe equivalent removes PUBLIC and retains the runtime's
// already-reviewed explicit allowlist.
const canExecute = ({ direct = false, viaPublic = false, viaMembership = false }) => (
  direct || viaPublic || viaMembership
);
assert.equal(canExecute({ direct: false, viaPublic: true }), true,
  'A direct read-only-role REVOKE must still reproduce PUBLIC EXECUTE inheritance.');
assert.equal(canExecute({ direct: false, viaPublic: false }), false,
  'The evidence role reaches zero only after PUBLIC EXECUTE is removed.');
assert.equal(canExecute({ direct: true, viaPublic: false }), true,
  'The Production runtime explicit allowlist must survive PUBLIC revocation.');
assert.equal(canExecute({ direct: false, viaPublic: false, viaMembership: false }), false,
  'A membership-free evidence role must have no equivalent EXECUTE path.');

assert.match(verify, /SET default_transaction_read_only = on/);
assert.match(verify, /business_table_select_count/);
assert.match(verify, /table_write_privilege_count/);
assert.match(verify, /sequence_write_privilege_count/);
assert.match(verify, /function_execute_privilege_count/);
assert.match(verify, /public_function_execute_privilege_count/);
assert.match(verify, /direct_function_execute_grant_count/);
assert.doesNotMatch(verify, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)\s+(?:INTO|TABLE|SCHEMA|DATABASE|ROLE|ON|FROM|TO)\b/i);

assert.match(disable, /DISABLE_BANKE_PRODUCTION_READONLY/);
assert.match(disable, /ALTER ROLE :"readonly_role" NOLOGIN/);
assert.match(disable, /REVOKE CONNECT ON DATABASE neondb/);
assert.doesNotMatch(disable, /DROP ROLE|DROP OWNED|PASSWORD\s+|postgres(?:ql)?:\/\//);

assert.match(functionOwnerDiagnostic, /MANUAL READ-ONLY DIAGNOSTIC ONLY/);
assert.equal((functionOwnerDiagnostic.match(/DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER/g) || []).length, 2,
  'The documented and enforced confirmation token must remain identical.');
assert.doesNotMatch(functionOwnerDiagnostic, /DIAGNOSE_BANKE_PRODUCTION_FUNCTION_ACL/);
assert.match(functionOwnerDiagnostic, /current_database\(\) = 'neondb'/);
assert.match(functionOwnerDiagnostic, /current_user = :'readonly_role' AS current_user_ok/);
assert.match(functionOwnerDiagnostic, /session_user = :'readonly_role' AS session_user_ok/);
assert.match(functionOwnerDiagnostic, /current_user is not the approved read-only role/);
assert.match(functionOwnerDiagnostic, /session_user is not the approved read-only login role/);
assert.match(functionOwnerDiagnostic, /SET default_transaction_read_only = on/);
assert.match(functionOwnerDiagnostic, /BEGIN TRANSACTION READ ONLY/);
assert.match(functionOwnerDiagnostic, /pg_get_function_identity_arguments/);
assert.match(functionOwnerDiagnostic, /pg_get_userbyid/);
assert.match(functionOwnerDiagnostic, /AS routine_kind/);
assert.match(functionOwnerDiagnostic, /public_execute/);
assert.match(functionOwnerDiagnostic, /runtime_execute/);
assert.match(functionOwnerDiagnostic, /runtime_explicit_execute/);
assert.match(functionOwnerDiagnostic, /owner_matches_object_owner/);
assert.match(functionOwnerDiagnostic, /pg_catalog\.pg_extension/);
assert.doesNotMatch(functionOwnerDiagnostic, /pg_get_functiondef|\bprosrc\b|PASSWORD\s+|postgres(?:ql)?:\/\/|BEGIN (?:RSA |EC )?PRIVATE KEY/);
assert.doesNotMatch(
  functionOwnerDiagnostic,
  /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)\s+(?:INTO|TABLE|SCHEMA|DATABASE|ROLE|ON|FROM|TO)\b/i
);

const expectedProductionFunctions = [
  'app_private.current_workspace_id()',
  'app_private.current_user_id()',
  'app_private.current_role()',
  'app_private.touch_updated_at()',
  'app_private.base64url_decode(text)',
  'app_private.raise_auth_error(text)',
  'app_private.verify_tenant_context(text,text,text,text,boolean)',
  'app_private.api_establish_session(text,text,text)',
  'app_private.api_logout_session(text,text,text)',
  'app_private.api_list_employees(text,text,text)',
  'app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'
];
for (const signature of expectedProductionFunctions) {
  assert.equal(functionOwnerDiagnostic.includes(`'${signature}'`), true,
    `The read-only diagnostic must classify ${signature}.`);
}
assert.equal((functionOwnerDiagnostic.match(/, true\)/g) || []).length, 4,
  'Exactly four Production API entry points must be classified for explicit runtime EXECUTE.');

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
