import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDefaultAclPolicy } from './reviewed-principal-policy.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EXACT_OWNER_PROOF_VERSION = 'bankeban-exact-application-owner-proof-v1';
export const APPLICATION_OBJECT_SET_VERSION = 'bankeban-0001-0008-application-owner-set-v1';
export const EXPECTED_STARTING_MIGRATIONS = Object.freeze(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);

export const FUTURE_OWNER_PROOF_CONTRACT = Object.freeze({
  command: 'pnpm run db:parity:production-application-owner-relation',
  confirmationToken: 'COMPARE_BANKE_PRODUCTION_APPLICATION_OWNER_RELATION',
  implementationStatus: 'IMPLEMENTED_NOT_AUTHORIZED',
  connectionAttempts: 1,
  retries: 0,
  transactionMode: 'READ ONLY',
  tlsMode: 'verify-full',
  credentialClass: 'DEDICATED_PRODUCTION_READONLY',
  businessRowReads: false,
  sourceCommitRequired: true,
  final0022ParityIncluded: false,
  productionMutationAllowed: false,
  cleanup: Object.freeze(['CLOSE_CONNECTION', 'CLEAR_PROCESS_CREDENTIALS', 'DELETE_TEMPORARY_CA'])
});

export const EXPECTED_OWNER_DEFAULT_ACL_FACTS = Object.freeze([
  ...['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
    .map(privilege => `PUBLIC_SCHEMA|RELATION|${privilege}|true`),
  ...['SELECT', 'UPDATE', 'USAGE']
    .map(privilege => `PUBLIC_SCHEMA|SEQUENCE|${privilege}|true`)
].sort());

export const OWNER_PROOF_CATALOG_SCOPE = Object.freeze([
  'pg_catalog.pg_auth_members',
  'pg_catalog.pg_class',
  'pg_catalog.pg_database',
  'pg_catalog.pg_default_acl',
  'pg_catalog.pg_depend',
  'pg_catalog.pg_extension',
  'pg_catalog.pg_namespace',
  'pg_catalog.pg_proc',
  'pg_catalog.pg_roles',
  'pg_catalog.aclexplode'
]);

export const EXPECTED_OWNER_POLICY = Object.freeze({
  requiredCategory: 'EXPECTED_OWNER',
  requiredProof: 'EXACT_APPLICATION_OBJECT_OWNER_RELATION',
  dangerousAttributesMustBeFalse: Object.freeze([
    'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls'
  ]),
  allowedOutboundMemberships: Object.freeze([]),
  requiredOwnerSetCount: 1,
  unrelatedOwnershipAllowed: false,
  publicOidZeroAllowed: false,
  explicitDefaultPrivilegesAllowed: false,
  explicitGrantOptionAllowed: false,
  ownerImpliedDelegationAcknowledged: true
});

const SENSITIVE_KEY = /(?:raw.*(?:oid|principal|acl)|principal.*(?:name|oid)|role.*name|user.*name|password|secret|token|credential|connection|string|url|host|endpoint|cookie|authorization)/i;
const SENSITIVE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function canonicalOwnerProofJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function ownerProofSha256(value) {
  const input = typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalOwnerProofJson(value);
  return createHash('sha256').update(input).digest('hex');
}

function identitySetHash(values) {
  return ownerProofSha256([...new Set(values)].sort());
}

export function applicationObjectIdentitySetSha256(values) {
  return identitySetHash(values);
}

function sensitivePath(value, parts = []) {
  if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) return parts.join('.') || '$';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (['rawOidPersisted', 'rawPrincipalNamePersisted', 'businessRowsRead'].includes(key) && child === false) continue;
    if (SENSITIVE_KEY.test(key)) return [...parts, key].join('.');
    const nested = sensitivePath(child, [...parts, key]);
    if (nested) return nested;
  }
  return null;
}

function relationType(kind) {
  return ({ r: 'RELATION', p: 'RELATION', S: 'SEQUENCE', v: 'VIEW', m: 'MATERIALIZED_VIEW' })[kind] || 'UNSUPPORTED';
}

function objectSetEntry(type, identity) {
  return `${type}|${identity}`;
}

