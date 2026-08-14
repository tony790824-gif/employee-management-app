import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REVIEWED_PRINCIPAL_POLICY_VERSION = 'bankeban-reviewed-principal-policy-v1';

export const REVIEWED_PRINCIPAL_UNIVERSE = Object.freeze({
  EXPECTED_OWNER: ['DATABASE_OWNER_RELATION', 'SCHEMA_OWNER_RELATION', 'EXACT_APPLICATION_OBJECT_OWNER_RELATION'],
  EXPECTED_READONLY_ROLE: ['DEDICATED_READONLY_IDENTITY_RELATION'],
  EXPECTED_RUNTIME_ROLE: ['CONTROLLED_FUNCTION_RUNTIME_RELATION'],
  SYSTEM_PLATFORM_MANAGED: ['REVIEWED_PLATFORM_ROLE_RELATION'],
  EXTENSION_OWNER: ['REVIEWED_EXTENSION_OWNER_RELATION'],
  READONLY_MEMBERSHIP_CARRIER: ['READONLY_OUTBOUND_MEMBERSHIP_RELATION'],
  PUBLIC: ['PUBLIC_OID_ZERO']
});

export const REJECTED_CANDIDATE_CATEGORIES = Object.freeze([
  'EXPECTED_MIGRATOR_ROLE',
  'EXPECTED_APPLICATION_ROLE',
  'EXPECTED_SERVICE_ROLE',
  'EXPECTED_DEFAULT_PRIVILEGE_GRANTEE',
  'EXPECTED_DEPLOYMENT_ROLE'
]);

const RELATION_PRIVILEGES = new Set(['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
const SEQUENCE_PRIVILEGES = new Set(['SELECT', 'UPDATE', 'USAGE']);
const SENSITIVE_KEY = /^(?:.*(?:_oid|Oid)|rawPrincipal.*|raw_principal.*|principalName|principal_name|roleName|role_name|username|password|credential|connectionString|connection_string|databaseUrl|database_url|hostname|endpoint|token|cookie|authorizationHeader|authorization_header|rawAcl|raw_acl)$/i;
const SENSITIVE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function sensitivePath(value, pathParts = []) {
  if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) return pathParts.join('.') || '$';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'rawOidPersisted' || key === 'rawPrincipalNamePersisted') && child === false) continue;
    if (SENSITIVE_KEY.test(key)) return [...pathParts, key].join('.');
    const nested = sensitivePath(child, [...pathParts, key]);
    if (nested) return nested;
  }
  return null;
}

export function classifyReviewedPrincipal({ relationships = [], publicOidZero = false } = {}) {
  const normalized = [...new Set(relationships.map(item => `${item.category}|${item.proof}`))]
    .map(item => {
      const [category, proof] = item.split('|');
      return { category, proof };
    });
  if (publicOidZero) normalized.push({ category: 'PUBLIC', proof: 'PUBLIC_OID_ZERO' });
  const valid = normalized.filter(item => REVIEWED_PRINCIPAL_UNIVERSE[item.category]?.includes(item.proof));
  const categories = [...new Set(valid.map(item => item.category))];
  if (categories.length > 1 || valid.length > 1) return canonicalValue({
    status: 'BLOCKED', reviewedCategory: 'UNCLASSIFIED', proofEnum: 'AMBIGUOUS_REVIEWED_RELATION',
    proofBoolean: false, ambiguity: 'PRESENT', membershipClassification: 'AMBIGUOUS',
    rawOidPersisted: false, rawPrincipalNamePersisted: false
  });
  if (valid.length === 0) return canonicalValue({
    status: 'BLOCKED', reviewedCategory: 'OTHER_NAMED_PRINCIPAL', proofEnum: 'NO_REVIEWED_RELATION',
    proofBoolean: false, ambiguity: 'NONE', membershipClassification: 'NONE',
    rawOidPersisted: false, rawPrincipalNamePersisted: false
  });
  const match = valid[0];
  return canonicalValue({
    status: 'PASS', reviewedCategory: match.category, proofEnum: match.proof,
    proofBoolean: true, ambiguity: 'NONE',
    membershipClassification: match.category === 'READONLY_MEMBERSHIP_CARRIER' ? 'OUTBOUND_EFFECTIVE' : 'NONE',
    rawOidPersisted: false, rawPrincipalNamePersisted: false
  });
}

