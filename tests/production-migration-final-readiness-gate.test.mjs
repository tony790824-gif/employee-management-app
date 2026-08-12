import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  evaluateProductionMigrationReadiness,
  loadFinalReadinessPackage,
  repositoryFinalReadinessGate,
  validateFinalReadinessPackage
} from '../database/production-migration-final-readiness-gate.mjs';

const readiness = await loadFinalReadinessPackage();
const validation = await validateFinalReadinessPackage(readiness);
assert.equal(validation.status, 'PASS');
assert.deepEqual(validation.failures, []);
assert.equal(validation.repositoryTruth, 'PASS');
assert.equal(validation.productionMigrationTechnicalReadiness, 'NO_GO');
assert.equal(validation.productionMigrationAuthorization, 'NOT_GRANTED');
assert.ok(validation.blockerCount >= 10);
assert.equal(readiness.schemaVersion, 2);
assert.equal(readiness.lastReviewedSprint, 61);
assert.equal(readiness.repositoryInventory.expectedCount, 21);
assert.equal(readiness.repositoryInventory.result, 'PASS');
assert.deepEqual(readiness.repositoryInventory.intentionalGaps, ['0010']);
assert.deepEqual(readiness.repositoryInventory.duplicates, []);
assert.deepEqual(readiness.repositoryInventory.unexpected, []);
assert.deepEqual(readiness.repositoryInventory.checksumMismatch, []);

assert.deepEqual(readiness.intentionalExcludedVersions, ['0010']);
assert.equal(readiness.approvedExecutionOrder.includes('0010'), false);
assert.deepEqual(readiness.approvedExecutionOrder, [
  '0009', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);
assert.equal(readiness.currentGateEvidence['0010_ABSENT'].status, 'PASS');
assert.equal(readiness.currentGateEvidence.EXACT_EXECUTION_SEQUENCE.status, 'PASS');
assert.equal(readiness.currentGateEvidence.ISOLATED_RESTORE.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RTO_60_MINUTES.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RPO_15_MINUTES.status, 'BLOCKED');
assert.equal(readiness.currentGateEvidence.PRE_MIGRATION_RESTORE_POINT.status, 'BLOCKED');
assert.equal(readiness.currentGateEvidence.EXPLICIT_EVENT_AUTHORIZATION.status, 'NOT_GRANTED');
assert.equal(readiness.currentGateEvidence.STRUCTURAL_STARTING_BASELINE.status, 'BLOCKED');
assert.equal(readiness.productionReadOnlyRevalidation.processInputs, 'ABSENT');
assert.equal(readiness.productionReadOnlyRevalidation.currentStatus, 'BLOCKED');
assert.equal(readiness.rollbackAssessment.status, 'PARTIAL');
assert.equal(readiness.rollbackAssessment.unconditionallyReversibleCount, 0);
assert.equal(readiness.rollbackAssessment.conditionallyReversibleCount, 13);
assert.equal(readiness.rollbackAssessment.automaticDownAllowed, false);

const allPass = Object.fromEntries(readiness.requiredGateIds.map(gateId => [gateId, { status: 'PASS', reason: 'TEST_ONLY' }]));
assert.equal(evaluateProductionMigrationReadiness(allPass, readiness.requiredGateIds).status, 'GO');
for (const status of ['BLOCKED', 'NOT_GRANTED', 'UNKNOWN', 'NOT_CONFIGURED', 'FAIL']) {
  const gates = structuredClone(allPass);
  gates.EXPLICIT_EVENT_AUTHORIZATION.status = status;
  assert.equal(evaluateProductionMigrationReadiness(gates, readiness.requiredGateIds).status, 'NO_GO');
}
const missing = structuredClone(allPass);
delete missing.TARGET_IDENTITY;
assert.equal(evaluateProductionMigrationReadiness(missing, readiness.requiredGateIds).status, 'NO_GO');

const weakened = structuredClone(readiness);
weakened.decision.productionMigrationAuthorization = 'GRANTED';
assert.equal((await validateFinalReadinessPackage(weakened)).status, 'BLOCKED');
const includes0010 = structuredClone(readiness);
includes0010.approvedExecutionOrder.splice(1, 0, '0010');
assert.equal((await validateFinalReadinessPackage(includes0010)).status, 'BLOCKED');
const falseRpoPass = structuredClone(readiness);
falseRpoPass.currentGateEvidence.RPO_15_MINUTES.status = 'PASS';
assert.equal((await validateFinalReadinessPackage(falseRpoPass)).status, 'BLOCKED');
const falseRollback = structuredClone(readiness);
falseRollback.rollbackAssessment.automaticDownAllowed = true;
assert.equal((await validateFinalReadinessPackage(falseRollback)).status, 'BLOCKED');

const gate = await repositoryFinalReadinessGate();
assert.equal(gate.packageValidation, 'PASS');
assert.equal(gate.productionMigrationTechnicalReadiness, 'NO_GO');
assert.equal(gate.productionMigrationAuthorization, 'NOT_GRANTED');
assert.equal(gate.productionConnectionAttempted, false);
assert.equal(gate.productionSqlExecuted, false);
assert.equal(gate.productionMutation, false);

const source = await readFile(new URL('../database/production-migration-final-readiness-gate.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /DATABASE_(?:URL|MIGRATOR_URL|READONLY_URL)/);
assert.doesNotMatch(source, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
assert.match(source, /CURRENT_GATE_MUST_FAIL_CLOSED/);
assert.match(source, /TRACKED_MIGRATION_SOURCE_DIRTY/);

const simulationSource = await readFile(new URL('../database/rehearse-production-migration-final-readiness.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(simulationSource, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(simulationSource, /neon\.tech|onrender\.com|netlify\.app/i);
assert.match(simulationSource, /DISPOSABLE_FINAL_READINESS_CONFIRMATION_REQUIRED/);
assert.match(simulationSource, /PRODUCTION_GATE_MUST_REMAIN_NO_GO/);
assert.match(simulationSource, /SIMULATED_STARTING_BASELINE_MISMATCH/);
assert.match(simulationSource, /SIMULATED_FINAL_FINGERPRINT_MISMATCH/);
assert.match(simulationSource, /productionConnectionAttempted: false/);
assert.match(simulationSource, /productionMutation: false/);

console.log('Production Migration final readiness package and fail-closed gate tests passed');
