import { createHash } from 'node:crypto';

export const OPAQUE_GRANTEE_MODEL_VERSION = 'bankeban-default-acl-opaque-grantee-v1';

export const OPAQUE_GRANTEE_CATEGORIES = Object.freeze([
  'EXPECTED_OWNER',
  'EXPECTED_READONLY_ROLE',
  'EXPECTED_RUNTIME_ROLE',
  'SYSTEM_PLATFORM_MANAGED',
  'READONLY_MEMBERSHIP_CARRIER',
  'EXTENSION_OWNER',
  'PUBLIC',
  'OTHER_NAMED_PRINCIPAL',
  'UNCLASSIFIED'
]);

export const OPAQUE_GRANTEE_PROOFS = Object.freeze([
  'PUBLIC_OID_ZERO',
  'EXPECTED_OWNER_OID_RELATION',
  'EXPECTED_READONLY_ROLE_OID_RELATION',
  'EXPECTED_RUNTIME_ROLE_OID_RELATION',
  'SYSTEM_PLATFORM_OID_RELATION',
  'EXTENSION_OWNER_OID_RELATION',
  'READONLY_OUTBOUND_MEMBERSHIP_RELATION',
  'NAMED_ROLE_WITHOUT_REVIEWED_RELATION',
  'NO_ROLE_RELATION',
  'AMBIGUOUS_OID_RELATION'
]);

const REVIEWED_CATEGORIES = new Set([
  'EXPECTED_OWNER',
  'EXPECTED_READONLY_ROLE',
  'EXPECTED_RUNTIME_ROLE',
  'SYSTEM_PLATFORM_MANAGED',
  'READONLY_MEMBERSHIP_CARRIER',
  'EXTENSION_OWNER',
  'PUBLIC'
]);
const OBJECT_TYPES = Object.freeze({ r: 'RELATION', S: 'SEQUENCE' });
const EXPECTED_UNRESOLVED_FACTS = Object.freeze([
  ...['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'].map(privilege => `PUBLIC_SCHEMA|RELATION|${privilege}|true`),
  ...['SELECT', 'UPDATE', 'USAGE'].map(privilege => `PUBLIC_SCHEMA|SEQUENCE|${privilege}|true`)
].sort());
const SENSITIVE_KEY = /^(?:.*(?:_oid|Oid)|rawPrincipal.*|raw_principal.*|principalName|principal_name|roleName|role_name|username|password|credential|connectionString|connection_string|databaseUrl|database_url|hostname|endpoint|token|cookie|authorization|rawAcl|raw_acl)$/i;
const SENSITIVE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;

