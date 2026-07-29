import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';
import { STAGING_TENANT_CONTEXT_KEY_ID } from './staging-ui-bootstrap.mjs';

const { Client } = pg;
const VERSION = '0014';
const NAME = 'notification_center';
const PATCH_VERSION = '0015';
const PATCH_NAME = 'notification_command_validation';
const LOCK_NAME = 'banke-staging-notification-center-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_NOTIFICATION_CENTER';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013'
]);
const UP_FILE = new URL('./migrations/0014_notification_center.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0014_notification_center.down.sql', import.meta.url);
const PATCH_UP_FILE = new URL(
  './migrations/0015_notification_command_validation.up.sql',
  import.meta.url
);
const PATCH_DOWN_FILE = new URL(
  './migrations/0015_notification_command_validation.down.sql',
  import.meta.url
);

function stagingConfig(env = process.env) {
  const config = databaseTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0014 notification_center can only be managed with BANK_ENV=staging.');
  }
  return config;
}

async function migrationSource() {
  const [upSql, downSql, patchUpSql, patchDownSql] = await Promise.all([
    readFile(UP_FILE, 'utf8'),
    readFile(DOWN_FILE, 'utf8'),
    readFile(PATCH_UP_FILE, 'utf8'),
    readFile(PATCH_DOWN_FILE, 'utf8')
  ]);
  return {
    upSql,
    downSql,
    checksum: createHash('sha256').update(upSql, 'utf8').digest('hex'),
    patchUpSql,
    patchDownSql,
    patchChecksum: createHash('sha256').update(patchUpSql, 'utf8').digest('hex')
  };
}

