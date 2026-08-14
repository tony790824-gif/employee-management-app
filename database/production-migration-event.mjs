import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { authenticatedTlsConfig } from './compare-production-catalog.mjs';
import { normalizeStartingCatalog } from './compare-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import { STRUCTURAL_SECTIONS } from './materialize-production-starting-baseline.mjs';
import {
  applyMigrationStep,
  loadExactMigrationSet
} from './rehearse-production-migration-upgrade.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from './rehearse-structural-schema-parity.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const STARTING_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const FINAL_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_EVENT_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_EVENT_EVIDENCE.sha256');

export const PRODUCTION_EVENT_CONFIRMATION = 'EXECUTE_BANKE_PRODUCTION_MIGRATION_EVENT';
export const RESTORE_POINT_CONFIRMATION = 'EVENT_RESTORE_POINT_VERIFIED';
export const MAINTENANCE_CONFIRMATION = 'EVENT_WRITES_DRAINED';
export const APPROVED_UPGRADE_SEQUENCE = Object.freeze([
  '0009', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_OPERATOR = /(?:^|[_-])(?:readonly|reader|api|push|staging)(?:$|[_-])/i;
const FORBIDDEN_EVIDENCE_KEY = /(?:credential|string|hostname|endpoint|password|secret|token|cookie|authorization|url|role.?name|user.?name)/i;

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
}

function sanitizeCatalog(value) {
  if (Array.isArray(value)) return value.map(sanitizeCatalog);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'acl')
    .map(([key, child]) => [key, sanitizeCatalog(child)]));
}

function structuralCatalog(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, sanitizeCatalog(catalog?.[section] || [])]));
}

function forbiddenEvidencePath(value, parts = []) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const next = [...parts, key];
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) return next.join('.');
    const nested = forbiddenEvidencePath(child, next);
    if (nested) return nested;
  }
  return null;
}

