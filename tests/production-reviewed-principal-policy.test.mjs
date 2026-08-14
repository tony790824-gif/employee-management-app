import assert from 'node:assert/strict';
import {
  REJECTED_CANDIDATE_CATEGORIES,
  REVIEWED_PRINCIPAL_POLICY_VERSION,
  REVIEWED_PRINCIPAL_UNIVERSE,
  analyzeRepositoryDefaultAclOrigin,
  classifyReviewedPrincipal,
  evaluateDefaultAclPolicy,
  loadRepositoryPolicyInputs,
  validateReviewedPrincipalPolicyResult
} from '../database/reviewed-principal-policy.mjs';

assert.equal(REVIEWED_PRINCIPAL_POLICY_VERSION, 'bankeban-reviewed-principal-policy-v1');
assert.deepEqual(Object.keys(REVIEWED_PRINCIPAL_UNIVERSE).sort(), [
  'EXPECTED_OWNER', 'EXPECTED_READONLY_ROLE', 'EXPECTED_RUNTIME_ROLE', 'EXTENSION_OWNER',
  'PUBLIC', 'READONLY_MEMBERSHIP_CARRIER', 'SYSTEM_PLATFORM_MANAGED'
].sort());
assert.equal(REJECTED_CANDIDATE_CATEGORIES.includes('EXPECTED_DEFAULT_PRIVILEGE_GRANTEE'), true);

const expectedOwnerRelation = { category: 'EXPECTED_OWNER', proof: 'EXACT_APPLICATION_OBJECT_OWNER_RELATION' };
const valid = classifyReviewedPrincipal({ relationships: [expectedOwnerRelation] });
assert.equal(valid.status, 'PASS');
assert.equal(valid.reviewedCategory, 'EXPECTED_OWNER');
assert.equal(valid.rawOidPersisted, false);
assert.equal(valid.rawPrincipalNamePersisted, false);

// Names are never classifier inputs. A rename preserves the relationship;
// drop/recreate loses it until catalog ownership is independently re-proven.
assert.deepEqual(classifyReviewedPrincipal({ relationships: [expectedOwnerRelation], ignoredName: 'before' }), valid);
assert.deepEqual(classifyReviewedPrincipal({ relationships: [expectedOwnerRelation], ignoredName: 'after' }), valid);
assert.equal(classifyReviewedPrincipal({ relationships: [], ignoredName: 'same-name-recreated' }).status, 'BLOCKED');
assert.equal(classifyReviewedPrincipal({ relationships: [] }).reviewedCategory, 'OTHER_NAMED_PRINCIPAL');

const publicPrincipal = classifyReviewedPrincipal({ publicOidZero: true });
assert.equal(publicPrincipal.status, 'PASS');
assert.equal(publicPrincipal.reviewedCategory, 'PUBLIC');
assert.equal(publicPrincipal.proofEnum, 'PUBLIC_OID_ZERO');
assert.equal(classifyReviewedPrincipal({ relationships: [], schemaName: 'public' }).status, 'BLOCKED');

const ambiguous = classifyReviewedPrincipal({ relationships: [
  expectedOwnerRelation,
  { category: 'EXPECTED_RUNTIME_ROLE', proof: 'CONTROLLED_FUNCTION_RUNTIME_RELATION' }
] });
assert.equal(ambiguous.status, 'BLOCKED');
assert.equal(ambiguous.ambiguity, 'PRESENT');

const unrelatedMembership = classifyReviewedPrincipal({ relationships: [
  { category: 'READONLY_MEMBERSHIP_CARRIER', proof: 'UNRELATED_MEMBERSHIP' }
] });
assert.equal(unrelatedMembership.status, 'BLOCKED');
const expectedMembership = classifyReviewedPrincipal({ relationships: [
  { category: 'READONLY_MEMBERSHIP_CARRIER', proof: 'READONLY_OUTBOUND_MEMBERSHIP_RELATION' }
] });
assert.equal(expectedMembership.status, 'PASS');
assert.equal(expectedMembership.membershipClassification, 'OUTBOUND_EFFECTIVE');

const builtInOwner = evaluateDefaultAclPolicy({
  category: 'EXPECTED_OWNER', aclState: 'BUILTIN_DEFAULT', objectType: 'RELATION', privilege: 'SELECT', grantOption: true
});
assert.equal(builtInOwner.status, 'PASS');
assert.equal(builtInOwner.grantOptionAllowed, true);