// This query is deliberately narrower than the Phase 2H collector. PostgreSQL
// compares opaque OIDs internally and returns only reviewed categories,
// booleans and ACL semantics for unresolved explicit public-schema grantees.
// No role name, raw OID or ACL string crosses the database boundary.
export const OPAQUE_GRANTEE_CLASSIFICATION_SQL = `
  WITH RECURSIVE role_context AS (
    SELECT
      (SELECT database.datdba FROM pg_catalog.pg_database AS database WHERE database.datname = pg_catalog.current_database()) AS database_owner_oid,
      (SELECT namespace.nspowner FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspname = 'app_private') AS application_schema_owner_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $1) AS readonly_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $2) AS runtime_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $3) AS platform_oid,
      (SELECT extension.extowner FROM pg_catalog.pg_extension AS extension WHERE extension.extname = 'pgcrypto') AS extension_owner_oid
  ), outbound_membership(role_oid, ambiguous) AS (
    SELECT membership.roleid,
           NOT (membership.inherit_option OR membership.set_option OR membership.admin_option)
      FROM pg_catalog.pg_auth_members AS membership
      CROSS JOIN role_context AS context
     WHERE membership.member = context.readonly_oid
       AND (membership.inherit_option OR membership.set_option OR membership.admin_option)
    UNION
    SELECT membership.roleid,
           outbound_membership.ambiguous OR NOT (membership.inherit_option OR membership.set_option OR membership.admin_option)
      FROM outbound_membership
      JOIN pg_catalog.pg_auth_members AS membership ON membership.member = outbound_membership.role_oid
     WHERE membership.inherit_option OR membership.set_option OR membership.admin_option
  ), expanded AS (
    SELECT default_acl.defaclobjtype::text AS default_acl_type,
           acl.grantee AS grantee_oid,
           acl.privilege_type,
           acl.is_grantable AS grant_option
      FROM pg_catalog.pg_default_acl AS default_acl
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
     WHERE namespace.nspname = 'public'
       AND default_acl.defaclobjtype IN ('r', 'S')
  ), category_facts AS (
    SELECT expanded.*,
           expanded.grantee_oid = 0 AS public_match,
           expanded.grantee_oid IN (context.database_owner_oid, context.application_schema_owner_oid) AS expected_owner_match,
           expanded.grantee_oid = context.readonly_oid AS readonly_match,
           expanded.grantee_oid = context.runtime_oid AS runtime_match,
           expanded.grantee_oid = context.platform_oid AS platform_match,
           expanded.grantee_oid = context.extension_owner_oid AS extension_owner_match,
           EXISTS (SELECT 1 FROM outbound_membership WHERE outbound_membership.role_oid = expanded.grantee_oid) AS membership_match,
           EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role WHERE role.oid = expanded.grantee_oid) AS named_role_match
      FROM expanded
      CROSS JOIN role_context AS context
  ), classified AS (
    SELECT category_facts.*,
           ((public_match::int) + (expected_owner_match::int) + (readonly_match::int) +
            (runtime_match::int) + (platform_match::int) + (extension_owner_match::int) +
            (membership_match::int)) AS category_match_count
      FROM category_facts
  )
  SELECT CASE classified.default_acl_type WHEN 'r' THEN 'PUBLIC_SCHEMA|RELATION' ELSE 'PUBLIC_SCHEMA|SEQUENCE' END AS default_acl_key,
         classified.default_acl_type,
         'EXPLICIT_DEFAULT_ACL'::text AS acl_state,
         'GRANTEE'::text AS principal_position,
         classified.privilege_type,
         classified.grant_option,
         classified.category_match_count,
         CASE
           WHEN classified.category_match_count > 1 THEN 'UNCLASSIFIED'
           WHEN classified.public_match THEN 'PUBLIC'
           WHEN classified.expected_owner_match THEN 'EXPECTED_OWNER'
           WHEN classified.readonly_match THEN 'EXPECTED_READONLY_ROLE'
           WHEN classified.runtime_match THEN 'EXPECTED_RUNTIME_ROLE'
           WHEN classified.platform_match THEN 'SYSTEM_PLATFORM_MANAGED'
           WHEN classified.extension_owner_match THEN 'EXTENSION_OWNER'
           WHEN classified.membership_match THEN 'READONLY_MEMBERSHIP_CARRIER'
           WHEN classified.named_role_match THEN 'OTHER_NAMED_PRINCIPAL'
           ELSE 'UNCLASSIFIED'
         END AS principal_category,
         CASE
           WHEN classified.category_match_count > 1 THEN 'AMBIGUOUS_OID_RELATION'
           WHEN classified.public_match THEN 'PUBLIC_OID_ZERO'
           WHEN classified.expected_owner_match THEN 'EXPECTED_OWNER_OID_RELATION'
           WHEN classified.readonly_match THEN 'EXPECTED_READONLY_ROLE_OID_RELATION'
           WHEN classified.runtime_match THEN 'EXPECTED_RUNTIME_ROLE_OID_RELATION'
           WHEN classified.platform_match THEN 'SYSTEM_PLATFORM_OID_RELATION'
           WHEN classified.extension_owner_match THEN 'EXTENSION_OWNER_OID_RELATION'
           WHEN classified.membership_match THEN 'READONLY_OUTBOUND_MEMBERSHIP_RELATION'
           WHEN classified.named_role_match THEN 'NAMED_ROLE_WITHOUT_REVIEWED_RELATION'
           ELSE 'NO_ROLE_RELATION'
         END AS classification_proof,
         CASE
           WHEN classified.membership_match AND classified.category_match_count > 1 THEN 'AMBIGUOUS'
           WHEN classified.membership_match THEN 'OUTBOUND_EFFECTIVE'
           ELSE 'NONE'
         END AS membership_classification
    FROM classified
   ORDER BY default_acl_key, classified.privilege_type, classified.grant_option`;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function bool(value) {
  return value === true || value === 't' || value === 'true';
}