export function productionMigrationEventConfig(env = process.env, { head = gitHead() } = {}) {
  if (env.BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION !== PRODUCTION_EVENT_CONFIRMATION) throw new Error('EVENT_AUTHORIZATION_REQUIRED');
  if (env.BANK_PRODUCTION_RESTORE_POINT_STATUS !== RESTORE_POINT_CONFIRMATION) throw new Error('EVENT_RESTORE_POINT_REQUIRED');
  if (env.BANK_PRODUCTION_MAINTENANCE_STATUS !== MAINTENANCE_CONFIRMATION) throw new Error('EVENT_MAINTENANCE_DRAIN_REQUIRED');
  if (String(env.BANK_ENV || '').toLowerCase() !== 'production') throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');

  const value = String(env.DATABASE_MIGRATOR_URL || '').trim();
  const expectedDatabase = String(env.BANK_PRODUCTION_DATABASE_NAME || '').trim();
  const expectedOperator = String(env.BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE || '').trim();
  const expectedCommit = String(env.BANK_PRODUCTION_MIGRATION_COMMIT_SHA || '').trim();
  const caInput = String(env.BANK_PRODUCTION_CA_BUNDLE || '').trim();
  if (!value || !expectedDatabase || !expectedOperator || !expectedCommit || !caInput) throw new Error('PROTECTED_EVENT_INPUT_MISSING');
  if (!SAFE_IDENTIFIER.test(expectedDatabase) || !SAFE_IDENTIFIER.test(expectedOperator) || FORBIDDEN_OPERATOR.test(expectedOperator)) {
    throw new Error('MIGRATION_OPERATOR_EXPECTATION_BLOCKED');
  }
  if (expectedCommit !== head) throw new Error('EVENT_COMMIT_IDENTITY_MISMATCH');

  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('MIGRATOR_PROTOCOL_BLOCKED');
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = parsed.hostname;
  if (!host || !user || !password || user !== expectedOperator || database !== expectedDatabase) throw new Error('MIGRATOR_IDENTITY_BLOCKED');
  if (['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase()) || host.includes('-pooler.')) throw new Error('MIGRATOR_DIRECT_TARGET_REQUIRED');
  if (parsed.searchParams.get('sslmode') !== 'verify-full') throw new Error('TLS_VERIFY_FULL_REQUIRED');
  if (parsed.searchParams.get('channel_binding') !== 'require') throw new Error('CHANNEL_BINDING_REQUIRED');

  const caPath = path.resolve(caInput);
  const tempRoot = path.resolve(os.tmpdir());
  if (caPath !== tempRoot && !caPath.startsWith(`${tempRoot}${path.sep}`)) throw new Error('PRODUCTION_CA_BUNDLE_MUST_BE_TEMPORARY');
  return Object.freeze({
    expectedDatabase,
    expectedOperator,
    expectedCommit,
    caPath,
    client: Object.freeze({ host, port: parsed.port ? Number(parsed.port) : 5432, database, user, password, connectionTimeoutMillis: 10_000 })
  });
}

function compareLedger(expected, observed) {
  const normalized = rows => rows.map(row => ({ version: String(row.version), name: row.name, checksum: row.checksum }));
  return canonicalJson(normalized(expected)) === canonicalJson(normalized(observed));
}

async function collectCatalog(client) {
  const catalog = {};
  for (const [section, sql] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) catalog[section] = (await client.query(sql)).rows;
  return catalog;
}

async function verifyIdentityAndOperator(client, config) {
  const identity = (await client.query(`
    SELECT current_database() = $1 AS database_ok,
           current_user = $2 AS user_ok,
           session_user = $2 AS session_ok,
           current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 AS version_ok
  `, [config.expectedDatabase, config.expectedOperator])).rows[0];
  if (!identity?.database_ok || !identity?.user_ok || !identity?.session_ok || !identity?.version_ok) throw new Error('EVENT_IDENTITY_BLOCKED');
  const boundary = (await client.query(`
    SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
           AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolcanlogin
           AND pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
           AND pg_catalog.has_schema_privilege(current_user, 'app_private', 'CREATE')
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_class c
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r','p','v','m','S')
               AND c.relowner <> r.oid
               AND NOT EXISTS (
                 SELECT 1 FROM pg_catalog.pg_depend d
                 WHERE d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
                   AND d.objid = c.oid AND d.deptype = 'e'
               )
           )
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_proc p
             JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname IN ('public', 'app_private') AND p.proowner <> r.oid
               AND NOT EXISTS (
                 SELECT 1 FROM pg_catalog.pg_depend d
                 WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                   AND d.objid = p.oid AND d.deptype = 'e'
               )
           ) AS operator_safe
      FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
  `)).rows[0];
  if (!boundary?.operator_safe) throw new Error('MIGRATION_OPERATOR_BOUNDARY_BLOCKED');
}

async function verifyStructuralBaseline(client, baseline, migrationOwner, code) {
  const observed = normalizeStartingCatalog(await collectCatalog(client), migrationOwner);
  if (canonicalJson(structuralCatalog(observed)) !== canonicalJson(structuralCatalog(baseline.catalog))) throw new Error(code);
  return sha256(canonicalJson(structuralCatalog(observed)));
}

export async function executeProductionMigrationEvent({ env = process.env, clientFactory, head } = {}) {
  const config = productionMigrationEventConfig(env, { head: head || gitHead() });
  const [ca, migrationSet, startingBaseline, finalBaseline] = await Promise.all([
    readFile(config.caPath, 'utf8'),
    loadExactMigrationSet(),
    readFile(STARTING_BASELINE_PATH, 'utf8').then(JSON.parse),
    readFile(FINAL_BASELINE_PATH, 'utf8').then(JSON.parse)
  ]);
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('PRODUCTION_CA_BUNDLE_INVALID');
  if (canonicalJson(migrationSet.upgrade.map(item => item.version)) !== canonicalJson(APPROVED_UPGRADE_SEQUENCE)) throw new Error('EVENT_SEQUENCE_BLOCKED');
  if (migrationSet.upgrade.some(item => item.version === '0010')) throw new Error('MIGRATION_0010_REJECTED');

  const client = clientFactory
    ? clientFactory(config)
    : new Client({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
  let connectionCount = 0;
  await client.connect();
  connectionCount += 1;
  try {
    await verifyIdentityAndOperator(client, config);
    await client.query('BEGIN TRANSACTION READ ONLY');
    let startingFingerprint;
    try {
      const ledger = (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows;
      if (!compareLedger(migrationSet.baseline, ledger)) throw new Error('EVENT_STARTING_LEDGER_BLOCKED');
      startingFingerprint = await verifyStructuralBaseline(client, startingBaseline, config.expectedOperator, 'EVENT_NON_ACL_STARTING_BASELINE_BLOCKED');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const applied = [...migrationSet.baseline];
    const results = [];
    for (const migration of migrationSet.upgrade) {
      results.push(await applyMigrationStep(client, migration, applied));
      applied.push(migration);
    }

    await client.query('BEGIN TRANSACTION READ ONLY');
    let finalFingerprint;
    try {
      const ledger = (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows;
      if (!compareLedger(applied, ledger)) throw new Error('EVENT_FINAL_LEDGER_BLOCKED');
      finalFingerprint = await verifyStructuralBaseline(client, finalBaseline, config.expectedOperator, 'EVENT_NON_ACL_FINAL_BASELINE_BLOCKED');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const evidence = Object.freeze({
      schemaVersion: 1,
      mode: 'PRODUCTION_MIGRATION_EVENT',
      timestamp: new Date().toISOString(),
      commitSha: config.expectedCommit,
      connectionCount,
      retryCount: 0,
      approvedSequence: APPROVED_UPGRADE_SEQUENCE,
      excludedVersions: ['0010'],
      restorePoint: 'VERIFIED_BEFORE_CONNECTION',
      trafficState: 'WRITES_DRAINED',
      operatorBoundary: 'PASS',
      startingLedger: 'PASS',
      startingNonAclStructural: 'PASS',
      startingFingerprint,
      migrationResults: results.map(({ version, checksum, precondition, postcondition, transaction, durationMs }) => ({ version, checksum, precondition, postcondition, transaction, durationMs })),
      finalLedger: 'PASS',
      finalNonAclStructural: 'PASS',
      finalFingerprint,
      aclSemantic: 'SEPARATE_TRAFFIC_GO_GATE',
      productionMutation: 'EXACT_13_MIGRATION_TRANSACTIONS_ONLY'
    });
    const forbidden = forbiddenEvidencePath(evidence);
    if (forbidden) throw new Error(`EVENT_EVIDENCE_SANITIZATION_BLOCKED:${forbidden}`);
    const serialized = canonicalJson(evidence);
    const hash = createHash('sha256').update(serialized).digest('hex');
    await writeFile(EVIDENCE_PATH, serialized, 'utf8');
    await writeFile(EVIDENCE_HASH_PATH, `${hash}  PRODUCTION_MIGRATION_EVENT_EVIDENCE.json\n`, 'utf8');
    return Object.freeze({ evidence, evidenceHash: hash });
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    const output = await executeProductionMigrationEvent();
    process.stdout.write('PRODUCTION_MIGRATION_EVENT=PASS\n');
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${output.evidenceHash}\n`);
  } catch (error) {
    process.stderr.write('PRODUCTION_MIGRATION_EVENT=BLOCKED\n');
    process.stderr.write(`PRODUCTION_MIGRATION_EVENT_ERROR=${String(error?.message || 'SANITIZED_FAILURE').replace(/[^A-Z0-9_:.-]/gi, '_').slice(0, 160)}\n`);
    process.exitCode = 2;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
