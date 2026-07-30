import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { apiRoleTargetConfig } from './apply-role-grants.mjs';

const { Client } = pg;
const VERSION = '0018';
const NAME = 'edge_web_push_provider_allowlist';
const LOCK_NAME = 'banke-staging-edge-web-push-provider-allowlist-v1';
const ROLLBACK_CONFIRMATION = 'ROLLBACK_BANKE_STAGING_EDGE_WEB_PUSH_PROVIDER_ALLOWLIST';
const REQUIRED_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017'
]);
const UP_FILE = new URL(
  './migrations/0018_edge_web_push_provider_allowlist.up.sql',
  import.meta.url
);
const DOWN_FILE = new URL(
  './migrations/0018_edge_web_push_provider_allowlist.down.sql',
  import.meta.url
);
const PUSH_COMMAND_FUNCTION =
  'app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)';

export function edgePushAllowlistTargetConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment !== 'staging') {
    throw new Error('0018 edge_web_push_provider_allowlist can only be managed with BANK_ENV=staging.');
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
    throw new Error('Migration 0018 ledger entry does not match the approved source checksum.');
  }

  const endpointConstraint = (await client.query(
    `SELECT pg_get_constraintdef(constraint_object.oid) AS definition
       FROM pg_constraint constraint_object
       JOIN pg_class table_object ON table_object.oid = constraint_object.conrelid
       JOIN pg_namespace namespace ON namespace.oid = table_object.relnamespace
      WHERE namespace.nspname = 'public'
        AND table_object.relname = 'push_subscriptions'
        AND constraint_object.conname = 'push_subscriptions_endpoint_check'`
  )).rows[0]?.definition;
  if (!endpointConstraint) throw new Error('Web Push endpoint constraint is missing.');

  const functionAudit = (await client.query(
    `SELECT
       procedure.prosecdef AS security_definer,
       procedure.prosrc AS source,
       EXISTS (
         SELECT 1
           FROM aclexplode(coalesce(
             procedure.proacl,
             acldefault('f', procedure.proowner)
           )) AS function_acl
          WHERE function_acl.grantee = 0
            AND function_acl.privilege_type = 'EXECUTE'
       ) AS public_execute,
       has_function_privilege($1, procedure.oid, 'EXECUTE') AS api_execute
      FROM pg_proc procedure
     WHERE procedure.oid = $2::regprocedure`,
    [apiRole, PUSH_COMMAND_FUNCTION]
  )).rows[0];
  if (!functionAudit) throw new Error('Controlled Web Push command function is missing.');

  const constraintAllowsEdge = endpointConstraint.includes('notify\\.windows\\.com');
  const functionAllowsEdge =
    (functionAudit.source.match(/notify\\\.windows\\\.com/g) || []).length === 3;
  const expectedApplied = constraintAllowsEdge
    && functionAllowsEdge
    && functionAudit.security_definer
    && !functionAudit.public_execute
    && functionAudit.api_execute;
  if (Boolean(current) !== expectedApplied) {
    throw new Error('Migration 0018 ledger and endpoint validation are inconsistent.');
  }

  return {
    database,
    applied: Boolean(current),
    checksum,
    edgeConstraintAllowed: constraintAllowsEdge,
    edgeCommandBranchesAllowed: functionAllowsEdge ? 3 : 0,
    securityDefiner: functionAudit.security_definer,
    publicExecute: functionAudit.public_execute,
    apiExecute: functionAudit.api_execute,
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

export async function manageStagingEdgePushAllowlist(client, {
  command = 'status',
  apiRole,
  allowRollback = false
} = {}) {
  if (!apiRole) throw new Error('Staging API role is required for least-privilege verification.');
  const source = await migrationSource();
  if (command === 'status') return inspect(client, source.checksum, apiRole);
  if (!['up', 'down'].includes(command)) throw new Error('Command must be status, up, or down.');
  if (command === 'down' && !allowRollback) {
    throw new Error('Staging 0018 rollback requires explicit confirmation.');
  }

  return withLock(client, async () => {
    const before = await inspect(client, source.checksum, apiRole);
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
    return { ...(await inspect(client, source.checksum, apiRole)), command, changed: true };
  });
}

async function main() {
  const config = edgePushAllowlistTargetConfig();
  const command = process.argv[2] || 'status';
  const allowRollback =
    process.env.BANK_ALLOW_STAGING_EDGE_WEB_PUSH_PROVIDER_ALLOWLIST_ROLLBACK
      === ROLLBACK_CONFIRMATION;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    const result = await manageStagingEdgePushAllowlist(client, {
      command,
      apiRole: config.apiRole,
      allowRollback
    });
    process.stdout.write(`${JSON.stringify({ environment: config.environment, command, result }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Staging 0018 operation failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