function values(value) {
  return new Set((value || []).filter(item => item !== null && item !== undefined));
}

function sensitivePath(value, path = []) {
  if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) return path.join('.') || '$';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'rawOidPersisted' || key === 'rawPrincipalNamePersisted') && child === false) continue;
    if (SENSITIVE_KEY.test(key)) return [...path, key].join('.');
    const nested = sensitivePath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

// Test/disposable model. Identifiers are transient inputs only; the return
// value contains no identifier and is safe to persist.
export function classifyOpaqueGrantee({
  granteeIdentifier,
  roleExists = true,
  expectedOwnerIdentifiers = [],
  expectedReadonlyIdentifier = null,
  expectedRuntimeIdentifiers = [],
  platformIdentifiers = [],
  extensionOwnerIdentifiers = [],
  membershipCarrierIdentifiers = []
} = {}) {
  const matches = [];
  if (granteeIdentifier === 0) matches.push(['PUBLIC', 'PUBLIC_OID_ZERO']);
  if (values(expectedOwnerIdentifiers).has(granteeIdentifier)) matches.push(['EXPECTED_OWNER', 'EXPECTED_OWNER_OID_RELATION']);
  if (expectedReadonlyIdentifier !== null && granteeIdentifier === expectedReadonlyIdentifier) matches.push(['EXPECTED_READONLY_ROLE', 'EXPECTED_READONLY_ROLE_OID_RELATION']);
  if (values(expectedRuntimeIdentifiers).has(granteeIdentifier)) matches.push(['EXPECTED_RUNTIME_ROLE', 'EXPECTED_RUNTIME_ROLE_OID_RELATION']);
  if (values(platformIdentifiers).has(granteeIdentifier)) matches.push(['SYSTEM_PLATFORM_MANAGED', 'SYSTEM_PLATFORM_OID_RELATION']);
  if (values(extensionOwnerIdentifiers).has(granteeIdentifier)) matches.push(['EXTENSION_OWNER', 'EXTENSION_OWNER_OID_RELATION']);
  if (values(membershipCarrierIdentifiers).has(granteeIdentifier)) matches.push(['READONLY_MEMBERSHIP_CARRIER', 'READONLY_OUTBOUND_MEMBERSHIP_RELATION']);
  if (matches.length > 1) return canonicalValue({
    category: 'UNCLASSIFIED', classificationProof: 'AMBIGUOUS_OID_RELATION', categoryMatchCount: matches.length,
    membershipClassification: matches.some(([category]) => category === 'READONLY_MEMBERSHIP_CARRIER') ? 'AMBIGUOUS' : 'NONE',
    status: 'BLOCKED', blocker: 'OPAQUE_GRANTEE_AMBIGUOUS_OID_RELATION'
  });
  if (matches.length === 1) return canonicalValue({
    category: matches[0][0], classificationProof: matches[0][1], categoryMatchCount: 1,
    membershipClassification: matches[0][0] === 'READONLY_MEMBERSHIP_CARRIER' ? 'OUTBOUND_EFFECTIVE' : 'NONE',
    status: 'PASS', blocker: null
  });
  return canonicalValue({
    category: roleExists ? 'OTHER_NAMED_PRINCIPAL' : 'UNCLASSIFIED',
    classificationProof: roleExists ? 'NAMED_ROLE_WITHOUT_REVIEWED_RELATION' : 'NO_ROLE_RELATION',
    categoryMatchCount: 0, membershipClassification: 'NONE', status: 'BLOCKED',
    blocker: roleExists ? 'OPAQUE_GRANTEE_OTHER_PRINCIPAL_REVIEW_REQUIRED' : 'OPAQUE_GRANTEE_UNCLASSIFIED'
  });
}

