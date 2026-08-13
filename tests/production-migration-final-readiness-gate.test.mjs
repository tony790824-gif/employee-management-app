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
assert.equal(readiness.schemaVersion, 4);
assert.equal(readiness.lastReviewedSprint, 65);
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
assert.equal(readiness.currentGateEvidence.IMMUTABLE_EXECUTION_ARTIFACT.status, 'PASS');
assert.equal(readiness.currentGateEvidence.RUNTIME_COMPATIBILITY.status, 'PASS');
assert.equal(readiness.currentGateEvidence.EXPLICIT_EVENT_AUTHORIZATION.status, 'NOT_GRANTED');
assert.equal(readiness.currentGateEvidence.TARGET_IDENTITY.status, 'PASS');
assert.equal(readiness.currentGateEvidence.TLS_VERIFY_FULL.status, 'PASS');
assert.equal(readiness.currentGateEvidence.ZERO_UNEXPECTED_MIGRATIONS.status, 'PASS');
assert.equal(readiness.currentGateEvidence.FRESH_LEDGER_AND_CHECKSUM.status, 'BLOCKED');
assert.equal(readiness.currentGateEvidence.STRUCTURAL_STARTING_BASELINE.status, 'BLOCKED');
assert.equal(readiness.repositoryStartingBaseline.status, 'PASS');
assert.deepEqual(readiness.repositoryStartingBaseline.migrationSequence, [
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008'
]);
assert.equal(readiness.repositoryStartingBaseline.structuralFingerprint, readiness.productionBaseline.expectedStructuralFingerprint);
assert.equal(readiness.repositoryStartingBaseline.independentRebuildCount, 2);
assert.equal(readiness.repositoryStartingBaseline.determinism, 'PASS');
assert.equal(readiness.repositoryStartingBaseline.cleanup, 'PASS');
assert.equal(readiness.repositoryStartingBaseline.liveProductionComparison, 'NOT_EVALUATED');
assert.equal(readiness.repositoryStartingBaseline.authoritativeGate, 'BLOCKED');
assert.equal(readiness.productionReadOnlyRevalidation.processInputs, 'PRESENT_DURING_SINGLE_AUTHORIZED_PROCESS');
assert.equal(readiness.productionReadOnlyRevalidation.currentStatus, 'PARTIAL');
assert.equal(readiness.productionReadOnlyRevalidation.authorizationConsumed, true);
assert.equal(readiness.productionReadOnlyRevalidation.lastAttemptConnection, true);
assert.equal(readiness.productionReadOnlyRevalidation.currentIdentity, 'PASS');
assert.equal(readiness.productionReadOnlyRevalidation.currentReaderRoleBoundary, 'PASS');
assert.equal(readiness.productionReadOnlyRevalidation.currentTlsVerifyFull, 'PASS');
assert.deepEqual(readiness.productionReadOnlyRevalidation.currentObservedLedgerRange, {
  start: '0001', end: '0008', count: 8
});
assert.deepEqual(readiness.productionReadOnlyRevalidation.currentUnexpected, []);
assert.deepEqual(readiness.productionReadOnlyRevalidation.currentChecksumMismatch, []);
assert.equal(readiness.rollbackAssessment.status, 'PARTIAL');
assert.equal(readiness.rollbackAssessment.unconditionallyReversibleCount, 0);
assert.equal(readiness.rollbackAssessment.conditionallyReversibleCount, 13);
assert.equal(readiness.rollbackAssessment.automaticDownAllowed, false);
assert.deepEqual(readiness.classificationSummary, {
  REPOSITORY_CLOSABLE: 0,
  READONLY_PRODUCTION_CLOSABLE: 2,
  EXTERNAL_CONFIGURATION_REQUIRED: 3,
  PRODUCTION_MUTATION_REQUIRED: 3,
  COMMERCIAL_DECISION_REQUIRED: 0,
  HUMAN_AUTHORIZATION_REQUIRED: 3,
  BLOCKED_BY_DEPENDENCY: 2
});
assert.equal(Object.values(readiness.currentGateEvidence).filter(gate => gate.status === 'PASS').length, 9);
assert.equal(Object.values(readiness.currentGateEvidence).filter(gate => gate.status !== 'PASS').length, 13);
assert.equal(Object.keys(readiness.gateClosureMatrix).length, 22);
for (const gateId of readiness.requiredGateIds) {
  const gate = readiness.currentGateEvidence[gateId];
  const closure = readiness.gateClosureMatrix[gateId];
  assert.ok(closure);
  assert.ok(closure.existingEvidence);
  assert.ok(closure.evidenceSource);
  assert.ok(closure.requiredAction);
  assert.ok(closure.requiredAuthorization);
  assert.ok(closure.requiredExternalResource);
  assert.ok(closure.costImplication);
  assert.equal(typeof closure.canCloseWithoutProductionMutation, 'boolean');
  assert.ok(Array.isArray(closure.dependencies));
  if (gate.status === 'PASS') assert.equal(closure.category, 'CLOSED_PASS');
  else assert.notEqual(closure.category, 'CLOSED_PASS');
}

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
const falseLedgerPass = structuredClone(readiness);
falseLedgerPass.currentGateEvidence.FRESH_LEDGER_AND_CHECKSUM.status = 'PASS';
assert.equal((await validateFinalReadinessPackage(falseLedgerPass)).status, 'BLOCKED');
const falseStructuralPass = structuredClone(readiness);
falseStructuralPass.currentGateEvidence.STRUCTURAL_STARTING_BASELINE.status = 'PASS';
assert.equal((await validateFinalReadinessPackage(falseStructuralPass)).status, 'BLOCKED');
const falseRepositoryBaseline = structuredClone(readiness);
falseRepositoryBaseline.repositoryStartingBaseline.liveProductionComparison = 'PASS';
assert.equal((await validateFinalReadinessPackage(falseRepositoryBaseline)).status, 'BLOCKED');
const missingClassification = structuredClone(readiness);
delete missingClassification.gateClosureMatrix.TARGET_IDENTITY;
assert.equal((await validateFinalReadinessPackage(missingClassification)).status, 'BLOCKED');
const duplicatedClassification = structuredClone(readiness);
duplicatedClassification.gateClosureMatrix.FRESH_LEDGER_AND_CHECKSUM.category = 'CLOSED_PASS';
assert.equal((await validateFinalReadinessPackage(duplicatedClassification)).status, 'BLOCKED');
const weakenedMutationBoundary = structuredClone(readiness);
weakenedMutationBoundary.gateClosureMatrix.RPO_15_MINUTES.canCloseWithoutProductionMutation = true;
assert.equal((await validateFinalReadinessPackage(weakenedMutationBoundary)).status, 'BLOCKED');
const cyclicClosurePlan = structuredClone(readiness);
cyclicClosurePlan.gateClosureMatrix.PRE_MIGRATION_RESTORE_POINT.dependencies.push('EXPLICIT_EVENT_AUTHORIZATION');
assert.equal((await validateFinalReadinessPackage(cyclicClosurePlan)).status, 'BLOCKED');

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