export function deriveApplicationObjectSet(structuralBaseline, aclBaseline) {
  const blockers = [];
  if (JSON.stringify(structuralBaseline?.appliedMigrations) !== JSON.stringify(EXPECTED_STARTING_MIGRATIONS)) blockers.push('STRUCTURAL_MIGRATION_RANGE_INVALID');
  if (JSON.stringify(aclBaseline?.appliedMigrations) !== JSON.stringify(EXPECTED_STARTING_MIGRATIONS)) blockers.push('ACL_MIGRATION_RANGE_INVALID');

  const catalog = structuralBaseline?.catalog || {};
  const applicationFunctions = (catalog.functions || []).filter(item => !item.extension_name);
  const extensionFunctions = (catalog.functions || []).filter(item => item.extension_name);
  const required = [objectSetEntry('DATABASE', 'CURRENT_DATABASE')];

  const privateSchema = (catalog.schemas || []).filter(item => item.schema_name === 'app_private');
  const publicSchema = (catalog.schemas || []).filter(item => item.schema_name === 'public');
  if (privateSchema.length !== 1 || privateSchema[0]?.owner_name !== '$MIGRATION_OWNER') blockers.push('APPLICATION_PRIVATE_SCHEMA_OWNER_POLICY_INVALID');
  if (publicSchema.length !== 1 || publicSchema[0]?.owner_name !== 'pg_database_owner') blockers.push('PUBLIC_SCHEMA_PLATFORM_OWNER_POLICY_INVALID');
  required.push(...privateSchema.map(item => objectSetEntry('SCHEMA', item.schema_name)));

  for (const item of catalog.relations || []) {
    const type = relationType(item.relation_kind);
    if (type === 'UNSUPPORTED') blockers.push(`UNSUPPORTED_RELATION_KIND:${item.relation_kind}`);
    if (item.owner_name !== '$MIGRATION_OWNER') blockers.push(`RELATION_OWNER_POLICY_INVALID:${item.schema_name}.${item.relation_name}`);
    required.push(objectSetEntry(type, `${item.schema_name}.${item.relation_name}`));
  }
  for (const item of catalog.indexes || []) {
    if (item.owner_name !== '$MIGRATION_OWNER') blockers.push(`INDEX_OWNER_POLICY_INVALID:${item.schema_name}.${item.index_name}`);
    required.push(objectSetEntry('INDEX', `${item.schema_name}.${item.index_name}`));
  }
  for (const item of applicationFunctions) {
    if (item.owner_name !== '$MIGRATION_OWNER') blockers.push(`FUNCTION_OWNER_POLICY_INVALID:${item.schema_name}.${item.function_name}`);
    required.push(objectSetEntry('FUNCTION', `${item.schema_name}.${item.function_name}(${item.identity_arguments})`));
  }

  const aclApplication = (aclBaseline?.snapshot?.objects || []).filter(item => item.extensionClass === 'APPLICATION_MANAGED');
  const aclExtension = (aclBaseline?.snapshot?.objects || []).filter(item => item.extensionClass === 'EXTENSION_MANAGED');
  const expectedAclCounts = { FUNCTION: 11, RELATION: 18, SCHEMA: 2 };
  for (const [type, count] of Object.entries(expectedAclCounts)) {
    if (aclApplication.filter(item => item.objectType === type).length !== count) blockers.push(`ACL_APPLICATION_${type}_COUNT_INVALID`);
  }
  if (aclExtension.length !== extensionFunctions.length) blockers.push('EXTENSION_FUNCTION_SET_COUNT_INVALID');

  const requiredByType = Object.fromEntries(
    ['DATABASE', 'SCHEMA', 'RELATION', 'SEQUENCE', 'VIEW', 'MATERIALIZED_VIEW', 'INDEX', 'FUNCTION'].map(type => {
      const values = required.filter(value => value.startsWith(`${type}|`));
      return [type, { count: values.length, identitySetSha256: identitySetHash(values) }];
    })
  );
  const requiredSet = [...new Set(required)].sort();
  if (requiredSet.length !== required.length) blockers.push('APPLICATION_OBJECT_SET_DUPLICATE');

  const separatelyClassified = {
    extensions: {
      count: (catalog.extensions || []).length,
      identitySetSha256: identitySetHash((catalog.extensions || []).map(item => objectSetEntry('EXTENSION', `${item.schema_name}.${item.extension_name}`)))
    },
    extensionManagedFunctions: {
      count: extensionFunctions.length,
      identitySetSha256: identitySetHash(extensionFunctions.map(item => objectSetEntry('EXTENSION_FUNCTION', `${item.schema_name}.${item.function_name}(${item.identity_arguments})`)))
    },
    systemDatabaseOwnerSchemas: {
      count: publicSchema.length,
      identitySetSha256: identitySetHash(publicSchema.map(item => objectSetEntry('SYSTEM_DATABASE_OWNER_SCHEMA', item.schema_name)))
    }
  };
  const indirectObjects = {
    columns: (catalog.columns || []).length,
    constraints: (catalog.constraints || []).length,
    policies: (catalog.policies || []).length,
    triggers: (catalog.triggers || []).length
  };
  const core = canonicalValue({
    schemaVersion: 1,
    modelVersion: EXACT_OWNER_PROOF_VERSION,
    objectSetVersion: APPLICATION_OBJECT_SET_VERSION,
    source: {
      migrationRange: EXPECTED_STARTING_MIGRATIONS,
      structuralBaselineSha256: ownerProofSha256(canonicalOwnerProofJson(structuralBaseline)),
      aclBaselineSha256: ownerProofSha256(canonicalOwnerProofJson(aclBaseline))
    },
    requiredOwnership: {
      count: requiredSet.length,
      identitySetSha256: identitySetHash(requiredSet),
      byType: requiredByType,
      requiredOwnerSetCount: 1
    },
    separatelyClassified,
    indirectNoIndependentOwner: indirectObjects,
    exclusions: [
      'EXTENSION_MANAGED_OBJECTS',
      'PG_CATALOG_OBJECTS',
      'PUBLIC_SCHEMA_PG_DATABASE_OWNER_ALIAS',
      'TRIGGERS_CONSTRAINTS_COLUMNS_POLICIES_USE_PARENT_OWNERSHIP'
    ]
  });
  return canonicalValue({
    ...core,
    objectSetFingerprint: ownerProofSha256(core),
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers: [...new Set(blockers)].sort()
  });
}

