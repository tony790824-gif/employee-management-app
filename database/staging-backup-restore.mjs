import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { rootCertificates } from 'node:tls';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyApiRoleGrants } from './apply-role-grants.mjs';
import { databaseConfig } from './migrate.mjs';
import { createCommandService } from '../server/commands.mjs';
import { createPool } from '../server/db.mjs';

const { Client } = pg;
const RESTORE_DATABASE = 'banke_restore_sprint2';
const RESTORE_CONFIRMATION = 'RESTORE_BANKE_STAGING_BACKUP';
const TEST_WORKSPACES = Object.freeze([
  'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
]);
const GLOBAL_TABLES = Object.freeze(['organizations', 'users']);
const TENANT_TABLES = Object.freeze([
  'workspaces',
  'workspace_members',
  'employees',
  'shifts',
  'leave_selections',
  'attendance_records',
  'payroll_adjustments',
  'command_receipts',
  'audit_logs',
  'outbox_events',
  'snapshot_imports'
]);

function normalizedHost(value) {
  return value.replace('-pooler.', '.');
}

function databaseName(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function urlForDatabase(url, name) {
  const result = new URL(url.href);
  result.pathname = `/${encodeURIComponent(name)}`;
  return result;
}

export function stagingRestoreConfig(env = process.env) {
  const migration = databaseConfig(env);
  if (migration.environment !== 'staging') throw new Error('備份／還原演練僅允許 BANK_ENV=staging。');
  if (env.BANK_STAGING_RESTORE_CONFIRM !== RESTORE_CONFIRMATION) {
    throw new Error(`備份／還原演練需要 BANK_STAGING_RESTORE_CONFIRM=${RESTORE_CONFIRMATION}。`);
  }
  const migratorUrl = new URL(migration.connectionString);
  const apiValue = String(env.DATABASE_API_URL || '').trim();
  if (!apiValue) throw new Error('缺少 DATABASE_API_URL。');
  const apiUrl = new URL(apiValue);
  if (migratorUrl.hostname.includes('-pooler.')) throw new Error('備份／還原必須使用 direct PostgreSQL endpoint。');
  if (normalizedHost(migratorUrl.hostname) !== normalizedHost(apiUrl.hostname)) {
    throw new Error('Migration 與 API 連線不是同一個 Staging PostgreSQL 專案。');
  }
  if (databaseName(migratorUrl) !== databaseName(apiUrl)) {
    throw new Error('Migration 與 API 連線不是同一個來源資料庫。');
  }
  if (databaseName(migratorUrl) === RESTORE_DATABASE) throw new Error('來源資料庫不可等於還原演練資料庫。');
  return {
    migration,
    migratorUrl,
    apiUrl,
    targetMigratorUrl: urlForDatabase(migratorUrl, RESTORE_DATABASE),
    targetApiUrl: urlForDatabase(apiUrl, RESTORE_DATABASE)
  };
}

function postgresBin(name, env = process.env) {
  if (env.POSTGRES_BIN) return path.join(env.POSTGRES_BIN, process.platform === 'win32' ? `${name}.exe` : name);
  if (process.platform === 'win32') return path.join('C:\\Program Files\\PostgreSQL\\18\\bin', `${name}.exe`);
  return name;
}

async function runTool(executable, args, url, rootCertificateFile) {
  if (path.isAbsolute(executable)) await access(executable);
  const environment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: rootCertificateFile
  };
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} 執行失敗（exit ${code}）：${stderr.trim().slice(-4000)}`));
    });
  });
}

function connectionArgs(url, database) {
  return [
    '--host', url.hostname,
    '--port', url.port || '5432',
    '--username', decodeURIComponent(url.username),
    '--dbname', database
  ];
}

async function workspaceCounts(client, workspaceId) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const values = {};
    for (const table of TENANT_TABLES) {
      const tenantColumn = table === 'workspaces' ? 'id' : 'workspace_id';
      const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${tenantColumn} = $1`, [workspaceId]);
      values[table] = result.rows[0].count;
    }
    await client.query('ROLLBACK');
    return values;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function databaseEvidence(client) {
  const ledger = await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  const global = {};
  for (const table of GLOBAL_TABLES) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    global[table] = result.rows[0].count;
  }
  const workspaces = {};
  for (const workspaceId of TEST_WORKSPACES) workspaces[workspaceId] = await workspaceCounts(client, workspaceId);
  return { ledger: ledger.rows, global, workspaces };
}

async function rlsEvidence(client) {
  const result = await client.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [TENANT_TABLES]
  );
  if (result.rowCount !== TENANT_TABLES.length || result.rows.some(row => !row.relrowsecurity || !row.relforcerowsecurity)) {
    throw new Error('還原資料庫的 RLS／FORCE RLS 狀態不完整。');
  }
  return result.rowCount;
}