export function validateOpaqueGranteeQuery(sql = OPAQUE_GRANTEE_CLASSIFICATION_SQL) {
  const failures = [];
  const text = String(sql || '').trim();
  const executable = text.replace(/'(?:''|[^'])*'/g, "''");
  if (!/^WITH\s+RECURSIVE\b/i.test(text)) failures.push('OPAQUE_GRANTEE_QUERY_NOT_SELECT_ONLY');
  if (/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i.test(executable)) failures.push('OPAQUE_GRANTEE_QUERY_MUTATION_TOKEN');
  for (const source of ['pg_catalog.pg_default_acl', 'pg_catalog.aclexplode', 'pg_catalog.pg_auth_members', 'pg_catalog.pg_roles', 'pg_catalog.pg_database', 'pg_catalog.pg_namespace', 'pg_catalog.pg_extension']) {
    if (!text.includes(source)) failures.push(`OPAQUE_GRANTEE_QUERY_SOURCE_MISSING:${source}`);
  }
  if (!/grantee_oid\s*=\s*0\s+AS\s+public_match/i.test(text)) failures.push('OPAQUE_GRANTEE_PUBLIC_OID_ZERO_RULE_MISSING');
  if (!/namespace\.nspname\s*=\s*'public'/i.test(text) || !/defaclobjtype\s+IN\s*\('r',\s*'S'\)/i.test(text)) failures.push('OPAQUE_GRANTEE_QUERY_SCOPE_TOO_BROAD');
  if (/pg_get_userbyid|rolname\s+AS|grantee_oid\s*,\s*classified/i.test(text)) failures.push('OPAQUE_GRANTEE_RAW_IDENTITY_OUTPUT_BLOCKED');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function buildOpaqueGranteeClassification(rows) {
  const blockers = [];
  if (!Array.isArray(rows) || rows.length === 0) blockers.push('OPAQUE_GRANTEE_ROWS_MISSING');
  if (sensitivePath(rows)) blockers.push('OPAQUE_GRANTEE_RAW_IDENTITY_FIELD_BLOCKED');
  const classifications = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const objectType = OBJECT_TYPES[String(row.default_acl_type || '')] || 'UNCLASSIFIED';
    const defaultAclKey = String(row.default_acl_key || '');
    const category = OPAQUE_GRANTEE_CATEGORIES.includes(row.principal_category) ? row.principal_category : 'UNCLASSIFIED';
    const proof = OPAQUE_GRANTEE_PROOFS.includes(row.classification_proof) ? row.classification_proof : 'NO_ROLE_RELATION';
    const matchCount = Number(row.category_match_count);
    const membershipClassification = ['NONE', 'OUTBOUND_EFFECTIVE', 'AMBIGUOUS'].includes(row.membership_classification) ? row.membership_classification : 'AMBIGUOUS';
    const privilege = String(row.privilege_type || '').toUpperCase();
    const grantOption = bool(row.grant_option);
    if (!['PUBLIC_SCHEMA|RELATION', 'PUBLIC_SCHEMA|SEQUENCE'].includes(defaultAclKey) || objectType === 'UNCLASSIFIED'
        || row.acl_state !== 'EXPLICIT_DEFAULT_ACL' || row.principal_position !== 'GRANTEE' || !privilege) blockers.push('OPAQUE_GRANTEE_ROW_CONTRACT_BLOCKED');
    if (!Number.isInteger(matchCount) || matchCount < 0 || matchCount > 7) blockers.push('OPAQUE_GRANTEE_MATCH_COUNT_INVALID');
    if (!REVIEWED_CATEGORIES.has(category)) blockers.push(`OPAQUE_GRANTEE_CATEGORY_BLOCKED:${defaultAclKey}`);
    if (proof === 'AMBIGUOUS_OID_RELATION' || membershipClassification === 'AMBIGUOUS' || matchCount !== 1) blockers.push(`OPAQUE_GRANTEE_AMBIGUOUS_OR_UNPROVEN:${defaultAclKey}`);
    if (grantOption && !REVIEWED_CATEGORIES.has(category)) blockers.push(`OPAQUE_GRANTEE_GRANT_OPTION_UNREVIEWED:${defaultAclKey}`);
    classifications.push({
      defaultAclKey, objectType, aclState: 'EXPLICIT_DEFAULT_ACL', principalPosition: 'GRANTEE',
      principalCategory: category, classificationProof: proof, membershipClassification,
      privilege, grantOption, categoryMatchCount: matchCount,
      semanticResult: REVIEWED_CATEGORIES.has(category) && matchCount === 1 && proof !== 'AMBIGUOUS_OID_RELATION' ? 'CLASSIFICATION_PROVEN' : 'BLOCKED',
      modelVersion: OPAQUE_GRANTEE_MODEL_VERSION
    });
  }
  classifications.sort((left, right) => JSON.stringify(canonicalValue(left)).localeCompare(JSON.stringify(canonicalValue(right))));
  const observedFacts = classifications.map(entry => `${entry.defaultAclKey}|${entry.privilege}|${entry.grantOption}`).sort();
  if (JSON.stringify(observedFacts) !== JSON.stringify(EXPECTED_UNRESOLVED_FACTS)) blockers.push('OPAQUE_GRANTEE_UNRESOLVED_FACT_SET_MISMATCH');
  const core = canonicalValue({ modelVersion: OPAQUE_GRANTEE_MODEL_VERSION, classifications });
  return canonicalValue({
    status: blockers.length ? 'BLOCKED' : 'PASS', blockers: [...new Set(blockers)].sort(), ...core,
    fingerprint: createHash('sha256').update(`${JSON.stringify(core)}\n`, 'utf8').digest('hex'),
    audit: { rawOidPersisted: false, rawPrincipalNamePersisted: false, classificationCount: classifications.length }
  });
}

