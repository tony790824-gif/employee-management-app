import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  authenticatedTlsConfig,
  productionConnectionConfig
} from './compare-production-catalog.mjs';
import {
  STARTING_BASELINE_VERSIONS,
  STRUCTURAL_SECTIONS,
  validateStartingBaselineArtifact
} from './materialize-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  compareStructuralCatalogs,
  STRUCTURAL_CATALOG_QUERIES
} from './rehearse-structural-schema-parity.mjs';
import { validateFinalReadinessPackage } from './production-migration-final-readiness-gate.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const ARTIFACT_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const READINESS_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-final-readiness.expected.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.sha256');
const TRACKED_ARTIFACTS = Object.freeze([
  'database/production-0001-0008-structural-baseline.json',
  'database/production-0001-0008-structural-baseline.sha256'
]);
const ALLOWED_QUERY_RELATIONS = new Set([
  'pg_catalog.pg_namespace', 'pg_catalog.pg_class', 'pg_catalog.pg_attribute',
  'pg_catalog.pg_type', 'pg_catalog.pg_attrdef',
  'pg_catalog.pg_constraint', 'pg_catalog.pg_index', 'pg_catalog.pg_proc',
  'pg_catalog.pg_language', 'pg_catalog.pg_depend', 'pg_catalog.pg_extension',
  'pg_catalog.pg_trigger', 'pg_catalog.pg_sequence', 'pg_catalog.pg_policies'
]);
const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i;
const FORBIDDEN_EVIDENCE_KEY = /^(?:connectionString|databaseUrl|hostname|endpoint|username|password|credential|secret|token|cookie|authorization|authorizationHeader|projectId|branchId|businessRows|databaseName|roleName|port)$/i;
const FORBIDDEN_EVIDENCE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY)-----|\bBearer\s+[A-Za-z0-9._~-]+)/i;

export const STARTING_BASELINE_CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE';
export const EXPECTED_STARTING_FINGERPRINT = '885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e';
export const EXPECTED_STARTING_ARTIFACT_SHA256 = '6f09dd605cd939fc6bb9de778a6690d93cc66764334722fd2afbf7d5d6e70076';

const IDENTITY_SQL = `
  SELECT current_database() = $1 AS database_ok,
         current_user = $2 AS current_role_ok,
         session_user = $2 AS session_role_ok,
         current_setting('transaction_read_only') = 'on' AS read_only_ok,
         current_setting('server_version_num')::integer AS server_version_number`;

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

const LEDGER_SQL = 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function structuralCatalog(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, catalog?.[section] || []]));
}

export function normalizeStartingCatalog(rawCatalog, migrationOwner) {
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    const extensionName = String(value.extension_name || '').trim();
    const extensionPlaceholder = extensionName ? `$EXTENSION_OWNER:${extensionName}` : null;
    const extensionOwner = extensionName && typeof value.owner_name === 'string' ? value.owner_name : null;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => {
      if (key === 'owner_name' && extensionPlaceholder) return [key, extensionPlaceholder];
      if (key === 'owner_name' && child === migrationOwner) return [key, '$MIGRATION_OWNER'];
      if (typeof child === 'string') {
        let normalized = child;
        if (extensionOwner) normalized = normalized.split(extensionOwner).join(extensionPlaceholder);
        normalized = normalized.split(migrationOwner).join('$MIGRATION_OWNER');
        return [key, normalized];
      }
      return [key, normalize(child)];
    }));
  };
  return normalize(rawCatalog);
}

function objectCounts(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, (catalog?.[section] || []).length]));
}

function hashRecord(hashText) {
  return String(hashText || '').trim().match(/^([a-f0-9]{64})\s+production-0001-0008-structural-baseline\.json$/)?.[1] || null;
}

export function startingBaselineConnectionConfig(env = process.env) {
  return productionConnectionConfig(env, {
    confirmation: STARTING_BASELINE_CONFIRMATION,
    confirmationError: 'PRODUCTION_STARTING_BASELINE_CONFIRMATION_REQUIRED'
  });
}