export function evaluateDefaultAclPolicy({ category, aclState, objectType, privilege, grantOption } = {}) {
  const normalizedPrivilege = String(privilege || '').toUpperCase();
  const privileges = objectType === 'RELATION' ? RELATION_PRIVILEGES : objectType === 'SEQUENCE' ? SEQUENCE_PRIVILEGES : null;
  if (!REVIEWED_PRINCIPAL_UNIVERSE[category] || !privileges?.has(normalizedPrivilege)) return canonicalValue({
    status: 'BLOCKED', privilegeAllowed: false, grantOptionAllowed: false,
    defaultPrivilegeAllowed: false, delegationAllowed: false, reason: 'UNREVIEWED_OR_UNSUPPORTED_SEMANTICS'
  });
  if (aclState === 'BUILTIN_DEFAULT' && ['EXPECTED_OWNER', 'SYSTEM_PLATFORM_MANAGED'].includes(category)) return canonicalValue({
    status: 'PASS', privilegeAllowed: true, grantOptionAllowed: Boolean(grantOption),
    defaultPrivilegeAllowed: true, delegationAllowed: Boolean(grantOption), reason: 'POSTGRESQL_BUILTIN_OWNER_DEFAULT'
  });
  const privilegeAllowed = category === 'EXPECTED_READONLY_ROLE' || category === 'EXPECTED_RUNTIME_ROLE'
    ? normalizedPrivilege === 'SELECT'
    : ['EXPECTED_OWNER', 'SYSTEM_PLATFORM_MANAGED', 'EXTENSION_OWNER'].includes(category);
  if (aclState === 'EXPLICIT_DEFAULT_ACL') return canonicalValue({
    status: 'SEMANTIC_MISMATCH', privilegeAllowed, grantOptionAllowed: false,
    defaultPrivilegeAllowed: false, delegationAllowed: false,
    reason: grantOption ? 'EXPLICIT_DEFAULT_PRIVILEGE_WITH_GRANT_OPTION_NOT_APPROVED' : 'EXPLICIT_DEFAULT_PRIVILEGE_NOT_APPROVED'
  });
  return canonicalValue({
    status: 'BLOCKED', privilegeAllowed: false, grantOptionAllowed: false,
    defaultPrivilegeAllowed: false, delegationAllowed: false, reason: 'ACL_STATE_UNSUPPORTED'
  });
}

