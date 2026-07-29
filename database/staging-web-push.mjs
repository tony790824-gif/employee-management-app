import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const { Client } = pg;
const VERSION = '0016';
const NAME = 'web_push_subscriptions';
const LOCK_NAME = 'banke-staging-web-push-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_WEB_PUSH';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015'
]);
const UP_FILE = new URL('./migrations/0016_web_push_subscriptions.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0016_web_push_subscriptions.down.sql', import.meta.url);

function stagingConfig(env = process.env) {
  const config = databaseTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0016 web_push_subscriptions can only be managed with BANK_ENV=staging.');
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
  for (const version of REQUIRED_VERSIONS) {
    if (!applied.has(version)) throw new Error(`Required Staging migration ${version} is missing.`);
  }
  const current = applied.get(VERSION);
  if (current && (current.name !== NAME || current.checksum !== checksum)) {
    throw new Error('Migration 0016 ledger entry does not match the approved source checksum.');
  }

  const objects = (await client.query(
    `SELECT
       to_regclass('public.push_subscriptions') IS NOT NULL AS subscriptions_table,
       to_regclass('public.push_deliveries') IS NOT NULL AS deliveries_table,
       to_regprocedure('app_private.api_push_status(text,text,text)') IS NOT NULL AS status_function,
       to_regprocedure(
         'app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)'
       ) IS NOT NULL AS command_function,
       to_regprocedure(
         'app_private.worker_claim_push_deliveries(text,integer)'
       ) IS NOT NULL AS claim_function,
       to_regprocedure(
         'app_private.worker_complete_push_delivery(uuid,text,integer,text)'
       ) IS NOT NULL AS complete_function,
       EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgname = 'notifications_enqueue_web_push' AND NOT tgisinternal
       ) AS enqueue_trigger`
  )).rows[0];
  const objectReady = Object.values(objects).every(Boolean);
  const rls = (await client.query(
    `SELECT count(*)::integer AS count
       FROM pg_class object
       JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'public'
        AND object.relname IN ('push_subscriptions', 'push_deliveries')
        AND object.relrowsecurity
        AND object.relforcerowsecurity`
  )).rows[0].count;
  const publicGrants = (await client.query(
    `SELECT count(*)::integer AS count
       FROM information_schema.role_table_grants
      WHERE grantee = 'PUBLIC'
        AND table_schema = 'public'
        AND table_name IN ('push_subscriptions', 'push_deliveries')`
  )).rows[0].count;
  const expectedApplied = objectReady && rls === 2 && publicGrants === 0;
  if (Boolean(current) !== expectedApplied) {
    throw new Error('Migration 0016 ledger and database objects are inconsistent.');
  }

  return {
    database,
    applied: Boolean(current),
    checksum,
    tables: objectReady ? 2 : 0,
    forcedRlsTables: rls,
    publicTableGrants: publicGrants,
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

export async function manageStagingWebPush(client, {
  command = 'status',
  allowRollback = false
} = {}) {
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0016 rollback requires explicit confirmation.');
  }

  return withLock(client, async () => {
    const before = await inspect(client, source.checksum);
    if ((command === 'up' && before.applied) || (command === 'down' && !before.applied)) {
      return { ...before, command, changed: false };
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
    return { ...(await inspect(client, source.checksum)), command, changed: true };
  });
}

async function main() {
  const config = stagingConfig();
  const command = process.argv[2] || 'status';
  const allowRollback = process.env.BANK_ALLOW_STAGING_WEB_PUSH_ROLLBACK === ROLLBACK_CONFIRMATION;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingWebPush(client, { command, allowRollback });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0016 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
