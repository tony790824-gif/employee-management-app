import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { API_FUNCTIONS, apiRoleTargetConfig } from './apply-role-grants.mjs';

const { Client } = pg;
const FORBIDDEN_CODE = '42501';

async function expectPrivilegeDenied(client, sql) {
  await client.query('BEGIN');
  let denied = false;
  try {
    await client.query(sql);
  } catch (error) {
    denied = error.code === FORBIDDEN_CODE;
  } finally {
    await client.query('ROLLBACK');
  }
  assert.equal(denied, true, `Expected privilege denial for: ${sql.split(/\s+/).slice(0, 4).join(' ')}`);
}

async function expectRejected(client, sql) {
  await client.query('BEGIN');
  let rejected = false;
  try {
    await client.query(sql);
  } catch {
    rejected = true;
  } finally {
    await client.query('ROLLBACK');
  }
  assert.equal(rejected, true, `Expected rejection for: ${sql.split(/\s+/).slice(0, 5).join(' ')}`);
}

async function businessRowCount(client) {
  const tables = await client.query(
    `SELECT format('%I.%I', schemaname, tablename) AS table_name
       FROM pg_tables
      WHERE schemaname IN ('public', 'app_private')
        AND tablename <> 'schema_migrations'
      ORDER BY schemaname, tablename`
  );
  let count = 0;
  for (const row of tables.rows) {
    const result = await client.query(`SELECT count(*)::integer AS count FROM ${row.table_name}`);
    count += result.rows[0].count;
  }
  return count;
}