export function validateOpaqueGranteeEvidence(value) {
  const failures = [];
  if (sensitivePath(value)) failures.push('OPAQUE_GRANTEE_EVIDENCE_SENSITIVE_FIELD');
  const required = [
    'schemaVersion', 'phase', 'sprintNumberingCappedAt', 'generatedAt', 'repositoryCommitSha',
    'sourcePhase2IEvidenceSha256', 'modelVersion', 'scope', 'identityResult', 'tlsVerification',
    'roleBoundaryResult', 'transactionReadOnlyResult', 'ledgerResult', 'classifications', 'blockers',
    'classificationFingerprint', 'opaqueGranteeResult', 'aclSemanticGate', 'connectionAttemptCount',
    'retryCount', 'productionConnectionAttempted', 'productionMutation', 'businessRowReads',
    'rawOidPersisted', 'rawPrincipalNamePersisted', 'cleanupResult', 'finalStatus'
  ];
  for (const key of required) if (!Object.hasOwn(value || {}, key)) failures.push(`OPAQUE_GRANTEE_EVIDENCE_FIELD_MISSING:${key}`);
  if (value?.schemaVersion !== 1 || value?.phase !== 'PRODUCTION_CLOSURE_PHASE_2J_OPAQUE_GRANTEE_SUPPLEMENT'
      || value?.sprintNumberingCappedAt !== 65 || value?.modelVersion !== OPAQUE_GRANTEE_MODEL_VERSION
      || value?.scope !== 'UNRESOLVED_PUBLIC_SCHEMA_RELATION_SEQUENCE_GRANTEE_ONLY') failures.push('OPAQUE_GRANTEE_EVIDENCE_CONTRACT_MISMATCH');
  if (value?.connectionAttemptCount !== 1 || value?.retryCount !== 0 || value?.productionConnectionAttempted !== true
      || value?.productionMutation !== false || value?.businessRowReads !== 'NONE'
      || value?.rawOidPersisted !== false || value?.rawPrincipalNamePersisted !== false || value?.cleanupResult !== 'PASS') failures.push('OPAQUE_GRANTEE_EVIDENCE_EXECUTION_BOUNDARY_MISMATCH');
  if (value?.aclSemanticGate !== 'BLOCKED_PENDING_SEMANTIC_RECOMPOSITION') failures.push('OPAQUE_GRANTEE_EVIDENCE_GATE_SCOPE_INVALID');
  if (!['PASS', 'BLOCKED'].includes(value?.opaqueGranteeResult) || value?.finalStatus !== value?.opaqueGranteeResult) failures.push('OPAQUE_GRANTEE_EVIDENCE_RESULT_INVALID');
  if (!Array.isArray(value?.classifications) || value.classifications.some(entry => entry?.principalPosition !== 'GRANTEE')) failures.push('OPAQUE_GRANTEE_EVIDENCE_CLASSIFICATION_SCOPE_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}
