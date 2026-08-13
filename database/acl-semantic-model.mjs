import { createHash } from 'node:crypto';

export const ACL_SEMANTIC_MODEL_VERSION = 'bankeban-acl-semantics-v1';

export const PRINCIPAL_CATEGORIES = Object.freeze([
  'EXPECTED_OWNER',
  'EXPECTED_READONLY_ROLE',
  'EXPECTED_RUNTIME_ROLE',
  'PUBLIC',
  'EXTENSION_OWNER',
  'SYSTEM_PLATFORM_MANAGED',
  'READONLY_MEMBERSHIP_CARRIER',
  'OTHER_NAMED_PRINCIPAL'
]);

export const OBJECT_PRIVILEGES = Object.freeze({
  SCHEMA: Object.freeze(['CREATE', 'USAGE']),
  RELATION: Object.freeze(['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']),
  FUNCTION: Object.freeze(['EXECUTE']),
  SEQUENCE: Object.freeze(['SELECT', 'UPDATE', 'USAGE'])
});

const OWNER_IMPLIED_PRIVILEGES = OBJECT_PRIVILEGES;
const WRITE_PRIVILEGES = new Set(['CREATE', 'DELETE', 'INSERT', 'MAINTAIN', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
const SENSITIVE_KEY = /(?:password|secret|token|credential|connection|string|url|host|endpoint)/i;

export const ACL_SEMANTIC_QUERIES = Object.freeze({
  objects: `
    WITH modeled_objects AS (
      SELECT 'SCHEMA'::text AS object_type,
             namespace.nspname AS schema_name,
             namespace.nspname AS object_identity,
             ''::text AS extension_name,
             namespace.nspowner AS owner_oid,
             namespace.nspacl AS raw_acl,
             'n'::text AS default_acl_type
        FROM pg_catalog.pg_namespace AS namespace
       WHERE namespace.nspname IN ('public', 'app_private')
      UNION ALL
      SELECT CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE' ELSE 'RELATION' END,
             namespace.nspname,
             namespace.nspname || '.' || relation.relname,
             '',
             relation.relowner,
             relation.relacl,
             CASE WHEN relation.relkind = 'S' THEN 's' ELSE 'r' END
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname IN ('public', 'app_private')
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      UNION ALL
      SELECT 'FUNCTION',
             namespace.nspname,
             namespace.nspname || '.' || procedure.proname || '(' || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')',
             COALESCE(extension.extname, ''),
             procedure.proowner,
             procedure.proacl,
             'f'
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        LEFT JOIN pg_catalog.pg_depend AS dependency
          ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         AND dependency.objid = procedure.oid
         AND dependency.deptype = 'e'
        LEFT JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
       WHERE namespace.nspname IN ('public', 'app_private')
    )
    SELECT object_type,
           schema_name,
           object_identity,
           extension_name,
           pg_catalog.pg_get_userbyid(owner_oid) AS owner_principal,
           raw_acl IS NULL AS acl_is_null,
           default_acl_type
      FROM modeled_objects
     ORDER BY object_type, object_identity`,
  entries: `
    WITH modeled_objects AS (
      SELECT 'SCHEMA'::text AS object_type, namespace.nspname AS schema_name,
             namespace.nspname AS object_identity, ''::text AS extension_name,
             namespace.nspowner AS owner_oid, namespace.nspacl AS raw_acl, 'n'::text AS default_acl_type
        FROM pg_catalog.pg_namespace AS namespace
       WHERE namespace.nspname IN ('public', 'app_private')
      UNION ALL
      SELECT CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE' ELSE 'RELATION' END,
             namespace.nspname, namespace.nspname || '.' || relation.relname, '',
             relation.relowner, relation.relacl, CASE WHEN relation.relkind = 'S' THEN 's' ELSE 'r' END
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname IN ('public', 'app_private')
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      UNION ALL
      SELECT 'FUNCTION', namespace.nspname,
             namespace.nspname || '.' || procedure.proname || '(' || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')',
             COALESCE(extension.extname, ''), procedure.proowner, procedure.proacl, 'f'
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        LEFT JOIN pg_catalog.pg_depend AS dependency
          ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         AND dependency.objid = procedure.oid
         AND dependency.deptype = 'e'
        LEFT JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
       WHERE namespace.nspname IN ('public', 'app_private')
    )
    SELECT object.object_type,
           object.schema_name,
           object.object_identity,
           object.extension_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_principal,
           pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_principal,
           acl.privilege_type,
           acl.is_grantable AS grant_option
      FROM modeled_objects AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        object.raw_acl,
        pg_catalog.acldefault(object.default_acl_type::"char", object.owner_oid)
      )) AS acl
     ORDER BY object.object_type, object.object_identity, grantee_principal, acl.privilege_type, acl.is_grantable`,
  defaultPrivileges: `
    SELECT COALESCE(namespace.nspname, '') AS schema_name,
           default_acl.defaclobjtype::text AS default_acl_type,
           pg_catalog.pg_get_userbyid(default_acl.defaclrole) AS owner_principal,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_principal,
           pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_principal,
           acl.privilege_type,
           acl.is_grantable AS grant_option
      FROM pg_catalog.pg_default_acl AS default_acl
      LEFT JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
     WHERE namespace.nspname IN ('public', 'app_private') OR default_acl.defaclnamespace = 0
     ORDER BY schema_name, default_acl.defaclobjtype, owner_principal, grantee_principal, acl.privilege_type, acl.is_grantable`,
  memberships: `
    SELECT member_role.rolname AS member_principal,
           granted_role.rolname AS granted_role_principal,
           membership.admin_option,
           membership.inherit_option,
           membership.set_option
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
      JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
     ORDER BY member_role.rolname, granted_role.rolname`
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function canonicalAclJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function aclSemanticSha256(value) {
  const input = typeof value === 'string' ? value : canonicalAclJson(value);
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function normalizeBoolean(value) {
  return value === true || value === 't' || value === 'true';
}

function normalizeContext(context = {}) {
  return {
    expectedOwners: new Set(context.expectedOwners || []),
    expectedReadonlyRole: String(context.expectedReadonlyRole || ''),
    expectedRuntimeRoles: new Set(context.expectedRuntimeRoles || []),
    extensionOwners: Object.fromEntries(Object.entries(context.extensionOwners || {}).map(([key, values]) => [key, new Set(values)])),
    systemManagedPrincipals: new Set(context.systemManagedPrincipals || [])
  };
}

function reachableMemberships(memberships, readonlyRole) {
  const outgoing = new Map();
  for (const membership of memberships || []) {
    const member = String(membership.member_principal || '');
    const role = String(membership.granted_role_principal || '');
    if (!member || !role) continue;
    const edge = {
      member,
      role,
      adminOption: normalizeBoolean(membership.admin_option),
      inheritOption: normalizeBoolean(membership.inherit_option),
      setOption: normalizeBoolean(membership.set_option)
    };
    if (!outgoing.has(member)) outgoing.set(member, []);
    outgoing.get(member).push(edge);
  }
  const reachable = new Map();
  const queue = [{ principal: readonlyRole, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of outgoing.get(current.principal) || []) {
      const effective = edge.inheritOption || edge.setOption || edge.adminOption;
      const prior = reachable.get(edge.role);
      const fact = { ...edge, depth: current.depth + 1, effective };
      if (!prior || fact.depth < prior.depth) reachable.set(edge.role, fact);
      if (effective && (!prior || fact.depth < prior.depth)) queue.push({ principal: edge.role, depth: fact.depth });
    }
  }
  return reachable;
}

function principalCategory(principal, object, context, membershipCarriers) {
  if (principal === 'PUBLIC') return 'PUBLIC';
  if (principal && principal === context.expectedReadonlyRole) return 'EXPECTED_READONLY_ROLE';
  if (context.expectedRuntimeRoles.has(principal)) return 'EXPECTED_RUNTIME_ROLE';
  if (object?.extensionName && context.extensionOwners[object.extensionName]?.has(principal)) return 'EXTENSION_OWNER';
  if (context.expectedOwners.has(principal)) return 'EXPECTED_OWNER';
  if (context.systemManagedPrincipals.has(principal)) return 'SYSTEM_PLATFORM_MANAGED';
  if (membershipCarriers.has(principal)) return 'READONLY_MEMBERSHIP_CARRIER';
  return 'OTHER_NAMED_PRINCIPAL';
}

function privilegeKey(entry) {
  return `${entry.granteeCategory}|${entry.privilege}`;
}

function semanticObjectKey(object) {
  return `${object.objectType}|${object.objectIdentity}`;
}

function validateRawFacts(rawFacts) {
  const failures = [];
  if (!rawFacts || rawFacts.defaultsExpanded !== true) failures.push('ACL_DEFAULTS_NOT_EXPANDED');
  for (const [section, rows] of Object.entries({
    objects: rawFacts?.objects,
    entries: rawFacts?.entries,
    defaultPrivileges: rawFacts?.defaultPrivileges,
    memberships: rawFacts?.memberships
  })) {
    if (!Array.isArray(rows)) failures.push(`ACL_FACT_SECTION_MISSING:${section}`);
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) failures.push(`FORBIDDEN_ACL_FACT_FIELD:${key}`);
      visit(child);
    }
  };
  visit(rawFacts);
  return [...new Set(failures)].sort();
}

function canonicalPrivilegeEntries(entries) {
  const merged = new Map();
  for (const entry of entries) {
    const key = privilegeKey(entry);
    const prior = merged.get(key);
    merged.set(key, {
      granteeCategory: entry.granteeCategory,
      privilege: entry.privilege,
      grantOption: Boolean(entry.grantOption || prior?.grantOption),
      sources: [...new Set([...(prior?.sources || []), ...(entry.sources || [])])].sort()
    });
  }
  const values = [...merged.values()];
  const publicByPrivilege = new Map(values.filter(entry => entry.granteeCategory === 'PUBLIC').map(entry => [entry.privilege, entry]));
  return values.filter(entry => {
    if (!['EXPECTED_READONLY_ROLE', 'EXPECTED_RUNTIME_ROLE', 'SYSTEM_PLATFORM_MANAGED', 'READONLY_MEMBERSHIP_CARRIER'].includes(entry.granteeCategory)) return true;
    const publicEntry = publicByPrivilege.get(entry.privilege);
    return !publicEntry || entry.grantOption && !publicEntry.grantOption;
  }).sort((left, right) => privilegeKey(left).localeCompare(privilegeKey(right)));
}

export function buildAclSemanticSnapshot(rawFacts, principalContext, { modelVersion = ACL_SEMANTIC_MODEL_VERSION } = {}) {
  const blockers = validateRawFacts(rawFacts);
  if (modelVersion !== ACL_SEMANTIC_MODEL_VERSION) blockers.push('ACL_MODEL_VERSION_UNSUPPORTED');
  const context = normalizeContext(principalContext);
  if (!context.expectedReadonlyRole || context.expectedOwners.size === 0) blockers.push('ACL_PRINCIPAL_CONTEXT_INCOMPLETE');
  const reachable = reachableMemberships(rawFacts?.memberships || [], context.expectedReadonlyRole);
  const membershipCarriers = new Set([...reachable.entries()].filter(([, fact]) => fact.effective).map(([principal]) => principal));
  const entryMap = new Map();
  for (const row of rawFacts?.entries || []) {
    const key = `${String(row.object_type || '')}|${String(row.object_identity || '')}`;
    if (!entryMap.has(key)) entryMap.set(key, []);
    entryMap.get(key).push(row);
  }
  const objects = [];
  for (const row of rawFacts?.objects || []) {
    const object = {
      objectType: String(row.object_type || ''),
      schemaName: String(row.schema_name || ''),
      objectIdentity: String(row.object_identity || ''),
      extensionName: String(row.extension_name || '')
    };
    const allowed = OBJECT_PRIVILEGES[object.objectType];
    if (!allowed || !object.objectIdentity) blockers.push(`ACL_OBJECT_UNSUPPORTED:${object.objectType || 'UNKNOWN'}`);
    const ownerCategory = principalCategory(String(row.owner_principal || ''), object, context, membershipCarriers);
    if (ownerCategory === 'OTHER_NAMED_PRINCIPAL') blockers.push(`ACL_OWNER_UNCLASSIFIED:${semanticObjectKey(object)}`);
    if (object.extensionName && object.extensionName !== 'pgcrypto') blockers.push(`ACL_EXTENSION_UNREVIEWED:${object.extensionName}`);
    if (object.extensionName && ownerCategory !== 'EXTENSION_OWNER') blockers.push(`ACL_EXTENSION_OWNER_UNREVIEWED:${object.extensionName}`);
    const semanticEntries = (OWNER_IMPLIED_PRIVILEGES[object.objectType] || []).map(privilege => ({
      granteeCategory: ownerCategory,
      privilege,
      grantOption: true,
      sources: ['OWNER_IMPLIED']
    }));
    for (const acl of entryMap.get(`${object.objectType}|${object.objectIdentity}`) || []) {
      const privilege = String(acl.privilege_type || '').toUpperCase();
      if (!allowed?.includes(privilege)) blockers.push(`ACL_PRIVILEGE_UNSUPPORTED:${semanticObjectKey(object)}:${privilege}`);
      const granteeCategory = principalCategory(String(acl.grantee_principal || ''), object, context, membershipCarriers);
      const grantorCategory = principalCategory(String(acl.grantor_principal || ''), object, context, membershipCarriers);
      if (granteeCategory === 'OTHER_NAMED_PRINCIPAL') blockers.push(`ACL_GRANTEE_UNCLASSIFIED:${semanticObjectKey(object)}`);
      if (grantorCategory === 'OTHER_NAMED_PRINCIPAL') blockers.push(`ACL_GRANTOR_UNCLASSIFIED:${semanticObjectKey(object)}`);
      if (grantorCategory === 'SYSTEM_PLATFORM_MANAGED' && !object.extensionName) blockers.push(`ACL_PLATFORM_GRANTOR_OUTSIDE_EXTENSION:${semanticObjectKey(object)}`);
      semanticEntries.push({
        granteeCategory,
        privilege,
        grantOption: normalizeBoolean(acl.grant_option),
        sources: ['ACL_EFFECTIVE']
      });
    }
    objects.push({
      ...object,
      ownerCategory,
      extensionClass: object.extensionName ? 'EXTENSION_MANAGED' : 'APPLICATION_MANAGED',
      privileges: canonicalPrivilegeEntries(semanticEntries)
    });
  }
  objects.sort((left, right) => semanticObjectKey(left).localeCompare(semanticObjectKey(right)));
  const defaultPrivileges = [];
  for (const row of rawFacts?.defaultPrivileges || []) {
    const object = { extensionName: '', objectType: 'DEFAULT', objectIdentity: `${row.schema_name || '$GLOBAL'}|${row.default_acl_type || ''}` };
    const ownerCategory = principalCategory(String(row.owner_principal || ''), object, context, membershipCarriers);
    const granteeCategory = principalCategory(String(row.grantee_principal || ''), object, context, membershipCarriers);
    const grantorCategory = principalCategory(String(row.grantor_principal || ''), object, context, membershipCarriers);
    if ([ownerCategory, granteeCategory, grantorCategory].includes('OTHER_NAMED_PRINCIPAL')) blockers.push(`DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:${object.objectIdentity}`);
    defaultPrivileges.push({
      schemaName: String(row.schema_name || ''),
      defaultAclType: String(row.default_acl_type || ''),
      ownerCategory,
      granteeCategory,
      privilege: String(row.privilege_type || '').toUpperCase(),
      grantOption: normalizeBoolean(row.grant_option)
    });
  }
  defaultPrivileges.sort((left, right) => canonicalAclJson(left).localeCompare(canonicalAclJson(right)));
  const readonlyMemberships = [...reachable.entries()].map(([principal, fact]) => ({
    roleCategory: principalCategory(principal, null, context, membershipCarriers),
    depth: fact.depth,
    effective: fact.effective,
    adminOption: fact.adminOption,
    inheritOption: fact.inheritOption,
    setOption: fact.setOption
  })).sort((left, right) => canonicalAclJson(left).localeCompare(canonicalAclJson(right)));
  const semanticCore = canonicalValue({ modelVersion, objects, defaultPrivileges, readonlyMemberships });
  return canonicalValue({
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers: [...new Set(blockers)].sort(),
    ...semanticCore,
    fingerprint: aclSemanticSha256(semanticCore),
    audit: {
      objectCount: objects.length,
      nullAclCount: (rawFacts?.objects || []).filter(row => normalizeBoolean(row.acl_is_null)).length,
      explicitAclCount: (rawFacts?.objects || []).filter(row => !normalizeBoolean(row.acl_is_null)).length,
      rawPrincipalNamesPersisted: false
    }
  });
}

function privilegeMap(snapshot) {
  const result = new Map();
  for (const object of snapshot?.objects || []) {
    for (const privilege of object.privileges || []) {
      result.set(`${semanticObjectKey(object)}|${privilege.granteeCategory}|${privilege.privilege}`, privilege);
    }
  }
  return result;
}

export function compareAclSemanticSnapshots(expected, observed) {
  const blockers = [];
  if (expected?.modelVersion !== ACL_SEMANTIC_MODEL_VERSION || observed?.modelVersion !== ACL_SEMANTIC_MODEL_VERSION
      || expected?.modelVersion !== observed?.modelVersion) blockers.push('ACL_MODEL_VERSION_MISMATCH');
  if (expected?.status !== 'PASS') blockers.push('EXPECTED_ACL_SNAPSHOT_BLOCKED');
  if (observed?.status !== 'PASS') blockers.push('OBSERVED_ACL_SNAPSHOT_BLOCKED');
  blockers.push(...(expected?.blockers || []).map(value => `EXPECTED:${value}`));
  blockers.push(...(observed?.blockers || []).map(value => `OBSERVED:${value}`));
  if (blockers.length) return canonicalValue({ status: 'BLOCKED', blockers: [...new Set(blockers)].sort(), differences: [] });
  const expectedCore = { modelVersion: expected.modelVersion, objects: expected.objects, defaultPrivileges: expected.defaultPrivileges, readonlyMemberships: expected.readonlyMemberships };
  const observedCore = { modelVersion: observed.modelVersion, objects: observed.objects, defaultPrivileges: observed.defaultPrivileges, readonlyMemberships: observed.readonlyMemberships };
  if (canonicalAclJson(expectedCore) === canonicalAclJson(observedCore)) {
    return canonicalValue({ status: 'SEMANTIC_MATCH', blockers: [], differences: [], expectedFingerprint: expected.fingerprint, observedFingerprint: observed.fingerprint });
  }
  const expectedPrivileges = privilegeMap(expected);
  const observedPrivileges = privilegeMap(observed);
  const differences = [];
  for (const [key, value] of observedPrivileges) {
    const prior = expectedPrivileges.get(key);
    if (!prior) differences.push({ type: 'PRIVILEGE_ADDED', key, dangerous: value.granteeCategory === 'PUBLIC' || value.granteeCategory === 'EXPECTED_READONLY_ROLE' && WRITE_PRIVILEGES.has(value.privilege) });
    else if (!prior.grantOption && value.grantOption) differences.push({ type: 'GRANT_OPTION_ADDED', key, dangerous: true });
  }
  for (const key of expectedPrivileges.keys()) if (!observedPrivileges.has(key)) differences.push({ type: 'PRIVILEGE_REMOVED', key, dangerous: false });
  if (canonicalAclJson(expected.defaultPrivileges) !== canonicalAclJson(observed.defaultPrivileges)) differences.push({ type: 'DEFAULT_PRIVILEGES_CHANGED', dangerous: true });
  if (canonicalAclJson(expected.readonlyMemberships) !== canonicalAclJson(observed.readonlyMemberships)) differences.push({ type: 'READONLY_MEMBERSHIP_CHANGED', dangerous: true });
  const expectedObjects = new Map(expected.objects.map(object => [semanticObjectKey(object), object]));
  const observedObjects = new Map(observed.objects.map(object => [semanticObjectKey(object), object]));
  for (const key of expectedObjects.keys()) if (!observedObjects.has(key)) differences.push({ type: 'ACL_OBJECT_MISSING', key, dangerous: true });
  for (const key of observedObjects.keys()) if (!expectedObjects.has(key)) differences.push({ type: 'ACL_OBJECT_UNEXPECTED', key, dangerous: true });
  return canonicalValue({
    status: 'SEMANTIC_MISMATCH',
    blockers: [],
    differences,
    expectedFingerprint: expected.fingerprint,
    observedFingerprint: observed.fingerprint
  });
}

export function combineStructuralAndAclGate(nonAclStructuralStatus, aclSemanticStatus) {
  if (nonAclStructuralStatus === 'BLOCKED' || aclSemanticStatus === 'BLOCKED') return 'BLOCKED';
  if (nonAclStructuralStatus !== 'PASS' || aclSemanticStatus !== 'SEMANTIC_MATCH') return 'MISMATCH';
  return 'PASS';
}

export async function collectAclSemanticFacts(client) {
  const objects = (await client.query(ACL_SEMANTIC_QUERIES.objects)).rows;
  const entries = (await client.query(ACL_SEMANTIC_QUERIES.entries)).rows;
  const defaultPrivileges = (await client.query(ACL_SEMANTIC_QUERIES.defaultPrivileges)).rows;
  const memberships = (await client.query(ACL_SEMANTIC_QUERIES.memberships)).rows;
  return Object.freeze({ defaultsExpanded: true, objects, entries, defaultPrivileges, memberships });
}
