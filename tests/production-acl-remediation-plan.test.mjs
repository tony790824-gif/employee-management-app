import assert from 'node:assert/strict';
import {
  REQUIRED_PRECONDITIONS,
  REQUIRED_STOPS,
  loadAclRemediationPlan,
  validateAclRemediationPlan,
  validateAclRemediationPlanIntegrity
} from '../database/production-acl-remediation-plan.mjs';

const source = await loadAclRemediationPlan();
const clone = () => structuredClone(source);

const validation = validateAclRemediationPlan(source);
assert.equal(validation.status, 'PASS');
assert.equal(validation.decision, 'READY_FOR_ONE_BOUNDED_CONDITIONAL_AUTHORIZATION');
assert.equal(validation.productionConnectionAttempted, false);
assert.equal(validation.productionMutation, false);
assert.deepEqual(validation.failures, []);

assert.equal(source.authorizationStatus, 'NOT_GRANTED');
assert.equal(source.authorizationEnvelope.maxConnectionAttempts, 3);
assert.equal(source.authorizationEnvelope.retryCount, 0);
assert.deepEqual(source.authorizationEnvelope.stages.map(stage => stage.id), ['PRECHECK', 'CONDITIONAL_MUTATION', 'INDEPENDENT_POSTCHECK']);
assert.ok(source.authorizationEnvelope.stages.every(stage => stage.maxConnectionAttempts === 1));
assert.ok(source.authorizationEnvelope.stages.every(stage => stage.businessRowReads === false));
assert.deepEqual(source.remediationTargets.defaultPrivileges.relationPrivileges, ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']);
assert.deepEqual(source.remediationTargets.defaultPrivileges.sequencePrivileges, ['USAGE','SELECT','UPDATE']);
assert.equal(source.remediationTargets.materializedObjectPrivileges.broadAllObjectsRevokeAllowed, false);
assert.ok(REQUIRED_PRECONDITIONS.every(value => source.preconditions.includes(value)));
assert.ok(REQUIRED_STOPS.every(value => source.stopConditions.includes(value)));
assert.equal(source.precheckRunner.status, 'READY');
assert.equal(source.precheckRunner.command, 'pnpm run db:acl:production-precheck');
assert.equal(source.precheckRunner.maxConnectionAttempts, 1);
assert.equal(source.precheckRunner.retryCount, 0);
assert.equal(source.precheckRunner.productionMutation, false);
assert.equal(source.precheckRunner.requiredEvidence.length, 8);
assert.ok(!source.precheckRunner.processOnlyInputs.includes('BANK_PRODUCTION_ACL_OPERATOR_ROLE'));
assert.deepEqual(source.precheckRunner.optionalProcessOnlyInputs, ['BANK_PRODUCTION_ACL_OPERATOR_ROLE']);
assert.deepEqual(source.precheckRunner.operatorDiscovery.resultAllowlist,
  ['ELIGIBLE_OPERATOR_CANDIDATE','NO_ELIGIBLE_OPERATOR','INSUFFICIENT_EVIDENCE']);
assert.equal(source.precheckRunner.operatorDiscovery.productionMutation, false);

const authorized = clone();
authorized.authorizationStatus = 'GRANTED';
assert.match(validateAclRemediationPlan(authorized).failures.join(','), /AUTHORIZATION_GATE_WEAKENED/);

const missingOwner = clone();
missingOwner.preconditions = missingOwner.preconditions.filter(value => value !== 'EXACT_DEFAULT_ACL_OWNER_PROVEN');
assert.match(validateAclRemediationPlan(missingOwner).failures.join(','), /PRECONDITION_MISSING:EXACT_DEFAULT_ACL_OWNER_PROVEN/);

const runtimeTarget = clone();
runtimeTarget.preconditions = runtimeTarget.preconditions.filter(value => value !== 'GRANTEE_NOT_APPROVED_RUNTIME_READER_OR_OPERATOR');
assert.match(validateAclRemediationPlan(runtimeTarget).failures.join(','), /PRECONDITION_MISSING:GRANTEE_NOT_APPROVED_RUNTIME_READER_OR_OPERATOR/);

const broadRevoke = clone();
broadRevoke.remediationTargets.materializedObjectPrivileges.broadAllObjectsRevokeAllowed = true;
assert.match(validateAclRemediationPlan(broadRevoke).failures.join(','), /BROAD_OBJECT_REVOKE_ALLOWED/);

const retry = clone();
retry.authorizationEnvelope.retryCount = 1;
assert.match(validateAclRemediationPlan(retry).failures.join(','), /AUTHORIZATION_ENVELOPE_MISMATCH/);

const missingStop = clone();
missingStop.stopConditions = missingStop.stopConditions.filter(value => value !== 'ACTIVE_RUNTIME_DEPENDENCY_FOUND');
assert.match(validateAclRemediationPlan(missingStop).failures.join(','), /STOP_CONDITION_MISSING:ACTIVE_RUNTIME_DEPENDENCY_FOUND/);

const grant = clone();
grant.mutationGuards.grantAllowed = true;
assert.match(validateAclRemediationPlan(grant).failures.join(','), /MUTATION_GUARD_WEAKENED:grantAllowed/);

const secondAttempt = clone();
secondAttempt.authorizationEnvelope.stages[0].maxConnectionAttempts = 2;
assert.match(validateAclRemediationPlan(secondAttempt).failures.join(','), /STAGE_ATTEMPT_LIMIT_WEAKENED/);

const businessRead = clone();
businessRead.authorizationEnvelope.stages[2].businessRowReads = true;
assert.match(validateAclRemediationPlan(businessRead).failures.join(','), /BUSINESS_ROW_READ_ALLOWED/);

const precheckRetry = clone();
precheckRetry.precheckRunner.retryCount = 1;
assert.match(validateAclRemediationPlan(precheckRetry).failures.join(','), /PRECHECK_RUNNER_BOUNDARY_MISMATCH/);

const missingPrecheckEvidence = clone();
missingPrecheckEvidence.precheckRunner.requiredEvidence.pop();
assert.match(validateAclRemediationPlan(missingPrecheckEvidence).failures.join(','), /PRECHECK_RUNNER_EVIDENCE_SCOPE_MISMATCH/);

const gatePromotion = clone();
gatePromotion.currentGateState.aclSemantic = 'PASS';
assert.match(validateAclRemediationPlan(gatePromotion).failures.join(','), /CURRENT_GATE_STATE_MISMATCH/);

const sensitive = clone();
sensitive.futurePassword = 'redacted';
assert.match(validateAclRemediationPlan(sensitive).failures.join(','), /SENSITIVE_FIELD:futurePassword/);

const integrity = await validateAclRemediationPlanIntegrity();
assert.equal(integrity.status, 'PASS');
assert.match(integrity.planSha256, /^[a-f0-9]{64}$/);
assert.equal(integrity.productionConnectionAttempted, false);
assert.equal(integrity.productionMutation, false);

console.log('Production ACL remediation plan passed repository-only fail-closed validation');
