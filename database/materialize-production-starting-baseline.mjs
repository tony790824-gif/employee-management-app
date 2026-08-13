import { execFileSync } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  loadExactMigrationSet,
  resolvePostgresBin,
  runOneRehearsal,
  validateRehearsalEnvironment,
  validateSanitizedEvidence
} from './rehearse-production-migration-upgrade.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from './rehearse-structural-schema-parity.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const ARTIFACT_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.sha256');
const CONFIRMATION = 'MATERIALIZE_BANKE_0001_0008_STRUCTURAL_BASELINE';
const DISPOSABLE_PREFIX = 'banke-disposable-upgrade-';

export const STARTING_BASELINE_VERSIONS = Object.freeze([
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008'
]);

export const UNAPPLIED_VERSIONS = Object.freeze([
  '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);

export const STRUCTURAL_SECTIONS = Object.freeze([
  'schemas', 'relations', 'columns', 'constraints', 'indexes', 'functions',
  'triggers', 'sequences', 'policies', 'extensions'
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function structuralCatalog(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, catalog?.[section] || []]));
}

function objectCounts(catalog) {
  const counts = Object.fromEntries(
    ['migrationLedger', ...STRUCTURAL_SECTIONS].map(section => [section, (catalog?.[section] || []).length])
  );
  counts.tables = (catalog?.relations || []).filter(row => ['r', 'p'].includes(row.relation_kind)).length;
  counts.views = (catalog?.relations || []).filter(row => ['v', 'm'].includes(row.relation_kind)).length;
  return canonicalValue(counts);
}

async function residualDisposableResources() {
  return (await readdir(os.tmpdir(), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(DISPOSABLE_PREFIX))
    .map(entry => entry.name);
}

export function validateStartingBaselineArtifact(artifact) {
  const failures = [];
  if (artifact?.schemaVersion !== 1 || artifact?.scope !== 'REPOSITORY_0001_0008_STRUCTURAL_BASELINE') {
    failures.push('ARTIFACT_FORMAT_MISMATCH');
  }
  if (artifact?.postgresMajorVersion !== 18) failures.push('POSTGRES_MAJOR_VERSION_MISMATCH');
  if (canonicalJson(artifact?.appliedMigrations) !== canonicalJson(STARTING_BASELINE_VERSIONS)) {
    failures.push('BASELINE_SEQUENCE_MISMATCH');
  }
  if (artifact?.catalog?.migrationLedger?.some(item => item.version === '0010')) failures.push('MIGRATION_0010_PRESENT');
  if (canonicalJson(artifact?.catalog?.migrationLedger?.map(item => item.version)) !== canonicalJson(STARTING_BASELINE_VERSIONS)) {
    failures.push('MIGRATION_LEDGER_MISMATCH');
  }
  if (canonicalJson(artifact?.unappliedVersions) !== canonicalJson(UNAPPLIED_VERSIONS)) {
    failures.push('UNAPPLIED_VERSION_BOUNDARY_MISMATCH');
  }
  for (const section of STRUCTURAL_SECTIONS) {
    if (!Array.isArray(artifact?.catalog?.[section])) failures.push(`CATALOG_SECTION_MISSING:${section}`);
  }
  const expectedFingerprint = sha256(canonicalJson(structuralCatalog(artifact?.catalog || {})));
  if (artifact?.structuralFingerprint !== expectedFingerprint) failures.push('STRUCTURAL_FINGERPRINT_MISMATCH');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

function baselineArtifact(catalog, migrations) {
  return canonicalValue({
    schemaVersion: 1,
    scope: 'REPOSITORY_0001_0008_STRUCTURAL_BASELINE',
    postgresMajorVersion: 18,
    migrationRange: { start: '0001', end: '0008', ledgerEntries: 8 },
    appliedMigrations: STARTING_BASELINE_VERSIONS,
    intentionalUnapprovedGap: '0010',
    unappliedVersions: UNAPPLIED_VERSIONS,
    normalization: {
      model: 'APPROVED_PRODUCTION_STRUCTURAL_CATALOG_NORMALIZATION',
      ownerPlaceholder: '$MIGRATION_OWNER',
      extensionOwnerPlaceholder: '$EXTENSION_OWNER:<extension_name>',
      omittedVolatileFields: [
        'applied_at', 'database_name', 'data_directory', 'hostname', 'port',
        'object_oid', 'generated_at', 'duration_ms'
      ],
      catalogSchemas: ['public', 'app_private']
    },
    migrationInventory: migrations.map(({ version, name, file, checksum }) => ({ version, name, file, checksum })),
    objectCounts: objectCounts(catalog),
    structuralFingerprint: sha256(canonicalJson(structuralCatalog(catalog))),
    catalog
  });
}

export async function materializeProductionStartingBaseline({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_STARTING_BASELINE_CONFIRMATION !== CONFIRMATION) {
    throw new Error('DISPOSABLE_STARTING_BASELINE_CONFIRMATION_REQUIRED');
  }
  validateRehearsalEnvironment(env);
  const initialResiduals = await residualDisposableResources();
  if (initialResiduals.length) throw new Error('PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED');

  const migrationSet = await loadExactMigrationSet();
  const baselineVersions = migrationSet.baseline.map(item => item.version);
  if (canonicalJson(baselineVersions) !== canonicalJson(STARTING_BASELINE_VERSIONS)) {
    throw new Error('BASELINE_ALLOWLIST_MISMATCH');
  }
  const postgresBin = resolvePostgresBin(env);
  const first = await runOneRehearsal({
    postgresBin,
    migrationSet,
    runLabel: 'INDEPENDENT_REBUILD_A',
    includeCatalog: true,
    structuralQueries: STRUCTURAL_CATALOG_QUERIES,
    baselineOnly: true
  });
  const second = await runOneRehearsal({
    postgresBin,
    migrationSet,
    runLabel: 'INDEPENDENT_REBUILD_B',
    includeCatalog: true,
    structuralQueries: STRUCTURAL_CATALOG_QUERIES,
    baselineOnly: true
  });

  const firstArtifact = baselineArtifact(first.baselineCatalog, migrationSet.baseline);
  const secondArtifact = baselineArtifact(second.baselineCatalog, migrationSet.baseline);
  const firstSerialized = canonicalJson(firstArtifact);
  const secondSerialized = canonicalJson(secondArtifact);
  const firstHash = sha256(firstSerialized);
  const secondHash = sha256(secondSerialized);
  if (firstHash !== secondHash || firstSerialized !== secondSerialized) {
    throw new Error('STARTING_BASELINE_REPRODUCIBILITY_MISMATCH');
  }
  const artifactValidation = validateStartingBaselineArtifact(firstArtifact);
  if (artifactValidation.status !== 'PASS') {
    throw new Error(`STARTING_BASELINE_ARTIFACT_BLOCKED:${artifactValidation.failures.join(',')}`);
  }

  const residuals = await residualDisposableResources();
  if (residuals.length) throw new Error('DISPOSABLE_RESOURCE_CLEANUP_FAILED');
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const evidence = canonicalValue({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommitSha: commitSha,
    phase: 'PRODUCTION_CLOSURE_PHASE_1',
    sprintNumberingCappedAt: 65,
    scope: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    productionReadiness: '70_PERCENT_NOT_READY',
    productionStatus: 'NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionMigrationAuthorization: 'NOT_GRANTED',
    productionMigrationTechnicalReadiness: 'NO_GO',
    productionConnectionAttempted: false,
    productionMutation: false,
    postgresMajorVersion: 18,
    repository00010008StructuralBaseline: 'PASS',
    liveProductionStructuralStartingBaseline: 'NOT_EVALUATED',
    authoritativeStructuralStartingBaseline: 'BLOCKED',
    appliedMigrations: STARTING_BASELINE_VERSIONS,
    unappliedVersions: UNAPPLIED_VERSIONS,
    migration0010Excluded: true,
    structuralFingerprint: firstArtifact.structuralFingerprint,
    artifactSha256: firstHash,
    objectCounts: firstArtifact.objectCounts,
    independentRebuilds: [first, second].map(run => ({
      label: run.run,
      identityVerification: run.identityVerification,
      ledger: run.baselineLedger,
      catalogSha256: sha256(canonicalJson(run.baselineCatalog)),
      structuralFingerprint: sha256(canonicalJson(structuralCatalog(run.baselineCatalog)))
    })),
    determinism: {
      status: 'PASS',
      byteIdenticalArtifacts: true,
      fingerprintMatch: true
    },
    cleanup: {
      postgresProcessesTerminated: true,
      temporaryDataRemoved: true,
      temporaryCredentialsRemoved: true,
      residualDisposableResourceCount: residuals.length
    }
  });
  const sanitized = validateSanitizedEvidence(evidence);
  if (sanitized.status !== 'PASS') {
    throw new Error(`EVIDENCE_SANITIZATION_BLOCKED:${sanitized.failures.join(',')}`);
  }

  const evidenceSerialized = canonicalJson(evidence);
  const evidenceHash = sha256(evidenceSerialized);
  await writeFile(ARTIFACT_PATH, firstSerialized, 'utf8');
  await writeFile(ARTIFACT_HASH_PATH, `${firstHash}  production-0001-0008-structural-baseline.json\n`, 'utf8');
  await writeFile(EVIDENCE_PATH, evidenceSerialized, 'utf8');
  await writeFile(EVIDENCE_HASH_PATH, `${evidenceHash}  PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.json\n`, 'utf8');

  return Object.freeze({
    status: 'PASS',
    environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    postgresMajorVersion: 18,
    appliedMigrations: STARTING_BASELINE_VERSIONS,
    migration0010Excluded: true,
    repository00010008StructuralBaseline: 'PASS',
    liveProductionStructuralStartingBaseline: 'NOT_EVALUATED',
    authoritativeStructuralStartingBaseline: 'BLOCKED',
    structuralFingerprint: firstArtifact.structuralFingerprint,
    independentRebuildFingerprint: secondArtifact.structuralFingerprint,
    deterministic: 'PASS',
    artifactSha256: firstHash,
    evidenceSha256: evidenceHash,
    residualDisposableResourceCount: residuals.length,
    productionConnectionAttempted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  materializeProductionStartingBaseline().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Production starting baseline materialization failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
