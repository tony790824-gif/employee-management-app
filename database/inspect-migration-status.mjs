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

async function main() {
  const config = readOnlyDatabaseConfig();
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await inspectMigrationStatus(client, await expectedTrackedMigrations());
    if (!result.transactionReadOnly) throw new Error('Database did not accept read-only transaction mode.');
    process.stdout.write(`${JSON.stringify({ environment: config.environment, ...result }, null, 2)}\n`);
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
