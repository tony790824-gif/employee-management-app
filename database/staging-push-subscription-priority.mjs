import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { apiRoleTargetConfig } from './apply-role-grants.mjs';

const { Client } = pg;
const VERSION = '0020';
const NAME = 'push_subscription_priority';
const LOCK_NAME = 'banke-staging-push-subscription-priority-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_PUSH_SUBSCRIPTION_PRIORITY';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019'
]);
const UP_FILE = new URL('./migrations/0020_push_subscription_priority.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0020_push_subscription_priority.down.sql', import.meta.url);
const PUSH_COMMAND_FUNCTION =
  'app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)';

export function pushSubscriptionPriorityTargetConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0020 push_subscription_priority can only be managed with BANK_ENV=staging.');
  }
  return { ...config, apiRole: decodeURIComponent(config.apiUrl.username) };
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

async function inspect(client, checksum, apiRole) {
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
    throw new Error('Migration 0020 ledger entry does not match the approved source checksum.');
  }

  const audit = (await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'push_subscriptions'
            AND column_name = 'client_mode'
       ) AS client_mode_column,
       to_regclass('public.push_subscriptions_recipient_mode_active_idx') IS NOT NULL AS priority_index,
       position('eligible AS MATERIALIZED' IN enqueue.prosrc) > 0 AS priority_function,
       position('client_mode = ''pwa''' IN enqueue.prosrc) > 0 AS pwa_preference,
       position('coalesce(command_input->>''clientMode'', ''browser'')' IN command.prosrc) > 0 AS command_metadata,
       enqueue.prosecdef AS enqueue_security_definer,
       command.prosecdef AS command_security_definer,
       NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(enqueue.proacl, acldefault('f', enqueue.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS enqueue_public_denied,
       NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(command.proacl, acldefault('f', command.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS command_public_denied,
       has_function_privilege($1, command.oid, 'EXECUTE') AS api_command_execute,
       NOT has_table_privilege($1, 'public.push_subscriptions', 'SELECT') AS api_table_select_denied
      FROM pg_proc enqueue
      JOIN pg_namespace enqueue_namespace ON enqueue_namespace.oid = enqueue.pronamespace
      CROSS JOIN pg_proc command
      JOIN pg_namespace command_namespace ON command_namespace.oid = command.pronamespace
     WHERE enqueue_namespace.nspname = 'app_private'
       AND enqueue.proname = 'enqueue_notification_push'
       AND command_namespace.nspname = 'app_private'
       AND command.oid = $2::regprocedure`,
    [apiRole, PUSH_COMMAND_FUNCTION]
  )).rows[0];
  if (!audit) throw new Error('Controlled Web Push functions are missing.');

  const expectedApplied = Object.values(audit).every(Boolean);
  if (Boolean(current) !== expectedApplied) {
    throw new Error('Migration 0020 ledger and subscription priority controls are inconsistent.');
  }
  return {
    database,
    applied: Boolean(current),
    checksum,
    leastPrivilege: expectedApplied,
    deliberatelyPendingEarlierMigrations: ['0009', '0010'].filter(version => !applied.has(version))
  };
}

export async function manageStagingPushSubscriptionPriority(client, {
  command = 'status', apiRole, allowRollback = false
} = {}) {
  if (!apiRole) throw new Error('Staging API role is required for least-privilege verification.');
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum, apiRole);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0020 rollback requires explicit confirmation.');
  }

  await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
  try {
    const before = await inspect(client, source.checksum, apiRole);
    if ((command === 'up' && before.applied) || (command === 'down' && !before.applied)) {
      return { ...before, command, changed: false };
    }
    await client.query('BEGIN');
    try {
      await client.query(command === 'up' ? source.upSql : source.downSql);
      if (command === 'up') {
        await client.query(
          'INSERT INTO public.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
          [VERSION, NAME, source.checksum]
        );
      } else {
        await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [VERSION]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return { ...(await inspect(client, source.checksum, apiRole)), command, changed: true };
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
  }
}

async function main() {
  const config = pushSubscriptionPriorityTargetConfig();
  const command = process.argv[2] || 'status';
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingPushSubscriptionPriority(client, {
      command,
      apiRole: config.apiRole,
      allowRollback: process.env.BANK_ALLOW_STAGING_PUSH_SUBSCRIPTION_PRIORITY_ROLLBACK
        === ROLLBACK_CONFIRMATION
    });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0020 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
