import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  loadExpectedInventory,
  validateExpectedInventory
} from './production-schema-parity-plan.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATION_ROOT = path.join(PROJECT_ROOT, 'database', 'migrations');
const ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.sha256');
const CONFIRMATION = 'MATERIALIZE_BANKE_DISPOSABLE_BASELINE';
const OWNER = 'banke_baseline_owner';
const DATABASE_PREFIX = 'banke_expected_catalog_';
const TEMP_PREFIX = 'banke-disposable-catalog-';
const FORBIDDEN_ENVIRONMENT_KEYS = Object.freeze([
  'DATABASE_URL',
  'DATABASE_MIGRATOR_URL',
  'DATABASE_READONLY_URL',
  'BANK_PRODUCTION_DATABASE_HOST'
]);

export const CATALOG_QUERIES = Object.freeze({
  schemas: `
    SELECT n.nspname AS schema_name,
           pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
           COALESCE(n.nspacl::text, '') AS acl
      FROM pg_catalog.pg_namespace n
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname`,
  relations: `
    SELECT n.nspname AS schema_name,
           c.relname AS relation_name,
           c.relkind AS relation_kind,
           pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           COALESCE(c.relacl::text, '') AS acl
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
       AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
     ORDER BY n.nspname, c.relname`,
  columns: `
    SELECT namespace.nspname AS schema_name,
           relation.relname AS table_name,
           attribute.attnum AS ordinal_position,
           attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, NULL) AS data_type,
           type_namespace.nspname AS udt_schema,
           type.typname AS udt_name,
           CASE WHEN attribute.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
           CASE WHEN attribute.attgenerated = ''
             THEN COALESCE(pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid), '')
             ELSE ''
           END AS column_default,
           CASE WHEN attribute.attidentity = '' THEN 'NO' ELSE 'YES' END AS is_identity,
           CASE attribute.attidentity
             WHEN 'a' THEN 'ALWAYS'
             WHEN 'd' THEN 'BY DEFAULT'
             ELSE ''
           END AS identity_generation
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_type AS type ON type.oid = attribute.atttypid
      JOIN pg_catalog.pg_namespace AS type_namespace ON type_namespace.oid = type.typnamespace
      LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
        ON attribute_default.adrelid = attribute.attrelid
       AND attribute_default.adnum = attribute.attnum
     WHERE namespace.nspname IN ('public', 'app_private')
       AND relation.relkind IN ('r', 'p', 'v', 'm')
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
     ORDER BY namespace.nspname, relation.relname, attribute.attnum`,
  constraints: `
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           con.conname AS constraint_name,
           con.contype AS constraint_type,
           con.condeferrable AS is_deferrable,
           con.condeferred AS initially_deferred,
           con.convalidated AS is_validated,
           pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname, c.relname, con.conname`,
  indexes: `
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           i.relname AS index_name,
           pg_catalog.pg_get_userbyid(i.relowner) AS owner_name,
           ix.indisunique AS is_unique,
           ix.indisprimary AS is_primary,
           ix.indisvalid AS is_valid,
           pg_catalog.pg_get_indexdef(ix.indexrelid) AS definition
      FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
      JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname, c.relname, i.relname`,
  functions: `
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
           p.prokind AS function_kind,
           p.prosecdef AS security_definer,
           p.provolatile AS volatility,
           COALESCE(p.proacl::text, '') AS acl,
           COALESCE(e.extname, '') AS extension_name
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_catalog.pg_depend d
        ON d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
       AND d.objid = p.oid
       AND d.deptype = 'e'
      LEFT JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname, p.proname,
              pg_catalog.pg_get_function_identity_arguments(p.oid)`,
  triggers: `
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           t.tgname AS trigger_name,
           t.tgenabled AS enabled_mode,
           pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
       AND NOT t.tgisinternal
     ORDER BY n.nspname, c.relname, t.tgname`,
  sequences: `
    SELECT n.nspname AS schema_name,
           c.relname AS sequence_name,
           pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
           s.seqtypid::pg_catalog.regtype::text AS data_type,
           s.seqstart::text AS start_value,
           s.seqincrement::text AS increment_by,
           s.seqmin::text AS minimum_value,
           s.seqmax::text AS maximum_value,
           s.seqcache::text AS cache_size,
           s.seqcycle AS cycles
      FROM pg_catalog.pg_sequence s
      JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname, c.relname`,
  policies: `
    SELECT p.schemaname AS schema_name,
           p.tablename AS table_name,
           p.policyname AS policy_name,
           p.permissive,
           p.roles,
           p.cmd,
           COALESCE(p.qual, '') AS using_expression,
           COALESCE(p.with_check, '') AS check_expression
      FROM pg_catalog.pg_policies p
     WHERE p.schemaname IN ('public', 'app_private')
     ORDER BY p.schemaname, p.tablename, p.policyname`,
  extensions: `
    SELECT e.extname AS extension_name,
           e.extversion AS extension_version,
           n.nspname AS schema_name,
           pg_catalog.pg_get_userbyid(e.extowner) AS owner_name
      FROM pg_catalog.pg_extension e
      JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
     ORDER BY e.extname`
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function replaceOwner(value, ownerName) {
  if (typeof value !== 'string') return value;
  return value.split(ownerName).join('$MIGRATION_OWNER');
}

export function normalizeCatalog(rawCatalog, ownerName = OWNER) {
  const normalize = value => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (!value || typeof value !== 'object') return replaceOwner(value, ownerName);
    const ownerPlaceholder = value.extension_name
      ? `$EXTENSION_OWNER:${value.extension_name}`
      : '$MIGRATION_OWNER';
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => {
      if (key === 'owner_name' && child === ownerName) return [key, ownerPlaceholder];
      if (typeof child === 'string') return [key, child.split(ownerName).join(ownerPlaceholder)];
      return [key, normalize(child)];
    }));
  };
  return normalize(rawCatalog);
}

