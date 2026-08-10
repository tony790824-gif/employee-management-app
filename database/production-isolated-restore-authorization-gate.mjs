import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_PATH = new URL('./production-isolated-restore-authorization.expected.json', import.meta.url);
const RECOVERY_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RECOVERY_READINESS_EVIDENCE.json');
const RECOVERY_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_RECOVERY_READINESS_EVIDENCE.sha256');
const DECISION_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ISOLATED_RESTORE_DECISION_EVIDENCE.json');
const DECISION_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ISOLATED_RESTORE_DECISION_EVIDENCE.sha256');
const ALLOWED_STATUSES = new Set(['PASS', 'PARTIAL', 'BLOCKED', 'NOT_CONFIGURED', 'NOT_GRANTED', 'UNKNOWN', 'FAIL']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function verifiedHash(file, hashFile) {
  const [content, record] = await Promise.all([readFile(file), readFile(hashFile, 'utf8')]);
  const actual = sha256(content);
  if (actual !== record.trim().split(/\s+/)[0]) throw new Error(`EVIDENCE_HASH_MISMATCH:${path.basename(file)}`);
  return { content, sha256: actual };
}

export function evaluateIsolatedRestoreAuthorization(gates, requiredGateIds) {
  const blockers = [];
  for (const gateId of requiredGateIds || []) {
    const gate = gates?.[gateId];
    if (!gate || gate.status !== 'PASS') blockers.push({ gateId, status: gate?.status || 'MISSING', reason: gate?.reason || 'GATE_EVIDENCE_MISSING' });
  }
  return Object.freeze({ decision: blockers.length ? 'DEFER' : 'ELIGIBLE_FOR_EXACT_OWNER_AUTHORIZATION', blockers: Object.freeze(blockers.map(item => Object.freeze(item))) });
}

export async function loadIsolatedRestoreAuthorizationPackage() {
  return JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
}

export async function validateIsolatedRestoreAuthorizationPackage(input) {
  const value = input || await loadIsolatedRestoreAuthorizationPackage();
  const failures = [];
  if (value.schemaVersion !== 1 || value.mode !== 'PRODUCTION_ISOLATED_RESTORE_AUTHORIZATION_PACKAGE') failures.push('PACKAGE_FORMAT_MISMATCH');
  if (value.authorizationDecision !== 'DEFER' || value.exerciseAuthorization !== 'NOT_GRANTED') failures.push('AUTHORIZATION_DECISION_WEAKENED');
  const scope = value.exactProposedScope || {};
  if (scope.maximumRestoreTargets !== 1 || scope.maximumTemporaryVerificationCredentials !== 1) failures.push('RESOURCE_LIMIT_MISMATCH');
  if (scope.productionTrafficAllowed !== false || scope.applicationConnectionAllowed !== false || scope.businessDataInspectionAllowed !== false) failures.push('ISOLATION_CONTRACT_WEAKENED');
  for (const field of ['productionSqlAllowed', 'productionMigrationAllowed', 'retentionChangeAllowed', 'scheduledSnapshotChangeAllowed', 'planUpgradeAllowed']) {
    if (scope[field] !== false) failures.push(`PROHIBITED_SCOPE_ENABLED:${field}`);
  }
  const cost = value.costAndResourceBoundary || {};
  if (cost.currentPlan !== 'FREE' || cost.currentPlanChangeAuthorized !== false || cost.billingActionAuthorized !== false || cost.stopIfChargeOrUpgradeRequired !== true) failures.push('COST_BOUNDARY_WEAKENED');
  if (cost.restoreTargetCost !== 'UNKNOWN_RECONFIRM_IN_PROVIDER_BEFORE_AUTHORIZATION' || cost.branchCapacityAvailable !== 'UNKNOWN_RECONFIRM_IN_PROVIDER_BEFORE_AUTHORIZATION') failures.push('UNKNOWN_COST_OR_CAPACITY_COERCED');
  const measurement = value.measurementContract || {};
  if (measurement.rpoTargetMinutes !== 15 || measurement.rtoTargetMinutes !== 60 || measurement.rpoRequiresProviderContinuityEvidence !== true) failures.push('RPO_RTO_CONTRACT_DRIFT');
  if (new Set(value.requiredGateIds || []).size !== value.requiredGateIds?.length) failures.push('DUPLICATE_GATE_ID');
  if (Object.keys(value.currentGateEvidence || {}).sort().join('|') !== [...(value.requiredGateIds || [])].sort().join('|')) failures.push('GATE_SET_MISMATCH');
  for (const [gateId, gate] of Object.entries(value.currentGateEvidence || {})) {
    if (!ALLOWED_STATUSES.has(gate?.status)) failures.push(`INVALID_GATE_STATUS:${gateId}`);
    if (!gate?.reason) failures.push(`GATE_REASON_MISSING:${gateId}`);
  }
  if (!Array.isArray(value.stopConditions) || value.stopConditions.length < 12) failures.push('STOP_CONDITIONS_INCOMPLETE');
  if (!Array.isArray(value.requiredVerification) || value.requiredVerification.length < 8) failures.push('VERIFICATION_PLAN_INCOMPLETE');
  const decision = value.decision || {};
  if (decision.isolatedRestore !== 'BLOCKED' || decision.rpo15Minutes !== 'BLOCKED' || decision.rto60Minutes !== 'BLOCKED_NOT_MEASURED') failures.push('RECOVERY_STATUS_WEAKENED');
  if (decision.recoveryCommander !== 'NOT_CONFIGURED' || decision.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('OWNERSHIP_OR_MIGRATION_GATE_WEAKENED');
  if (decision.productionReadiness !== '70_PERCENT_NOT_READY' || decision.productionStatus !== 'NOT_READY' || decision.gateA !== 'DEFER' || decision.productionProvisioning !== 'NO_GO') failures.push('PRODUCTION_DECISION_DRIFT');

  const recoveryEvidence = await verifiedHash(RECOVERY_EVIDENCE_PATH, RECOVERY_HASH_PATH);
  if (recoveryEvidence.sha256 !== value.sourceRecoveryEvidenceSha256) failures.push('SOURCE_RECOVERY_EVIDENCE_HASH_MISMATCH');
  const recovery = JSON.parse(recoveryEvidence.content.toString('utf8'));
  if (recovery.isolatedRestore?.executed !== false || recovery.rpo15Minutes !== 'BLOCKED' || recovery.rto60Minutes !== 'BLOCKED') failures.push('SOURCE_RECOVERY_STATUS_MISMATCH');

  const decisionEvidence = await verifiedHash(DECISION_EVIDENCE_PATH, DECISION_HASH_PATH);
  const evidence = JSON.parse(decisionEvidence.content.toString('utf8'));
  if (evidence.authorizationDecision !== 'DEFER' || evidence.exerciseAuthorization !== 'NOT_GRANTED') failures.push('DECISION_EVIDENCE_AUTHORIZATION_MISMATCH');
  if (evidence.productionConnectionAttempted !== false || evidence.productionSqlExecuted !== false || evidence.productionMutation !== false || evidence.externalResourceCreated !== false) failures.push('DECISION_EVIDENCE_BOUNDARY_FAILURE');

  const evaluated = evaluateIsolatedRestoreAuthorization(value.currentGateEvidence, value.requiredGateIds);
  if (evaluated.decision !== 'DEFER') failures.push('CURRENT_AUTHORIZATION_GATE_MUST_DEFER');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures), decision: evaluated.decision, blockers: evaluated.blockers, evidenceSha256: decisionEvidence.sha256 });
}

export async function repositoryIsolatedRestoreAuthorizationGate() {
  const value = await loadIsolatedRestoreAuthorizationPackage();
  const validation = await validateIsolatedRestoreAuthorizationPackage(value);
  if (validation.status !== 'PASS') throw new Error(validation.failures.join(','));
  return Object.freeze({
    mode: 'REPOSITORY_ONLY_ISOLATED_RESTORE_AUTHORIZATION_GATE',
    packageValidation: validation.status,
    authorizationDecision: validation.decision,
    exerciseAuthorization: value.exerciseAuthorization,
    blockerCount: validation.blockers.length,
    evidenceSha256: validation.evidenceSha256,
    externalResourceCreated: false,
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryIsolatedRestoreAuthorizationGate().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Isolated Restore authorization gate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
