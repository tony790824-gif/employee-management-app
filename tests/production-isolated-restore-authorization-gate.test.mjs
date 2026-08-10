import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  evaluateIsolatedRestoreAuthorization,
  loadIsolatedRestoreAuthorizationPackage,
  repositoryIsolatedRestoreAuthorizationGate,
  validateIsolatedRestoreAuthorizationPackage
} from '../database/production-isolated-restore-authorization-gate.mjs';

const packageValue = await loadIsolatedRestoreAuthorizationPackage();
const validation = await validateIsolatedRestoreAuthorizationPackage(packageValue);
assert.equal(validation.status, 'PASS');
assert.deepEqual(validation.failures, []);
assert.equal(validation.decision, 'DEFER');
assert.ok(validation.blockers.length >= 6);
assert.equal(packageValue.exerciseAuthorization, 'NOT_GRANTED');
assert.equal(packageValue.exactProposedScope.maximumRestoreTargets, 1);
assert.equal(packageValue.exactProposedScope.maximumTemporaryVerificationCredentials, 1);
assert.equal(packageValue.exactProposedScope.productionTrafficAllowed, false);
assert.equal(packageValue.exactProposedScope.productionSqlAllowed, false);
assert.equal(packageValue.exactProposedScope.productionMigrationAllowed, false);
assert.equal(packageValue.costAndResourceBoundary.restoreTargetCost, 'UNKNOWN_RECONFIRM_IN_PROVIDER_BEFORE_AUTHORIZATION');
assert.equal(packageValue.measurementContract.rpoTargetMinutes, 15);
assert.equal(packageValue.measurementContract.rtoTargetMinutes, 60);
assert.equal(packageValue.currentGateEvidence.EXACT_OWNER_AUTHORIZATION.status, 'NOT_GRANTED');
assert.equal(packageValue.currentGateEvidence.RECOVERY_COMMANDER.status, 'NOT_CONFIGURED');

const allPass = Object.fromEntries(packageValue.requiredGateIds.map(id => [id, { status: 'PASS', reason: 'TEST_ONLY' }]));
assert.equal(evaluateIsolatedRestoreAuthorization(allPass, packageValue.requiredGateIds).decision, 'ELIGIBLE_FOR_EXACT_OWNER_AUTHORIZATION');
for (const status of ['PARTIAL', 'BLOCKED', 'NOT_CONFIGURED', 'NOT_GRANTED', 'UNKNOWN', 'FAIL']) {
  const gates = structuredClone(allPass);
  gates.COST_AND_BRANCH_CAPACITY.status = status;
  assert.equal(evaluateIsolatedRestoreAuthorization(gates, packageValue.requiredGateIds).decision, 'DEFER');
}

const paidWithoutAuthorization = structuredClone(packageValue);
paidWithoutAuthorization.costAndResourceBoundary.stopIfChargeOrUpgradeRequired = false;
assert.equal((await validateIsolatedRestoreAuthorizationPackage(paidWithoutAuthorization)).status, 'BLOCKED');
const trafficEnabled = structuredClone(packageValue);
trafficEnabled.exactProposedScope.productionTrafficAllowed = true;
assert.equal((await validateIsolatedRestoreAuthorizationPackage(trafficEnabled)).status, 'BLOCKED');
const migrationEnabled = structuredClone(packageValue);
migrationEnabled.exactProposedScope.productionMigrationAllowed = true;
assert.equal((await validateIsolatedRestoreAuthorizationPackage(migrationEnabled)).status, 'BLOCKED');
const falsePass = structuredClone(packageValue);
falsePass.decision.rpo15Minutes = 'PASS';
assert.equal((await validateIsolatedRestoreAuthorizationPackage(falsePass)).status, 'BLOCKED');

const gate = await repositoryIsolatedRestoreAuthorizationGate();
assert.equal(gate.packageValidation, 'PASS');
assert.equal(gate.authorizationDecision, 'DEFER');
assert.equal(gate.exerciseAuthorization, 'NOT_GRANTED');
assert.equal(gate.externalResourceCreated, false);
assert.equal(gate.productionConnectionAttempted, false);
assert.equal(gate.productionSqlExecuted, false);
assert.equal(gate.productionMutation, false);

const source = await readFile(new URL('../database/production-isolated-restore-authorization-gate.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /DATABASE_(?:URL|MIGRATOR_URL|READONLY_URL)/);
assert.doesNotMatch(source, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
assert.match(source, /CURRENT_AUTHORIZATION_GATE_MUST_DEFER/);
assert.match(source, /UNKNOWN_COST_OR_CAPACITY_COERCED/);

console.log('Production isolated Restore authorization package tests passed');