export function validateNoProductionInputs(env = process.env) {
  const present = FORBIDDEN_ENVIRONMENT_KEYS.filter(key => String(env[key] || '').trim());
  if (present.length) throw new Error(`PRODUCTION_INPUT_PRESENT:${present.join(',')}`);
  return Object.freeze({ status: 'PASS', forbiddenInputsPresent: false });
}

export function validateDisposableIdentity(identity, expected) {
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

export async function loadApprovedMigrations() {
  const inventory = await loadExpectedInventory();
  const validation = await validateExpectedInventory(inventory);
  if (validation.status !== 'PASS') throw new Error(`MIGRATION_INVENTORY_BLOCKED:${validation.failures.join(',')}`);
  const entries = inventory.migrations.filter(item => item.sourceStatus === 'TRACKED');
  if (entries.length !== 21 || entries.some(item => item.version === '0010')) {
    throw new Error('APPROVED_MIGRATION_SET_MISMATCH');
  }
  return Promise.all(entries.map(async item => ({
    ...item,
    sql: await readFile(path.join(MIGRATION_ROOT, item.file), 'utf8')
  })));
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

function resolvePostgresBin(env = process.env) {
  const candidates = [
    String(env.BANK_DISPOSABLE_POSTGRES_BIN || '').trim(),
    'C:\\Program Files\\PostgreSQL\\18\\bin'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(path.join(candidate, 'postgres.exe'), ['--version'], { stdio: 'ignore' });
      return path.resolve(candidate);
    } catch {
      // Try the next explicitly local PostgreSQL installation candidate.
    }
  }
  throw new Error('LOCAL_POSTGRESQL_18_NOT_FOUND');
}

function run(binary, args, { detachedIo = false } = {}) {
  const result = spawnSync(binary, args, detachedIo
    ? { stdio: 'ignore', windowsHide: true }
    : { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${path.basename(binary)} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]+$/.test(value)) throw new Error('UNSAFE_DATABASE_IDENTIFIER');
  return `"${value}"`;
}

async function connect(port, password, database = 'postgres') {
  const client = new Client({ host: '127.0.0.1', port, database, user: OWNER, password, ssl: false });
  await client.connect();
  return client;
}

async function createDatabase(port, password, databaseName) {
  const client = await connect(port, password);
  try {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0 ENCODING 'UTF8'`);
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

async function applyMigrations(client, migrations) {
  await client.query(`
    CREATE TABLE public.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
  for (const migration of migrations) {
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO public.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`MIGRATION_FAILED:${migration.version}:${error.message}`);
    }
  }
}

async function readCatalog(client, migrations) {
  const ledger = await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version');
  const expectedLedger = migrations.map(({ version, name, checksum }) => ({ version, name, checksum }));
  if (JSON.stringify(ledger.rows) !== JSON.stringify(expectedLedger) || ledger.rows.some(row => row.version === '0010')) {
    throw new Error('MIGRATION_LEDGER_MISMATCH');
  }
  const catalog = { migrationLedger: ledger.rows };
  for (const [name, sql] of Object.entries(CATALOG_QUERIES)) {
    catalog[name] = (await client.query(sql)).rows;
  }
  return catalog;
}