export async function verifyApiRoleGrants({ migrator, api, role }) {
  const beforeRows = await businessRowCount(migrator);
  const attributes = (await migrator.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
            rolreplication, rolbypassrls, rolconnlimit
       FROM pg_roles WHERE rolname = $1`, [role]
  )).rows[0];
  assert.deepEqual(attributes, {
    rolname: role,
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: true,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: 20
  });

  const database = (await migrator.query('SELECT current_database() AS name')).rows[0].name;
  assert.equal(database, 'neondb', 'Production privilege verification must target neondb.');
  const databasePrivileges = (await migrator.query(
    `SELECT has_database_privilege($1, $2, 'CONNECT') AS connect,
            has_database_privilege($1, $2, 'CREATE') AS create`, [role, database]
  )).rows[0];
  assert.deepEqual(databasePrivileges, { connect: true, create: false });
  const connectableDatabases = await migrator.query(
    `SELECT datname, pg_get_userbyid(datdba) AS owner, coalesce(datacl::text, 'DEFAULT') AS acl
       FROM pg_database
      WHERE datallowconn
        AND NOT datistemplate
        AND has_database_privilege($1, datname, 'CONNECT')
      ORDER BY datname`, [role]
  );
  const acceptedPlatformDatabases = new Set([database, 'postgres']);
  const unexpectedConnectable = connectableDatabases.rows.filter(row => !acceptedPlatformDatabases.has(row.datname));
  assert.deepEqual(unexpectedConnectable, [],
    'API role must not connect to any unexpected database.');
  const postgresTemporary = (await migrator.query(
    `SELECT has_database_privilege($1, 'postgres', 'TEMPORARY') AS temporary`, [role]
  )).rows[0].temporary;

  const schemaPrivileges = (await migrator.query(
    `SELECT has_schema_privilege($1, 'app_private', 'USAGE') AS private_usage,
            has_schema_privilege($1, 'app_private', 'CREATE') AS private_create,
            has_schema_privilege($1, 'public', 'CREATE') AS public_create`, [role]
  )).rows[0];
  assert.deepEqual(schemaPrivileges, { private_usage: true, private_create: false, public_create: false });

  const directTablePrivileges = await migrator.query(
    `SELECT table_schema, table_name, privilege_type
       FROM information_schema.role_table_grants
      WHERE grantee = $1 AND table_schema IN ('public', 'app_private')`, [role]
  );
  assert.equal(directTablePrivileges.rowCount, 0);
  const effectiveTablePrivileges = await migrator.query(
    `SELECT format('%I.%I', namespace.nspname, object.relname) AS object_name
       FROM pg_class object
       JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname IN ('public', 'app_private')
        AND object.relkind IN ('r', 'p', 'v', 'm', 'S')
        AND (
          CASE WHEN object.relkind = 'S'
            THEN has_sequence_privilege($1, object.oid, 'USAGE,SELECT,UPDATE')
            ELSE has_table_privilege($1, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          END
        )`, [role]
  );
  assert.equal(effectiveTablePrivileges.rowCount, 0, 'API role must have zero effective table/sequence privileges.');

  const membership = await migrator.query(
    `SELECT 1 FROM pg_auth_members membership
      JOIN pg_roles member_role ON member_role.oid = membership.member
     WHERE member_role.rolname = $1`, [role]
  );
  assert.equal(membership.rowCount, 0);
  const neonSuperuserMembership = await migrator.query(
    `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles member_role ON member_role.oid = membership.member
       JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      WHERE member_role.rolname = $1 AND granted_role.rolname = 'neon_superuser'`, [role]
  );
  assert.equal(neonSuperuserMembership.rowCount, 0, 'API role must not belong to neon_superuser.');

  const ownership = await migrator.query(
    `SELECT 1 FROM pg_namespace namespace JOIN pg_roles owner ON owner.oid = namespace.nspowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_class object JOIN pg_roles owner ON owner.oid = object.relowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_proc function JOIN pg_roles owner ON owner.oid = function.proowner WHERE owner.rolname = $1`, [role]
  );
  assert.equal(ownership.rowCount, 0);

  const functionPrivileges = await migrator.query(
    `SELECT procedure.oid::regprocedure::text AS signature,
            has_function_privilege($1, procedure.oid, 'EXECUTE') AS can_execute
       FROM pg_proc procedure
       JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'app_private'
      ORDER BY signature`, [role]
  );
  const executable = functionPrivileges.rows.filter(row => row.can_execute).map(row => row.signature);
  assert.deepEqual(executable.sort(), [...API_FUNCTIONS].sort());

  await expectPrivilegeDenied(api, 'SELECT 1 FROM public.workspaces LIMIT 1');
  await expectPrivilegeDenied(api, 'SELECT 1 FROM app_private.auth_sessions LIMIT 1');
  await expectPrivilegeDenied(api, 'CREATE SCHEMA banke_api_privilege_probe');
  await expectPrivilegeDenied(api, 'CREATE TABLE public.banke_api_privilege_probe(id integer)');
  await expectPrivilegeDenied(api, 'CREATE ROLE banke_api_privilege_probe');
  await expectPrivilegeDenied(api, 'CREATE EXTENSION postgres_fdw');
  await expectPrivilegeDenied(api, 'ALTER TABLE public.workspaces DISABLE ROW LEVEL SECURITY');
  await expectRejected(api, 'CREATE SERVER banke_api_privilege_probe FOREIGN DATA WRAPPER postgres_fdw');
  await expectRejected(api, 'CREATE USER MAPPING FOR CURRENT_USER SERVER banke_api_privilege_probe');

  const crossDatabaseObjects = await migrator.query(
    `SELECT 1 FROM pg_foreign_server server JOIN pg_roles owner ON owner.oid = server.srvowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_user_mapping mapping WHERE mapping.umuser = (SELECT oid FROM pg_roles WHERE rolname = $1)`, [role]
  );
  assert.equal(crossDatabaseObjects.rowCount, 0, 'API role must own no foreign server or user mapping.');
  const crossDatabaseExtensions = await migrator.query(
    `SELECT extension.extname,
            CASE extension.extname
              WHEN 'dblink' THEN has_function_privilege($1, 'public.dblink_connect(text)', 'EXECUTE')
              ELSE false
            END AS executable
       FROM pg_extension extension
      WHERE extension.extname IN ('dblink', 'postgres_fdw')`, [role]
  );
  assert.equal(crossDatabaseExtensions.rows.some(row => row.executable), false,
    'API role must not execute a cross-database connection function.');

  await api.query("SELECT set_config('app.current_workspace_id', 'ws_ffffffffffffffffffffffffffffffff', false)");
  await expectPrivilegeDenied(api, 'SELECT 1 FROM public.employees LIMIT 1');

  let controlledFunctionRejectedContext = false;
  try {
    await api.query("SELECT app_private.api_list_employees('invalid', 'invalid', 'invalid')");
  } catch (error) {
    assert.notEqual(error.code, FORBIDDEN_CODE, 'The allowlisted function must be executable by the API role.');
    controlledFunctionRejectedContext = true;
  }
  assert.equal(controlledFunctionRejectedContext, true, 'Invalid session/workspace context must fail closed.');

  const afterRows = await businessRowCount(migrator);
  assert.equal(afterRows, beforeRows, 'Privilege verification must not write business data.');
  return {
    role,
    grantedFunctions: executable.length,
    directTablePrivileges: directTablePrivileges.rowCount,
    effectiveTablePrivileges: effectiveTablePrivileges.rowCount,
    connectableDatabases: connectableDatabases.rowCount,
    postgresTemporary,
    businessRowsBefore: beforeRows,
    businessRowsAfter: afterRows,
    privilegeBoundary: 'passed'
  };
}

async function main() {
  const config = apiRoleTargetConfig();
  const apiUrl = new URL(config.apiUrl.href);
  apiUrl.searchParams.delete('sslmode');
  apiUrl.searchParams.delete('uselibpqcompat');
  const migrator = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  const api = new Client({ connectionString: apiUrl.href, ssl: config.ssl });
  const postgresUrl = new URL(apiUrl.href);
  postgresUrl.pathname = '/postgres';
  const postgres = new Client({ connectionString: postgresUrl.href, ssl: config.ssl });
  await migrator.connect();
  await api.connect();
  await postgres.connect();
  try {
    assert.equal((await api.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
    assert.equal((await migrator.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
    assert.equal((await postgres.query('SELECT current_database() AS name')).rows[0].name, 'postgres');
    assert.equal((await api.query('SELECT current_user AS name')).rows[0].name, config.apiUrl.username);
    assert.equal((await postgres.query('SELECT current_user AS name')).rows[0].name, config.apiUrl.username);
    assert.notEqual(config.apiUrl.username, config.migratorUrl.username);
    const stagingRole = await migrator.query("SELECT 1 FROM pg_roles WHERE rolname = 'banke_api_staging'");
    assert.equal(stagingRole.rowCount, 0, 'Staging API role must not exist in Production.');
    const result = await verifyApiRoleGrants({ migrator, api, role: config.apiUrl.username });
    const postgresPrivateSchema = await postgres.query("SELECT to_regnamespace('app_private') AS schema");
    assert.equal(postgresPrivateSchema.rows[0].schema, null,
      'The maintenance database must not expose the neondb private schema.');
    await expectRejected(postgres, 'SELECT 1 FROM neondb.public.workspaces LIMIT 1');
    await expectPrivilegeDenied(postgres, 'CREATE SCHEMA banke_api_privilege_probe');
    await expectPrivilegeDenied(postgres, 'CREATE TABLE public.banke_api_privilege_probe(id integer)');
    await expectPrivilegeDenied(postgres, 'CREATE ROLE banke_api_privilege_probe');
    await expectPrivilegeDenied(postgres, 'CREATE EXTENSION dblink');
    await expectPrivilegeDenied(postgres, 'CREATE EXTENSION postgres_fdw');
    await expectRejected(postgres, 'CREATE SERVER banke_api_privilege_probe FOREIGN DATA WRAPPER postgres_fdw');
    await expectRejected(postgres, 'CREATE USER MAPPING FOR CURRENT_USER SERVER banke_api_privilege_probe');
    await postgres.query('BEGIN');
    try {
      await postgres.query(`GRANT CREATE ON DATABASE neondb TO ${config.apiUrl.username}`);
      const privilegeAfterGrantAttempt = await postgres.query(
        `SELECT has_database_privilege(current_user, 'neondb', 'CREATE') AS allowed`
      );
      assert.equal(privilegeAfterGrantAttempt.rows[0].allowed, false,
        'A no-op GRANT attempt must not give the API role additional neondb privileges.');
    } finally {
      await postgres.query('ROLLBACK');
    }
    process.stdout.write(`${JSON.stringify({ environment: config.environment, ...result })}\n`);
  } finally {
    await postgres.end();
    await api.end();
    await migrator.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
