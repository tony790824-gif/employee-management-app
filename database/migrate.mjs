import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const MIGRATION_DIR = new URL('./migrations/', import.meta.url);
const LOCK_NAME = 'banke-schema-migrations-v1';
const PRODUCTION_CONFIRMATION = 'APPLY_BANKE_PRODUCTION_MIGRATIONS';
const DESTRUCTIVE_CONFIRMATION = 'ALLOW_BANKE_DESTRUCTIVE_ROLLBACK';

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

function requiredExpectedHost(environment, env) {
  const variable = environment === 'staging'
    ? 'BANK_STAGING_DATABASE_HOST'
    : environment === 'production'
      ? 'BANK_PRODUCTION_DATABASE_HOST'
      : '';
  if (!variable) return '';
  const expectedHost = String(env[variable] || '').trim();
  if (!expectedHost) throw new Error(`${environment} PostgreSQL requires ${variable}.`);
  return expectedHost;
}

export function databaseTargetConfig(env = process.env) {
  const environment = String(env.BANK_ENV || 'local').toLowerCase();
  if (!['local', 'staging', 'production'].includes(environment)) {
    throw new Error('BANK_ENV 必須是 local、staging 或 production。');
  }
  const connectionString = String(env.DATABASE_MIGRATOR_URL || env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('缺少 DATABASE_MIGRATOR_URL，未執行任何 Migration。');
  const sslMode = String(env.DATABASE_SSL || (environment === 'local' ? 'disable' : 'require')).toLowerCase();
  if (!['disable', 'require'].includes(sslMode)) throw new Error('DATABASE_SSL 只能是 disable 或 require。');
  if (environment === 'production' && sslMode !== 'require') throw new Error('Production PostgreSQL 必須啟用 TLS。');
  const hostname = new URL(connectionString).hostname;
  if (environment !== 'local' && hostname.includes('-pooler.')) {
    throw new Error('Staging/Production Migration 必須使用 direct PostgreSQL endpoint，不可使用 pooler。');
  }
  if (environment !== 'local') {
    const expectedHost = requiredExpectedHost(environment, env);
    if (normalizedHost(hostname) !== normalizedHost(expectedHost)) {
      const environmentLabel = environment === 'staging' ? 'Staging' : 'Production';
      throw new Error(`DATABASE_MIGRATOR_URL does not match the approved ${environmentLabel} PostgreSQL host.`);
    }
  }
  const verifiedConnectionUrl = new URL(connectionString);
  verifiedConnectionUrl.searchParams.delete('sslmode');
  verifiedConnectionUrl.searchParams.delete('uselibpqcompat');
  return {
    environment,
    connectionString: verifiedConnectionUrl.href,
    ssl: sslMode === 'require' ? { rejectUnauthorized: true } : false
  };
}

export function databaseConfig(env = process.env) {
  const environment = String(env.BANK_ENV || 'local').toLowerCase();
  if (environment === 'production' && env.BANK_ALLOW_PRODUCTION_MIGRATIONS !== PRODUCTION_CONFIRMATION) {
    throw new Error('Production Migration 未取得明確確認，已停止。');
  }
  return databaseTargetConfig(env);
}

export async function loadMigrations() {
  const files = await readdir(MIGRATION_DIR);
  const upFiles = files.filter(name => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(name)).sort();
  return Promise.all(upFiles.map(async file => {
    const version = file.slice(0, 4);
    const downFile = file.replace('.up.sql', '.down.sql');
    if (!files.includes(downFile)) throw new Error(`Migration ${file} 缺少 ${downFile}`);
    const [upSql, downSql] = await Promise.all([
      readFile(new URL(file, MIGRATION_DIR), 'utf8'),
      readFile(new URL(downFile, MIGRATION_DIR), 'utf8')
    ]);
    return {
      version,
      name: file.slice(5, -7),
      upSql,
      downSql,
      checksum: createHash('sha256').update(upSql, 'utf8').digest('hex')
    };
  }));
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

async function appliedMigrations(client) {
  const result = await client.query('SELECT version, name, checksum, applied_at FROM public.schema_migrations ORDER BY version');
  return result.rows;
}

export async function migrate(client, { command = 'up', target = null, allowDestructive = false } = {}) {
  const migrations = await loadMigrations();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
  try {
    await ensureLedger(client);
    const applied = await appliedMigrations(client);
    const appliedByVersion = new Map(applied.map(row => [row.version, row]));
    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version);
      if (existing && existing.checksum !== migration.checksum) {
        throw new Error(`Migration ${migration.version} checksum 不一致，禁止覆寫已套用歷史。`);
      }
    }
    if (command === 'status') {
      return migrations.map(item => ({
        version: item.version,
        name: item.name,
        status: appliedByVersion.has(item.version) ? 'applied' : 'pending'
      }));
    }
    if (command === 'up') {
      const completed = [];
      for (const migration of migrations) {
        if (appliedByVersion.has(migration.version)) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.upSql);
          await client.query(
            'INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
            [migration.version, migration.name, migration.checksum]
          );
          await client.query('COMMIT');
          completed.push(migration.version);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      return completed;
    }
    if (command === 'down') {
      if (!allowDestructive) throw new Error('Rollback 需要明確的 destructive confirmation。');
      const targetVersion = target || '0000';
      const completed = [];
      for (const migration of [...migrations].reverse()) {
        if (!appliedByVersion.has(migration.version) || migration.version <= targetVersion) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.downSql);
          await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [migration.version]);
          await client.query('COMMIT');
          completed.push(migration.version);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      return completed;
    }
    throw new Error(`不支援的 Migration 指令：${command}`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
  }
}

function parseArguments(argv) {
  const command = argv[2] || 'status';
  const targetArg = argv.find(value => value.startsWith('--to='));
  return { command, target: targetArg ? targetArg.slice(5) : null };
}

async function main() {
  const config = databaseConfig();
  const args = parseArguments(process.argv);
  if (args.command === 'down' && config.environment === 'production') {
    throw new Error('Production 禁止自動 Down Migration；請使用經審核的 forward fix。');
  }
  const allowDestructive = process.env.BANK_ALLOW_DESTRUCTIVE_MIGRATIONS === DESTRUCTIVE_CONFIRMATION;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await migrate(client, { ...args, allowDestructive });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command: args.command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(`${error.message}${error.position ? ` (SQL position ${error.position})` : ''}`);
    process.exitCode = 1;
  });
}