export function validateApplicationObjectSetArtifact(artifact, structuralBaseline, aclBaseline, companionSha256 = '') {
  const failures = [];
  const derived = deriveApplicationObjectSet(structuralBaseline, aclBaseline);
  if (derived.status !== 'PASS') failures.push(...derived.blockers.map(item => `DERIVATION:${item}`));
  if (canonicalOwnerProofJson(artifact) !== canonicalOwnerProofJson(derived)) failures.push('APPLICATION_OBJECT_SET_ARTIFACT_MISMATCH');
  if (companionSha256 && companionSha256.trim().split(/\s+/)[0] !== ownerProofSha256(canonicalOwnerProofJson(artifact))) failures.push('APPLICATION_OBJECT_SET_COMPANION_HASH_MISMATCH');
  if (artifact?.requiredOwnership?.count !== 65) failures.push('APPLICATION_OBJECT_SET_REQUIRED_COUNT_INVALID');
  if (artifact?.requiredOwnership?.requiredOwnerSetCount !== 1) failures.push('APPLICATION_OBJECT_SET_OWNER_COUNT_POLICY_INVALID');
  if (artifact?.separatelyClassified?.extensionManagedFunctions?.count !== 37) failures.push('APPLICATION_OBJECT_SET_EXTENSION_EXCLUSION_INVALID');
  if (artifact?.separatelyClassified?.systemDatabaseOwnerSchemas?.count !== 1) failures.push('APPLICATION_OBJECT_SET_PLATFORM_SCHEMA_EXCLUSION_INVALID');
  if (sensitivePath(artifact)) failures.push('APPLICATION_OBJECT_SET_SENSITIVE_FIELD');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

function dangerousAttributeCount(attributes = {}) {
  return EXPECTED_OWNER_POLICY.dangerousAttributesMustBeFalse.filter(name => attributes[name] !== false).length;
}

export function evaluateExactApplicationObjectOwnerRelation({ artifact, artifactValidation, transient = {} } = {}) {
  const blockers = [];
  if (artifactValidation?.status !== 'PASS') blockers.push('OBJECT_SET_ARTIFACT_NOT_VALIDATED');
  if (transient.objectSetFingerprint !== artifact?.objectSetFingerprint) blockers.push('OBJECT_SET_FINGERPRINT_MISMATCH');
  if (transient.objectIdentitySetSha256 !== artifact?.requiredOwnership?.identitySetSha256) blockers.push('OBJECT_IDENTITY_SET_MISMATCH');
  if (!transient.granteeRoleRef || transient.granteeRoleCount !== 1) blockers.push('OPAQUE_GRANTEE_ROLE_RESOLUTION_INVALID');
  if (transient.publicOidZero === true) blockers.push('PUBLIC_CANNOT_MATCH_EXPECTED_OWNER');

  const owners = Array.isArray(transient.objectOwnerRefs) ? transient.objectOwnerRefs : [];
  const ownerSetCount = new Set(owners).size;
  const coverageCount = owners.filter(owner => owner === transient.granteeRoleRef).length;
  const expectedCount = artifact?.requiredOwnership?.count ?? 0;
  if (owners.length !== expectedCount || transient.expectedOwnershipCount !== expectedCount) blockers.push('OWNERSHIP_COUNT_MISMATCH');
  if (coverageCount !== expectedCount) blockers.push('OWNERSHIP_COVERAGE_INCOMPLETE');
  if (ownerSetCount !== EXPECTED_OWNER_POLICY.requiredOwnerSetCount) blockers.push('OWNER_SET_COUNT_INVALID');
  if (transient.reviewedCategory !== 'EXPECTED_OWNER' || transient.reviewedCategoryMatchCount !== 1) blockers.push('REVIEWED_CATEGORY_MATCH_INVALID');
  if (transient.ambiguity === true || transient.otherReviewedCategoryMatchCount !== 0) blockers.push('OWNER_PROOF_AMBIGUOUS');
  if (dangerousAttributeCount(transient.roleAttributes) !== 0) blockers.push('DANGEROUS_ROLE_ATTRIBUTE');
  if (transient.outboundMembershipCount !== 0 || transient.outboundEffectiveMembershipCount !== 0) blockers.push('UNEXPECTED_OUTBOUND_MEMBERSHIP');
  if (transient.unrelatedOwnershipCount !== 0) blockers.push('UNRELATED_OWNERSHIP_PRESENT');
  if (transient.excludedObjectOwnershipMismatchCount !== 0) blockers.push('EXCLUDED_OBJECT_CLASSIFICATION_MISMATCH');
  if (transient.businessRowsRead !== false) blockers.push('BUSINESS_ROW_READ_BOUNDARY_INVALID');
  if (transient.rawOidPersisted !== false || transient.rawPrincipalNamePersisted !== false) blockers.push('RAW_PRINCIPAL_PERSISTENCE_FORBIDDEN');

  const defaultAclFacts = Array.isArray(transient.defaultAclFacts) ? [...transient.defaultAclFacts].sort() : [];
  if (JSON.stringify(defaultAclFacts) !== JSON.stringify(EXPECTED_OWNER_DEFAULT_ACL_FACTS)) blockers.push('DEFAULT_ACL_FACT_SET_MISMATCH');
  if (defaultAclFacts.filter(item => item.endsWith('|true')).length !== 11) blockers.push('DEFAULT_ACL_GRANT_OPTION_COUNT_MISMATCH');

  const relationSemantics = ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
    .map(privilege => evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'RELATION', privilege, grantOption: true }));
  const sequenceSemantics = ['SELECT', 'UPDATE', 'USAGE']
    .map(privilege => evaluateDefaultAclPolicy({ category: 'EXPECTED_OWNER', aclState: 'EXPLICIT_DEFAULT_ACL', objectType: 'SEQUENCE', privilege, grantOption: true }));
  const grantOptionSemanticResult = [...relationSemantics, ...sequenceSemantics].every(item => item.status === 'SEMANTIC_MISMATCH')
    ? 'SEMANTIC_MISMATCH'
    : 'BLOCKED';

  const result = canonicalValue({
    schemaVersion: 1,
    modelVersion: EXACT_OWNER_PROOF_VERSION,
    sourceCommitSha: String(transient.sourceCommitSha || ''),
    objectSetVersion: artifact?.objectSetVersion || '',
    objectSetFingerprint: artifact?.objectSetFingerprint || '',
    ownershipCoverageCount: coverageCount,
    expectedOwnershipCount: expectedCount,
    ownerSetCount,
    unrelatedOwnershipCount: Number.isInteger(transient.unrelatedOwnershipCount) ? transient.unrelatedOwnershipCount : -1,
    exactOwnerMatch: blockers.length === 0,
    reviewedCategory: blockers.length ? 'UNCLASSIFIED' : 'EXPECTED_OWNER',
    proofEnum: blockers.length ? 'EXACT_APPLICATION_OBJECT_OWNER_RELATION_NOT_PROVEN' : 'EXACT_APPLICATION_OBJECT_OWNER_RELATION',
    ambiguity: blockers.some(item => item === 'OWNER_PROOF_AMBIGUOUS'),
    membershipClassification: transient.outboundMembershipCount === 0 ? 'NONE' : 'UNEXPECTED_OUTBOUND',
    roleBoundaryResult: blockers.some(item => ['DANGEROUS_ROLE_ATTRIBUTE', 'UNEXPECTED_OUTBOUND_MEMBERSHIP', 'UNRELATED_OWNERSHIP_PRESENT'].includes(item)) ? 'BLOCKED' : 'PASS',
    grantOptionSemanticResult,
    finalProofStatus: blockers.length ? 'BLOCKED' : 'PASS',
    blockers: [...new Set(blockers)].sort(),
    rawOidPersisted: false,
    rawPrincipalNamePersisted: false,
    businessRowsRead: false
  });
  if (sensitivePath(result)) return canonicalValue({ ...result, finalProofStatus: 'BLOCKED', blockers: [...new Set([...result.blockers, 'SANITIZED_OUTPUT_INVALID'])].sort() });
  return result;
}

