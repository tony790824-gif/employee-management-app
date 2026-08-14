import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  APPLICATION_OBJECT_SET_VERSION,
  EXACT_OWNER_PROOF_VERSION,
  EXPECTED_OWNER_POLICY,
  EXPECTED_STARTING_MIGRATIONS,
  FUTURE_OWNER_PROOF_CONTRACT,
  OWNER_PROOF_CATALOG_SCOPE,
  canonicalOwnerProofJson,
  deriveApplicationObjectSet,
  evaluateExactApplicationObjectOwnerRelation,
  loadOwnerProofRepositoryInputs,
  ownerProofSha256,
  validateApplicationObjectSetArtifact,
  validateOwnerProofEvidence
} from '../database/exact-application-object-owner-proof.mjs';
import { evaluateDefaultAclPolicy } from '../database/reviewed-principal-policy.mjs';

assert.equal(EXACT_OWNER_PROOF_VERSION, 'bankeban-exact-application-owner-proof-v1');
assert.equal(APPLICATION_OBJECT_SET_VERSION, 'bankeban-0001-0008-application-owner-set-v1');
assert.deepEqual(EXPECTED_STARTING_MIGRATIONS, ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.implementationStatus, 'RESERVED_NOT_IMPLEMENTED');
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.connectionAttempts, 1);
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.retries, 0);
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.transactionMode, 'READ ONLY');
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.tlsMode, 'verify-full');
assert.equal(FUTURE_OWNER_PROOF_CONTRACT.businessRowReads, false);
assert.deepEqual(EXPECTED_OWNER_POLICY.allowedOutboundMemberships, []);
assert.equal(EXPECTED_OWNER_POLICY.requiredOwnerSetCount, 1);
assert.equal(EXPECTED_OWNER_POLICY.explicitGrantOptionAllowed, false);

const allowedCatalogs = new Set([
  'pg_catalog.pg_auth_members', 'pg_catalog.pg_class', 'pg_catalog.pg_database', 'pg_catalog.pg_default_acl',
  'pg_catalog.pg_depend', 'pg_catalog.pg_extension', 'pg_catalog.pg_namespace', 'pg_catalog.pg_proc',
  'pg_catalog.pg_roles', 'pg_catalog.aclexplode'
]);
assert.deepEqual(new Set(OWNER_PROOF_CATALOG_SCOPE), allowedCatalogs);

const inputs = await loadOwnerProofRepositoryInputs();
const derived = deriveApplicationObjectSet(inputs.structuralBaseline, inputs.aclBaseline);
assert.equal(derived.status, 'PASS');
assert.deepEqual(derived, inputs.artifact);
assert.equal(derived.objectSetFingerprint, 'ce84209b37fe81c7ec93d211327f2e0f3cb4576a5966d48803dae6ddd2bf6200');
assert.equal(derived.requiredOwnership.count, 65);
assert.equal(derived.requiredOwnership.requiredOwnerSetCount, 1);
assert.equal(derived.requiredOwnership.byType.DATABASE.count, 1);
assert.equal(derived.requiredOwnership.byType.SCHEMA.count, 1);
assert.equal(derived.requiredOwnership.byType.RELATION.count, 18);
assert.equal(derived.requiredOwnership.byType.SEQUENCE.count, 0);
assert.equal(derived.requiredOwnership.byType.VIEW.count, 0);
assert.equal(derived.requiredOwnership.byType.MATERIALIZED_VIEW.count, 0);
assert.equal(derived.requiredOwnership.byType.INDEX.count, 34);
assert.equal(derived.requiredOwnership.byType.FUNCTION.count, 11);
assert.equal(derived.separatelyClassified.systemDatabaseOwnerSchemas.count, 1);
assert.equal(derived.separatelyClassified.extensionManagedFunctions.count, 37);
assert.equal(derived.separatelyClassified.extensions.count, 2);
assert.deepEqual(derived.indirectNoIndependentOwner, { columns: 140, constraints: 234, policies: 11, triggers: 9 });
assert.equal(validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256).status, 'PASS');
assert.equal(inputs.companionSha256.trim().split(/\s+/)[0], ownerProofSha256(canonicalOwnerProofJson(inputs.artifact)));

