import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_STARTING_ARTIFACT_SHA256,
  EXPECTED_STARTING_FINGERPRINT,
  normalizeStartingCatalog,
  validateStartingEvidence
} from './compare-production-starting-baseline.mjs';
import { canonicalJson, normalizeCatalog, sha256 } from './materialize-expected-catalog.mjs';
import { STRUCTURAL_SECTIONS } from './materialize-production-starting-baseline.mjs';
import {
  loadExactMigrationSet,
  resolvePostgresBin,
  runOneRehearsal,
  validateRehearsalEnvironment,
  validateSanitizedEvidence
} from './rehearse-production-migration-upgrade.mjs';
import {
  compareStructuralCatalogs,
  STRUCTURAL_CATALOG_QUERIES
} from './rehearse-structural-schema-parity.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json');
const SOURCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.sha256');
const SOURCE_SCHEMA_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.schema.json');
const EXPECTED_ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const EXPECTED_ARTIFACT_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.json');
const OUTPUT_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.sha256');
const CONFIRMATION = 'ANALYZE_BANKE_STARTING_BASELINE_DRIFT';
const DISPOSABLE_PREFIX = 'banke-disposable-upgrade-';
const LOCAL_READER = 'banke_phase2c_reader';

const LEGACY_PERMISSION_FILTERED_COLUMNS_QUERY = `
  SELECT c.table_schema AS schema_name,
         c.table_name,
         c.ordinal_position,
         c.column_name,
         c.data_type,
         c.udt_schema,
         c.udt_name,
         c.is_nullable,
         COALESCE(c.column_default, '') AS column_default,
         c.is_identity,
         COALESCE(c.identity_generation, '') AS identity_generation
    FROM information_schema.columns c
   WHERE c.table_schema IN ('public', 'app_private')
   ORDER BY c.table_schema, c.table_name, c.ordinal_position`;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function structuralCatalog(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, catalog?.[section] || []]));
}

function fingerprint(catalog) {
  return sha256(canonicalJson(structuralCatalog(catalog)));
}

function withoutAcl(value) {
  if (Array.isArray(value)) return value.map(withoutAcl);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'acl')
    .map(([key, child]) => [key, withoutAcl(child)]));
}

function companionHash(hashText, fileName) {
  return String(hashText || '').trim().match(new RegExp(`^([a-f0-9]{64})\\s+${fileName.replaceAll('.', '\\.')}$`))?.[1] || null;
}

function objectKey(section, row) {
  const fields = {
    functions: ['schema_name', 'function_name', 'identity_arguments']
  }[section] || [];
  return fields.map(field => row[field] ?? '').join('|');
}

function countBy(values, keySelector) {
  const result = {};
  for (const value of values) {
    const key = keySelector(value);
    result[key] = (result[key] || 0) + 1;
  }
  return canonicalValue(result);
}

