import { createHash } from 'node:crypto';

export const DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION = 'bankeban-default-acl-principal-classification-v1';

export const DEFAULT_ACL_PRINCIPAL_POSITIONS = Object.freeze(['OWNER', 'GRANTEE', 'GRANTOR']);

export const DEFAULT_ACL_PRINCIPAL_CATEGORIES = Object.freeze([
  'EXPECTED_OWNER',
  'EXPECTED_READONLY_ROLE',
  'EXPECTED_RUNTIME_ROLE',
  'PUBLIC',
  'EXTENSION_OWNER',
  'SYSTEM_PLATFORM_MANAGED',
  'READONLY_MEMBERSHIP_CARRIER',
  'OTHER_NAMED_PRINCIPAL',
  'UNCLASSIFIED'
]);

export const DEFAULT_ACL_OBJECT_TYPES = Object.freeze({
  n: 'SCHEMA',
  r: 'RELATION',
  S: 'SEQUENCE',
  f: 'FUNCTION',
  T: 'TYPE'
});

const WRITE_PRIVILEGES = new Set(['CREATE', 'DELETE', 'INSERT', 'MAINTAIN', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
const TRUSTED_GRANTORS = new Set(['EXPECTED_OWNER', 'EXTENSION_OWNER', 'SYSTEM_PLATFORM_MANAGED']);
const SENSITIVE_KEY = /^(?:owner_principal|grantee_principal|grantor_principal|principal_name|role_name|username|password|credential|connection_string|database_url|hostname|endpoint|token|cookie|authorization|raw_acl)$/i;
const SENSITIVE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;

// Future live scope is intentionally limited to the two Phase 2G blockers:
// schema `public`, default ACL object types relation (`r`) and sequence (`S`).
// PostgreSQL proves PUBLIC only through grantee OID 0; schema text is never used
// to infer a principal category. Raw role names are consumed only inside SQL and
// are not returned to Node or written to Evidence.
export const DEFAULT_ACL_CLASSIFICATION_SQL = `
  WITH role_context AS (
    SELECT
      (SELECT namespace.nspowner FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspname = 'app_private') AS expected_owner_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $1) AS readonly_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $2) AS runtime_oid,
      (SELECT extension.extowner FROM pg_catalog.pg_extension AS extension WHERE extension.extname = 'pgcrypto') AS extension_owner_oid,
      (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $3) AS platform_oid
  ), target_defaults AS (
    SELECT default_acl.defaclrole AS owner_oid,
           default_acl.defaclobjtype::text AS default_acl_type,
           namespace.nspname AS schema_name,
           default_acl.defaclacl AS actual_acl
      FROM pg_catalog.pg_default_acl AS default_acl
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
     WHERE namespace.nspname = 'public'
       AND default_acl.defaclobjtype IN ('r', 'S')
  ), expanded AS (
    SELECT target.*, 'EXPLICIT_DEFAULT_ACL'::text AS acl_state,
           acl.grantor AS grantor_oid, acl.grantee AS grantee_oid,
           acl.privilege_type, acl.is_grantable AS grant_option
      FROM target_defaults AS target
      CROSS JOIN LATERAL pg_catalog.aclexplode(target.actual_acl) AS acl
    UNION ALL
    SELECT target.*, 'BUILTIN_DEFAULT'::text AS acl_state,
           acl.grantor AS grantor_oid, acl.grantee AS grantee_oid,
           acl.privilege_type, acl.is_grantable AS grant_option
      FROM target_defaults AS target
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        pg_catalog.acldefault(target.default_acl_type::"char", target.owner_oid)
      ) AS acl
  )
  SELECT expanded.schema_name,
         expanded.default_acl_type,
         expanded.acl_state,
         expanded.privilege_type,
         expanded.grant_option,
         CASE
           WHEN expanded.owner_oid IS NULL THEN 'UNCLASSIFIED'
           WHEN expanded.owner_oid = context.expected_owner_oid THEN 'EXPECTED_OWNER'
           WHEN expanded.owner_oid = context.readonly_oid THEN 'EXPECTED_READONLY_ROLE'
           WHEN expanded.owner_oid = context.runtime_oid THEN 'EXPECTED_RUNTIME_ROLE'
           WHEN expanded.owner_oid = context.extension_owner_oid THEN 'EXTENSION_OWNER'
           WHEN expanded.owner_oid = context.platform_oid THEN 'SYSTEM_PLATFORM_MANAGED'
           WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role WHERE role.oid = expanded.owner_oid) THEN 'OTHER_NAMED_PRINCIPAL'
           ELSE 'UNCLASSIFIED'
         END AS owner_category,
         CASE
           WHEN expanded.grantee_oid = 0 THEN 'PUBLIC'
           WHEN expanded.grantee_oid IS NULL THEN 'UNCLASSIFIED'
           WHEN expanded.grantee_oid = context.expected_owner_oid THEN 'EXPECTED_OWNER'
           WHEN expanded.grantee_oid = context.readonly_oid THEN 'EXPECTED_READONLY_ROLE'
           WHEN expanded.grantee_oid = context.runtime_oid THEN 'EXPECTED_RUNTIME_ROLE'
           WHEN expanded.grantee_oid = context.extension_owner_oid THEN 'EXTENSION_OWNER'
           WHEN expanded.grantee_oid = context.platform_oid THEN 'SYSTEM_PLATFORM_MANAGED'
           WHEN context.readonly_oid IS NOT NULL AND (
             pg_catalog.pg_has_role(context.readonly_oid, expanded.grantee_oid, 'MEMBER WITH ADMIN OPTION')
             OR pg_catalog.pg_has_role(context.readonly_oid, expanded.grantee_oid, 'USAGE')
             OR pg_catalog.pg_has_role(context.readonly_oid, expanded.grantee_oid, 'SET')
           ) THEN 'READONLY_MEMBERSHIP_CARRIER'
           WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role WHERE role.oid = expanded.grantee_oid) THEN 'OTHER_NAMED_PRINCIPAL'
           ELSE 'UNCLASSIFIED'
         END AS grantee_category,
         CASE
           WHEN expanded.grantor_oid IS NULL THEN 'UNCLASSIFIED'
           WHEN expanded.grantor_oid = context.expected_owner_oid THEN 'EXPECTED_OWNER'
           WHEN expanded.grantor_oid = context.readonly_oid THEN 'EXPECTED_READONLY_ROLE'
           WHEN expanded.grantor_oid = context.runtime_oid THEN 'EXPECTED_RUNTIME_ROLE'
           WHEN expanded.grantor_oid = context.extension_owner_oid THEN 'EXTENSION_OWNER'
           WHEN expanded.grantor_oid = context.platform_oid THEN 'SYSTEM_PLATFORM_MANAGED'
           WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role WHERE role.oid = expanded.grantor_oid) THEN 'OTHER_NAMED_PRINCIPAL'
           ELSE 'UNCLASSIFIED'
         END AS grantor_category
    FROM expanded
    CROSS JOIN role_context AS context
   ORDER BY expanded.schema_name, expanded.default_acl_type, expanded.acl_state,
            expanded.privilege_type, expanded.grant_option,
            owner_category, grantee_category, grantor_category`;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function schemaKey(value) {
  if (value === 'public') return 'PUBLIC_SCHEMA';
  if (value === 'app_private') return 'APP_PRIVATE_SCHEMA';
  if (!value) return 'GLOBAL';
  return 'UNCLASSIFIED_SCHEMA';
}

function bool(value) {
  return value === true || value === 't' || value === 'true';
}

function entryKey(entry, { includeGrantor = false } = {}) {
  // aclState identifies the observed side and must not participate in the
  // semantic key; otherwise EXPLICIT_DEFAULT_ACL could never equal its
  // PostgreSQL BUILTIN_DEFAULT counterpart.
  const fields = [entry.defaultAclKey, entry.ownerCategory, entry.granteeCategory, entry.privilege, entry.grantOption];
  if (includeGrantor) fields.push(entry.grantorCategory);
  return fields.join('|');
}

function sensitivePath(value, path = []) {
  if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) return path.join('.') || '$';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) return [...path, key].join('.');
    const nested = sensitivePath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

export function validateDefaultAclClassificationQuery(sql = DEFAULT_ACL_CLASSIFICATION_SQL) {
  const failures = [];
  const text = String(sql || '').trim();
  const executable = text.replace(/'(?:''|[^'])*'/g, "''");
  if (!/^WITH\b/i.test(text)) failures.push('DEFAULT_ACL_QUERY_NOT_SELECT_ONLY');
  if (/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i.test(executable)) failures.push('DEFAULT_ACL_QUERY_MUTATION_TOKEN');
  for (const required of ['pg_catalog.pg_default_acl', 'pg_catalog.pg_namespace', 'pg_catalog.pg_roles', 'pg_catalog.pg_extension', 'pg_catalog.aclexplode', 'pg_catalog.acldefault']) {
    if (!text.includes(required)) failures.push(`DEFAULT_ACL_QUERY_SOURCE_MISSING:${required}`);
  }
  if (!/expanded\.grantee_oid\s*=\s*0\s+THEN\s+'PUBLIC'/i.test(text)) failures.push('PUBLIC_OID_ZERO_RULE_MISSING');
  if (!/namespace\.nspname\s*=\s*'public'/i.test(text) || !/defaclobjtype\s+IN\s*\('r',\s*'S'\)/i.test(text)) failures.push('DEFAULT_ACL_QUERY_SCOPE_TOO_BROAD');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function buildDefaultAclClassification(rows, { modelVersion = DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION } = {}) {
  const blockers = [];
  if (modelVersion !== DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION) blockers.push('DEFAULT_ACL_MODEL_VERSION_UNSUPPORTED');
  if (!Array.isArray(rows)) blockers.push('DEFAULT_ACL_ROWS_MISSING');
  const rawSensitive = sensitivePath(rows);
  if (rawSensitive) blockers.push('DEFAULT_ACL_RAW_IDENTITY_FIELD_BLOCKED');
  const entries = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const ownerCategory = DEFAULT_ACL_PRINCIPAL_CATEGORIES.includes(row.owner_category) ? row.owner_category : 'UNCLASSIFIED';
    const granteeCategory = DEFAULT_ACL_PRINCIPAL_CATEGORIES.includes(row.grantee_category) ? row.grantee_category : 'UNCLASSIFIED';
    const grantorCategory = DEFAULT_ACL_PRINCIPAL_CATEGORIES.includes(row.grantor_category) ? row.grantor_category : 'UNCLASSIFIED';
    const key = schemaKey(String(row.schema_name || ''));
    const objectType = DEFAULT_ACL_OBJECT_TYPES[String(row.default_acl_type || '')] || 'UNCLASSIFIED';
    const aclState = ['EXPLICIT_DEFAULT_ACL', 'BUILTIN_DEFAULT'].includes(row.acl_state) ? row.acl_state : 'UNCLASSIFIED';
    const privilege = String(row.privilege_type || '').toUpperCase();
    const principalClassifications = [
      { position: 'OWNER', category: ownerCategory },
      { position: 'GRANTEE', category: granteeCategory },
      { position: 'GRANTOR', category: grantorCategory }
    ];
    if (key === 'UNCLASSIFIED_SCHEMA' || objectType === 'UNCLASSIFIED' || aclState === 'UNCLASSIFIED' || !privilege) blockers.push('DEFAULT_ACL_ROW_CLASSIFICATION_INCOMPLETE');
    for (const principal of principalClassifications) {
      if (principal.category === 'UNCLASSIFIED') blockers.push(`DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:${key}|${objectType}|${principal.position}`);
      if (principal.category === 'OTHER_NAMED_PRINCIPAL') blockers.push(`DEFAULT_ACL_OTHER_PRINCIPAL_REVIEW_REQUIRED:${key}|${objectType}|${principal.position}`);
    }
    if (!TRUSTED_GRANTORS.has(grantorCategory)) blockers.push(`DEFAULT_ACL_GRANTOR_UNTRUSTED:${key}|${objectType}`);
    entries.push({
      defaultAclKey: `${key}|${objectType}`,
      schemaKey: key,
      objectType,
      aclState,
      principalClassifications,
      ownerCategory,
      granteeCategory,
      grantorCategory,
      privilege,
      grantOption: bool(row.grant_option),
      modelVersion
    });
  }
  entries.sort((left, right) => JSON.stringify(canonicalValue(left)).localeCompare(JSON.stringify(canonicalValue(right))));

  const actual = new Map(entries.filter(entry => entry.aclState === 'EXPLICIT_DEFAULT_ACL').map(entry => [entryKey(entry), entry]));
  const builtin = new Map(entries.filter(entry => entry.aclState === 'BUILTIN_DEFAULT').map(entry => [entryKey(entry), entry]));
  const differences = [];
  for (const [key, entry] of actual) {
    if (!builtin.has(key)) differences.push({
      type: 'DEFAULT_PRIVILEGE_ADDED',
      defaultAclKey: entry.defaultAclKey,
      granteeCategory: entry.granteeCategory,
      privilege: entry.privilege,
      grantOption: entry.grantOption,
      dangerous: entry.granteeCategory === 'PUBLIC' || entry.granteeCategory === 'EXPECTED_READONLY_ROLE' && WRITE_PRIVILEGES.has(entry.privilege) || entry.grantOption
    });
  }
  for (const [key, entry] of builtin) {
    if (!actual.has(key)) differences.push({
      type: 'DEFAULT_PRIVILEGE_REMOVED',
      defaultAclKey: entry.defaultAclKey,
      granteeCategory: entry.granteeCategory,
      privilege: entry.privilege,
      grantOption: entry.grantOption,
      dangerous: false
    });
  }
  differences.sort((left, right) => JSON.stringify(canonicalValue(left)).localeCompare(JSON.stringify(canonicalValue(right))));
  const status = blockers.length ? 'BLOCKED' : differences.length ? 'SEMANTIC_MISMATCH' : 'SEMANTIC_MATCH';
  const semanticCore = canonicalValue({ modelVersion, entries, differences });
  return canonicalValue({
    status,
    blockers: [...new Set(blockers)].sort(),
    ...semanticCore,
    fingerprint: createHash('sha256').update(`${JSON.stringify(semanticCore)}\n`, 'utf8').digest('hex'),
    audit: { rawPrincipalNamesPersisted: false, entryCount: entries.length }
  });
}