export function validateOwnerProofEvidence(value) {
  const failures = [];
  const allowed = new Set([
    'schemaVersion', 'modelVersion', 'objectSetVersion', 'objectSetFingerprint', 'ownershipCoverageCount',
    'sourceCommitSha',
    'expectedOwnershipCount', 'ownerSetCount', 'exactOwnerMatch', 'reviewedCategory', 'proofEnum', 'ambiguity',
    'unrelatedOwnershipCount',
    'membershipClassification', 'roleBoundaryResult', 'grantOptionSemanticResult', 'finalProofStatus', 'blockers',
    'rawOidPersisted', 'rawPrincipalNamePersisted', 'businessRowsRead'
  ]);
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) failures.push(`OWNER_PROOF_FIELD_NOT_ALLOWED:${key}`);
  if (sensitivePath(value)) failures.push('OWNER_PROOF_SENSITIVE_FIELD');
  if (value?.modelVersion !== EXACT_OWNER_PROOF_VERSION) failures.push('OWNER_PROOF_MODEL_VERSION_INVALID');
  if (!/^[a-f0-9]{40}$/.test(value?.sourceCommitSha || '')) failures.push('OWNER_PROOF_SOURCE_COMMIT_INVALID');
  if (value?.objectSetVersion !== APPLICATION_OBJECT_SET_VERSION || !/^[a-f0-9]{64}$/.test(value?.objectSetFingerprint || '')) failures.push('OWNER_PROOF_OBJECT_SET_INVALID');
  if (value?.expectedOwnershipCount !== 65 || value?.ownershipCoverageCount < 0 || value?.ownershipCoverageCount > 65) failures.push('OWNER_PROOF_COVERAGE_COUNT_INVALID');
  if (!Number.isInteger(value?.unrelatedOwnershipCount) || value.unrelatedOwnershipCount < 0) failures.push('OWNER_PROOF_UNRELATED_OWNERSHIP_COUNT_INVALID');
  if (value?.rawOidPersisted !== false || value?.rawPrincipalNamePersisted !== false || value?.businessRowsRead !== false) failures.push('OWNER_PROOF_PRIVACY_BOUNDARY_INVALID');
  if (!['PASS', 'BLOCKED'].includes(value?.finalProofStatus)) failures.push('OWNER_PROOF_STATUS_INVALID');
  if (value?.finalProofStatus === 'PASS' && (value?.reviewedCategory !== 'EXPECTED_OWNER'
      || value?.proofEnum !== 'EXACT_APPLICATION_OBJECT_OWNER_RELATION' || value?.exactOwnerMatch !== true
      || value?.ownershipCoverageCount !== value?.expectedOwnershipCount || value?.ownerSetCount !== 1
      || value?.unrelatedOwnershipCount !== 0
      || value?.roleBoundaryResult !== 'PASS' || value?.ambiguity !== false
      || value?.membershipClassification !== 'NONE' || value?.blockers?.length !== 0)) failures.push('OWNER_PROOF_PASS_CONTRACT_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export async function loadOwnerProofRepositoryInputs() {
  const [structuralText, aclText, artifactText, companionText] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'database', 'production-0001-0008-application-owner-object-set.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'database', 'production-0001-0008-application-owner-object-set.sha256'), 'utf8')
  ]);
  return {
    structuralBaseline: JSON.parse(structuralText),
    aclBaseline: JSON.parse(aclText),
    artifact: JSON.parse(artifactText),
    companionSha256: companionText
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = await loadOwnerProofRepositoryInputs();
  const validation = validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256);
  console.log(`PHASE2M_DECISION=${validation.status === 'PASS' ? 'A_PROOF_CONTRACT_READY' : 'D_BLOCKED'}`);
  console.log(`PHASE2M_OBJECT_SET_FINGERPRINT=${inputs.artifact.objectSetFingerprint}`);
  console.log('PRODUCTION_CONNECTIONS=0');
  process.exitCode = validation.status === 'PASS' ? 0 : 2;
}
