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

export function readOnlyDatabaseConfig(env = process.env) {
  const environment = String(env.BANK_ENV || '').trim().toLowerCase();
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('Migration inspection is restricted to staging or production.');
  }
  const readOnlyUrl = String(env.DATABASE_READONLY_URL || '').trim();
  if (!readOnlyUrl) throw new Error('Missing DATABASE_READONLY_URL; no database connection was attempted.');
  const readOnlyUser = new URL(readOnlyUrl).username;
  for (const name of ['DATABASE_MIGRATOR_URL', 'DATABASE_API_URL', 'DATABASE_PUSH_URL']) {
    const value = String(env[name] || '').trim();
    if (value && new URL(value).username === readOnlyUser) {
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
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
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
    `SELECT routine_schema AS schema_name, routine_name AS object_name
       FROM information_schema.routines
      WHERE routine_schema IN ('public', 'app_private')
      ORDER BY routine_schema, routine_name`
  );
  const triggers = await client.query(
    `SELECT trigger_schema AS schema_name,
            event_object_table AS table_name,
            trigger_name AS object_name
       FROM information_schema.triggers
      WHERE trigger_schema IN ('public', 'app_private')
      ORDER BY trigger_schema, event_object_table, trigger_name`
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

  const database = identity.rows[0] || {};
  const roleAttributes = role.rows[0] || {};
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
