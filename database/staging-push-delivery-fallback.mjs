import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { apiRoleTargetConfig } from './apply-role-grants.mjs';

const { Client } = pg;
const VERSION = '0021';
const NAME = 'push_delivery_fallback';
const LOCK_NAME = 'banke-staging-push-delivery-fallback-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_PUSH_DELIVERY_FALLBACK';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020'
]);
const UP_FILE = new URL('./migrations/0021_push_delivery_fallback.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0021_push_delivery_fallback.down.sql', import.meta.url);
const COMPLETE_FUNCTION =
  'app_private.worker_complete_push_delivery(uuid,text,integer,text)';

export function pushDeliveryFallbackTargetConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0021 push_delivery_fallback can only be managed with BANK_ENV=staging.');
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
    throw new Error('Migration 0021 ledger entry does not match the approved source checksum.');
  }

  const audit = (await client.query(
    `SELECT
       complete.prosecdef AS complete_security_definer,
       position('target_client_mode = ''pwa''' IN complete.prosrc) > 0 AS pwa_expiry_fallback,
       position('subscription.client_mode = ''browser''' IN complete.prosrc) > 0 AS browser_selection,
       position('preferred.client_mode = ''pwa''' IN complete.prosrc) > 0 AS active_pwa_guard,
       position('ON CONFLICT' IN complete.prosrc) > 0 AS idempotent_insert,
       NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(complete.proacl, acldefault('f', complete.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS complete_public_denied,
       NOT has_function_privilege($1, complete.oid, 'EXECUTE') AS api_complete_execute_denied,
       EXISTS (
         SELECT 1
           FROM aclexplode(coalesce(complete.proacl, acldefault('f', complete.proowner))) acl
           JOIN pg_roles grantee ON grantee.oid = acl.grantee
          WHERE acl.privilege_type = 'EXECUTE'
            AND grantee.rolname <> $1
            AND acl.grantee <> complete.proowner
       ) AS dedicated_push_execute,
       NOT has_table_privilege($1, 'public.push_subscriptions', 'SELECT') AS api_subscription_select_denied,
       NOT has_table_privilege($1, 'public.push_deliveries', 'SELECT') AS api_delivery_select_denied
      FROM pg_proc complete
      JOIN pg_namespace namespace ON namespace.oid = complete.pronamespace
     WHERE namespace.nspname = 'app_private'
       AND complete.oid = $2::regprocedure`,
    [apiRole, COMPLETE_FUNCTION]
  )).rows[0];
  if (!audit) throw new Error('Controlled Push delivery completion function is missing.');

  const expectedApplied = Object.values(audit).every(Boolean);
  if (Boolean(current) !== expectedApplied) {
    throw new Error('Migration 0021 ledger and Push fallback controls are inconsistent.');
  }
  return {
    database,
    applied: Boolean(current),
    checksum,
    leastPrivilege: expectedApplied,
    deliberatelyPendingEarlierMigrations: ['0009', '0010'].filter(version => !applied.has(version))
  };
}

export async function manageStagingPushDeliveryFallback(client, {
  command = 'status', apiRole, allowRollback = false
} = {}) {
  if (!apiRole) throw new Error('Staging API role is required for least-privilege verification.');
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum, apiRole);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0021 rollback requires explicit confirmation.');
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
    return {
      ...(await inspect(client, source.checksum, apiRole)),
      command,
      changed: true
    };
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
  }
}

async function main() {
  const config = pushDeliveryFallbackTargetConfig();
  const command = process.argv[2] || 'status';
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingPushDeliveryFallback(client, {
      command,
      apiRole: config.apiRole,
      allowRollback: process.env.BANK_ALLOW_STAGING_PUSH_DELIVERY_FALLBACK_ROLLBACK
        === ROLLBACK_CONFIRMATION
    });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0021 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