async function inspect(client, checksum, patchChecksum) {
  const identity = (await client.query(
    'SELECT current_database() AS database, current_user AS role'
  )).rows[0];
  const ledger = await client.query(
    'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version'
  );
  const applied = new Map(ledger.rows.map(row => [row.version, row]));
  for (const version of REQUIRED_VERSIONS) {
    if (!applied.has(version)) throw new Error(`Required Staging migration ${version} is missing.`);
  }
  const current = applied.get(VERSION);
  if (current && (current.name !== NAME || current.checksum !== checksum)) {
    throw new Error('Migration 0014 ledger entry does not match the approved source checksum.');
  }
  const patch = applied.get(PATCH_VERSION);
  if (patch && (patch.name !== PATCH_NAME || patch.checksum !== patchChecksum)) {
    throw new Error('Migration 0015 ledger entry does not match the approved source checksum.');
  }
  if (patch && !current) {
    throw new Error('Migration 0015 cannot remain applied without 0014.');
  }

  const objects = (await client.query(
    `SELECT
       to_regclass('public.notifications') IS NOT NULL AS notification_table,
       to_regprocedure('app_private.create_notifications_from_outbox()') IS NOT NULL AS projection_function,
       to_regprocedure('app_private.api_list_notifications(text,text,text)') IS NOT NULL AS read_function,
       to_regprocedure('app_private.api_notification_revision(text,text,text)') IS NOT NULL AS revision_function,
       to_regprocedure(
         'app_private.api_execute_notification_command(text,text,text,text,jsonb,text,text,text)'
       ) IS NOT NULL AS command_function,
       EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.outbox_events'::regclass
            AND tgname = 'outbox_events_create_notifications'
            AND NOT tgisinternal
       ) AS projection_trigger`
  )).rows[0];
  const expectedObjectsExist = Object.values(objects).every(Boolean);
  if (Boolean(current) !== expectedObjectsExist) {
    throw new Error('Migration 0014 ledger and database objects are inconsistent.');
  }

  let structural = {
    forcedRls: 0,
    tenantPolicies: 0,
    indexes: 0,
    constraints: 0,
    controlledFunctions: 0,
    publicExecuteGrants: 0,
    publicTableGrants: 0
  };
  if (current) {
    const result = (await client.query(
      `SELECT
         (
           SELECT count(*)::integer FROM pg_class relation
           JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
           WHERE namespace.nspname = 'public'
             AND relation.relname = 'notifications'
             AND relation.relrowsecurity
             AND relation.relforcerowsecurity
         ) AS forced_rls,
         (
           SELECT count(*)::integer FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'notifications'
         ) AS tenant_policies,
         (
           SELECT count(*)::integer FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'notifications'
         ) AS indexes,
         (
           SELECT count(*)::integer FROM pg_constraint
            WHERE conrelid = 'public.notifications'::regclass
         ) AS constraints,
         (
           SELECT count(*)::integer
             FROM pg_proc procedure
             JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
            WHERE namespace.nspname = 'app_private'
              AND procedure.proname IN (
                'create_notifications_from_outbox',
                'api_list_notifications',
                'api_notification_revision',
                'api_execute_notification_command'
              )
              AND procedure.prosecdef
              AND array_to_string(procedure.proconfig, ',')
                LIKE '%search_path=pg_catalog, public, app_private%'
         ) AS controlled_functions,
         (
           SELECT count(*)::integer
             FROM information_schema.routine_privileges
            WHERE grantee = 'PUBLIC'
              AND specific_schema = 'app_private'
              AND routine_name IN (
                'create_notifications_from_outbox',
                'api_list_notifications',
                'api_notification_revision',
                'api_execute_notification_command'
              )
         ) AS public_execute_grants,
         (
           SELECT count(*)::integer
             FROM information_schema.table_privileges
            WHERE grantee = 'PUBLIC'
              AND table_schema = 'public'
              AND table_name = 'notifications'
         ) AS public_table_grants`
    )).rows[0];
    structural = {
      forcedRls: Number(result.forced_rls),
      tenantPolicies: Number(result.tenant_policies),
      indexes: Number(result.indexes),
      constraints: Number(result.constraints),
      controlledFunctions: Number(result.controlled_functions),
      publicExecuteGrants: Number(result.public_execute_grants),
      publicTableGrants: Number(result.public_table_grants)
    };
    if (structural.forcedRls !== 1
      || structural.tenantPolicies !== 1
      || structural.indexes !== 4
      || structural.constraints < 8
      || structural.controlledFunctions !== 4
      || structural.publicExecuteGrants !== 0
      || structural.publicTableGrants !== 0) {
      throw new Error(
        `Migration 0014 RLS, indexes, constraints, functions, or PUBLIC grants are incomplete: ${
          JSON.stringify(structural)
        }`
      );
    }
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
    ...identity,
    applied: Boolean(current),
    patchApplied: Boolean(patch),
    checksum,
    patchChecksum,
    objects,
    ...structural,
    approvedKeyId: key.key_id,
    ledgerVersions: ledger.rows.map(row => row.version),
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

export async function manageStagingNotificationCenter(client, {
  command = 'status',
  allowRollback = false
} = {}) {
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum, source.patchChecksum);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0014 rollback requires explicit confirmation.');
  }

  return withLock(client, async () => {
    const before = await inspect(client, source.checksum, source.patchChecksum);
    if ((command === 'up' && before.applied && before.patchApplied)
      || (command === 'down' && !before.applied && !before.patchApplied)) {
      return { ...before, changed: false, command };
    }
    await client.query('BEGIN');
    try {
      if (command === 'up') {
        if (!before.applied) {
          await client.query(source.upSql);
          await client.query(
            'INSERT INTO public.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
            [VERSION, NAME, source.checksum]
          );
        }
        if (!before.patchApplied) {
          await client.query(source.patchUpSql);
          await client.query(
            'INSERT INTO public.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
            [PATCH_VERSION, PATCH_NAME, source.patchChecksum]
          );
        }
      } else {
        if (before.patchApplied) {
          await client.query(source.patchDownSql);
          await client.query(
            'DELETE FROM public.schema_migrations WHERE version = $1',
            [PATCH_VERSION]
          );
        }
        if (before.applied) {
          await client.query(source.downSql);
          await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [VERSION]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return {
      ...(await inspect(client, source.checksum, source.patchChecksum)),
      changed: true,
      command
    };
  });
}

async function main() {
  const config = stagingConfig();
  const command = process.argv.slice(2).find(argument => argument !== '--') || 'status';
  const allowRollback = process.env.BANK_ALLOW_STAGING_NOTIFICATION_CENTER_ROLLBACK
    === ROLLBACK_CONFIRMATION;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingNotificationCenter(client, { command, allowRollback });
    process.stdout.write(`${JSON.stringify({
      environment: config.environment,
      host: new URL(config.connectionString).hostname,
      command,
      result
    }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0014 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
