import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  API_FUNCTIONS,
  apiRoleTargetConfig,
  applyApiRoleGrants
} from './apply-role-grants.mjs';

const { Client } = pg;
const VERSION = '0022';
const NAME = 'announcement_center';
const LOCK_NAME = 'banke-staging-announcement-center-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_ANNOUNCEMENT_CENTER';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018',
  '0019', '0020', '0021'
]);
const ANNOUNCEMENT_FUNCTIONS = Object.freeze(API_FUNCTIONS.filter(signature =>
  signature.includes('announcement')));
const UP_FILE = new URL('./migrations/0022_announcement_center.up.sql', import.meta.url);
const DOWN_FILE = new URL('./migrations/0022_announcement_center.down.sql', import.meta.url);

export function announcementCenterTargetConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0022 announcement_center can only be managed with BANK_ENV=staging.');
  }
  return { ...config, apiRole: decodeURIComponent(config.apiUrl.username) };
}

async function migrationSource() {
  const [upSql, downSql] = await Promise.all([readFile(UP_FILE, 'utf8'), readFile(DOWN_FILE, 'utf8')]);
  return { upSql, downSql, checksum: createHash('sha256').update(upSql, 'utf8').digest('hex') };
}

async function inspect(client, checksum, apiRole) {
  const ledger = await client.query(
    'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version'
  );
  const applied = new Map(ledger.rows.map(row => [row.version, row]));
  for (const version of REQUIRED_VERSIONS) {
    if (!applied.has(version)) throw new Error(`Required Staging migration ${version} is missing.`);
  }
  const current = applied.get(VERSION);
  if (current && (current.name !== NAME || current.checksum !== checksum)) {
    throw new Error('Migration 0022 ledger entry does not match the approved source checksum.');
  }
  const objects = (await client.query(
    `SELECT
       to_regclass('public.announcement') IS NOT NULL AS announcement_table,
       to_regclass('public.announcement_read') IS NOT NULL AS read_table,
       to_regprocedure('app_private.api_list_announcements(text,text,text)') IS NOT NULL AS list_function,
       to_regprocedure('app_private.api_get_announcement(text,text,text,uuid)') IS NOT NULL AS detail_function,
       to_regprocedure('app_private.api_execute_announcement_command(text,text,text,text,jsonb,text,text,text)') IS NOT NULL AS command_function,
       to_regprocedure('app_private.api_mark_announcement_read(text,text,text,uuid,text,text,text)') IS NOT NULL AS read_function,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'outbox_events_create_announcement_notifications') AS notification_trigger`
  )).rows[0];
  const allObjects = Object.values(objects).every(Boolean);
  if (Boolean(current) !== allObjects) {
    throw new Error('Migration 0022 ledger and announcement objects are inconsistent.');
  }
  let leastPrivilege = !current;
  if (current) {
    const privileges = await client.query(
      `SELECT
         NOT has_table_privilege($1, 'public.announcement', 'SELECT,INSERT,UPDATE,DELETE') AS announcement_direct_denied,
         NOT has_table_privilege($1, 'public.announcement_read', 'SELECT,INSERT,UPDATE,DELETE') AS read_direct_denied,
         bool_and(has_function_privilege($1, signature::regprocedure, 'EXECUTE')) AS functions_allowed
       FROM unnest($2::text[]) signature`,
      [apiRole, ANNOUNCEMENT_FUNCTIONS]
    );
    leastPrivilege = Object.values(privileges.rows[0]).every(Boolean);
    if (!leastPrivilege) throw new Error('Staging Announcement API least-privilege boundary is incomplete.');
  }
  return {
    applied: Boolean(current), checksum, leastPrivilege,
    deliberatelyPendingEarlierMigrations: ['0009', '0010'].filter(version => !applied.has(version))
  };
}

export async function manageStagingAnnouncementCenter(client, {
  command = 'status', apiRole, apiUrl, allowRollback = false
} = {}) {
  if (!apiRole || !apiUrl) throw new Error('Staging API role configuration is required.');
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum, apiRole);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0022 rollback requires explicit confirmation.');
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
        await applyApiRoleGrants(client, apiUrl, API_FUNCTIONS);
      } else {
        await client.query('DELETE FROM public.schema_migrations WHERE version = $1', [VERSION]);
        await applyApiRoleGrants(client, apiUrl,
          API_FUNCTIONS.filter(signature => !ANNOUNCEMENT_FUNCTIONS.includes(signature)));
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
  const config = announcementCenterTargetConfig();
  const command = process.argv[2] || 'status';
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingAnnouncementCenter(client, {
      command,
      apiRole: config.apiRole,
      apiUrl: config.apiUrl,
      allowRollback: process.env.BANK_ALLOW_STAGING_ANNOUNCEMENT_CENTER_ROLLBACK
        === ROLLBACK_CONFIRMATION
    });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0022 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