export function compareExactStartingLedger(expectedRows, observedRows) {
  const differences = [];
  const expected = expectedRows || [];
  const observed = observedRows || [];
  const expectedVersions = expected.map(row => String(row.version));
  const observedVersions = observed.map(row => String(row.version));
  const duplicates = observedVersions.filter((version, index) => observedVersions.indexOf(version) !== index);
  for (const version of [...new Set(duplicates)].sort()) differences.push(`DUPLICATE:${version}`);
  for (const version of expectedVersions) if (!observedVersions.includes(version)) differences.push(`MISSING:${version}`);
  for (const version of observedVersions) if (!expectedVersions.includes(version)) differences.push(`UNEXPECTED:${version}`);
  if (observedVersions.length === expectedVersions.length && canonicalJson(observedVersions) !== canonicalJson(expectedVersions)) {
    differences.push('ORDER_MISMATCH');
  }
  for (let index = 0; index < Math.min(expected.length, observed.length); index += 1) {
    if (String(expected[index].version) !== String(observed[index].version)) continue;
    if (expected[index].name !== observed[index].name) differences.push(`NAME_MISMATCH:${expected[index].version}`);
    if (expected[index].checksum !== observed[index].checksum) differences.push(`CHECKSUM_MISMATCH:${expected[index].version}`);
  }
  return canonicalValue({
    status: differences.length ? 'BLOCKED' : 'PASS',
    expectedCount: expected.length,
    observedCount: observed.length,
    differences: [...new Set(differences)].sort()
  });
}

