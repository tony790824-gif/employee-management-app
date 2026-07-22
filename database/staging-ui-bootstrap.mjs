import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const { Client } = pg;
const VERSION = '0011';
const NAME = 'ui_bootstrap';
const LOCK_NAME = 'banke-staging-ui-bootstrap-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_UI_BOOTSTRAP';
export const STAGING_TENANT_CONTEXT_KEY_ID = 'render-staging-20260722-49a11f';

const UP_FILE = new URL('./migrations/0011_ui_bootstrap.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0011_ui_bootstrap.down.sql', import.meta.url);

function stagingConfig(env = process.env) {
  const config = databaseTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0011 ui_bootstrap can only be managed with BANK_ENV=staging.');
  }
  return config;
}

async function migrationSource() {
  const [upSql, downSql] = await Promise.all([
    readFile(UP_FILE, 'utf8'),
    readFile(DOWN_FILE, 'utf8')
  ]);
  return {
    upSql,
    downSql,
    checksum: createHash('sha256').update(upSql, 'utf8').digest('hex')
  };
}

async function inspect(client, checksum) {
  const database = (await client.query('SELECT current_database() AS name')).rows[0]?.name;
  const ledger = await client.query(
    'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version'
  );
  const applied = new Map(ledger.rows.map(row => [row.version, row]));
  for (const version of ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']) {
    if (!applied.has(version)) throw new Error(`Required Staging migration ${version} is missing.`);
  }
  const current = applied.get(VERSION);
  if (current && (current.name !== NAME || current.checksum !== checksum)) {
    throw new Error('Migration 0011 ledger entry does not match the approved source checksum.');
  }
  const functionExists = (await client.query(
    "SELECT to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL AS exists"
  )).rows[0].exists;
  if (Boolean(current) !== functionExists) {
    throw new Error('Migration 0011 ledger and api_bootstrap function state are inconsistent.');
  }
  const key = (await client.query(
    `SELECT key_id, status, octet_length(secret) AS bytes,
            not_before <= clock_timestamp() AS active_now,
            expires_at > clock_timestamp() AS unexpired
       FROM app_private.tenant_context_keys
      WHERE key_id = $1`,
    [STAGING_TENANT_CONTEXT_KEY_ID]
  )).rows[0];
  if (!key || key.status !== 'active' || key.bytes < 32 || !key.active_now || !key.unexpired) {
    throw new Error('The approved synchronized Staging tenant context key is unavailable.');
  }
  return {
    database,
    applied: Boolean(current),
    functionExists,
    checksum,
    approvedKeyId: key.key_id,
    deliberatelyPendingEarlierMigrations: ['0009', '0010'].filter(version => !applied.has(version))
  };
}

async function withLock(client, callback) {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
  try {
    return await callback();
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
  }
}

export async function manageStagingUiBootstrap(client, {
  command = 'status',
  allowRollback = false
} = {}) {
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0011 rollback requires explicit confirmation.');
  }
  return withLock(client, async () => {
    const before = await inspect(client, source.checksum);
    if ((command === 'up' && before.applied) || (command === 'down' && !before.applied)) {
      return { ...before, changed: false, command };
    }
    await client.query('BEGIN');
    try {
      if (command === 'up') {
        await client.query(source.upSql);
        await client.query(
          'INSERT INTO public.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
          [VERSION, NAME, source.checksum]
        );
      } else {
        await client.query(source.downSql);
        await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [VERSION]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return { ...(await inspect(client, source.checksum)), changed: true, command };
  });
}

async function main() {
  const config = stagingConfig();
  const command = process.argv[2] || 'status';
  const allowRollback = process.env.BANK_ALLOW_STAGING_UI_BOOTSTRAP_ROLLBACK === ROLLBACK_CONFIRMATION;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingUiBootstrap(client, { command, allowRollback });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0011 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