const explicitOwnerGrant = evaluateDefaultAclPolicy({
  category: 'EXPECTED_OWNER', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'RELATION', privilege: 'SELECT', grantOption: true
});
assert.equal(explicitOwnerGrant.status, 'SEMANTIC_MISMATCH');
assert.equal(explicitOwnerGrant.privilegeAllowed, true);
assert.equal(explicitOwnerGrant.grantOptionAllowed, false);
assert.equal(explicitOwnerGrant.defaultPrivilegeAllowed, false);
assert.equal(explicitOwnerGrant.delegationAllowed, false);

const readonlyWrite = evaluateDefaultAclPolicy({
  category: 'EXPECTED_READONLY_ROLE', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'RELATION', privilege: 'UPDATE', grantOption: false
});
assert.equal(readonlyWrite.status, 'SEMANTIC_MISMATCH');
assert.equal(readonlyWrite.privilegeAllowed, false);
assert.equal(evaluateDefaultAclPolicy({ category: 'OTHER_NAMED_PRINCIPAL', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'SEQUENCE', privilege: 'USAGE', grantOption: true }).status, 'BLOCKED');

const inputs = await loadRepositoryPolicyInputs();
const forensic = analyzeRepositoryDefaultAclOrigin(inputs);
assert.equal(forensic.status, 'PASS');
assert.equal(forensic.decision, 'D_UNTRACKED_OR_UNKNOWN_PRINCIPAL');
assert.equal(forensic.sourceType, 'UNKNOWN');
assert.equal(forensic.migrationFindings.publicRelationSequenceDefaultGrantCount, 0);
assert.equal(forensic.migrationFindings.withGrantOptionCount, 0);
assert.equal(forensic.migrationFindings.appPrivateFunctionPublicRevokeCount, 1);
assert.equal(forensic.operatorFindings.relationSequenceDefaultGrantCount, 0);
assert.equal(forensic.operatorFindings.withGrantOptionCount, 0);
assert.equal(forensic.operatorFindings.readonlyRevokeCount > 0, true);
assert.equal(forensic.expectedBaselineDefaultPrivilegeCount, 0);
assert.deepEqual(forensic.observedFacts, { grantOptionTrue: 11, relation: 8, sequence: 3, total: 11 });
assert.equal(forensic.newReviewedCategoryApproved, false);
assert.equal(forensic.existingCategoryProvenForLivePrincipal, false);
assert.equal(forensic.immutableEvidenceSufficientForClassification, false);
assert.equal(validateReviewedPrincipalPolicyResult(forensic).status, 'PASS');

for (const key of ['relation', 'sequence', 'total', 'grantOptionTrue']) {
  const changedEvidence = {
    ...inputs.phase2KEvidence,
    factCounts: { ...inputs.phase2KEvidence.factCounts, [key]: inputs.phase2KEvidence.factCounts[key] - 1 }
  };
  assert.equal(analyzeRepositoryDefaultAclOrigin({ ...inputs, phase2KEvidence: changedEvidence }).status, 'BLOCKED');
}
const duplicateOrExtra = {
  ...inputs.phase2KEvidence,
  factCounts: { relation: 9, sequence: 3, total: 12, grantOptionTrue: 12 }
};
assert.equal(analyzeRepositoryDefaultAclOrigin({ ...inputs, phase2KEvidence: duplicateOrExtra }).status, 'BLOCKED');

const trackedGrant = 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO candidate WITH GRANT OPTION;';
assert.equal(analyzeRepositoryDefaultAclOrigin({ ...inputs, migrationSources: [...inputs.migrationSources, trackedGrant] }).decision, 'BLOCKED_INCOMPLETE_FORENSICS');

assert.equal(validateReviewedPrincipalPolicyResult({ ...forensic, rawOid: 123 }).status, 'BLOCKED');
assert.equal(validateReviewedPrincipalPolicyResult({ ...forensic, principalName: 'unsafe' }).status, 'BLOCKED');
assert.equal(validateReviewedPrincipalPolicyResult({ ...forensic, decision: 'A_REPOSITORY_PROOF_SUFFICIENT' }).status, 'BLOCKED');

console.log('Production Closure Phase 2L reviewed principal policy and proof tests passed');
