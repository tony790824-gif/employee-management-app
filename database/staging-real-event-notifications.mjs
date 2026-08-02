import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { API_FUNCTIONS, apiRoleTargetConfig, applyApiRoleGrants } from './apply-role-grants.mjs';

const { Client } = pg;
const VERSION = '0019';
const NAME = 'real_event_notifications';
const LOCK_NAME = 'banke-staging-real-event-notifications-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_REAL_EVENT_NOTIFICATIONS';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018'
]);
const UP_FILE = new URL('./migrations/0019_real_event_notifications.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0019_real_event_notifications.down.sql', import.meta.url);

export function realEventNotificationTargetConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0019 real_event_notifications can only be managed with BANK_ENV=staging.');
  }
  return { ...config, apiRole: decodeURIComponent(config.apiUrl.username) };
}

async function source() {
  const [upSql, downSql] = await Promise.all([readFile(UP_FILE, 'utf8'), readFile(DOWN_FILE, 'utf8')]);
  return { upSql, downSql, checksum: createHash('sha256').update(upSql, 'utf8').digest('hex') };
}

async function inspect(client, checksum, apiRole) {
  const database = (await client.query('SELECT current_database() AS name')).rows[0]?.name;
  const ledger = await client.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
  const applied = new Map(ledger.rows.map(row => [row.version, row]));
  for (const version of REQUIRED_VERSIONS) {
    if (!applied.has(version)) throw new Error(`Required Staging migration ${version} is missing.`);
  }
  const current = applied.get(VERSION);
  if (current && (current.name !== NAME || current.checksum !== checksum)) {
    throw new Error('Migration 0019 ledger entry does not match the approved source checksum.');
  }
  const objects = (await client.query(`SELECT
    to_regclass('public.notification_preferences') IS NOT NULL AS preferences,
    to_regprocedure('app_private.resolve_notification_recipients(text,text,uuid,text)') IS NOT NULL AS resolver,
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'outbox_events_create_notifications' AND NOT tgisinternal) AS projection_trigger,
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_preferences') AS preference_rls,
    has_table_privilege($1, 'public.notifications', 'SELECT') AS notification_select,
    CASE WHEN to_regclass('public.notification_preferences') IS NULL THEN false
      ELSE has_table_privilege($1, 'public.notification_preferences', 'SELECT') END AS preference_select,
    has_function_privilege($1,
      'app_private.api_execute_notification_command(text,text,text,text,jsonb,text,text,text)', 'EXECUTE') AS command_execute`,
    [apiRole])).rows[0];
  const expectedApplied = objects.preferences && objects.resolver && objects.projection_trigger
    && objects.preference_rls && !objects.notification_select && !objects.preference_select
    && objects.command_execute;
  if (Boolean(current) !== expectedApplied) {
    throw new Error('Migration 0019 ledger and database objects are inconsistent.');
  }
  return {
    database,
    applied: Boolean(current),
    checksum,
    leastPrivilege: expectedApplied,
    deliberatelyPendingEarlierMigrations: ['0009', '0010'].filter(version => !applied.has(version))
  };
}

export async function manageStagingRealEventNotifications(client, {
  command = 'status', apiRole, apiUrl, allowRollback = false
} = {}) {
  if (!apiRole || !apiUrl) throw new Error('Staging API role configuration is required.');
  const migration = await source();
  if (command === 'status') return inspect(client, migration.checksum, apiRole);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0019 rollback requires explicit confirmation.');
  }
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
  try {
    const before = await inspect(client, migration.checksum, apiRole);
    if ((command === 'up' && before.applied) || (command === 'down' && !before.applied)) {
      return { ...before, command, changed: false };
    }
    await client.query('BEGIN');
    try {
      await client.query(command === 'up' ? migration.upSql : migration.downSql);
      if (command === 'up') {
        await client.query(
          'INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
          [VERSION, NAME, migration.checksum]
        );
      } else {
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [VERSION]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const allowlist = command === 'up'
      ? API_FUNCTIONS
      : API_FUNCTIONS.filter(signature => !signature.includes('api_update_notification_preferences'));
    await applyApiRoleGrants(client, apiUrl, allowlist);
    return { ...(await inspect(client, migration.checksum, apiRole)), command, changed: true };
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
  }
}

async function main() {
  const config = realEventNotificationTargetConfig();
  const command = process.argv[2] || 'status';
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingRealEventNotifications(client, {
      command,
      apiRole: config.apiRole,
      apiUrl: config.apiUrl,
      allowRollback: process.env.BANK_ALLOW_STAGING_REAL_EVENT_NOTIFICATIONS_ROLLBACK
        === ROLLBACK_CONFIRMATION
    });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0019 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