function occurrences(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

export function analyzeRepositoryDefaultAclOrigin({ migrationSources = [], operatorSources = [], expectedBaseline, phase2KEvidence } = {}) {
  const migrationText = migrationSources.join('\n');
  const operatorText = operatorSources.join('\n');
  const publicRelationSequenceGrantCount = occurrences(migrationText, /ALTER\s+DEFAULT\s+PRIVILEGES[^;]*\bGRANT\b[^;]*ON\s+(?:TABLES|SEQUENCES)/gi);
  const migrationWithGrantOptionCount = occurrences(migrationText, /WITH\s+GRANT\s+OPTION/gi);
  const operatorGrantCount = occurrences(operatorText, /ALTER\s+DEFAULT\s+PRIVILEGES[^;]*\bGRANT\b[^;]*ON\s+(?:TABLES|SEQUENCES)/gi);
  const operatorWithGrantOptionCount = occurrences(operatorText, /WITH\s+GRANT\s+OPTION/gi);
  const appPrivateFunctionPublicRevokeCount = occurrences(migrationText, /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+app_private\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC/gi);
  const operatorReadonlyRevokeCount = occurrences(operatorText, /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE[^;]+REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+(?:TABLES|SEQUENCES)\s+FROM/gi);
  const baselineDefaultPrivilegeCount = expectedBaseline?.snapshot?.defaultPrivileges?.length;
  const facts = phase2KEvidence?.factCounts || {};
  const evidenceComplete = facts.relation === 8 && facts.sequence === 3 && facts.total === 11 && facts.grantOptionTrue === 11;
  const trackedGrantSourceFound = publicRelationSequenceGrantCount > 0 || operatorGrantCount > 0;
  return canonicalValue({
    status: evidenceComplete && baselineDefaultPrivilegeCount === 0 && !trackedGrantSourceFound ? 'PASS' : 'BLOCKED',
    decision: evidenceComplete && baselineDefaultPrivilegeCount === 0 && !trackedGrantSourceFound
      ? 'D_UNTRACKED_OR_UNKNOWN_PRINCIPAL'
      : 'BLOCKED_INCOMPLETE_FORENSICS',
    sourceType: trackedGrantSourceFound ? 'TRACKED_SOURCE_PRESENT_REQUIRES_REVIEW' : 'UNKNOWN',
    migrationFindings: {
      publicRelationSequenceDefaultGrantCount: publicRelationSequenceGrantCount,
      withGrantOptionCount: migrationWithGrantOptionCount,
      appPrivateFunctionPublicRevokeCount
    },
    operatorFindings: {
      relationSequenceDefaultGrantCount: operatorGrantCount,
      withGrantOptionCount: operatorWithGrantOptionCount,
      readonlyRevokeCount: operatorReadonlyRevokeCount
    },
    expectedBaselineDefaultPrivilegeCount: baselineDefaultPrivilegeCount,
    observedFacts: { relation: facts.relation ?? null, sequence: facts.sequence ?? null, total: facts.total ?? null, grantOptionTrue: facts.grantOptionTrue ?? null },
    newReviewedCategoryApproved: false,
    existingCategoryProvenForLivePrincipal: false,
    immutableEvidenceSufficientForClassification: false,
    rawOidPersisted: false,
    rawPrincipalNamePersisted: false
  });
}

export function validateReviewedPrincipalPolicyResult(value) {
  const failures = [];
  if (sensitivePath(value)) failures.push('REVIEWED_PRINCIPAL_POLICY_SENSITIVE_FIELD');
  if (value?.decision !== 'D_UNTRACKED_OR_UNKNOWN_PRINCIPAL') failures.push('REVIEWED_PRINCIPAL_POLICY_DECISION_INVALID');
  if (value?.sourceType !== 'UNKNOWN' || value?.newReviewedCategoryApproved !== false
      || value?.existingCategoryProvenForLivePrincipal !== false || value?.immutableEvidenceSufficientForClassification !== false) failures.push('REVIEWED_PRINCIPAL_POLICY_FAIL_CLOSED_BOUNDARY_INVALID');
  if (value?.observedFacts?.relation !== 8 || value?.observedFacts?.sequence !== 3
      || value?.observedFacts?.total !== 11 || value?.observedFacts?.grantOptionTrue !== 11) failures.push('REVIEWED_PRINCIPAL_POLICY_FACT_COUNT_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export async function loadRepositoryPolicyInputs() {
  const migrations = [
    '0001_core.up.sql', '0002_business.up.sql', '0003_commands.up.sql', '0004_identity_tenant_boundary.up.sql',
    '0005_identity_context_name_resolution.up.sql', '0006_session_token_boundary.up.sql',
    '0007_leave_resource_id_precedence.up.sql', '0008_session_subject_binding.up.sql'
  ];
  const operators = ['production-readonly-role.provision.sql', 'production-readonly-role.disable.sql'];
  return {
    migrationSources: await Promise.all(migrations.map(file => readFile(path.join(PROJECT_ROOT, 'database', 'migrations', file), 'utf8'))),
    operatorSources: await Promise.all(operators.map(file => readFile(path.join(PROJECT_ROOT, 'database', 'operator', file), 'utf8'))),
    expectedBaseline: JSON.parse(await readFile(path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json'), 'utf8')),
    phase2KEvidence: JSON.parse(await readFile(path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_CLOSURE_PHASE_2K_OPAQUE_GRANTEE_SEMANTIC_RECOMPOSITION.json'), 'utf8'))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = analyzeRepositoryDefaultAclOrigin(await loadRepositoryPolicyInputs());
  console.log(`PHASE2L_DECISION=${result.decision}`);
  console.log(`PHASE2L_DEFAULT_ACL_SOURCE=${result.sourceType}`);
  process.exitCode = validateReviewedPrincipalPolicyResult(result).status === 'PASS' ? 0 : 2;
}