async function apiEvidence(targetConfig, ownerClient) {
  const membership = await ownerClient.query(
    `SELECT workspace_id, role, user_id
       FROM workspace_members
      WHERE workspace_id = ANY($1::text[]) AND role = 'boss'
      ORDER BY workspace_id`,
    [TEST_WORKSPACES]
  );
  if (membership.rowCount !== TEST_WORKSPACES.length) throw new Error('還原資料庫缺少雙租戶 Boss 測試成員。');
  const env = {
    ...process.env,
    DATABASE_MIGRATOR_URL: targetConfig.targetMigratorUrl.href,
    DATABASE_API_URL: targetConfig.targetApiUrl.href
  };
  const pool = createPool(env);
  try {
    const commandService = createCommandService({ pool });
    const visible = [];
    for (const row of membership.rows) {
      const response = await commandService.listEmployees({ principal: { workspaceId: row.workspace_id, userId: row.user_id } });
      visible.push({ workspaceId: row.workspace_id, employeeCount: response.data.length });
      if (response.data.some(employee => employee.id === (row.workspace_id === TEST_WORKSPACES[0] ? 'employee-b' : 'employee-a'))) {
        throw new Error('還原資料庫 API 發生跨租戶資料外洩。');
      }
    }
    const noContext = await pool.query('SELECT count(*)::int AS count FROM employees');
    if (noContext.rows[0].count !== 0) throw new Error('還原資料庫在缺少租戶 Context 時仍可讀取資料。');
    return visible;
  } finally {
    await pool.end();
  }
}

async function main() {
  const config = stagingRestoreConfig();
  const pgDump = postgresBin('pg_dump');
  const pgRestore = postgresBin('pg_restore');
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'banke-staging-backup-'));
  const dumpFile = path.join(temporaryDirectory, 'staging.dump');
  const rootCertificateFile = path.join(temporaryDirectory, 'node-root-certificates.pem');
  const sourceClient = new Client({ connectionString: config.migration.connectionString, ssl: config.migration.ssl });
  let targetClient;
  try {
    await sourceClient.connect();
    const sourceDatabase = (await sourceClient.query('SELECT current_database() AS name')).rows[0].name;
    if (sourceDatabase !== databaseName(config.migratorUrl)) throw new Error('來源資料庫識別不一致，已停止。');
    const sourceEvidence = await databaseEvidence(sourceClient);
    await writeFile(rootCertificateFile, `${rootCertificates.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });

    await runTool(pgDump, [
      ...connectionArgs(config.migratorUrl, sourceDatabase),
      '--format', 'custom',
      '--no-owner',
      '--no-privileges',
      '--file', dumpFile
    ], config.migratorUrl, rootCertificateFile);
    const dump = await readFile(dumpFile);
    const backup = { bytes: dump.byteLength, sha256: createHash('sha256').update(dump).digest('hex') };

    await sourceClient.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [RESTORE_DATABASE]);
    await sourceClient.query(`DROP DATABASE IF EXISTS ${RESTORE_DATABASE}`);
    await sourceClient.query(`CREATE DATABASE ${RESTORE_DATABASE} TEMPLATE template0`);

    await runTool(pgRestore, [
      ...connectionArgs(config.targetMigratorUrl, RESTORE_DATABASE),
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      dumpFile
    ], config.targetMigratorUrl, rootCertificateFile);

    targetClient = new Client({ connectionString: config.targetMigratorUrl.href, ssl: config.migration.ssl });
    await targetClient.connect();
    await targetClient.query('BEGIN');
    try {
      await applyApiRoleGrants(targetClient, config.targetApiUrl);
      await targetClient.query('COMMIT');
    } catch (error) {
      await targetClient.query('ROLLBACK');
      throw error;
    }
    const restoredEvidence = await databaseEvidence(targetClient);
    if (JSON.stringify(restoredEvidence) !== JSON.stringify(sourceEvidence)) throw new Error('備份與還原後的 Migration／資料筆數對帳不一致。');
    const rlsPolicies = await rlsEvidence(targetClient);
    const api = await apiEvidence(config, targetClient);

    process.stdout.write(`${JSON.stringify({
      environment: 'staging',
      sourceDatabase,
      restoreDatabase: RESTORE_DATABASE,
      backup,
      reconciliation: 'passed',
      rlsForcedTables: rlsPolicies,
      api
    })}\n`);
  } finally {
    if (targetClient) await targetClient.end();
    await sourceClient.end().catch(() => {});
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
