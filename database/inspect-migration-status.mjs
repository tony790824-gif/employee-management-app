import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig, loadMigrations } from './migrate.mjs';

const { Client } = pg;

function databaseName(value) {
  return decodeURIComponent(new URL(value).pathname.replace(/^\//, '')).trim();
}

function databaseUser(value) {
  return decodeURIComponent(new URL(value).username).trim();
}

const FORBIDDEN_READONLY_ROLE_NAME = /(?:^|[_-])(?:owner|admin|superuser|migrator|migration|api|runtime|push|staging)(?:$|[_-])/i;

export function readOnlyDatabaseConfig(env = process.env) {
  const environment = String(env.BANK_ENV || '').trim().toLowerCase();
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('Migration inspection is restricted to staging or production.');
  }
  const readOnlyUrl = String(env.DATABASE_READONLY_URL || '').trim();
  if (!readOnlyUrl) throw new Error('Missing DATABASE_READONLY_URL; no database connection was attempted.');
  const readOnlyUser = databaseUser(readOnlyUrl);
  if (environment === 'production') {
    const expectedRole = String(env.BANK_PRODUCTION_READONLY_ROLE || '').trim();
    if (!expectedRole) {
      throw new Error('Production inspection requires BANK_PRODUCTION_READONLY_ROLE; no database connection was attempted.');
    }
    if (FORBIDDEN_READONLY_ROLE_NAME.test(expectedRole) || FORBIDDEN_READONLY_ROLE_NAME.test(readOnlyUser)) {
      throw new Error('Production read-only inspection rejects privileged or environment-reused role names.');
    }
    if (readOnlyUser !== expectedRole) {
      throw new Error('DATABASE_READONLY_URL user must match BANK_PRODUCTION_READONLY_ROLE.');
    }
  }
  for (const name of ['DATABASE_MIGRATOR_URL', 'DATABASE_API_URL', 'DATABASE_PUSH_URL']) {
    const value = String(env[name] || '').trim();
    if (value && databaseUser(value) === readOnlyUser) {
      throw new Error(`DATABASE_READONLY_URL must not reuse ${name} credentials.`);
    }
  }
  const target = databaseTargetConfig({ ...env, DATABASE_MIGRATOR_URL: readOnlyUrl });
  if (environment === 'production' && databaseName(target.connectionString) !== 'neondb') {
    throw new Error('Production migration inspection must explicitly target neondb.');
  }
  return target;
}

function trackedMigrationFiles() {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  return new Set(execFileSync('git', ['ls-files', '--', 'database/migrations/*.up.sql'], {
    cwd: projectRoot,
    encoding: 'utf8'
  }).trim().split(/\r?\n/).filter(Boolean).map(file => path.basename(file)));
}

export async function expectedTrackedMigrations() {
  const tracked = trackedMigrationFiles();
  return (await loadMigrations()).filter(item => tracked.has(`${item.version}_${item.name}.up.sql`));
}

export async function inspectMigrationStatus(client, migrations) {
  await client.query('SET default_transaction_read_only = on');
  const identity = await client.query(
    `SELECT current_database() AS database_name,
            current_user AS role_name,
            current_setting('transaction_read_only') AS transaction_read_only,
            to_regclass('public.schema_migrations') IS NOT NULL AS ledger_exists`
  );
  const database = identity.rows[0];
  const applied = database.ledger_exists
    ? (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows
    : [];
  const appliedByVersion = new Map(applied.map(row => [String(row.version), row]));
  for (const migration of migrations) {
    const row = appliedByVersion.get(migration.version);
    if (row && (row.name !== migration.name || row.checksum !== migration.checksum)) {
      throw new Error(`Migration ${migration.version} ledger mismatch; inspection stopped.`);
    }
  }
  const expectedVersions = new Set(migrations.map(item => item.version));
  const unexpected = applied.filter(row => !expectedVersions.has(String(row.version)));
  if (unexpected.length) throw new Error('Database contains unexpected migration versions; inspection stopped.');
  return Object.freeze({
    database: database.database_name,
    role: database.role_name,
    transactionReadOnly: database.transaction_read_only === 'on',
    ledgerExists: Boolean(database.ledger_exists),
    applied: migrations.filter(item => appliedByVersion.has(item.version)).map(item => item.version),
    pending: migrations.filter(item => !appliedByVersion.has(item.version)).map(item => item.version)
  });
}

export async function inspectSchemaMetadata(client) {
  const identity = await client.query(
    `SELECT current_database() AS database_name,
            current_user AS role_name,
            current_setting('transaction_read_only') AS transaction_read_only,
            current_setting('server_version_num')::integer AS server_version_num,
            has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_schema,
            CASE WHEN to_regnamespace('app_private') IS NULL THEN false
                 ELSE has_schema_privilege(current_user, 'app_private', 'CREATE') END
              AS can_create_private_schema`
  );
  const role = await client.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
            rolcanlogin, rolinherit, rolconnlimit,
            COALESCE(rolconfig, ARRAY[]::text[]) AS role_config
       FROM pg_catalog.pg_roles
      WHERE rolname = current_user`
  );
  const tables = await client.query(
    `SELECT namespace.nspname AS schema_name,
            relation.relname AS object_name,
            relation.relrowsecurity AS rls_enabled,
            relation.relforcerowsecurity AS rls_forced
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN ('public', 'app_private')
        AND relation.relkind IN ('r', 'p')
      ORDER BY namespace.nspname, relation.relname`
  );
  const indexes = await client.query(
    `SELECT schemaname AS schema_name, tablename AS table_name, indexname AS object_name
       FROM pg_catalog.pg_indexes
      WHERE schemaname IN ('public', 'app_private')
      ORDER BY schemaname, tablename, indexname`
  );
  const constraints = await client.query(
    `SELECT namespace.nspname AS schema_name,
            relation.relname AS table_name,
            constraint_record.conname AS object_name,
            constraint_record.contype AS constraint_type
       FROM pg_catalog.pg_constraint AS constraint_record
       JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN ('public', 'app_private')
      ORDER BY namespace.nspname, relation.relname, constraint_record.conname`
  );
  const functions = await client.query(
    `SELECT namespace.nspname AS schema_name, procedure.proname AS object_name
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname IN ('public', 'app_private')
      ORDER BY namespace.nspname, procedure.proname`
  );
  const triggers = await client.query(
    `SELECT namespace.nspname AS schema_name,
            relation.relname AS table_name,
            trigger_record.tgname AS object_name
       FROM pg_catalog.pg_trigger AS trigger_record
       JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_record.tgrelid
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN ('public', 'app_private')
        AND NOT trigger_record.tgisinternal
      ORDER BY namespace.nspname, relation.relname, trigger_record.tgname`
  );
  const policies = await client.query(
    `SELECT schemaname AS schema_name, tablename AS table_name, policyname AS object_name
       FROM pg_catalog.pg_policies
      WHERE schemaname IN ('public', 'app_private')
      ORDER BY schemaname, tablename, policyname`
  );
  const capacity = await client.query(
    `SELECT current_setting('max_connections')::integer AS max_connections,
            count(*)::integer AS observed_connections
       FROM pg_catalog.pg_stat_activity`
  );
  const privileges = await client.query(
    `SELECT
       CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN false
            ELSE has_table_privilege(current_user, to_regclass('public.schema_migrations'), 'SELECT') END
         AS can_read_migration_ledger,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname IN ('public', 'app_private')
           AND relation.relkind IN ('r', 'p', 'v', 'm')
           AND NOT (namespace.nspname = 'public' AND relation.relname = 'schema_migrations')
           AND has_table_privilege(current_user, relation.oid, 'SELECT')) AS business_table_select_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname IN ('public', 'app_private')
           AND relation.relkind IN ('r', 'p', 'v', 'm')
           AND has_table_privilege(current_user, relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
         AS table_write_privilege_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname IN ('public', 'app_private')
           AND relation.relkind = 'S'
           AND has_sequence_privilege(current_user, relation.oid, 'USAGE,UPDATE')) AS sequence_write_privilege_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_proc AS procedure
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname IN ('public', 'app_private')
           AND has_function_privilege(current_user, procedure.oid, 'EXECUTE')) AS function_execute_privilege_count`
  );

  const database = identity.rows[0] || {};
  const roleAttributes = role.rows[0] || {};
  const roleConfig = Array.isArray(roleAttributes.role_config) ? roleAttributes.role_config : [];
  const roleSetting = name => roleConfig.find(item => String(item).toLowerCase().startsWith(`${name}=`)) || '';
  const privilegeSummary = privileges.rows[0] || {};
  const mapObjects = rows => rows.map(row => Object.freeze({
    schema: row.schema_name,
    name: row.object_name,
    ...(row.table_name ? { table: row.table_name } : {}),
    ...(row.constraint_type ? { type: row.constraint_type } : {})
  }));
  return Object.freeze({
    database: database.database_name,
    role: database.role_name,
    transactionReadOnly: database.transaction_read_only === 'on',
    serverVersionNumber: Number(database.server_version_num || 0),
    roleAttributes: Object.freeze({
      superuser: Boolean(roleAttributes.rolsuper),
      createDatabase: Boolean(roleAttributes.rolcreatedb),
      createRole: Boolean(roleAttributes.rolcreaterole),
      replication: Boolean(roleAttributes.rolreplication),
      bypassRls: Boolean(roleAttributes.rolbypassrls),
      login: Boolean(roleAttributes.rolcanlogin),
      inherit: Boolean(roleAttributes.rolinherit),
      connectionLimit: Number(roleAttributes.rolconnlimit ?? -1),
      defaultTransactionReadOnly: roleSetting('default_transaction_read_only').toLowerCase() === 'default_transaction_read_only=on',
      statementTimeoutConfigured: Boolean(roleSetting('statement_timeout')) && !/=(?:0|0ms|0s)$/i.test(roleSetting('statement_timeout')),
      idleTransactionTimeoutConfigured: Boolean(roleSetting('idle_in_transaction_session_timeout'))
        && !/=(?:0|0ms|0s)$/i.test(roleSetting('idle_in_transaction_session_timeout')),
      createPublicSchema: Boolean(database.can_create_public_schema),
      createPrivateSchema: Boolean(database.can_create_private_schema)
    }),
    tables: tables.rows.map(row => Object.freeze({
      schema: row.schema_name,
      name: row.object_name,
      rlsEnabled: Boolean(row.rls_enabled),
      rlsForced: Boolean(row.rls_forced)
    })),
    indexes: mapObjects(indexes.rows),
    constraints: mapObjects(constraints.rows),
    functions: mapObjects(functions.rows),
    triggers: mapObjects(triggers.rows),
    policies: mapObjects(policies.rows),
    capacity: Object.freeze({
      maxConnections: Number(capacity.rows[0]?.max_connections || 0),
      observedConnections: Number(capacity.rows[0]?.observed_connections || 0)
    }),
    privileges: Object.freeze({
      migrationLedgerSelect: Boolean(privilegeSummary.can_read_migration_ledger),
      businessTableSelectCount: Number(privilegeSummary.business_table_select_count || 0),
      tableWritePrivilegeCount: Number(privilegeSummary.table_write_privilege_count || 0),
      sequenceWritePrivilegeCount: Number(privilegeSummary.sequence_write_privilege_count || 0),
      functionExecutePrivilegeCount: Number(privilegeSummary.function_execute_privilege_count || 0)
    })
  });
}

async function main() {
  const config = readOnlyDatabaseConfig();
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await inspectMigrationStatus(client, await expectedTrackedMigrations());
    if (!result.transactionReadOnly) throw new Error('Database did not accept read-only transaction mode.');
    const metadata = await inspectSchemaMetadata(client);
    process.stdout.write(`${JSON.stringify({ environment: config.environment, ...result, metadata }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
