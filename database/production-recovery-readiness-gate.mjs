import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_PATH = new URL('./production-recovery-readiness.expected.json', import.meta.url);
const SOURCE_MANIFEST_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_EVIDENCE_HASHES.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RECOVERY_READINESS_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RECOVERY_READINESS_EVIDENCE.sha256');
const CAPACITY_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RESTORE_CAPACITY_OWNERSHIP_EVIDENCE.json');
const CAPACITY_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RESTORE_CAPACITY_OWNERSHIP_EVIDENCE.sha256');
const DRILL_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ISOLATED_RESTORE_DRILL_EVIDENCE.json');
const DRILL_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ISOLATED_RESTORE_DRILL_EVIDENCE.sha256');
const ALLOWED_STATUSES = new Set(['PASS', 'PARTIAL', 'BLOCKED', 'NOT_CONFIGURED', 'UNKNOWN', 'FAIL']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function evaluateRecoveryReadiness(gates, requiredGateIds) {
  const blockers = [];
  for (const gateId of requiredGateIds || []) {
    const gate = gates?.[gateId];
    if (!gate || gate.status !== 'PASS') blockers.push({ gateId, status: gate?.status || 'MISSING', reason: gate?.reason || 'GATE_EVIDENCE_MISSING' });
  }
  return Object.freeze({ status: blockers.length ? 'NO_GO' : 'GO', blockers: Object.freeze(blockers.map(item => Object.freeze(item))) });
}

export async function loadRecoveryReadinessPackage() {
  return JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
}

export async function validateRecoveryReadinessPackage(input) {
  const value = input || await loadRecoveryReadinessPackage();
  const failures = [];
  if (value.schemaVersion !== 1 || value.mode !== 'PRODUCTION_RECOVERY_READINESS_PACKAGE') failures.push('PACKAGE_FORMAT_MISMATCH');
  if (value.targets?.rpoMinutes !== 15 || value.targets?.rtoMinutes !== 60) failures.push('RECOVERY_TARGET_DRIFT');
  if (new Set(value.requiredGateIds || []).size !== value.requiredGateIds?.length) failures.push('DUPLICATE_GATE_ID');
  if (Object.keys(value.currentGateEvidence || {}).sort().join('|') !== [...(value.requiredGateIds || [])].sort().join('|')) failures.push('GATE_SET_MISMATCH');
  for (const [gateId, gate] of Object.entries(value.currentGateEvidence || {})) {
    if (!ALLOWED_STATUSES.has(gate?.status)) failures.push(`INVALID_GATE_STATUS:${gateId}`);
    if (!gate?.reason) failures.push(`GATE_REASON_MISSING:${gateId}`);
  }
  if (!Array.isArray(value.requiredStopConditions) || value.requiredStopConditions.length < 12) failures.push('STOP_CONDITIONS_INCOMPLETE');
  if (value.observedEvidence?.historyRetentionHours !== 6 || value.observedEvidence?.pitrAvailable !== true) failures.push('OBSERVED_PITR_EVIDENCE_DRIFT');
  if (value.observedEvidence?.scheduledSnapshotEnabled !== false || value.observedEvidence?.latestSnapshot !== 'NONE') failures.push('SNAPSHOT_EVIDENCE_DRIFT');
  if (value.observedEvidence?.restoreExecuted !== false || value.observedEvidence?.branchCreated !== false || value.observedEvidence?.productionMutation !== false) failures.push('MUTATION_BOUNDARY_DRIFT');
  if (value.currentGateEvidence?.RPO_15_MINUTES?.status === 'PASS') failures.push('RPO_UNSUPPORTED_PASS');
  if (value.currentGateEvidence?.RTO_60_MINUTES?.status !== 'PASS') failures.push('RTO_DRILL_EVIDENCE_MISSING');
  if (value.currentGateEvidence?.ISOLATED_RESTORE_TARGET?.status !== 'PASS' || value.currentGateEvidence?.RESTORE_TARGET_TRAFFIC_ISOLATION?.status !== 'PASS' || value.currentGateEvidence?.RESTORE_CLEANUP_EVIDENCE?.status !== 'PASS') failures.push('ISOLATED_RESTORE_DRILL_EVIDENCE_MISSING');
  if (value.currentGateEvidence?.RESTORE_CREDENTIAL_ISOLATION?.status !== 'PARTIAL' || value.currentGateEvidence?.RESTORED_DATABASE_VERIFICATION?.status !== 'PARTIAL') failures.push('RESTORE_VERIFICATION_LIMITS_WEAKENED');
  if (value.decision?.productionRecoveryTechnicalReadiness !== 'NO_GO' || value.decision?.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('RECOVERY_DECISION_WEAKENED');
  if (value.decision?.productionReadiness !== '70_PERCENT_NOT_READY' || value.decision?.gateA !== 'DEFER' || value.decision?.productionProvisioning !== 'NO_GO') failures.push('PRODUCTION_DECISION_DRIFT');

  const sourceManifest = JSON.parse(await readFile(SOURCE_MANIFEST_PATH, 'utf8'));
  const source = sourceManifest.manualBackupRestoreEvidence;
  const sourceEntry = sourceManifest.entries?.find(item => item.id === value.observedEvidence?.sourceEvidenceId);
  if (!source || source.status !== 'PARTIAL' || source.pitrAvailable !== true || source.historyRetentionHours !== 6) failures.push('SOURCE_EVIDENCE_MISMATCH');
  if (source.restoreExecuted !== false || source.scheduledSnapshotEnabled !== false || source.latestSnapshot !== 'NONE') failures.push('SOURCE_RECOVERY_STATE_MISMATCH');
  if (sourceEntry?.sha256 !== value.observedEvidence?.sourceEvidenceSha256) failures.push('SOURCE_EVIDENCE_HASH_MISMATCH');

  const [capacityContent, capacityHashRecord] = await Promise.all([readFile(CAPACITY_EVIDENCE_PATH), readFile(CAPACITY_HASH_PATH, 'utf8')]);
  const capacityHash = sha256(capacityContent);
  if (capacityHash !== capacityHashRecord.trim().split(/\s+/)[0] || capacityHash !== value.sprint56Evidence?.sourceEvidenceSha256) failures.push('CAPACITY_OWNERSHIP_EVIDENCE_HASH_MISMATCH');
  const capacity = JSON.parse(capacityContent.toString('utf8'));
  if (capacity.currentPlan?.name !== 'FREE' || capacity.observedCapacity?.branchesUsed !== 1 || capacity.observedCapacity?.branchLimit !== 10 || capacity.observedCapacity?.branchesAvailable !== 9) failures.push('CAPACITY_EVIDENCE_DRIFT');
  if (capacity.restoreCapability?.historicalBranchConfigurationAvailable !== true || capacity.restoreCapability?.restoreExecuted !== false || capacity.costEvidence?.actualRestoreCost !== 'UNKNOWN') failures.push('RESTORE_CAPABILITY_OR_COST_EVIDENCE_DRIFT');
  if (capacity.recoveryOwnership?.status !== 'CONFIGURED' || capacity.recoveryOwnership?.restoreAuthorizationGranted !== false || capacity.productionMutation !== false) failures.push('RECOVERY_OWNERSHIP_OR_BOUNDARY_DRIFT');
  if (value.sprint56Evidence?.actualRestoreCost !== 'UNKNOWN' || value.sprint56Evidence?.restoreExecuted !== false || value.sprint56Evidence?.recoveryCommander !== 'OWNER_CONFIGURED' || value.sprint56Evidence?.restoreAuthorization !== 'NOT_GRANTED') failures.push('SPRINT_56_DECISION_DRIFT');

  const [drillContent, drillHashRecord] = await Promise.all([readFile(DRILL_EVIDENCE_PATH), readFile(DRILL_HASH_PATH, 'utf8')]);
  const drillHash = sha256(drillContent);
  if (drillHash !== drillHashRecord.trim().split(/\s+/)[0] || drillHash !== value.sprint57Evidence?.sourceEvidenceSha256) failures.push('ISOLATED_RESTORE_DRILL_EVIDENCE_HASH_MISMATCH');
  const drill = JSON.parse(drillContent.toString('utf8'));
  if (drill.restore?.status !== 'PASS' || drill.restore?.temporaryBranchCreated !== true || drill.restore?.temporaryBranchDistinctFromProduction !== true || drill.restore?.productionBranchReplacedOrReset !== false) failures.push('ISOLATED_RESTORE_DRILL_STATE_MISMATCH');
  if (drill.verification?.transactionReadOnly !== true || drill.verification?.migrationLedgerCount !== 8 || drill.verification?.migrationLedgerVersions?.join(',') !== '0001,0002,0003,0004,0005,0006,0007,0008') failures.push('RESTORED_DATABASE_BASIC_VERIFICATION_MISMATCH');
  if (drill.recoveryObjectives?.rtoSeconds !== 112.335 || drill.recoveryObjectives?.rto60Minutes !== 'PASS' || drill.recoveryObjectives?.rpo15Minutes !== 'NOT_PROVEN' || drill.recoveryObjectives?.restorePointAgeAtStartSeconds !== 33.482) failures.push('RESTORE_MEASUREMENT_EVIDENCE_DRIFT');
  if (drill.isolation?.productionSchemaMutation !== false || drill.isolation?.productionDataMutation !== false || drill.isolation?.productionMigrationExecuted !== false || drill.isolation?.productionTrafficRoutedToTemporaryBranch !== false) failures.push('RESTORE_ISOLATION_BOUNDARY_FAILURE');
  if (drill.cleanup?.temporaryBranchDeleted !== true || drill.cleanup?.residualTemporaryBranchCount !== 0 || drill.cleanup?.branchesUsedAfter !== 1 || drill.cleanup?.status !== 'PASS') failures.push('RESTORE_CLEANUP_EVIDENCE_MISMATCH');
  if (drill.cost?.actualRestoreCost !== 'UNKNOWN' || drill.cost?.paymentPerformed !== false || drill.cost?.planUpgradePerformed !== false) failures.push('RESTORE_COST_OR_BILLING_BOUNDARY_DRIFT');
  if (drill.productionReadiness !== '70_PERCENT_NOT_READY' || drill.productionStatus !== 'NOT_READY' || drill.gateA !== 'DEFER' || drill.productionProvisioning !== 'NO_GO' || drill.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('SPRINT_57_PRODUCTION_DECISION_DRIFT');
  if (value.sprint57Evidence?.isolatedRestore !== 'PASS' || value.sprint57Evidence?.providerForkDurationSeconds !== 2.85 || value.sprint57Evidence?.rtoSeconds !== 112.335 || value.sprint57Evidence?.rto60Minutes !== 'PASS' || value.sprint57Evidence?.rpo15Minutes !== 'NOT_PROVEN' || value.sprint57Evidence?.productionMutation !== false || value.sprint57Evidence?.temporaryBranchDeleted !== true || value.sprint57Evidence?.residualTemporaryBranchCount !== 0 || value.sprint57Evidence?.branchesUsedAfter !== 1 || value.sprint57Evidence?.actualRestoreCost !== 'UNKNOWN') failures.push('SPRINT_57_EVIDENCE_DRIFT');

  const [evidenceContent, hashRecord] = await Promise.all([readFile(EVIDENCE_PATH), readFile(EVIDENCE_HASH_PATH, 'utf8')]);
  const evidenceHash = sha256(evidenceContent);
  if (evidenceHash !== hashRecord.trim().split(/\s+/)[0]) failures.push('RECOVERY_EVIDENCE_HASH_MISMATCH');
  const evidence = JSON.parse(evidenceContent.toString('utf8'));
  if (evidence.productionConnectionAttempted !== false || evidence.productionSqlExecuted !== false || evidence.productionMutation !== false) failures.push('RECOVERY_EVIDENCE_BOUNDARY_FAILURE');
  if (evidence.productionRecoveryTechnicalReadiness !== 'NO_GO' || evidence.rpo15Minutes !== 'BLOCKED' || evidence.rto60Minutes !== 'BLOCKED') failures.push('RECOVERY_EVIDENCE_DECISION_MISMATCH');

  const decision = evaluateRecoveryReadiness(value.currentGateEvidence, value.requiredGateIds);
  if (decision.status !== 'NO_GO') failures.push('CURRENT_RECOVERY_GATE_MUST_FAIL_CLOSED');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures), decision: decision.status, blockers: decision.blockers, evidenceHash, capacityEvidenceHash: capacityHash, drillEvidenceHash: drillHash });
}

export async function repositoryRecoveryReadinessGate() {
  const value = await loadRecoveryReadinessPackage();
  const validation = await validateRecoveryReadinessPackage(value);
  if (validation.status !== 'PASS') throw new Error(validation.failures.join(','));
  return Object.freeze({
    mode: 'REPOSITORY_ONLY_RECOVERY_READINESS_GATE',
    packageValidation: validation.status,
    productionRecoveryTechnicalReadiness: validation.decision,
    blockerCount: validation.blockers.length,
    evidenceSha256: validation.evidenceHash,
    capacityEvidenceSha256: validation.capacityEvidenceHash,
    drillEvidenceSha256: validation.drillEvidenceHash,
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryRecoveryReadinessGate().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Production Recovery readiness gate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
