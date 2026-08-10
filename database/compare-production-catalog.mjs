import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CATALOG_QUERIES, canonicalJson, normalizeCatalog, sha256 } from './materialize-expected-catalog.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const BASELINE_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.sha256');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.sha256');
const CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_CATALOG';
const FORBIDDEN_ROLE_NAME = /(?:^|[_-])(?:owner|admin|superuser|migrator|migration|api|runtime|push|staging)(?:$|[_-])/i;
const FORBIDDEN_EVIDENCE_KEY = /(?:credential|connection|string|hostname|endpoint|project.?id|branch.?id|password|secret|token|cookie|authorization|role.?name|user.?name)/i;

const ROLE_BOUNDARY_SQL = `
  SELECT NOT roles.rolsuper
         AND NOT roles.rolcreatedb
         AND NOT roles.rolcreaterole
         AND NOT roles.rolreplication
         AND NOT roles.rolbypassrls
         AND roles.rolcanlogin
         AND NOT roles.rolinherit
         AND NOT EXISTS (
           SELECT 1
             FROM pg_catalog.pg_roles AS granted_role
            WHERE granted_role.oid <> roles.oid
              AND pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'MEMBER')
              AND (
                pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'MEMBER WITH ADMIN OPTION')
                OR pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'USAGE')
                OR pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'SET')
              )
         )
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = roles.oid)
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = roles.oid)
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = roles.oid)
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = roles.oid)
         AS role_safe
    FROM pg_catalog.pg_roles AS roles
   WHERE roles.rolname = current_user`;

function forbiddenEvidencePath(value, pathParts = []) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) return nextPath.join('.');
    const nested = forbiddenEvidencePath(child, nextPath);
    if (nested) return nested;
  }
  return null;
}

function safeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value);
}

export function productionConnectionConfig(env = process.env) {
  if (env.BANK_PRODUCTION_PARITY_CONFIRMATION !== CONFIRMATION) {
    throw new Error('PRODUCTION_PARITY_CONFIRMATION_REQUIRED');
  }
  if (String(env.BANK_ENV || '').trim().toLowerCase() !== 'production') {
    throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');
  }
  const urlValue = String(env.DATABASE_READONLY_URL || '').trim();
  const expectedDatabase = String(env.BANK_PRODUCTION_DATABASE_NAME || '').trim();
  const expectedRole = String(env.BANK_PRODUCTION_READONLY_ROLE || '').trim();
  const caInput = String(env.BANK_PRODUCTION_CA_BUNDLE || '').trim();
  if (!urlValue || !expectedDatabase || !expectedRole || !caInput) {
    throw new Error('PROTECTED_PRODUCTION_INPUT_MISSING');
  }
  if (!safeIdentifier(expectedDatabase) || !safeIdentifier(expectedRole) || FORBIDDEN_ROLE_NAME.test(expectedRole)) {
    throw new Error('PRODUCTION_IDENTITY_EXPECTATION_BLOCKED');
  }
  const parsed = new URL(urlValue);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = parsed.hostname;
  if (!host || !user || !password || !database || user !== expectedRole || database !== expectedDatabase) {
    throw new Error('PRODUCTION_URL_IDENTITY_BLOCKED');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
    throw new Error('PRODUCTION_LOOPBACK_TARGET_BLOCKED');
  }
  const caPath = path.resolve(caInput);
  const tempRoot = path.resolve(os.tmpdir());
  if (caPath !== tempRoot && !caPath.startsWith(`${tempRoot}${path.sep}`)) {
    throw new Error('PRODUCTION_CA_BUNDLE_MUST_BE_TEMPORARY');
  }
  return Object.freeze({
    expectedDatabase,
    expectedRole,
    caPath,
    client: Object.freeze({ host, port: parsed.port ? Number(parsed.port) : 5432, database, user, password, connectionTimeoutMillis: 10_000 })
  });
}

export function compareMigrationLedger(expected, observed) {
  const differences = [];
  const expectedByVersion = new Map(expected.map(row => [String(row.version), row]));
  const observedByVersion = new Map(observed.map(row => [String(row.version), row]));
  for (const [version, row] of expectedByVersion) {
    const actual = observedByVersion.get(version);
    if (!actual) differences.push(`MISSING:${version}`);
    else if (actual.name !== row.name || actual.checksum !== row.checksum) differences.push(`MISMATCH:${version}`);
  }
  for (const version of observedByVersion.keys()) {
    if (!expectedByVersion.has(version)) differences.push(`UNEXPECTED:${version}`);
  }
  return Object.freeze({ status: differences.length ? 'BLOCKED' : 'PASS', differences: Object.freeze(differences.sort()) });
}