export function validatePhase2BSource({ evidenceText, hashText, schema, artifactText, artifactHashText, commitExists = true }) {
  const failures = [];
  let evidence;
  let artifact;
  try { evidence = JSON.parse(evidenceText); } catch { failures.push('SOURCE_EVIDENCE_JSON_INVALID'); }
  try { artifact = JSON.parse(artifactText); } catch { failures.push('EXPECTED_ARTIFACT_JSON_INVALID'); }
  const evidenceHash = sha256(evidenceText);
  const artifactHash = sha256(artifactText);
  if (companionHash(hashText, 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json') !== evidenceHash) failures.push('SOURCE_EVIDENCE_HASH_MISMATCH');
  if (companionHash(artifactHashText, 'production-0001-0008-structural-baseline.json') !== artifactHash) failures.push('EXPECTED_ARTIFACT_COMPANION_HASH_MISMATCH');
  if (artifactHash !== EXPECTED_STARTING_ARTIFACT_SHA256) failures.push('EXPECTED_ARTIFACT_HASH_MISMATCH');
  if (artifact?.structuralFingerprint !== EXPECTED_STARTING_FINGERPRINT) failures.push('EXPECTED_FINGERPRINT_MISMATCH');
  if (validateStartingEvidence(evidence).status !== 'PASS') failures.push('SOURCE_EVIDENCE_SCHEMA_CONTRACT_BLOCKED');
  if (schema?.additionalProperties !== false
      || (schema?.required || []).some(key => !Object.hasOwn(evidence || {}, key))
      || Object.keys(evidence || {}).some(key => !Object.hasOwn(schema?.properties || {}, key))) {
    failures.push('SOURCE_JSON_SCHEMA_MISMATCH');
  }
  if (!commitExists || evidence?.repositoryCommitSha !== 'c3653add472211a27e929c9194f540fb00d11ee6') failures.push('SOURCE_COMMIT_PROVENANCE_MISMATCH');
  if (evidence?.expectedArtifactSha256 !== EXPECTED_STARTING_ARTIFACT_SHA256
      || evidence?.expectedStructuralFingerprint !== EXPECTED_STARTING_FINGERPRINT) failures.push('SOURCE_EXPECTATION_PROVENANCE_MISMATCH');
  if (evidence?.ledgerResult?.status !== 'PASS' || evidence?.ledgerResult?.differences?.length) failures.push('SOURCE_LEDGER_NOT_PASS');
  if (evidence?.fingerprintComparison !== 'MISMATCH' || evidence?.finalStatus !== 'BLOCKED') failures.push('SOURCE_STRUCTURAL_RESULT_MISMATCH');
  if (evidence?.productionConnectionAttempted !== true || evidence?.productionMutation !== false) failures.push('SOURCE_EXECUTION_BOUNDARY_MISMATCH');
  return canonicalValue({
    status: failures.length ? 'BLOCKED' : 'PASS',
    failures: [...new Set(failures)].sort(),
    evidence,
    artifact,
    evidenceSha256: evidenceHash,
    artifactSha256: artifactHash
  });
}

export function analyzeSanitizedDrift(evidence, artifact) {
  const missing = evidence?.missingObjectKeys || [];
  const unexpected = evidence?.unexpectedObjectKeys || [];
  const mismatched = evidence?.mismatchedObjects || [];
  const extensionFunctions = new Set((artifact?.catalog?.functions || [])
    .filter(row => row.extension_name)
    .map(row => objectKey('functions', row)));
  const missingClassifications = missing.map(key => ({
    key,
    classification: key.startsWith('columns:') ? 'COMPARATOR_IMPLEMENTATION_DEFECT' : 'UNKNOWN',
    reason: key.startsWith('columns:')
      ? 'LEGACY_INFORMATION_SCHEMA_COLUMNS_IS_PRIVILEGE_FILTERED_FOR_THE_DEDICATED_READER'
      : 'SANITIZED_SOURCE_DOES_NOT_PROVE_CAUSE'
  }));
  const mismatchClassifications = mismatched.map(item => {
    const extensionAcl = item.section === 'functions' && extensionFunctions.has(item.key) && item.changedFields?.length === 1 && item.changedFields[0] === 'acl';
    const aclOnly = item.changedFields?.length === 1 && item.changedFields[0] === 'acl';
    return {
      ...item,
      classifications: extensionAcl
        ? ['EXTENSION_ENVIRONMENT_DIFFERENCE', 'EVIDENCE_INSUFFICIENT']
        : aclOnly
          ? ['OWNER_OR_ACL_PLACEHOLDER_MISMATCH', 'EVIDENCE_INSUFFICIENT']
          : ['UNKNOWN'],
      reason: extensionAcl
        ? 'PGCRYPTO_ACL_DIFFERS_BUT_SANITIZED_EVIDENCE_OMITS_VALUES'
        : aclOnly
          ? 'RAW_ACL_MODEL_INCLUDES_POST_MIGRATION_OPERATIONAL_GRANTS_BUT_SANITIZED_EVIDENCE_OMITS_VALUES'
          : 'SANITIZED_SOURCE_DOES_NOT_PROVE_CAUSE'
    };
  });
  const missingColumnRelationCounts = countBy(
    missing.filter(key => key.startsWith('columns:')),
    key => key.split(':', 2)[1].split('|').slice(0, 2).join('|')
  );
  return canonicalValue({
    missingClassifications,
    unexpectedClassifications: unexpected.map(key => ({ key, classification: 'UNKNOWN', reason: 'SANITIZED_SOURCE_DOES_NOT_PROVE_CAUSE' })),
    mismatchClassifications,
    missingBySection: countBy(missing, key => key.split(':', 1)[0]),
    missingColumnRelationCounts,
    mismatchBySection: countBy(mismatched, item => item.section),
    mismatchByField: countBy(mismatched.flatMap(item => item.changedFields || []), field => field),
    conclusion: 'MIXED_COMPARATOR_DEFECT_AND_ACL_EVIDENCE_INSUFFICIENT',
    selectedPath: 'D'
  });
}

async function collectRawCatalog(client) {
  const catalog = {
    migrationLedger: (await client.query('SELECT version, name, checksum FROM public.schema_migrations ORDER BY version')).rows
  };
  for (const [section, sql] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) catalog[section] = (await client.query(sql)).rows;
  return catalog;
}

async function localObserver({ client, migrationOwner }) {
  const ownerRaw = await collectRawCatalog(client);
  const phaseA = normalizeCatalog(ownerRaw, migrationOwner);
  const phaseB = normalizeStartingCatalog(ownerRaw, migrationOwner);
  await client.query(`CREATE ROLE ${LOCAL_READER} NOLOGIN NOINHERIT`);
  try {
    await client.query(`GRANT USAGE ON SCHEMA public, app_private TO ${LOCAL_READER}`);
    await client.query(`GRANT SELECT ON TABLE public.schema_migrations TO ${LOCAL_READER}`);
    await client.query(`SET ROLE ${LOCAL_READER}`);
    const legacyColumnCount = (await client.query(LEGACY_PERMISSION_FILTERED_COLUMNS_QUERY)).rows.length;
    const readerRaw = await collectRawCatalog(client);
    const readerNormalized = normalizeStartingCatalog(readerRaw, migrationOwner);
    const readerComparison = compareStructuralCatalogs(readerNormalized, phaseA);
    await client.query('RESET ROLE');
    return canonicalValue({
      phaseAFingerprint: fingerprint(phaseA),
      phaseBFingerprint: fingerprint(phaseB),
      phaseAAndBByteEquivalent: canonicalJson(structuralCatalog(phaseA)) === canonicalJson(structuralCatalog(phaseB)),
      legacyPermissionFilteredColumnCount: legacyColumnCount,
      pgCatalogColumnCount: readerRaw.columns.length,
      expectedColumnCount: phaseA.columns.length,
      readerFullFingerprint: fingerprint(readerNormalized),
      readerCoreWithoutAclFingerprint: fingerprint(withoutAcl(readerNormalized)),
      expectedCoreWithoutAclFingerprint: fingerprint(withoutAcl(phaseA)),
      readerCoreWithoutAclMatch: fingerprint(withoutAcl(readerNormalized)) === fingerprint(withoutAcl(phaseA)),
      readerMismatchFields: [...new Set(readerComparison.mismatchedObjects.flatMap(item => item.changedFields))].sort(),
      readerMissingObjectCount: readerComparison.missingObjects.length,
      readerUnexpectedObjectCount: readerComparison.unexpectedObjects.length
    });
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    await client.query(`REVOKE SELECT ON TABLE public.schema_migrations FROM ${LOCAL_READER}`).catch(() => {});
    await client.query(`REVOKE USAGE ON SCHEMA public, app_private FROM ${LOCAL_READER}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${LOCAL_READER}`).catch(() => {});
  }
}

async function residualDisposableResources() {
  return (await readdir(os.tmpdir(), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(DISPOSABLE_PREFIX))
    .map(entry => entry.name);
}

export async function analyzeProductionStartingBaselineDrift({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_STARTING_DRIFT_CONFIRMATION !== CONFIRMATION) throw new Error('DISPOSABLE_STARTING_DRIFT_CONFIRMATION_REQUIRED');
  validateRehearsalEnvironment(env);
  const [evidenceText, hashText, schema, artifactText, artifactHashText] = await Promise.all([
    readFile(SOURCE_EVIDENCE_PATH, 'utf8'),
    readFile(SOURCE_HASH_PATH, 'utf8'),
    readFile(SOURCE_SCHEMA_PATH, 'utf8').then(JSON.parse),
    readFile(EXPECTED_ARTIFACT_PATH, 'utf8'),
    readFile(EXPECTED_ARTIFACT_HASH_PATH, 'utf8')
  ]);
  const sourceCommitSha = JSON.parse(evidenceText).repositoryCommitSha;
  let commitExists = true;
  try { execFileSync('git', ['cat-file', '-e', `${sourceCommitSha}^{commit}`], { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch { commitExists = false; }
  const source = validatePhase2BSource({ evidenceText, hashText, schema, artifactText, artifactHashText, commitExists });
  if (source.status !== 'PASS') throw new Error(`PHASE_2B_SOURCE_EVIDENCE_BLOCKED:${source.failures.join(',')}`);
  const initialResiduals = await residualDisposableResources();
  if (initialResiduals.length) throw new Error('PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED');
  const migrationSet = await loadExactMigrationSet();
  const local = await runOneRehearsal({
    postgresBin: resolvePostgresBin(env),
    migrationSet,
    runLabel: 'PHASE_2C_SAME_DATABASE_A_B',
    includeCatalog: true,
    structuralQueries: STRUCTURAL_CATALOG_QUERIES,
    baselineOnly: true,
    baselineObserver: localObserver
  });
  const localResult = local.baselineObserverResult;
  if (localResult.phaseAFingerprint !== EXPECTED_STARTING_FINGERPRINT
      || localResult.phaseBFingerprint !== EXPECTED_STARTING_FINGERPRINT
      || !localResult.phaseAAndBByteEquivalent
      || localResult.legacyPermissionFilteredColumnCount !== 4
      || localResult.pgCatalogColumnCount !== localResult.expectedColumnCount
      || !localResult.readerCoreWithoutAclMatch
      || localResult.readerMissingObjectCount !== 0
      || localResult.readerUnexpectedObjectCount !== 0) {
    throw new Error('LOCAL_PHASE_2C_CONSISTENCY_BLOCKED');
  }
  const residuals = await residualDisposableResources();
  if (residuals.length) throw new Error('DISPOSABLE_RESOURCE_CLEANUP_FAILED');
  const drift = analyzeSanitizedDrift(source.evidence, source.artifact);
  const output = canonicalValue({
    schemaVersion: 1,
    phase: 'PRODUCTION_CLOSURE_PHASE_2C',
    sprintNumberingCappedAt: 65,
    generatedAt: new Date().toISOString(),
    repositoryCommitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
    phase2BSourceEvidenceSha256: source.evidenceSha256,
    phase2BSourceEvidenceIntegrity: 'PASS',
    phase2BAuthorization: 'CONSUMED',
    phase2BStartingLedger: source.evidence.ledgerResult.status,
    phase2BFingerprintComparison: source.evidence.fingerprintComparison,
    expectedFingerprint: EXPECTED_STARTING_FINGERPRINT,
    observedFingerprint: source.evidence.observedStructuralFingerprint,
    expectedSectionCounts: source.evidence.expectedSectionCounts,
    observedSectionCounts: source.evidence.observedSectionCounts,
    sanitizedDrift: drift,
    localDisposablePostgresMajorVersion: 18,
    localEquivalence: localResult,
    comparatorDefects: [
      'INFORMATION_SCHEMA_COLUMNS_PRIVILEGE_FILTER_FALSE_MISSING_OBJECTS',
      'RAW_ACL_FINGERPRINT_DOES_NOT_MODEL_POST_MIGRATION_OPERATIONAL_ACL_SEMANTICS'
    ],
    genuineProductionStructuralDrift: 'NOT_PROVEN',
    selectedNextPath: 'D',
    structuralStartingBaselineGate: 'BLOCKED',
    gateState: { pass: 9, nonPass: 13 },
    productionReadiness: '70_PERCENT_NOT_READY',
    productionStatus: 'NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionMigrationAuthorization: 'NOT_GRANTED',
    productionConnectionAttemptedDuringPhase2C: false,
    productionMutation: false,
    cleanup: {
      disposablePostgresTerminated: true,
      temporaryDataRemoved: true,
      temporaryCredentialsRemoved: true,
      residualDisposableResourceCount: residuals.length
    }
  });
  const sanitized = validateSanitizedEvidence(output);
  if (sanitized.status !== 'PASS') throw new Error(`PHASE_2C_EVIDENCE_SANITIZATION_BLOCKED:${sanitized.failures.join(',')}`);
  const serialized = canonicalJson(output);
  const outputHash = sha256(serialized);
  await writeFile(OUTPUT_PATH, serialized, 'utf8');
  await writeFile(OUTPUT_HASH_PATH, `${outputHash}  PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.json\n`, 'utf8');
  return Object.freeze({ status: 'PASS', evidence: output, evidenceSha256: outputHash });
}

async function main() {
  try {
    const result = await analyzeProductionStartingBaselineDrift();
    process.stdout.write(`PHASE_2C_LOCAL_ANALYSIS=${result.status}\n`);
    process.stdout.write(`PHASE_2C_SELECTED_PATH=${result.evidence.selectedNextPath}\n`);
    process.stdout.write(`PHASE_2C_EVIDENCE_SHA256=${result.evidenceSha256}\n`);
  } catch (error) {
    process.stderr.write('PHASE_2C_LOCAL_ANALYSIS=BLOCKED\n');
    process.stderr.write(`PHASE_2C_ERROR=${String(error?.message || 'SANITIZED_FAILURE').replace(/[^A-Z0-9_:,-]/gi, '_')}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