const roleA = Symbol('transient-owner-a');
const roleB = Symbol('transient-owner-b');
const safeAttributes = {
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false
};
const validTransient = {
  objectSetFingerprint: inputs.artifact.objectSetFingerprint,
  objectIdentitySetSha256: inputs.artifact.requiredOwnership.identitySetSha256,
  granteeRoleRef: roleA,
  granteeRoleCount: 1,
  publicOidZero: false,
  objectOwnerRefs: Array(inputs.artifact.requiredOwnership.count).fill(roleA),
  expectedOwnershipCount: inputs.artifact.requiredOwnership.count,
  reviewedCategory: 'EXPECTED_OWNER',
  reviewedCategoryMatchCount: 1,
  otherReviewedCategoryMatchCount: 0,
  ambiguity: false,
  roleAttributes: safeAttributes,
  outboundMembershipCount: 0,
  outboundEffectiveMembershipCount: 0,
  unrelatedOwnershipCount: 0,
  excludedObjectOwnershipMismatchCount: 0,
  businessRowsRead: false,
  rawOidPersisted: false,
  rawPrincipalNamePersisted: false,
  sourceCommitSha: 'a'.repeat(40)
};
const artifactValidation = validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256);
const candidate = evaluateExactApplicationObjectOwnerRelation({ artifact: inputs.artifact, artifactValidation, transient: validTransient });
assert.equal(candidate.finalProofStatus, 'PASS');
assert.equal(candidate.reviewedCategory, 'EXPECTED_OWNER');
assert.equal(candidate.proofEnum, 'EXACT_APPLICATION_OBJECT_OWNER_RELATION');
assert.equal(candidate.ownershipCoverageCount, 65);
assert.equal(candidate.ownerSetCount, 1);
assert.equal(candidate.grantOptionSemanticResult, 'SEMANTIC_MISMATCH');
assert.equal(validateOwnerProofEvidence(candidate).status, 'PASS');

for (const privilege of ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) {
  assert.equal(evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'BUILTIN_DEFAULT', objectType: 'RELATION', privilege, grantOption: true }).status, 'PASS');
  assert.equal(evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'RELATION', privilege, grantOption: true }).status, 'SEMANTIC_MISMATCH');
}
for (const privilege of ['SELECT', 'UPDATE', 'USAGE']) {
  assert.equal(evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'BUILTIN_DEFAULT', objectType: 'SEQUENCE', privilege, grantOption: true }).status, 'PASS');
  assert.equal(evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'SEQUENCE', privilege, grantOption: true }).status, 'SEMANTIC_MISMATCH');
}

function blocked(overrides) {
  return evaluateExactApplicationObjectOwnerRelation({ artifact: inputs.artifact, artifactValidation, transient: { ...validTransient, ...overrides } });
}

// One object owned elsewhere, two owners, unrelated role, count mismatch and ambiguity all fail closed.
assert.match(blocked({ objectOwnerRefs: [...validTransient.objectOwnerRefs.slice(0, 64), roleB] }).blockers.join(','), /OWNERSHIP_COVERAGE_INCOMPLETE|OWNER_SET_COUNT_INVALID/);
assert.match(blocked({ objectOwnerRefs: Array(65).fill(roleB) }).blockers.join(','), /OWNERSHIP_COVERAGE_INCOMPLETE/);
assert.match(blocked({ objectOwnerRefs: validTransient.objectOwnerRefs.slice(1) }).blockers.join(','), /OWNERSHIP_COUNT_MISMATCH/);
assert.match(blocked({ reviewedCategoryMatchCount: 2, otherReviewedCategoryMatchCount: 1, ambiguity: true }).blockers.join(','), /OWNER_PROOF_AMBIGUOUS|REVIEWED_CATEGORY_MATCH_INVALID/);