export function validateCatalogQueryScope(queries = STRUCTURAL_CATALOG_QUERIES) {
  const failures = [];
  if (canonicalJson(Object.keys(queries).sort()) !== canonicalJson([...STRUCTURAL_SECTIONS].sort())) {
    failures.push('CATALOG_SECTION_SET_MISMATCH');
  }
  for (const [section, sql] of Object.entries(queries)) {
    const text = String(sql || '').trim();
    if (!/^SELECT\b/i.test(text)) failures.push(`NON_SELECT_QUERY:${section}`);
    if (FORBIDDEN_SQL.test(text)) failures.push(`MUTATING_SQL_TOKEN:${section}`);
    const relations = [...text.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z0-9_."]+)/gi)]
      .map(match => match[1].replaceAll('"', '').toLowerCase());
    for (const relation of relations) {
      if (!ALLOWED_QUERY_RELATIONS.has(relation)) failures.push(`BUSINESS_RELATION_BLOCKED:${section}:${relation}`);
    }
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function validateStartingEvidence(value) {
  const failures = [];
  const visit = input => {
    if (typeof input === 'string' && FORBIDDEN_EVIDENCE_VALUE.test(input)) failures.push('FORBIDDEN_VALUE');
    if (!input || typeof input !== 'object') return;
    for (const [key, child] of Object.entries(input)) {
      if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_FIELD:${key}`);
      visit(child);
    }
  };
  visit(value);
  const requiredKeys = [
    'schemaVersion', 'phase', 'sprintNumberingCappedAt', 'generatedAt', 'repositoryCommitSha',
    'expectedArtifactSha256', 'expectedStructuralFingerprint', 'observedStructuralFingerprint',
    'expectedMigrationSequence', 'identityResult', 'tlsVerification', 'roleBoundaryResult',
    'ledgerResult', 'expectedSectionCounts', 'observedSectionCounts', 'fingerprintComparison',
    'missingObjectKeys', 'unexpectedObjectKeys', 'mismatchedObjects',
    'repository00010008StructuralBaseline', 'liveProduction00010008StructuralMatch',
    'authoritativeStructuralStartingBaseline', 'productionConnectionAttempted',
    'productionMutation', 'finalStatus', 'stopReasons'
  ];
  for (const key of requiredKeys) if (!Object.hasOwn(value || {}, key)) failures.push(`REQUIRED_FIELD_MISSING:${key}`);
  if (value?.schemaVersion !== 1 || value?.phase !== 'PRODUCTION_CLOSURE_PHASE_2A' || value?.sprintNumberingCappedAt !== 65) failures.push('EVIDENCE_FORMAT_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(value?.repositoryCommitSha || '')) failures.push('EVIDENCE_COMMIT_SHA_INVALID');
  if (value?.expectedArtifactSha256 !== EXPECTED_STARTING_ARTIFACT_SHA256
      || value?.expectedStructuralFingerprint !== EXPECTED_STARTING_FINGERPRINT
      || canonicalJson(value?.expectedMigrationSequence) !== canonicalJson(STARTING_BASELINE_VERSIONS)) {
    failures.push('EVIDENCE_EXPECTATION_MISMATCH');
  }
  if (value?.productionMutation !== false) failures.push('EVIDENCE_PRODUCTION_MUTATION_NOT_FALSE');
  if (!['PASS', 'BLOCKED'].includes(value?.finalStatus)
      || !['MATCH', 'MISMATCH', 'BLOCKED'].includes(value?.fingerprintComparison)) failures.push('EVIDENCE_RESULT_INVALID');
  const expectedMatch = value?.finalStatus === 'PASS';
  if ((value?.fingerprintComparison === 'MATCH') !== expectedMatch
      || (value?.liveProduction00010008StructuralMatch === 'PASS') !== expectedMatch
      || (value?.authoritativeStructuralStartingBaseline === 'PASS') !== expectedMatch) {
    failures.push('EVIDENCE_RESULT_INCONSISTENT');
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function validateStartingBaselineProvenance({ artifactText, hashText, readiness, tracked = true }) {
  const failures = [];
  let artifact;
  try {
    artifact = JSON.parse(artifactText);
  } catch {
    return canonicalValue({ status: 'BLOCKED', failures: ['ARTIFACT_JSON_INVALID'], artifact: null, artifactSha256: null });
  }
  const actualHash = sha256(artifactText);
  if (!tracked) failures.push('ARTIFACT_NOT_GIT_TRACKED');
  if (hashRecord(hashText) !== actualHash) failures.push('ARTIFACT_COMPANION_HASH_MISMATCH');
  if (actualHash !== EXPECTED_STARTING_ARTIFACT_SHA256) failures.push('ARTIFACT_SHA256_MISMATCH');
  const artifactValidation = validateStartingBaselineArtifact(artifact);
  if (artifactValidation.status !== 'PASS') failures.push(...artifactValidation.failures.map(item => `ARTIFACT:${item}`));
  if (artifact.schemaVersion !== 1 || artifact.scope !== 'REPOSITORY_0001_0008_STRUCTURAL_BASELINE') failures.push('ARTIFACT_FORMAT_MISMATCH');
  if (artifact.postgresMajorVersion !== 18) failures.push('ARTIFACT_POSTGRES_VERSION_MISMATCH');
  if (canonicalJson(artifact.appliedMigrations) !== canonicalJson(STARTING_BASELINE_VERSIONS)) failures.push('ARTIFACT_LEDGER_SEQUENCE_MISMATCH');
  if (artifact.structuralFingerprint !== EXPECTED_STARTING_FINGERPRINT) failures.push('ARTIFACT_EXPECTED_FINGERPRINT_MISMATCH');
  if (artifact.normalization?.model !== 'APPROVED_PRODUCTION_STRUCTURAL_CATALOG_NORMALIZATION'
      || artifact.normalization?.ownerPlaceholder !== '$MIGRATION_OWNER'
      || artifact.normalization?.extensionOwnerPlaceholder !== '$EXTENSION_OWNER:<extension_name>'
      || canonicalJson(artifact.normalization?.catalogSchemas) !== canonicalJson(['public', 'app_private'])) {
    failures.push('ARTIFACT_NORMALIZATION_MODEL_MISMATCH');
  }
  if (readiness?.repositoryStartingBaseline?.artifactSha256 !== actualHash
      || readiness?.productionBaseline?.expectedStructuralFingerprint !== EXPECTED_STARTING_FINGERPRINT
      || canonicalJson(readiness?.productionBaseline?.expectedVersions) !== canonicalJson(STARTING_BASELINE_VERSIONS)
      || readiness?.repositoryStartingBaseline?.status !== 'PASS') {
    failures.push('READINESS_PROVENANCE_MISMATCH');
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), artifact, artifactSha256: actualHash });
}

async function gitTracked(paths = TRACKED_ARTIFACTS) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', ...paths], { cwd: PROJECT_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function loadProvenance({ artifactPath = ARTIFACT_PATH, artifactHashPath = ARTIFACT_HASH_PATH, readinessPath = READINESS_PATH } = {}) {
  const [artifactText, hashText, readiness] = await Promise.all([
    readFile(artifactPath, 'utf8'), readFile(artifactHashPath, 'utf8'), readFile(readinessPath, 'utf8').then(JSON.parse)
  ]);
  const validation = validateStartingBaselineProvenance({ artifactText, hashText, readiness, tracked: await gitTracked() });
  if (validation.status !== 'PASS') throw new Error(`STARTING_BASELINE_PROVENANCE_BLOCKED:${validation.failures.join(',')}`);
  const gateValidation = await validateFinalReadinessPackage(readiness);
  if (gateValidation.status !== 'PASS') throw new Error('REPOSITORY_GATE_PROVENANCE_BLOCKED');
  return validation;
}

async function writeEvidence(evidence, evidencePath = EVIDENCE_PATH, evidenceHashPath = EVIDENCE_HASH_PATH) {
  const validation = validateStartingEvidence(evidence);
  if (validation.status !== 'PASS') throw new Error(`EVIDENCE_SANITIZATION_BLOCKED:${validation.failures.join(',')}`);
  const serialized = canonicalJson(evidence);
  const hash = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(evidenceHashPath, `${hash}  ${path.basename(evidencePath)}\n`, 'utf8');
  return hash;
}

function comparisonEvidence({ commitSha, provenance, ledgerResult, observedCatalog, comparison }) {
  const observedFingerprint = observedCatalog ? sha256(canonicalJson(structuralCatalog(observedCatalog))) : null;
  const match = comparison?.status === 'PASS' && observedFingerprint === EXPECTED_STARTING_FINGERPRINT;
  return canonicalValue({
    schemaVersion: 1,
    phase: 'PRODUCTION_CLOSURE_PHASE_2A',
    sprintNumberingCappedAt: 65,
    generatedAt: new Date().toISOString(),
    repositoryCommitSha: commitSha,
    expectedArtifactSha256: provenance.artifactSha256,
    expectedStructuralFingerprint: EXPECTED_STARTING_FINGERPRINT,
    observedStructuralFingerprint: observedFingerprint,
    expectedMigrationSequence: STARTING_BASELINE_VERSIONS,
    identityResult: 'PASS',
    tlsVerification: 'VERIFY_FULL_PASS',
    roleBoundaryResult: 'PASS',
    ledgerResult,
    expectedSectionCounts: objectCounts(provenance.artifact.catalog),
    observedSectionCounts: observedCatalog ? objectCounts(observedCatalog) : null,
    fingerprintComparison: match ? 'MATCH' : observedCatalog ? 'MISMATCH' : 'BLOCKED',
    missingObjectKeys: comparison?.missingObjects || [],
    unexpectedObjectKeys: comparison?.unexpectedObjects || [],
    mismatchedObjects: (comparison?.mismatchedObjects || []).map(item => ({ section: item.section, key: item.key, changedFields: item.changedFields })),
    repository00010008StructuralBaseline: 'PASS',
    liveProduction00010008StructuralMatch: match ? 'PASS' : 'BLOCKED',
    authoritativeStructuralStartingBaseline: match ? 'PASS' : 'BLOCKED',
    productionConnectionAttempted: true,
    productionMutation: false,
    finalStatus: match ? 'PASS' : 'BLOCKED',
    stopReasons: match ? [] : [observedCatalog ? 'STRUCTURAL_FINGERPRINT_MISMATCH' : 'STARTING_LEDGER_MISMATCH']
  });
}

export async function compareProductionStartingBaseline({
  env = process.env,
  ClientImpl = Client,
  evidencePath = EVIDENCE_PATH,
  evidenceHashPath = EVIDENCE_HASH_PATH,
  artifactPath = ARTIFACT_PATH,
  artifactHashPath = ARTIFACT_HASH_PATH,
  readinessPath = READINESS_PATH,
  commitSha = null
} = {}) {
  const config = startingBaselineConnectionConfig(env);
  const queryValidation = validateCatalogQueryScope();
  if (queryValidation.status !== 'PASS') throw new Error(`CATALOG_QUERY_SCOPE_BLOCKED:${queryValidation.failures.join(',')}`);
  const provenance = await loadProvenance({ artifactPath, artifactHashPath, readinessPath });
  const ca = await readFile(config.caPath, 'utf8');
  const client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
  await client.connect();
  let transactionOpen = false;
  try {
    const identity = (await client.query(IDENTITY_SQL, [config.expectedDatabase, config.expectedRole])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) {
      throw new Error('PRODUCTION_STARTING_IDENTITY_BOUNDARY_BLOCKED');
    }
    if (!(await client.query(ROLE_BOUNDARY_SQL)).rows[0]?.role_safe) throw new Error('PRODUCTION_STARTING_ROLE_BOUNDARY_BLOCKED');
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    const ledger = (await client.query(LEDGER_SQL)).rows;
    const ledgerResult = compareExactStartingLedger(provenance.artifact.catalog.migrationLedger, ledger);
    let observedCatalog = null;
    let comparison = null;
    if (ledgerResult.status === 'PASS') {
      const rawCatalog = { migrationLedger: ledger };
      for (const [section, sql] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) rawCatalog[section] = (await client.query(sql)).rows;
      const migrationOwner = rawCatalog.schemas.find(row => row.schema_name === 'app_private')?.owner_name;
      if (!migrationOwner) throw new Error('PRODUCTION_STARTING_MIGRATION_OWNER_UNRESOLVED');
      observedCatalog = normalizeStartingCatalog(rawCatalog, migrationOwner);
      comparison = compareStructuralCatalogs(observedCatalog, provenance.artifact.catalog);
    }
    await client.query('ROLLBACK');
    transactionOpen = false;
    const evidence = comparisonEvidence({
      commitSha: commitSha || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
      provenance, ledgerResult, observedCatalog, comparison
    });
    const evidenceSha256 = await writeEvidence(evidence, evidencePath, evidenceHashPath);
    return Object.freeze({ evidence, evidenceSha256 });
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    const output = await compareProductionStartingBaseline();
    process.stdout.write(`PRODUCTION_STARTING_BASELINE=${output.evidence.finalStatus}\n`);
    process.stdout.write(`STARTING_LEDGER=${output.evidence.ledgerResult.status}\n`);
    process.stdout.write(`STRUCTURAL_FINGERPRINT=${output.evidence.fingerprintComparison}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${output.evidenceSha256}\n`);
    if (output.evidence.finalStatus !== 'PASS') process.exitCode = 2;
  } catch {
    process.stderr.write('PRODUCTION_STARTING_BASELINE=BLOCKED\n');
    process.stderr.write('PRODUCTION_STARTING_BASELINE_ERROR=SANITIZED_FAILURE\n');
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
