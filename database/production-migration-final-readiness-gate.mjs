import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_MISSING_VERSIONS, validateRemediationInventory } from './production-migration-gap-remediation-plan.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_PATH = new URL('./production-migration-final-readiness.expected.json', import.meta.url);
const STRUCTURAL_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json');
const STRUCTURAL_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.sha256');
const UPGRADE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json');
const UPGRADE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.sha256');
const PRODUCTION_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.json');
const PRODUCTION_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_SCHEMA_PARITY_EVIDENCE.sha256');
const ALLOWED_GATE_STATUSES = new Set(['PASS', 'BLOCKED', 'NOT_GRANTED', 'UNKNOWN', 'NOT_CONFIGURED', 'FAIL']);

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
  if (value.schemaVersion !== 2 || value.mode !== 'PRODUCTION_MIGRATION_FINAL_READINESS_PACKAGE' || value.lastReviewedSprint !== 61) failures.push('PACKAGE_FORMAT_MISMATCH');
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