function rowKey(section, row, index) {
  const fields = {
    schemas: ['schema_name'], relations: ['schema_name', 'relation_name'],
    columns: ['schema_name', 'table_name', 'ordinal_position', 'column_name'],
    constraints: ['schema_name', 'table_name', 'constraint_name'],
    indexes: ['schema_name', 'table_name', 'index_name'],
    functions: ['schema_name', 'function_name', 'identity_arguments'],
    triggers: ['schema_name', 'table_name', 'trigger_name'],
    sequences: ['schema_name', 'sequence_name'], policies: ['schema_name', 'table_name', 'policy_name'],
    extensions: ['extension_name']
  }[section] || [];
  return fields.map(field => String(row[field] ?? '')).join('/') || String(index);
}

export function compareCatalogSection(section, expectedRows, observedRows) {
  const expected = new Map(expectedRows.map((row, index) => [rowKey(section, row, index), row]));
  const observed = new Map(observedRows.map((row, index) => [rowKey(section, row, index), row]));
  const differences = [];
  for (const [key, row] of expected) {
    const actual = observed.get(key);
    if (!actual) {
      differences.push(`MISSING:${section}:${key}`);
      continue;
    }
    const changedFields = [...new Set([...Object.keys(row), ...Object.keys(actual)])]
      .filter(field => canonicalJson(row[field]) !== canonicalJson(actual[field])).sort();
    if (changedFields.length) differences.push(`MISMATCH:${section}:${key}:${changedFields.join(',')}`);
  }
  for (const key of observed.keys()) if (!expected.has(key)) differences.push(`UNEXPECTED:${section}:${key}`);
  return Object.freeze({ status: differences.length ? 'BLOCKED' : 'PASS', differences: Object.freeze(differences.sort()) });
}

function result(status, differences = []) {
  return Object.freeze({ status, differences: Object.freeze([...differences]) });
}

export function compareCatalogs(expectedCatalog, observedCatalog) {
  const sections = Object.keys(expectedCatalog).filter(name => name !== 'migrationLedger');
  const sectionResults = Object.fromEntries(sections.map(section => [
    section, compareCatalogSection(section, expectedCatalog[section], observedCatalog[section] || [])
  ]));
  const merge = names => result(
    names.every(name => sectionResults[name].status === 'PASS') ? 'PASS' : 'BLOCKED',
    names.flatMap(name => sectionResults[name].differences)
  );
  return Object.freeze({
    schemaParityResult: merge(['schemas', 'relations', 'columns', 'constraints', 'indexes', 'sequences', 'triggers']),
    functionParityResult: merge(['functions']),
    aclResult: merge(['schemas', 'relations', 'functions']),
    rlsPolicyResult: merge(['relations', 'policies']),
    extensionResult: merge(['extensions'])
  });
}

function observedRange(rows) {
  return rows.length ? Object.freeze({ start: String(rows[0].version), end: String(rows.at(-1).version), count: rows.length }) : null;
}

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
}

async function writeEvidence(evidence) {
  if (forbiddenEvidencePath(evidence)) throw new Error('EVIDENCE_CONTAINS_FORBIDDEN_FIELD');
  const serialized = canonicalJson(evidence);
  const hash = sha256(serialized);
  await writeFile(EVIDENCE_PATH, serialized, 'utf8');
  await writeFile(EVIDENCE_HASH_PATH, `${hash}  PRODUCTION_SCHEMA_PARITY_EVIDENCE.json\n`, 'utf8');
  return hash;
}

function baseEvidence(baselineHash, ledger, ledgerResult) {
  return {
    timestamp: new Date().toISOString(), commitSha: gitHead(), expectedBaselineHash: baselineHash,
    productionCatalogHash: null, identityResult: 'PASS', tlsVerification: 'VERIFY_FULL_PASS',
    expectedMigrationRange: { start: '0001', end: '0022', count: 21 },
    observedMigrationRange: observedRange(ledger), checksumResult: ledgerResult
  };
}

async function loadBaseline() {
  const [text, hashText] = await Promise.all([readFile(BASELINE_PATH, 'utf8'), readFile(BASELINE_HASH_PATH, 'utf8')]);
  const expectedHash = hashText.trim().match(/^([a-f0-9]{64})\s+/)?.[1];
  const actualHash = createHash('sha256').update(text, 'utf8').digest('hex');
  if (!expectedHash || expectedHash !== actualHash) throw new Error('EXPECTED_BASELINE_HASH_MISMATCH');
  return Object.freeze({ baseline: JSON.parse(text), hash: actualHash });
}