// Names are never inputs: rename is stable; a same-name drop/recreate has a new transient identity and cannot inherit ownership.
assert.deepEqual(blocked({ ignoredDisplayName: 'renamed-owner' }), candidate);
assert.match(blocked({ granteeRoleRef: roleB, ignoredDisplayName: 'same-name' }).blockers.join(','), /OWNERSHIP_COVERAGE_INCOMPLETE/);

assert.match(blocked({ outboundMembershipCount: 1, outboundEffectiveMembershipCount: 1 }).blockers.join(','), /UNEXPECTED_OUTBOUND_MEMBERSHIP/);
for (const attribute of EXPECTED_OWNER_POLICY.dangerousAttributesMustBeFalse) {
  assert.match(blocked({ roleAttributes: { ...safeAttributes, [attribute]: true } }).blockers.join(','), /DANGEROUS_ROLE_ATTRIBUTE/);
}
assert.match(blocked({ unrelatedOwnershipCount: 1 }).blockers.join(','), /UNRELATED_OWNERSHIP_PRESENT/);
assert.match(blocked({ excludedObjectOwnershipMismatchCount: 1 }).blockers.join(','), /EXCLUDED_OBJECT_CLASSIFICATION_MISMATCH/);
assert.match(blocked({ publicOidZero: true }).blockers.join(','), /PUBLIC_CANNOT_MATCH_EXPECTED_OWNER/);
assert.match(blocked({ objectSetFingerprint: '0'.repeat(64) }).blockers.join(','), /OBJECT_SET_FINGERPRINT_MISMATCH/);
assert.match(blocked({ objectIdentitySetSha256: '0'.repeat(64) }).blockers.join(','), /OBJECT_IDENTITY_SET_MISMATCH/);
assert.match(blocked({ rawOidPersisted: true }).blockers.join(','), /RAW_PRINCIPAL_PERSISTENCE_FORBIDDEN/);
assert.match(blocked({ rawPrincipalNamePersisted: true }).blockers.join(','), /RAW_PRINCIPAL_PERSISTENCE_FORBIDDEN/);
assert.match(blocked({ businessRowsRead: true }).blockers.join(','), /BUSINESS_ROW_READ_BOUNDARY_INVALID/);

const artifactTampered = structuredClone(inputs.artifact);
artifactTampered.requiredOwnership.byType.RELATION.count = 17;
assert.equal(validateApplicationObjectSetArtifact(artifactTampered, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256).status, 'BLOCKED');
assert.equal(validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, `0`.repeat(64)).status, 'BLOCKED');

assert.equal(validateOwnerProofEvidence({ ...candidate, rawOid: 123 }).status, 'BLOCKED');
assert.equal(validateOwnerProofEvidence({ ...candidate, principalName: 'forbidden' }).status, 'BLOCKED');
assert.equal(validateOwnerProofEvidence({ ...candidate, expectedOwnershipCount: 64 }).status, 'BLOCKED');

const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.schema.json', import.meta.url), 'utf8'));
assert.equal(evidenceSchema.additionalProperties, false);
assert.equal(evidenceSchema.properties.rawOidPersisted.const, false);
assert.equal(evidenceSchema.properties.rawPrincipalNamePersisted.const, false);
assert.equal(evidenceSchema.properties.businessRowsRead.const, false);
assert.equal(Object.keys(evidenceSchema.properties).filter(key => !['rawOidPersisted', 'rawPrincipalNamePersisted'].includes(key))
  .some(key => /password|secret|credential|url|host|principalName|rawOid/i.test(key)), false);

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts[FUTURE_OWNER_PROOF_CONTRACT.command.replace('pnpm run ', '')], undefined, 'future Production command must remain non-executable during preflight');
const source = await readFile(new URL('../database/exact-application-object-owner-proof.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from ['"]pg['"]|new\s+Client\s*\(|DATABASE_READONLY_URL|\.connect\s*\(/);

console.log('Production Closure Phase 2M exact application owner proof preflight tests passed');
