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
  if (value.currentGateEvidence?.RPO_15_MINUTES?.status === 'PASS' || value.currentGateEvidence?.RTO_60_MINUTES?.status === 'PASS') failures.push('RPO_RTO_UNSUPPORTED_PASS');
  if (value.currentGateEvidence?.ISOLATED_RESTORE_TARGET?.status === 'PASS') failures.push('ISOLATED_RESTORE_UNSUPPORTED_PASS');
  if (value.decision?.productionRecoveryTechnicalReadiness !== 'NO_GO' || value.decision?.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('RECOVERY_DECISION_WEAKENED');
  if (value.decision?.productionReadiness !== '70_PERCENT_NOT_READY' || value.decision?.gateA !== 'DEFER' || value.decision?.productionProvisioning !== 'NO_GO') failures.push('PRODUCTION_DECISION_DRIFT');

  const sourceManifest = JSON.parse(await readFile(SOURCE_MANIFEST_PATH, 'utf8'));
  const source = sourceManifest.manualBackupRestoreEvidence;
  const sourceEntry = sourceManifest.entries?.find(item => item.id === value.observedEvidence?.sourceEvidenceId);
  if (!source || source.status !== 'PARTIAL' || source.pitrAvailable !== true || source.historyRetentionHours !== 6) failures.push('SOURCE_EVIDENCE_MISMATCH');
  if (source.restoreExecuted !== false || source.scheduledSnapshotEnabled !== false || source.latestSnapshot !== 'NONE') failures.push('SOURCE_RECOVERY_STATE_MISMATCH');
  if (sourceEntry?.sha256 !== value.observedEvidence?.sourceEvidenceSha256) failures.push('SOURCE_EVIDENCE_HASH_MISMATCH');

  const [evidenceContent, hashRecord] = await Promise.all([readFile(EVIDENCE_PATH), readFile(EVIDENCE_HASH_PATH, 'utf8')]);
  const evidenceHash = sha256(evidenceContent);
  if (evidenceHash !== hashRecord.trim().split(/\s+/)[0]) failures.push('RECOVERY_EVIDENCE_HASH_MISMATCH');
  const evidence = JSON.parse(evidenceContent.toString('utf8'));
  if (evidence.productionConnectionAttempted !== false || evidence.productionSqlExecuted !== false || evidence.productionMutation !== false) failures.push('RECOVERY_EVIDENCE_BOUNDARY_FAILURE');
  if (evidence.productionRecoveryTechnicalReadiness !== 'NO_GO' || evidence.rpo15Minutes !== 'BLOCKED' || evidence.rto60Minutes !== 'BLOCKED') failures.push('RECOVERY_EVIDENCE_DECISION_MISMATCH');

  const decision = evaluateRecoveryReadiness(value.currentGateEvidence, value.requiredGateIds);
  if (decision.status !== 'NO_GO') failures.push('CURRENT_RECOVERY_GATE_MUST_FAIL_CLOSED');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures), decision: decision.status, blockers: decision.blockers, evidenceHash });
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
