import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadFinalGoNoGoPackage,
  runFinalGoNoGoGate,
  validateFinalGoNoGoPackage
} from '../scripts/production-final-go-no-go-gate.mjs';

const packageValue = await loadFinalGoNoGoPackage();
const validation = validateFinalGoNoGoPackage(packageValue);
assert.equal(validation.status, 'PASS');
assert.deepEqual(validation.failures, []);
assert.equal(validation.blockerCount, 20);
assert.equal(validation.mustBeforeGoCount, 20);
assert.equal(packageValue.productionReadinessPercent, 70);
assert.equal(packageValue.productionStatus, 'NOT_READY');
assert.equal(packageValue.finalDecision, 'NO_GO');
assert.equal(packageValue.gateA, 'DEFER');
assert.equal(packageValue.productionProvisioning, 'NO_GO');
assert.equal(packageValue.productionMigrationAuthorization, 'NOT_GRANTED');
assert.equal(packageValue.rpo, 'NOT_PROVEN');
assert.equal(packageValue.rto, 'PASS_112_335_SECONDS');

for (const blocker of packageValue.blockers) {
  assert.ok(blocker.classifications.includes('MUST_BEFORE_GO'), blocker.id);
  assert.notEqual(blocker.status, 'PASS', blocker.id);
}

const falseGo = structuredClone(packageValue);
falseGo.finalDecision = 'GO';
assert.equal(validateFinalGoNoGoPackage(falseGo).status, 'BLOCKED');

const falseReadiness = structuredClone(packageValue);
falseReadiness.productionReadinessPercent = 98;
assert.equal(validateFinalGoNoGoPackage(falseReadiness).status, 'BLOCKED');

const missingArea = structuredClone(packageValue);
missingArea.blockers.pop();
assert.equal(validateFinalGoNoGoPackage(missingArea).status, 'BLOCKED');

const migrationAuthorized = structuredClone(packageValue);
migrationAuthorized.productionMigrationAuthorization = 'GRANTED';
assert.equal(validateFinalGoNoGoPackage(migrationAuthorized).status, 'BLOCKED');

const mutationAuthorized = structuredClone(packageValue);
mutationAuthorized.productionMutationAuthorized = true;
assert.equal(validateFinalGoNoGoPackage(mutationAuthorized).status, 'BLOCKED');

const rpoFalsePass = structuredClone(packageValue);
rpoFalsePass.rpo = 'PASS';
assert.equal(validateFinalGoNoGoPackage(rpoFalsePass).status, 'BLOCKED');

const gate = await runFinalGoNoGoGate();
assert.equal(gate.packageValidation, 'PASS');
assert.equal(gate.finalDecision, 'NO_GO');
assert.equal(gate.blockerCount, 20);
assert.equal(gate.mustBeforeGoCount, 20);
assert.equal(gate.productionMutation, false);
assert.equal(gate.paymentExecuted, false);

const source = await readFile(new URL('../scripts/production-final-go-no-go-gate.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /DATABASE_(?:URL|MIGRATOR_URL|READONLY_URL)/);
assert.doesNotMatch(source, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
assert.match(source, /FINAL_DECISION_WEAKENED/);
assert.match(source, /MIGRATION_AUTHORIZATION_WEAKENED/);
assert.match(source, /PROHIBITED_ACTION_RECORDED/);

console.log('Production Final Go/No-Go gate tests passed');
