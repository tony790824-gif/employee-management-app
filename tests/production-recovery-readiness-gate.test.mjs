import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  evaluateRecoveryReadiness,
  loadRecoveryReadinessPackage,
  repositoryRecoveryReadinessGate,
  validateRecoveryReadinessPackage
} from '../database/production-recovery-readiness-gate.mjs';

const readiness = await loadRecoveryReadinessPackage();
const validation = await validateRecoveryReadinessPackage(readiness);
assert.equal(validation.status, 'PASS');
assert.deepEqual(validation.failures, []);
assert.equal(validation.decision, 'NO_GO');
assert.equal(validation.blockers.length, 7);
assert.equal(readiness.targets.rpoMinutes, 15);
assert.equal(readiness.targets.rtoMinutes, 60);
assert.equal(readiness.observedEvidence.pitrAvailable, true);
assert.equal(readiness.observedEvidence.historyRetentionHours, 6);
assert.equal(readiness.currentGateEvidence.PROVIDER_PITR_CAPABILITY.status, 'PASS');
assert.equal(readiness.currentGateEvidence.SCHEDULED_SNAPSHOT.status, 'NOT_CONFIGURED');
assert.equal(readiness.currentGateEvidence.ISOLATED_RESTORE_TARGET.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RESTORE_TARGET_TRAFFIC_ISOLATION.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RESTORE_CREDENTIAL_ISOLATION.status, 'PARTIAL');
assert.equal(readiness.currentGateEvidence.RPO_15_MINUTES.status, 'PARTIAL');
assert.equal(readiness.currentGateEvidence.RTO_60_MINUTES.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RESTORED_DATABASE_VERIFICATION.status, 'PARTIAL');
assert.equal(readiness.currentGateEvidence.RESTORE_CLEANUP_EVIDENCE.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RECOVERY_COMMANDER.status, 'PASS');
assert.equal(readiness.sprint56Evidence.branchesAvailable, 9);
assert.equal(readiness.sprint56Evidence.actualRestoreCost, 'UNKNOWN');
assert.equal(readiness.sprint56Evidence.restoreAuthorization, 'NOT_GRANTED');
assert.equal(readiness.sprint57Evidence.isolatedRestore, 'PASS');
assert.equal(readiness.sprint57Evidence.rtoSeconds, 112.335);
assert.equal(readiness.sprint57Evidence.rpo15Minutes, 'NOT_PROVEN');
assert.equal(readiness.sprint57Evidence.temporaryBranchDeleted, true);
assert.equal(readiness.sprint57Evidence.actualRestoreCost, 'UNKNOWN');
assert.equal(readiness.sprint58Evidence.pitrCapability, 'PASS');
assert.equal(readiness.sprint58Evidence.latestRecoverableBoundaryUtc, 'UNKNOWN');
assert.equal(readiness.sprint58Evidence.referenceProductionBoundaryUtc, 'UNKNOWN');
assert.equal(readiness.sprint58Evidence.measuredRecoveryGapSeconds, 'UNKNOWN');
assert.equal(readiness.sprint58Evidence.rpo15Minutes, 'NOT_PROVEN');
assert.equal(readiness.sprint59Evidence.authenticatedConsoleReviewed, true);
assert.equal(readiness.sprint59Evidence.officialApiContractReviewed, true);
assert.equal(readiness.sprint59Evidence.documentedLatestRecoverableBoundaryField, false);
assert.equal(readiness.sprint59Evidence.referenceProductionBoundaryUtc, 'UNKNOWN');
assert.equal(readiness.sprint59Evidence.latestRecoverableBoundaryUtc, 'UNKNOWN');
assert.equal(readiness.sprint59Evidence.measuredRecoveryGapSeconds, 'UNKNOWN');
assert.equal(readiness.sprint59Evidence.rpo15Minutes, 'NOT_PROVEN');
assert.equal(readiness.sprint59Evidence.newRestoreAuthorized, false);

const allPass = Object.fromEntries(readiness.requiredGateIds.map(id => [id, { status: 'PASS', reason: 'TEST_ONLY' }]));
assert.equal(evaluateRecoveryReadiness(allPass, readiness.requiredGateIds).status, 'GO');
for (const status of ['PARTIAL', 'BLOCKED', 'NOT_CONFIGURED', 'UNKNOWN', 'FAIL']) {
  const gates = structuredClone(allPass);
  gates.RPO_15_MINUTES.status = status;
  assert.equal(evaluateRecoveryReadiness(gates, readiness.requiredGateIds).status, 'NO_GO');
}
const missing = structuredClone(allPass);
delete missing.RTO_60_MINUTES;
assert.equal(evaluateRecoveryReadiness(missing, readiness.requiredGateIds).status, 'NO_GO');

