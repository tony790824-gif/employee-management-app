import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  CATALOG_QUERIES,
  canonicalJson,
  normalizeCatalog,
  sha256
} from './materialize-expected-catalog.mjs';
import { loadExpectedInventory, validateExpectedInventory } from './production-schema-parity-plan.mjs';
import {
  REQUIRED_MISSING_VERSIONS,
  loadRemediationInventory,
  validateRemediationInventory
} from './production-migration-gap-remediation-plan.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATION_ROOT = path.join(PROJECT_ROOT, 'database', 'migrations');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.sha256');
const EXPECTED_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const EXPECTED_BASELINE_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.sha256');
const CONFIRMATION = 'REHEARSE_BANKE_DISPOSABLE_UPGRADE';
const OWNER = 'banke_rehearsal_owner';
const DATABASE_PREFIX = 'banke_upgrade_rehearsal_';
const TEMP_PREFIX = 'banke-disposable-upgrade-';
const BASELINE_VERSIONS = Object.freeze(['0001','0002','0003','0004','0005','0006','0007','0008']);
const FORBIDDEN_ENVIRONMENT_KEYS = Object.freeze([
  'DATABASE_URL',
  'DATABASE_MIGRATOR_URL',
  'DATABASE_READONLY_URL',
  'BANK_PRODUCTION_DATABASE_HOST',
  'BANK_PRODUCTION_DATABASE_NAME',
  'BANK_PRODUCTION_READONLY_ROLE'
]);
const FORBIDDEN_EVIDENCE_KEY = /^(?:connectionString|hostname|endpoint|username|password|token|cookie|authorizationHeader|projectId|branchId|businessRows|databaseName|port|path)$/i;

const PRECONDITION_SQL = Object.freeze({
  '0009': `SELECT to_regclass('app_private.security_event_inbox') IS NULL AS ok`,
  '0011': `SELECT to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NULL AS ok`,
  '0012': `SELECT to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'workspace_members' AND column_name = 'display_name'
                   ) AS ok`,
  '0013': `SELECT to_regclass('public.time_off_requests') IS NULL
                   AND to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL AS ok`,
  '0014': `SELECT to_regclass('public.notifications') IS NULL
                   AND to_regclass('public.time_off_requests') IS NOT NULL AS ok`,
  '0015': `SELECT to_regclass('public.notifications') IS NOT NULL
                   AND to_regprocedure('app_private.api_execute_notification_command(text,text,text,text,jsonb,text,text,text)') IS NOT NULL AS ok`,
  '0016': `SELECT to_regclass('public.push_subscriptions') IS NULL
                   AND to_regclass('public.push_deliveries') IS NULL
                   AND to_regclass('public.notifications') IS NOT NULL AS ok`,
  '0017': `SELECT to_regclass('public.push_subscriptions') IS NOT NULL
                   AND to_regprocedure('app_private.api_establish_session(text,text,text)') IS NOT NULL AS ok`,
  '0018': `SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_constraint
                     WHERE conname = 'push_subscriptions_endpoint_check'
                       AND conrelid = 'public.push_subscriptions'::regclass
                       AND position('notify\\.windows\\.com' IN pg_catalog.pg_get_constraintdef(oid, true)) = 0
                  )
                  AND EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'api_execute_push_command'
                  ) AS ok`,
  '0019': `SELECT to_regclass('public.notification_preferences') IS NULL
                   AND to_regprocedure('app_private.create_notifications_from_outbox()') IS NOT NULL
                   AND to_regprocedure('app_private.create_notifications_from_outbox_v1()') IS NULL AS ok`,
  '0020': `SELECT to_regclass('public.push_subscriptions') IS NOT NULL
                   AND to_regprocedure('app_private.enqueue_notification_push()') IS NOT NULL
                   AND to_regprocedure('app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)') IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'client_mode'
                   ) AS ok`,
  '0021': `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'client_mode'
                  )
                  AND to_regprocedure('app_private.worker_complete_push_delivery(uuid,text,integer,text)') IS NOT NULL AS ok`,
  '0022': `SELECT to_regclass('public.announcement') IS NULL
                   AND to_regclass('public.notification_preferences') IS NOT NULL
                   AND EXISTS (
                     SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'client_mode'
                   ) AS ok`
});