async function collectCatalog(client, expectedRole, expectedDatabase, baseline) {
  const identity = (await client.query(`
    SELECT current_database() = $1 AS database_ok, current_user = $2 AS current_role_ok,
           session_user = $2 AS session_role_ok,
           current_setting('transaction_read_only') = 'on' AS read_only_ok,
           current_setting('server_version_num')::integer AS server_version_number`, [expectedDatabase, expectedRole])).rows[0];
  if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
      || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) {
    throw new Error('PRODUCTION_IDENTITY_BOUNDARY_BLOCKED');
  }
  if (!(await client.query(ROLE_BOUNDARY_SQL)).rows[0]?.role_safe) throw new Error('PRODUCTION_ROLE_BOUNDARY_BLOCKED');
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    const ledger = (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows;
    const ledgerResult = compareMigrationLedger(baseline.catalog.migrationLedger, ledger);
    if (ledgerResult.status !== 'PASS') {
      await client.query('ROLLBACK');
      return Object.freeze({ ledger, ledgerResult, catalog: null });
    }
    const catalog = { migrationLedger: ledger };
    for (const [section, sql] of Object.entries(CATALOG_QUERIES)) catalog[section] = (await client.query(sql)).rows;
    await client.query('COMMIT');
    return Object.freeze({ ledger, ledgerResult, catalog });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function compareProductionCatalog(env = process.env) {
  const config = productionConnectionConfig(env);
  const ca = await readFile(config.caPath, 'utf8');
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('PRODUCTION_CA_BUNDLE_INVALID');
  const { baseline, hash: baselineHash } = await loadBaseline();
  const client = new Client({ ...config.client, ssl: { ca, rejectUnauthorized: true } });
  await client.connect();
  try {
    const collected = await collectCatalog(client, config.expectedRole, config.expectedDatabase, baseline);
    const common = baseEvidence(baselineHash, collected.ledger, collected.ledgerResult);
    if (!collected.catalog) {
      const notEvaluated = result('BLOCKED', ['NOT_EVALUATED_AFTER_MIGRATION_LEDGER_MISMATCH']);
      const evidence = Object.freeze({ ...common, schemaParityResult: notEvaluated, functionParityResult: notEvaluated,
        aclResult: notEvaluated, rlsPolicyResult: notEvaluated, extensionResult: notEvaluated,
        finalStatus: 'BLOCKED', stopReasons: ['MIGRATION_LEDGER_MISMATCH'] });
      return Object.freeze({ evidence, evidenceHash: await writeEvidence(evidence) });
    }
    const migrationOwner = collected.catalog.schemas.find(row => row.schema_name === 'app_private')?.owner_name;
    if (!migrationOwner) throw new Error('PRODUCTION_MIGRATION_OWNER_UNRESOLVED');
    const normalizedCatalog = normalizeCatalog(collected.catalog, migrationOwner);
    const compared = compareCatalogs(baseline.catalog, normalizedCatalog);
    const results = [compared.schemaParityResult, compared.functionParityResult, compared.aclResult,
      compared.rlsPolicyResult, compared.extensionResult];
    const allPass = results.every(item => item.status === 'PASS');
    const evidence = Object.freeze({ ...common, productionCatalogHash: sha256(canonicalJson(normalizedCatalog)),
      ...compared, finalStatus: allPass ? 'PASS' : 'BLOCKED',
      stopReasons: allPass ? [] : ['STRUCTURAL_CATALOG_MISMATCH'] });
    return Object.freeze({ evidence, evidenceHash: await writeEvidence(evidence) });
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    const output = await compareProductionCatalog();
    process.stdout.write(`PRODUCTION_SCHEMA_PARITY=${output.evidence.finalStatus}\n`);
    process.stdout.write(`MIGRATION_LEDGER_PARITY=${output.evidence.checksumResult.status}\n`);
    process.stdout.write(`STRUCTURAL_CATALOG_PARITY=${output.evidence.schemaParityResult.status}\n`);
    process.stdout.write(`EXPECTED_BASELINE_HASH=${output.evidence.expectedBaselineHash}\n`);
    process.stdout.write(`PRODUCTION_SANITIZED_EVIDENCE_HASH=${output.evidenceHash}\n`);
    if (output.evidence.finalStatus !== 'PASS') process.exitCode = 2;
  } catch {
    process.stderr.write('PRODUCTION_SCHEMA_PARITY=BLOCKED\n');
    process.stderr.write('PRODUCTION_SCHEMA_PARITY_ERROR=SANITIZED_FAILURE\n');
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