const falseRpo = structuredClone(readiness);
falseRpo.currentGateEvidence.RPO_15_MINUTES.status = 'PASS';
assert.equal((await validateRecoveryReadinessPackage(falseRpo)).status, 'BLOCKED');
const fabricatedRpoBoundary = structuredClone(readiness);
fabricatedRpoBoundary.sprint58Evidence.latestRecoverableBoundaryUtc = '2026-08-12T12:39:00Z';
assert.equal((await validateRecoveryReadinessPackage(fabricatedRpoBoundary)).status, 'BLOCKED');
const fabricatedRpoPass = structuredClone(readiness);
fabricatedRpoPass.sprint58Evidence.rpo15Minutes = 'PASS';
assert.equal((await validateRecoveryReadinessPackage(fabricatedRpoPass)).status, 'BLOCKED');
const fabricatedClosureBoundary = structuredClone(readiness);
fabricatedClosureBoundary.sprint59Evidence.latestRecoverableBoundaryUtc = '2026-08-12T12:39:00Z';
assert.equal((await validateRecoveryReadinessPackage(fabricatedClosureBoundary)).status, 'BLOCKED');
const fabricatedClosurePass = structuredClone(readiness);
fabricatedClosurePass.sprint59Evidence.rpo15Minutes = 'PASS';
assert.equal((await validateRecoveryReadinessPackage(fabricatedClosurePass)).status, 'BLOCKED');
const fabricatedProviderField = structuredClone(readiness);
fabricatedProviderField.sprint59Evidence.documentedLatestRecoverableBoundaryField = true;
assert.equal((await validateRecoveryReadinessPackage(fabricatedProviderField)).status, 'BLOCKED');
const falseRestore = structuredClone(readiness);
falseRestore.currentGateEvidence.ISOLATED_RESTORE_TARGET.status = 'BLOCKED';
assert.equal((await validateRecoveryReadinessPackage(falseRestore)).status, 'BLOCKED');
const falseRto = structuredClone(readiness);
falseRto.currentGateEvidence.RTO_60_MINUTES.status = 'BLOCKED';
assert.equal((await validateRecoveryReadinessPackage(falseRto)).status, 'BLOCKED');
const falseCleanup = structuredClone(readiness);
falseCleanup.sprint57Evidence.residualTemporaryBranchCount = 1;
assert.equal((await validateRecoveryReadinessPackage(falseCleanup)).status, 'BLOCKED');
const mutation = structuredClone(readiness);
mutation.observedEvidence.productionMutation = true;
assert.equal((await validateRecoveryReadinessPackage(mutation)).status, 'BLOCKED');
const falseRestoreCost = structuredClone(readiness);
falseRestoreCost.sprint56Evidence.actualRestoreCost = 'ZERO';
assert.equal((await validateRecoveryReadinessPackage(falseRestoreCost)).status, 'BLOCKED');
const falseCommander = structuredClone(readiness);
falseCommander.sprint56Evidence.recoveryCommander = 'NOT_CONFIGURED';
assert.equal((await validateRecoveryReadinessPackage(falseCommander)).status, 'BLOCKED');

const gate = await repositoryRecoveryReadinessGate();
assert.equal(gate.packageValidation, 'PASS');
assert.equal(gate.productionRecoveryTechnicalReadiness, 'NO_GO');
assert.equal(gate.blockerCount, 7);
assert.equal(gate.drillEvidenceSha256, readiness.sprint57Evidence.sourceEvidenceSha256);
assert.equal(gate.rpoEvidenceSha256, readiness.sprint58Evidence.sourceEvidenceSha256);
assert.equal(gate.rpoClosureEvidenceSha256, readiness.sprint59Evidence.sourceEvidenceSha256);
assert.equal(gate.productionConnectionAttempted, false);
assert.equal(gate.productionSqlExecuted, false);
assert.equal(gate.productionMutation, false);

const source = await readFile(new URL('../database/production-recovery-readiness-gate.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /DATABASE_(?:URL|MIGRATOR_URL|READONLY_URL)/);
assert.doesNotMatch(source, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
assert.match(source, /RPO_UNSUPPORTED_PASS/);
assert.match(source, /CURRENT_RECOVERY_GATE_MUST_FAIL_CLOSED/);
assert.match(source, /CAPACITY_OWNERSHIP_EVIDENCE_HASH_MISMATCH/);
assert.match(source, /ISOLATED_RESTORE_DRILL_EVIDENCE_HASH_MISMATCH/);
assert.match(source, /RPO_CONTINUITY_EVIDENCE_HASH_MISMATCH/);
assert.match(source, /RPO_MEASUREMENT_DECISION_WEAKENED/);
assert.match(source, /RPO_EVIDENCE_CLOSURE_HASH_MISMATCH/);
assert.match(source, /RPO_PROVIDER_CONTRACT_REVIEW_DRIFT/);
assert.match(source, /RPO_CLOSURE_MEASUREMENT_DECISION_WEAKENED/);

console.log('Production Recovery readiness package and fail-closed gate tests passed');