const POSTCONDITION_SQL = Object.freeze({
  '0009': `SELECT to_regclass('app_private.security_event_inbox') IS NOT NULL
                   AND to_regprocedure('app_private.ingest_auth0_security_event(text,text,text,text,text,text,text,timestamp with time zone,text)') IS NOT NULL AS ok`,
  '0011': `SELECT to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL AS ok`,
  '0012': `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'workspace_members' AND column_name = 'display_name'
                  ) AND to_regprocedure('app_private.api_bootstrap(text,text,text)') IS NOT NULL AS ok`,
  '0013': `SELECT to_regclass('public.time_off_requests') IS NOT NULL
                   AND to_regclass('public.time_off_request_dates') IS NOT NULL
                   AND to_regprocedure('app_private.api_execute_time_off_command(text,text,text,text,jsonb,text,text,text)') IS NOT NULL
                   AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.time_off_requests'::regclass) AS ok`,
  '0014': `SELECT to_regclass('public.notifications') IS NOT NULL
                   AND to_regprocedure('app_private.api_list_notifications(text,text,text)') IS NOT NULL
                   AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'outbox_events_create_notifications' AND NOT tgisinternal) AS ok`,
  '0015': `SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'api_execute_notification_command'
                      AND position('jsonb_typeof(command_input->''baseRevision'') <> ''number''' IN p.prosrc) > 0
                  ) AS ok`,
  '0016': `SELECT to_regclass('public.push_subscriptions') IS NOT NULL
                   AND to_regclass('public.push_deliveries') IS NOT NULL
                   AND to_regprocedure('app_private.worker_claim_push_deliveries(text,integer)') IS NOT NULL
                   AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'notifications_enqueue_web_push' AND NOT tgisinternal) AS ok`,
  '0017': `SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'api_establish_session'
                      AND position('session_was_expired' IN p.prosrc) > 0
                  ) AS ok`,
  '0018': `SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_constraint
                     WHERE conname = 'push_subscriptions_endpoint_check'
                       AND conrelid = 'public.push_subscriptions'::regclass
                       AND position('notify\\.windows\\.com' IN pg_catalog.pg_get_constraintdef(oid, true)) > 0
                  )
                  AND EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'api_execute_push_command'
                      AND position('notify\\.windows\\.com' IN p.prosrc) > 0
                  ) AS ok`,
  '0019': `SELECT to_regclass('public.notification_preferences') IS NOT NULL
                   AND to_regprocedure('app_private.create_notifications_from_outbox_v1()') IS NOT NULL
                   AND to_regprocedure('app_private.api_list_notifications_v1(text,text,text)') IS NOT NULL
                   AND EXISTS (
                     SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'metadata'
                   ) AS ok`,
  '0020': `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
                       AND column_name = 'client_mode' AND is_nullable = 'NO'
                  )
                  AND to_regclass('public.push_subscriptions_recipient_mode_active_idx') IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'api_execute_push_command'
                      AND position('clientMode' IN p.prosrc) > 0
                  ) AS ok`,
  '0021': `SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'app_private' AND p.proname = 'worker_complete_push_delivery'
                      AND position('target_client_mode = ''pwa''' IN p.prosrc) > 0
                      AND position('subscription.client_mode = ''browser''' IN p.prosrc) > 0
                  ) AS ok`,
  '0022': `SELECT to_regclass('public.announcement') IS NOT NULL
                   AND to_regclass('public.announcement_read') IS NOT NULL
                   AND to_regprocedure('app_private.api_list_announcements(text,text,text)') IS NOT NULL
                   AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'outbox_events_create_announcement_notifications' AND NOT tgisinternal)
                   AND EXISTS (
                     SELECT 1 FROM pg_catalog.pg_constraint
                      WHERE conname = 'notifications_notification_type_check'
                        AND conrelid = 'public.notifications'::regclass
                        AND position('announcement_created' IN pg_catalog.pg_get_constraintdef(oid, true)) > 0
                   ) AS ok`
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function trackedMigrationFiles() {
  return new Set(execFileSync('git', ['ls-files', '--', 'database/migrations/*.sql'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  }).trim().split(/\r?\n/).filter(Boolean).map(file => path.basename(file)));
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateRehearsalEnvironment(env = process.env) {
  const present = FORBIDDEN_ENVIRONMENT_KEYS.filter(key => String(env[key] || '').trim());
  if (present.length) throw new Error(`PRODUCTION_INPUT_PRESENT:${present.join(',')}`);
  return Object.freeze({ status: 'PASS', productionInputsPresent: false });
}

export function validateUpgradeSequence(requestedVersions, availableVersions = REQUIRED_MISSING_VERSIONS) {
  const requested = [...requestedVersions];
  if (requested.includes('0010')) throw new Error('MIGRATION_0010_REJECTED');
  if (requested.length !== REQUIRED_MISSING_VERSIONS.length) throw new Error('MIGRATION_SKIPPED_OR_EXTRA');
  if (JSON.stringify(requested) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) throw new Error('MIGRATION_ORDER_REJECTED');
  if (JSON.stringify(availableVersions) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) throw new Error('MIGRATION_ALLOWLIST_MISMATCH');
  return Object.freeze({ status: 'PASS', versions: Object.freeze(requested) });
}

export function validateMigrationDependencies(version, appliedVersions) {
  const index = REQUIRED_MISSING_VERSIONS.indexOf(version);
  if (index < 0) throw new Error(`UNAPPROVED_MIGRATION_VERSION:${version}`);
  const required = [...BASELINE_VERSIONS, ...REQUIRED_MISSING_VERSIONS.slice(0, index)];
  const applied = appliedVersions.map(item => typeof item === 'string' ? item : item.version);
  if (JSON.stringify(applied) !== JSON.stringify(required)) {
    throw new Error(`MISSING_OR_OUT_OF_ORDER_DEPENDENCY:${version}`);
  }
  return Object.freeze({ status: 'PASS', required: Object.freeze(required) });
}

export function migrationPreconditionSql(version) {
  const sql = PRECONDITION_SQL[version];
  if (!sql) throw new Error(`PRECONDITION_DEFINITION_MISSING:${version}`);
  return sql;
}

export function validateRollbackRequest(migration) {
  if (!migration || migration.rollbackClass !== 'REVERSIBLE') throw new Error('ROLLBACK_NOT_AUTHORIZED');
  return Object.freeze({ status: 'PASS' });
}

export function validateSanitizedEvidence(value) {
  const failures = [];
  const visit = input => {
    if (!input || typeof input !== 'object') return;
    for (const [key, child] of Object.entries(input)) {
      if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_FIELD:${key}`);
      visit(child);
    }
  };
  visit(value);
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export async function loadExactMigrationSet() {
  const [expected, remediation] = await Promise.all([loadExpectedInventory(), loadRemediationInventory()]);
  const [expectedValidation, remediationValidation] = await Promise.all([
    validateExpectedInventory(expected), validateRemediationInventory(remediation)
  ]);
  if (expectedValidation.status !== 'PASS') throw new Error(`EXPECTED_INVENTORY_BLOCKED:${expectedValidation.failures.join(',')}`);
  if (remediationValidation.status !== 'PASS') throw new Error(`REMEDIATION_INVENTORY_BLOCKED:${remediationValidation.failures.join(',')}`);
  validateUpgradeSequence(remediation.executionOrder);
  const tracked = trackedMigrationFiles();
  const expectedByVersion = new Map(expected.migrations.filter(item => item.sourceStatus === 'TRACKED').map(item => [item.version, item]));
  const remediationByVersion = new Map(remediation.migrations.map(item => [item.version, item]));
  const load = async (version, detail) => {
    const file = detail.file || detail.upFile;
    if (!file || !tracked.has(file) || version === '0010') throw new Error(`UNAPPROVED_MIGRATION_FILE:${version}`);
    const raw = await readFile(path.join(MIGRATION_ROOT, file));
    const actual = sha256Buffer(raw);
    const expectedHash = detail.checksum || detail.upSha256;
    if (actual !== expectedHash) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${version}`);
    return Object.freeze({ version, name: detail.name, file, checksum: expectedHash, sql: raw.toString('utf8') });
  };
  const baseline = await Promise.all(BASELINE_VERSIONS.map(version => load(version, expectedByVersion.get(version))));
  const upgrade = await Promise.all(REQUIRED_MISSING_VERSIONS.map(version => load(version, remediationByVersion.get(version))));
  return Object.freeze({ baseline: Object.freeze(baseline), upgrade: Object.freeze(upgrade), remediation });
}

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export function resolvePostgresBin(env = process.env) {
  const candidates = [String(env.BANK_DISPOSABLE_POSTGRES_BIN || '').trim(), 'C:\\Program Files\\PostgreSQL\\18\\bin'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(path.join(candidate, 'postgres.exe'), ['--version'], { stdio: 'ignore' });
      return path.resolve(candidate);
    } catch {
      // Continue to the next explicitly local candidate.
    }
  }
  throw new Error('LOCAL_POSTGRESQL_18_NOT_FOUND');
}

function run(binary, args, { detachedIo = false } = {}) {
  const result = spawnSync(binary, args, detachedIo
    ? { stdio: 'ignore', windowsHide: true }
    : { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

async function connect(port, password, database = 'postgres') {
  const client = new Client({ host: '127.0.0.1', port, database, user: OWNER, password, ssl: false });
  await client.connect();
  return client;
}

async function createDatabase(port, password, databaseName) {
  if (!/^[a-z][a-z0-9_]+$/.test(databaseName)) throw new Error('UNSAFE_DATABASE_IDENTIFIER');
  const client = await connect(port, password);
  try {
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0 ENCODING 'UTF8'`);
  } finally {
    await client.end();
  }
}

async function inspectIdentity(client) {
  const result = await client.query(`
    SELECT current_database() AS database_name,
           current_user AS role_name,
           session_user AS session_role,
           inet_server_addr()::text AS server_address,
           current_setting('listen_addresses') AS listen_addresses,
           current_setting('data_directory') AS data_directory,
           current_setting('server_version_num') AS server_version_num`);
  return result.rows[0];
}

function validateRehearsalIdentity(identity, expected) {
  const failures = [];
  if (!identity || !expected) failures.push('IDENTITY_MISSING');
  if (identity?.database_name !== expected?.databaseName || !String(identity?.database_name || '').startsWith(DATABASE_PREFIX)) {
    failures.push('DATABASE_IDENTITY_MISMATCH');
  }
  if (identity?.role_name !== OWNER || identity?.session_role !== OWNER) failures.push('ROLE_IDENTITY_MISMATCH');
  if (!['127.0.0.1', '127.0.0.1/32', '::1', '::1/128'].includes(identity?.server_address)) {
    failures.push('SERVER_NOT_LOOPBACK');
  }
  if (identity?.listen_addresses !== '127.0.0.1') failures.push('LISTEN_ADDRESS_NOT_ISOLATED');
  const dataDirectory = path.resolve(String(identity?.data_directory || ''));
  const expectedRoot = path.resolve(String(expected?.rootDirectory || ''));
  if (!expectedRoot || (dataDirectory !== expectedRoot && !dataDirectory.startsWith(`${expectedRoot}${path.sep}`))) {
    failures.push('DATA_DIRECTORY_OUTSIDE_DISPOSABLE_ROOT');
  }
  if (Number(identity?.server_version_num || 0) < 180000 || Number(identity?.server_version_num || 0) >= 190000) {
    failures.push('POSTGRES_MAJOR_VERSION_MISMATCH');
  }
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

async function createLedger(client) {
  await client.query(`
    CREATE TABLE public.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
}

async function readLedger(client) {
  return (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows;
}

function expectedLedger(migrations) {
  return migrations.map(({ version, name, checksum }) => ({ version, name, checksum }));
}

async function assertLedger(client, migrations, code = 'MIGRATION_LEDGER_MISMATCH') {
  const actual = await readLedger(client);
  const expected = expectedLedger(migrations);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || actual.some(row => row.version === '0010')) throw new Error(code);
  return actual;
}

async function applyBaseline(client, migrations) {
  await createLedger(client);
  const observations = [];
  for (const migration of migrations) {
    const started = performance.now();
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query(migration.sql);
      await client.query('INSERT INTO public.schema_migrations(version,name,checksum) VALUES ($1,$2,$3)', [migration.version, migration.name, migration.checksum]);
      await client.query('COMMIT');
      observations.push({ version: migration.version, transaction: 'COMMITTED', durationMs: Number((performance.now() - started).toFixed(3)) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`BASELINE_MIGRATION_FAILED:${migration.version}:${error.message}`);
    }
  }
  await assertLedger(client, migrations, 'BASELINE_LEDGER_MISMATCH');
  return observations;
}

async function runBooleanCheck(client, sql, failureCode) {
  const result = await client.query(sql);
  if (result.rows.length !== 1 || result.rows[0].ok !== true) throw new Error(failureCode);
}

async function lockEvidence(client) {
  const result = await client.query(`
    SELECT coalesce(array_agg(DISTINCT mode ORDER BY mode) FILTER (WHERE granted), ARRAY[]::text[]) AS granted_modes,
           count(*) FILTER (WHERE NOT granted)::integer AS waiting_lock_count,
           cardinality(pg_catalog.pg_blocking_pids(pg_catalog.pg_backend_pid()))::integer AS blocker_count
      FROM pg_catalog.pg_locks
     WHERE pid = pg_catalog.pg_backend_pid()`);
  return {
    grantedModes: result.rows[0].granted_modes,
    waitingLockCount: result.rows[0].waiting_lock_count,
    blockerCount: result.rows[0].blocker_count,
    blockingDetected: result.rows[0].waiting_lock_count > 0 || result.rows[0].blocker_count > 0
  };
}

export async function applyMigrationStep(client, migration, priorMigrations, {
  preconditionSql = PRECONDITION_SQL[migration.version],
  postconditionSql = POSTCONDITION_SQL[migration.version],
  forceSqlFailure = false,
  forcePostconditionFailure = false
} = {}) {
  validateMigrationDependencies(migration.version, priorMigrations);
  const started = performance.now();
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await assertLedger(client, priorMigrations, `PRECONDITION_LEDGER_FAILED:${migration.version}`);
    if (!preconditionSql) throw new Error(`PRECONDITION_DEFINITION_MISSING:${migration.version}`);
    await runBooleanCheck(client, preconditionSql, `PRECONDITION_FAILED:${migration.version}`);
    await client.query(migration.sql);
    if (forceSqlFailure) await client.query('SELECT 1 / 0');
    await client.query('INSERT INTO public.schema_migrations(version,name,checksum) VALUES ($1,$2,$3)', [migration.version, migration.name, migration.checksum]);
    if (forcePostconditionFailure) throw new Error(`POSTCONDITION_FAILED:${migration.version}:FORCED`);
    if (!postconditionSql) throw new Error(`POSTCONDITION_DEFINITION_MISSING:${migration.version}`);
    await runBooleanCheck(client, postconditionSql, `POSTCONDITION_FAILED:${migration.version}`);
    await assertLedger(client, [...priorMigrations, migration], `POSTCONDITION_LEDGER_FAILED:${migration.version}`);
    const locks = await lockEvidence(client);
    if (locks.blockingDetected) throw new Error(`BLOCKING_LOCK_DETECTED:${migration.version}`);
    await client.query('COMMIT');
    return Object.freeze({
      version: migration.version,
      checksum: migration.checksum,
      precondition: 'PASS',
      postcondition: 'PASS',
      transaction: 'COMMITTED',
      durationMs: Number((performance.now() - started).toFixed(3)),
      locks
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function verifyRolledBackProbe(client, baselineMigrations) {
  await assertLedger(client, baselineMigrations, 'ROLLBACK_PROBE_LEDGER_CHANGED');
  if ((await client.query("SELECT to_regclass('app_private.security_event_inbox') IS NULL AS ok")).rows[0].ok !== true) {
    throw new Error('ROLLBACK_PROBE_OBJECT_REMAINED');
  }
}

async function runFailureProbes(client, migration, baselineMigrations) {
  let transactionFailure = 'NOT_RUN';
  try {
    await applyMigrationStep(client, migration, baselineMigrations, { forceSqlFailure: true });
  } catch (error) {
    if (!/division by zero/i.test(error.message)) throw error;
    await verifyRolledBackProbe(client, baselineMigrations);
    transactionFailure = 'PASS_ROLLED_BACK_AND_STOPPED';
  }
  let postconditionFailure = 'NOT_RUN';
  try {
    await applyMigrationStep(client, migration, baselineMigrations, { forcePostconditionFailure: true });
  } catch (error) {
    if (!/POSTCONDITION_FAILED:0009:FORCED/.test(error.message)) throw error;
    await verifyRolledBackProbe(client, baselineMigrations);
    postconditionFailure = 'PASS_ROLLED_BACK_AND_STOPPED';
  }
  if (transactionFailure === 'NOT_RUN' || postconditionFailure === 'NOT_RUN') throw new Error('FAILURE_PROBE_DID_NOT_FAIL_CLOSED');
  return Object.freeze({ transactionFailure, postconditionFailure });
}

async function collectNormalizedCatalog(client, queries = CATALOG_QUERIES) {
  const catalog = { migrationLedger: await readLedger(client) };
  for (const [name, sql] of Object.entries(queries)) catalog[name] = (await client.query(sql)).rows;
  return normalizeCatalog(catalog, OWNER);
}

function deterministicRunSummary(run) {
  return canonicalValue({
    postgresMajorVersion: run.postgresMajorVersion,
    identityVerification: run.identityVerification,
    baselineLedger: run.baselineLedger,
    baselineCatalogHash: run.baselineCatalogHash,
    failureProbes: run.failureProbes,
    upgradeOrder: run.upgrades.map(item => item.version),
    upgrades: run.upgrades.map(item => ({
      version: item.version,
      checksum: item.checksum,
      precondition: item.precondition,
      postcondition: item.postcondition,
      transaction: item.transaction,
      blockingDetected: item.locks.blockingDetected
    })),
    rollbackGuards: run.rollbackGuards,
    finalLedger: run.finalLedger,
    finalCatalogHash: run.finalCatalogHash,
    expectedCatalogMatch: run.expectedCatalogMatch
  });
}

export async function runOneRehearsal({
  postgresBin,
  migrationSet,
  expectedCatalog,
  runLabel,
  includeCatalog = false,
  structuralQueries = CATALOG_QUERIES,
  baselineOnly = false,
  baselineObserver = null
}) {
  const rootDirectory = path.join(os.tmpdir(), `${TEMP_PREFIX}${randomBytes(8).toString('hex')}`);
  const dataDirectory = path.join(rootDirectory, 'data');
  const passwordFile = path.join(rootDirectory, 'initdb-password.txt');
  const password = randomBytes(32).toString('base64url');
  const port = await unusedPort();
  const databaseName = `${DATABASE_PREFIX}${randomBytes(4).toString('hex')}`;
  let started = false;
  await mkdir(rootDirectory, { recursive: false });
  try {
    await writeFile(passwordFile, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
    run(path.join(postgresBin, 'initdb.exe'), [
      `--pgdata=${dataDirectory}`,
      `--username=${OWNER}`,
      `--pwfile=${passwordFile}`,
      '--auth-local=trust',
      '--auth-host=scram-sha-256',
      '--encoding=UTF8',
      '--no-locale'
    ]);
    await rm(passwordFile, { force: true });
    run(path.join(postgresBin, 'pg_ctl.exe'), [
      `--pgdata=${dataDirectory}`,
      `--options=-p ${port} -h 127.0.0.1`,
      `--log=${path.join(rootDirectory, 'postgres.log')}`,
      '--wait',
      'start'
    ], { detachedIo: true });
    started = true;
    await createDatabase(port, password, databaseName);
    const client = await connect(port, password, databaseName);
    try {
      const identity = await inspectIdentity(client);
      const identityResult = validateRehearsalIdentity(identity, { databaseName, rootDirectory });
      if (identityResult.status !== 'PASS') throw new Error(`DISPOSABLE_IDENTITY_BLOCKED:${identityResult.failures.join(',')}`);
      const baselineObservations = await applyBaseline(client, migrationSet.baseline);
      const baselineLedger = await assertLedger(client, migrationSet.baseline, 'BASELINE_LEDGER_MISMATCH');
      const baselineCatalog = await collectNormalizedCatalog(client);
      const structuralBaselineCatalog = structuralQueries === CATALOG_QUERIES
        ? baselineCatalog
        : await collectNormalizedCatalog(client, structuralQueries);
      const baselineObserverResult = typeof baselineObserver === 'function'
        ? await baselineObserver({ client, migrationOwner: OWNER, baselineLedger, structuralQueries })
        : null;
      const baselineCatalogHash = sha256(canonicalJson(baselineCatalog));
      if (baselineOnly) {
        const baselineResult = {
          run: runLabel,
          environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
          postgresMajorVersion: 18,
          identityVerification: 'PASS',
          baselineLedger,
          baselineCatalogHash
        };
        return {
          ...baselineResult,
          ...(includeCatalog ? { baselineCatalog: structuralBaselineCatalog } : {}),
          ...(baselineObserverResult === null ? {} : { baselineObserverResult }),
          deterministicSummary: canonicalValue(baselineResult)
        };
      }
      const failureProbes = await runFailureProbes(client, migrationSet.upgrade[0], migrationSet.baseline);
      const applied = [...migrationSet.baseline];
      const upgrades = [];
      for (const migration of migrationSet.upgrade) {
        const result = await applyMigrationStep(client, migration, applied);
        upgrades.push(result);
        applied.push(migration);
      }
      const finalLedger = await assertLedger(client, [...migrationSet.baseline, ...migrationSet.upgrade], 'FINAL_LEDGER_MISMATCH');
      const finalCatalog = await collectNormalizedCatalog(client);
      const structuralFinalCatalog = structuralQueries === CATALOG_QUERIES
        ? finalCatalog
        : await collectNormalizedCatalog(client, structuralQueries);
      const finalCatalogHash = sha256(canonicalJson(finalCatalog));
      const expectedCatalogMatch = canonicalJson(finalCatalog) === canonicalJson(expectedCatalog);
      if (!expectedCatalogMatch) throw new Error('EXPECTED_FINAL_CATALOG_MISMATCH');
      const rollbackGuards = migrationSet.upgrade.map(migration => {
        try {
          validateRollbackRequest(migrationSet.remediation.migrations.find(item => item.version === migration.version));
          return { version: migration.version, result: 'UNEXPECTEDLY_ALLOWED' };
        } catch (error) {
          if (error.message !== 'ROLLBACK_NOT_AUTHORIZED') throw error;
          return { version: migration.version, result: 'BLOCKED_NOT_AUTHORIZED' };
        }
      });
      const runResult = {
        run: runLabel,
        environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
        postgresMajorVersion: 18,
        identityVerification: 'PASS',
        baselineLedger,
        baselineCatalogHash,
        baselineDurations: baselineObservations,
        failureProbes,
        upgrades,
        rollbackGuards,
        finalLedger,
        finalCatalogHash,
        expectedCatalogMatch
      };
      return {
        ...runResult,
        ...(includeCatalog ? { baselineCatalog: structuralBaselineCatalog, finalCatalog: structuralFinalCatalog } : {}),
        deterministicSummary: deterministicRunSummary(runResult)
      };
    } finally {
      await client.end();
    }
  } finally {
    if (started || existsSync(path.join(dataDirectory, 'postmaster.pid'))) {
      try {
        run(path.join(postgresBin, 'pg_ctl.exe'), [`--pgdata=${dataDirectory}`, '--mode=fast', '--wait', 'stop'], { detachedIo: true });
      } catch {
        // Cleanup continues; original failures remain authoritative.
      }
    }
    await rm(rootDirectory, { recursive: true, force: true });
  }
}

export async function runOneFreshInstall({
  postgresBin,
  migrationSet,
  expectedCatalog,
  runLabel = 'FRESH_INSTALL',
  structuralQueries = CATALOG_QUERIES
}) {
  const rootDirectory = path.join(os.tmpdir(), `${TEMP_PREFIX}${randomBytes(8).toString('hex')}`);
  const dataDirectory = path.join(rootDirectory, 'data');
  const passwordFile = path.join(rootDirectory, 'initdb-password.txt');
  const password = randomBytes(32).toString('base64url');
  const port = await unusedPort();
  const databaseName = `${DATABASE_PREFIX}${randomBytes(4).toString('hex')}`;
  const migrations = [...migrationSet.baseline, ...migrationSet.upgrade];
  let started = false;
  await mkdir(rootDirectory, { recursive: false });
  try {
    await writeFile(passwordFile, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
    run(path.join(postgresBin, 'initdb.exe'), [
      `--pgdata=${dataDirectory}`,
      `--username=${OWNER}`,
      `--pwfile=${passwordFile}`,
      '--auth-local=trust',
      '--auth-host=scram-sha-256',
      '--encoding=UTF8',
      '--no-locale'
    ]);
    await rm(passwordFile, { force: true });
    run(path.join(postgresBin, 'pg_ctl.exe'), [
      `--pgdata=${dataDirectory}`,
      `--options=-p ${port} -h 127.0.0.1`,
      `--log=${path.join(rootDirectory, 'postgres.log')}`,
      '--wait',
      'start'
    ], { detachedIo: true });
    started = true;
    await createDatabase(port, password, databaseName);
    const client = await connect(port, password, databaseName);
    try {
      const identity = await inspectIdentity(client);
      const identityResult = validateRehearsalIdentity(identity, { databaseName, rootDirectory });
      if (identityResult.status !== 'PASS') throw new Error(`DISPOSABLE_IDENTITY_BLOCKED:${identityResult.failures.join(',')}`);
      const migrationResults = await applyBaseline(client, migrations);
      const finalLedger = await assertLedger(client, migrations, 'FRESH_INSTALL_LEDGER_MISMATCH');
      const finalCatalog = await collectNormalizedCatalog(client);
      const structuralFinalCatalog = structuralQueries === CATALOG_QUERIES
        ? finalCatalog
        : await collectNormalizedCatalog(client, structuralQueries);
      const finalCatalogHash = sha256(canonicalJson(finalCatalog));
      const expectedCatalogMatch = canonicalJson(finalCatalog) === canonicalJson(expectedCatalog);
      if (!expectedCatalogMatch) throw new Error('FRESH_INSTALL_EXPECTED_CATALOG_MISMATCH');
      return Object.freeze({
        run: runLabel,
        pathMode: 'FRESH_INSTALL_FROM_EMPTY',
        environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
        postgresMajorVersion: 18,
        identityVerification: 'PASS',
        migrationOrder: Object.freeze(migrations.map(item => item.version)),
        migrationResults: Object.freeze(migrationResults),
        finalLedger: Object.freeze(finalLedger),
        finalCatalog: structuralFinalCatalog,
        finalCatalogHash,
        expectedCatalogMatch
      });
    } finally {
      await client.end();
    }
  } finally {
    if (started || existsSync(path.join(dataDirectory, 'postmaster.pid'))) {
      try {
        run(path.join(postgresBin, 'pg_ctl.exe'), [`--pgdata=${dataDirectory}`, '--mode=fast', '--wait', 'stop'], { detachedIo: true });
      } catch {
        // Cleanup continues; original failures remain authoritative.
      }
    }
    await rm(rootDirectory, { recursive: true, force: true });
  }
}

export async function rehearseProductionMigrationUpgrade({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_UPGRADE_CONFIRMATION !== CONFIRMATION) throw new Error('DISPOSABLE_UPGRADE_CONFIRMATION_REQUIRED');
  validateRehearsalEnvironment(env);
  const migrationSet = await loadExactMigrationSet();
  const [expectedBaselineRaw, expectedBaselineHashRaw] = await Promise.all([
    readFile(EXPECTED_BASELINE_PATH, 'utf8'),
    readFile(EXPECTED_BASELINE_HASH_PATH, 'utf8')
  ]);
  const expectedBaselineHash = sha256(expectedBaselineRaw);
  if (!expectedBaselineHashRaw.startsWith(`${expectedBaselineHash}  `)) throw new Error('EXPECTED_BASELINE_HASH_MISMATCH');
  const expectedBaseline = JSON.parse(expectedBaselineRaw);
  const postgresBin = resolvePostgresBin(env);
  const first = await runOneRehearsal({ postgresBin, migrationSet, expectedCatalog: expectedBaseline.catalog, runLabel: 'A' });
  const second = await runOneRehearsal({ postgresBin, migrationSet, expectedCatalog: expectedBaseline.catalog, runLabel: 'B' });
  const firstDeterministic = canonicalJson(first.deterministicSummary);
  const secondDeterministic = canonicalJson(second.deterministicSummary);
  if (firstDeterministic !== secondDeterministic) throw new Error('REHEARSAL_DETERMINISM_MISMATCH');
  const deterministicEvidenceHash = sha256(firstDeterministic);
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const evidence = canonicalValue({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commitSha,
    scope: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    productionReadiness: '70_PERCENT_NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionConnectionAttempted: false,
    productionMutation: false,
    postgresMajorVersion: 18,
    baselineVersions: BASELINE_VERSIONS,
    upgradeAllowlist: REQUIRED_MISSING_VERSIONS,
    intentionalExcludedVersions: ['0010'],
    expectedCatalogBaselineSha256: expectedBaselineHash,
    deterministicEvidenceSha256: deterministicEvidenceHash,
    deterministic: 'PASS',
    runs: [first, second].map(({ deterministicSummary, ...run }) => ({
      ...run,
      deterministicSummarySha256: sha256(canonicalJson(deterministicSummary))
    }))
  });
  const sanitized = validateSanitizedEvidence(evidence);
  if (sanitized.status !== 'PASS') throw new Error(`EVIDENCE_SANITIZATION_BLOCKED:${sanitized.failures.join(',')}`);
  const serialized = canonicalJson(evidence);
  const evidenceHash = sha256(serialized);
  await writeFile(EVIDENCE_PATH, serialized, 'utf8');
  await writeFile(EVIDENCE_HASH_PATH, `${evidenceHash}  PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json\n`, 'utf8');
  return Object.freeze({
    status: 'PASS',
    environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    postgresMajorVersion: 18,
    baseline: 'PASS',
    upgradeOrder: Object.freeze([...REQUIRED_MISSING_VERSIONS]),
    intentionalExcludedVersions: Object.freeze(['0010']),
    runs: Object.freeze([first, second].map(run => Object.freeze({
      run: run.run,
      baselineCatalogHash: run.baselineCatalogHash,
      finalCatalogHash: run.finalCatalogHash,
      upgrades: Object.freeze(run.upgrades.map(item => Object.freeze({ version: item.version, durationMs: item.durationMs })))
    }))),
    deterministic: 'PASS',
    deterministicEvidenceSha256: deterministicEvidenceHash,
    evidenceSha256: evidenceHash,
    evidenceFile: 'docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json',
    productionConnectionAttempted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseProductionMigrationUpgrade().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Disposable Migration upgrade rehearsal failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