export function validateDefaultAclEvidence(value) {
  const failures = [];
  const sensitive = sensitivePath(value);
  if (sensitive) failures.push('DEFAULT_ACL_EVIDENCE_SENSITIVE_FIELD');
  const required = [
    'schemaVersion', 'phase', 'sprintNumberingCappedAt', 'generatedAt', 'repositoryCommitSha',
    'sourceLiveSemanticEvidenceSha256', 'modelVersion', 'scope', 'identityResult', 'tlsVerification',
    'roleBoundaryResult', 'transactionReadOnlyResult', 'ledgerResult', 'entries', 'blockers', 'differences',
    'defaultAclSemanticResult', 'connectionAttemptCount', 'retryCount', 'productionConnectionAttempted',
    'productionMutation', 'businessRowReads', 'cleanupResult', 'finalStatus'
  ];
  for (const key of required) if (!Object.hasOwn(value || {}, key)) failures.push(`DEFAULT_ACL_EVIDENCE_FIELD_MISSING:${key}`);
  if (value?.schemaVersion !== 1 || value?.phase !== 'PRODUCTION_CLOSURE_PHASE_2H_DEFAULT_ACL_SUPPLEMENT'
      || value?.sprintNumberingCappedAt !== 65 || value?.modelVersion !== DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION
      || value?.scope !== 'PUBLIC_SCHEMA_RELATION_AND_SEQUENCE_DEFAULT_ACL_ONLY') failures.push('DEFAULT_ACL_EVIDENCE_CONTRACT_MISMATCH');
  if (value?.connectionAttemptCount !== 1 || value?.retryCount !== 0 || value?.productionConnectionAttempted !== true
      || value?.productionMutation !== false || value?.businessRowReads !== 'NONE' || value?.cleanupResult !== 'PASS') failures.push('DEFAULT_ACL_EVIDENCE_EXECUTION_BOUNDARY_MISMATCH');
  if (!['SEMANTIC_MATCH', 'SEMANTIC_MISMATCH', 'BLOCKED'].includes(value?.defaultAclSemanticResult)
      || value?.finalStatus !== (value?.defaultAclSemanticResult === 'SEMANTIC_MATCH' ? 'PASS' : 'BLOCKED')) failures.push('DEFAULT_ACL_EVIDENCE_RESULT_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}