function baselineDocument(catalog, migrations) {
  const normalizedCatalog = normalizeCatalog(catalog);
  const migrationInventory = migrations.map(({ version, name, file, checksum }) => ({ version, name, file, checksum }));
  const objectCounts = Object.fromEntries(Object.entries(normalizedCatalog).map(([key, value]) => [key, value.length]));
  return canonicalValue({
    schemaVersion: 1,
    postgresMajorVersion: 18,
    expectedMigrationRange: { start: '0001', end: '0022', ledgerEntries: 21 },
    intentionalGaps: ['0010'],
    normalization: {
      ownerPlaceholder: '$MIGRATION_OWNER',
      extensionOwnerPlaceholder: '$EXTENSION_OWNER:<extension_name>',
      omittedFields: ['applied_at', 'database_name', 'data_directory', 'hostname', 'port', 'object_oid'],
      catalogSchemas: ['public', 'app_private']
    },
    migrationInventory,
    objectCounts,
    catalog: normalizedCatalog
  });
}

async function buildDatabase(port, password, rootDirectory, migrations, suffix) {
  const databaseName = `${DATABASE_PREFIX}${suffix}`;
  await createDatabase(port, password, databaseName);
  const client = await connect(port, password, databaseName);
  try {
    const identity = await inspectIdentity(client);
    const identityResult = validateDisposableIdentity(identity, { databaseName, rootDirectory });
    if (identityResult.status !== 'PASS') throw new Error(`DISPOSABLE_IDENTITY_BLOCKED:${identityResult.failures.join(',')}`);
    await applyMigrations(client, migrations);
    const catalog = await readCatalog(client, migrations);
    const baseline = baselineDocument(catalog, migrations);
    const serialized = canonicalJson(baseline);
    return { databaseName, identityResult, baseline, serialized, hash: sha256(serialized) };
  } finally {
    await client.end();
  }
}

export async function materializeExpectedCatalog({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_BASELINE_CONFIRMATION !== CONFIRMATION) throw new Error('DISPOSABLE_CONFIRMATION_REQUIRED');
  validateNoProductionInputs(env);
  const migrations = await loadApprovedMigrations();
  const postgresBin = resolvePostgresBin(env);
  const rootDirectory = path.join(os.tmpdir(), `${TEMP_PREFIX}${randomBytes(8).toString('hex')}`);
  const dataDirectory = path.join(rootDirectory, 'data');
  const passwordFile = path.join(rootDirectory, 'initdb-password.txt');
  const disposablePassword = randomBytes(32).toString('base64url');
  const port = await unusedPort();
  let started = false;
  await mkdir(rootDirectory, { recursive: false });
  try {
    await writeFile(passwordFile, `${disposablePassword}\n`, { encoding: 'utf8', mode: 0o600 });
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
    const first = await buildDatabase(port, disposablePassword, rootDirectory, migrations, `a_${randomBytes(4).toString('hex')}`);
    const second = await buildDatabase(port, disposablePassword, rootDirectory, migrations, `b_${randomBytes(4).toString('hex')}`);
    if (first.hash !== second.hash || first.serialized !== second.serialized) {
      throw new Error('BASELINE_REPRODUCIBILITY_MISMATCH');
    }
    await writeFile(ARTIFACT_PATH, first.serialized, 'utf8');
    await writeFile(HASH_PATH, `${first.hash}  production-expected-catalog-baseline.json\n`, 'utf8');
    return Object.freeze({
      status: 'PASS',
      environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
      postgresMajorVersion: 18,
      identityVerification: 'PASS',
      appliedMigrations: Object.freeze(migrations.map(item => item.version)),
      intentionalGapsExcluded: Object.freeze(['0010']),
      migrationLedger: 'PASS',
      artifactPath: path.relative(PROJECT_ROOT, ARTIFACT_PATH).replaceAll('\\', '/'),
      hashPath: path.relative(PROJECT_ROOT, HASH_PATH).replaceAll('\\', '/'),
      sha256: first.hash,
      reproducibility: 'PASS',
      objectCounts: first.baseline.objectCounts,
      productionConnectionAttempted: false,
      productionSqlExecuted: false
    });
  } finally {
    if (started || existsSync(path.join(dataDirectory, 'postmaster.pid'))) {
      try {
        run(path.join(postgresBin, 'pg_ctl.exe'), [
          `--pgdata=${dataDirectory}`,
          '--mode=fast',
          '--wait',
          'stop'
        ], { detachedIo: true });
      } catch {
        // Cleanup continues; the caller still receives the original failure when one exists.
      }
    }
    await rm(rootDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  materializeExpectedCatalog().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Expected catalog materialization failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
