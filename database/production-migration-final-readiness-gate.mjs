import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_MISSING_VERSIONS, validateRemediationInventory } from './production-migration-gap-remediation-plan.mjs';
import { repositoryClosureGate } from './production-migration-repository-closure-gate.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_PATH = new URL('./production-migration-final-readiness.expected.json', import.meta.url);
const STRUCTURAL_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json');
const STRUCTURAL_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.sha256');
const UPGRADE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json');
const UPGRADE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.sha256');
const PRODUCTION_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.json');
const PRODUCTION_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.sha256');
const ALLOWED_GATE_STATUSES = new Set(['PASS', 'BLOCKED', 'NOT_GRANTED', 'UNKNOWN', 'NOT_CONFIGURED', 'FAIL']);
const CLOSURE_CATEGORIES = Object.freeze([
  'REPOSITORY_CLOSABLE',
  'READONLY_PRODUCTION_CLOSABLE',
  'EXTERNAL_CONFIGURATION_REQUIRED',
  'PRODUCTION_MUTATION_REQUIRED',
  'COMMERCIAL_DECISION_REQUIRED',
  'HUMAN_AUTHORIZATION_REQUIRED',
  'BLOCKED_BY_DEPENDENCY'
]);
const ALLOWED_CLOSURE_CATEGORIES = new Set([...CLOSURE_CATEGORIES, 'CLOSED_PASS']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function verifiedEvidenceHash(evidencePath, hashPath) {
  const [content, hashRecord] = await Promise.all([readFile(evidencePath), readFile(hashPath, 'utf8')]);
  const actual = sha256(content);
  const recorded = hashRecord.trim().split(/\s+/)[0];
  if (actual !== recorded) throw new Error(`EVIDENCE_HASH_MISMATCH:${path.basename(evidencePath)}`);
  return actual;
}

export async function loadFinalReadinessPackage() {
  return JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
}

export function evaluateProductionMigrationReadiness(gates, requiredGateIds) {
  const blockers = [];
  for (const gateId of requiredGateIds || []) {
    const gate = gates?.[gateId];
    if (!gate || gate.status !== 'PASS') {
      blockers.push({ gateId, status: gate?.status || 'MISSING', reason: gate?.reason || 'GATE_EVIDENCE_MISSING' });
    }
  }
  return Object.freeze({
    status: blockers.length ? 'NO_GO' : 'GO',
    blockers: Object.freeze(blockers.map(item => Object.freeze(item)))
  });
}

export async function validateFinalReadinessPackage(input) {
  const value = input || await loadFinalReadinessPackage();
  const failures = [];
  if (value.schemaVersion !== 4 || value.mode !== 'PRODUCTION_MIGRATION_FINAL_READINESS_PACKAGE' || value.lastReviewedSprint !== 63) failures.push('PACKAGE_FORMAT_MISMATCH');
  const inventory = value.repositoryInventory || {};
  if (inventory.expectedCount !== 21 || inventory.result !== 'PASS') failures.push('REPOSITORY_INVENTORY_STATUS_MISMATCH');
  if (JSON.stringify(inventory.approvedVersions) !== JSON.stringify([...value.productionBaseline.expectedVersions, ...REQUIRED_MISSING_VERSIONS])) failures.push('REPOSITORY_INVENTORY_VERSION_MISMATCH');
  if (JSON.stringify(inventory.intentionalGaps) !== JSON.stringify(['0010']) || inventory.duplicates?.length || inventory.unexpected?.length || inventory.checksumMismatch?.length) failures.push('REPOSITORY_INVENTORY_DRIFT');
  if (JSON.stringify(value.approvedExecutionOrder) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) failures.push('EXECUTION_ORDER_MISMATCH');
  if (JSON.stringify(value.intentionalExcludedVersions) !== JSON.stringify(['0010'])) failures.push('0010_EXCLUSION_MISMATCH');
  if (value.approvedExecutionOrder?.includes('0010')) failures.push('0010_INCLUDED');
  if (new Set(value.requiredGateIds || []).size !== value.requiredGateIds?.length) failures.push('DUPLICATE_GATE_ID');
  if (Object.keys(value.currentGateEvidence || {}).sort().join('|') !== [...(value.requiredGateIds || [])].sort().join('|')) failures.push('GATE_SET_MISMATCH');
  for (const [gateId, gate] of Object.entries(value.currentGateEvidence || {})) {
    if (!ALLOWED_GATE_STATUSES.has(gate?.status)) failures.push(`INVALID_GATE_STATUS:${gateId}`);
    if (!gate?.reason) failures.push(`GATE_REASON_MISSING:${gateId}`);
  }
  const matrix = value.gateClosureMatrix || {};
  if (Object.keys(matrix).sort().join('|') !== [...(value.requiredGateIds || [])].sort().join('|')) failures.push('CLOSURE_MATRIX_GATE_SET_MISMATCH');
  const classificationCounts = Object.fromEntries(CLOSURE_CATEGORIES.map(category => [category, 0]));
  for (const gateId of value.requiredGateIds || []) {
    const gate = value.currentGateEvidence?.[gateId];
    const closure = matrix[gateId];
    if (!closure || !ALLOWED_CLOSURE_CATEGORIES.has(closure.category)) {
      failures.push(`CLOSURE_CLASSIFICATION_MISSING_OR_INVALID:${gateId}`);
      continue;
    }
    if (gate?.status === 'PASS' && closure.category !== 'CLOSED_PASS') failures.push(`PASS_GATE_NOT_CLOSED:${gateId}`);
    if (gate?.status !== 'PASS') {
      if (!CLOSURE_CATEGORIES.includes(closure.category)) failures.push(`NON_PASS_GATE_CLASSIFICATION_INVALID:${gateId}`);
      else classificationCounts[closure.category] += 1;
    }
    if (![0, 1, 2, 3].includes(closure.phase)) failures.push(`CLOSURE_PHASE_INVALID:${gateId}`);
    for (const field of ['existingEvidence', 'evidenceSource', 'requiredAction', 'requiredAuthorization', 'requiredExternalResource', 'costImplication']) {
      if (!closure[field]) failures.push(`CLOSURE_FIELD_MISSING:${gateId}:${field}`);
    }
    if (typeof closure.canCloseWithoutProductionMutation !== 'boolean') failures.push(`CLOSURE_MUTATION_BOUNDARY_MISSING:${gateId}`);
    if (!Array.isArray(closure.dependencies)) failures.push(`CLOSURE_DEPENDENCIES_MISSING:${gateId}`);
    for (const dependency of closure.dependencies || []) {
      if (!value.requiredGateIds?.includes(dependency) || dependency === gateId) failures.push(`CLOSURE_DEPENDENCY_INVALID:${gateId}:${dependency}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visitDependency = gateId => {
    if (visiting.has(gateId)) {
      failures.push(`CLOSURE_DEPENDENCY_CYCLE:${gateId}`);
      return;
    }
    if (visited.has(gateId)) return;
    visiting.add(gateId);
    for (const dependency of matrix[gateId]?.dependencies || []) visitDependency(dependency);
    visiting.delete(gateId);
    visited.add(gateId);
  };
  for (const gateId of value.requiredGateIds || []) visitDependency(gateId);
  if (JSON.stringify(classificationCounts) !== JSON.stringify(value.classificationSummary)) failures.push('CLASSIFICATION_SUMMARY_MISMATCH');
  const passCount = (value.requiredGateIds || []).filter(gateId => value.currentGateEvidence?.[gateId]?.status === 'PASS').length;
  const nonPassCount = Object.values(classificationCounts).reduce((sum, count) => sum + count, 0);
  if (nonPassCount !== (value.requiredGateIds || []).length - passCount) failures.push('NON_PASS_CLASSIFICATION_COUNT_MISMATCH');
  for (const gateId of ['RPO_15_MINUTES', 'PRE_MIGRATION_RESTORE_POINT', 'TRAFFIC_AND_LONG_TRANSACTION_CONTROL']) {
    if (matrix[gateId]?.category !== 'PRODUCTION_MUTATION_REQUIRED' || matrix[gateId]?.canCloseWithoutProductionMutation !== false) {
      failures.push(`PRODUCTION_MUTATION_BOUNDARY_WEAKENED:${gateId}`);
    }
  }
  if (!Array.isArray(value.requiredStopConditions) || value.requiredStopConditions.length < 10) failures.push('STOP_CONDITIONS_INCOMPLETE');
  if (value.decision?.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('AUTHORIZATION_GATE_WEAKENED');
  if (value.decision?.productionMigrationTechnicalReadiness !== 'NO_GO') failures.push('TECHNICAL_GATE_WEAKENED');
  if (value.decision?.productionReadiness !== '70_PERCENT_NOT_READY' || value.decision?.gateA !== 'DEFER' || value.decision?.productionProvisioning !== 'NO_GO') failures.push('PRODUCTION_DECISION_DRIFT');
  const current = evaluateProductionMigrationReadiness(value.currentGateEvidence, value.requiredGateIds);
  if (current.status !== 'NO_GO') failures.push('CURRENT_GATE_MUST_FAIL_CLOSED');
  const revalidation = value.productionReadOnlyRevalidation || {};
  if (revalidation.processInputs !== 'ABSENT' || revalidation.currentStatus !== 'BLOCKED') failures.push('READONLY_REVALIDATION_FALSE_PASS');
  if (revalidation.historicalIdentity !== 'PASS' || revalidation.historicalRoleBoundary !== 'PASS' || revalidation.historicalTlsVerifyFull !== 'PASS') failures.push('HISTORICAL_IDENTITY_PROVENANCE_DRIFT');
  if (JSON.stringify(revalidation.historicalLedger) !== JSON.stringify(value.productionBaseline.expectedVersions) || JSON.stringify(revalidation.historicalMissing) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) failures.push('HISTORICAL_LEDGER_PROVENANCE_DRIFT');
  const rollback = value.rollbackAssessment || {};
  if (rollback.status !== 'PARTIAL' || rollback.unconditionallyReversibleCount !== 0 || rollback.conditionallyReversibleCount !== 13 || rollback.automaticDownAllowed !== false) failures.push('ROLLBACK_SAFETY_WEAKENED');
  if (value.currentGateEvidence?.ISOLATED_RESTORE?.status !== 'PASS' || value.currentGateEvidence?.RTO_60_MINUTES?.status !== 'PASS') failures.push('RECOVERY_PASS_PROVENANCE_DRIFT');
  if (value.currentGateEvidence?.RPO_15_MINUTES?.status !== 'BLOCKED' || value.currentGateEvidence?.PRE_MIGRATION_RESTORE_POINT?.status !== 'BLOCKED') failures.push('RECOVERY_BLOCKER_WEAKENED');
  if (value.currentGateEvidence?.IMMUTABLE_EXECUTION_ARTIFACT?.status !== 'PASS' || value.currentGateEvidence?.RUNTIME_COMPATIBILITY?.status !== 'PASS') failures.push('SPRINT_63_REPOSITORY_CLOSURE_DRIFT');

  const repositoryClosure = await repositoryClosureGate();
  if (repositoryClosure.immutableExactManifest !== 'PASS' || repositoryClosure.runtimeCompatibility !== 'PASS' || repositoryClosure.candidateCommitAuthorization !== 'NOT_GRANTED') failures.push('SPRINT_63_REPOSITORY_CLOSURE_EVIDENCE_MISMATCH');

  const remediation = await validateRemediationInventory();
  if (remediation.status !== 'PASS') failures.push(...remediation.failures.map(item => `REMEDIATION:${item}`));

  const [productionHash, upgradeHash, structuralHash] = await Promise.all([
    verifiedEvidenceHash(PRODUCTION_EVIDENCE_PATH, PRODUCTION_HASH_PATH),
    verifiedEvidenceHash(UPGRADE_EVIDENCE_PATH, UPGRADE_HASH_PATH),
    verifiedEvidenceHash(STRUCTURAL_EVIDENCE_PATH, STRUCTURAL_HASH_PATH)
  ]);
  if (productionHash !== value.sourceEvidence?.productionReadOnlyEvidenceSha256) failures.push('PRODUCTION_EVIDENCE_PROVENANCE_MISMATCH');
  if (upgradeHash !== value.sourceEvidence?.upgradeRehearsalEvidenceSha256) failures.push('UPGRADE_EVIDENCE_PROVENANCE_MISMATCH');
  if (structuralHash !== value.sourceEvidence?.structuralParityEvidenceSha256) failures.push('STRUCTURAL_EVIDENCE_PROVENANCE_MISMATCH');

  const structural = JSON.parse(await readFile(STRUCTURAL_EVIDENCE_PATH, 'utf8'));
  if (structural.baseline?.fingerprint !== value.productionBaseline?.expectedStructuralFingerprint) failures.push('STARTING_FINGERPRINT_MISMATCH');
  if (structural.comparison?.upgradeFingerprint !== value.expectedFinalStructuralFingerprint || structural.comparison?.fingerprintMatch !== 'MATCH') failures.push('FINAL_FINGERPRINT_MISMATCH');
  if (structural.productionConnectionAttempted !== false || structural.productionMutation !== false) failures.push('DISPOSABLE_EVIDENCE_BOUNDARY_FAILURE');

  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    failures: Object.freeze(failures),
    repositoryTruth: remediation.status,
    productionMigrationTechnicalReadiness: current.status,
    productionMigrationAuthorization: value.decision?.productionMigrationAuthorization,
    blockerCount: current.blockers.length,
    blockers: current.blockers
  });
}

export async function repositoryFinalReadinessGate() {
  const packageValue = await loadFinalReadinessPackage();
  const validation = await validateFinalReadinessPackage(packageValue);
  const migrationDiff = execFileSync('git', ['diff', '--name-only', '--', 'database/migrations'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  if (migrationDiff) throw new Error('TRACKED_MIGRATION_SOURCE_DIRTY');
  return Object.freeze({
    mode: 'REPOSITORY_ONLY_FINAL_READINESS_GATE',
    evaluatedCommitSha: commitSha,
    packageValidation: validation.status,
    repositoryTruth: validation.repositoryTruth,
    productionMigrationAuthorization: validation.productionMigrationAuthorization,
    productionMigrationTechnicalReadiness: validation.productionMigrationTechnicalReadiness,
    blockers: validation.blockers,
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryFinalReadinessGate().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Production Migration final readiness gate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
