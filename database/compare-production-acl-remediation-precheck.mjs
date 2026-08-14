import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ACL_SEMANTIC_QUERIES,
  buildAclSemanticSnapshot,
  collectAclSemanticFacts,
  compareAclSemanticSnapshots
} from './acl-semantic-model.mjs';
import { authenticatedTlsConfig, productionConnectionConfig } from './compare-production-catalog.mjs';
import {
  EXPECTED_PRODUCTION_DATABASE,
  EXPECTED_PRODUCTION_READONLY_ROLE,
  SEMANTIC_LIVE_QUERY_SURFACE,
  validateAclSemanticBaseline,
  validateSemanticQueryScope
} from './compare-production-starting-baseline-semantic.mjs';
import {
  compareExactStartingLedger,
  normalizeStartingCatalog,
  validateStartingBaselineProvenance
} from './compare-production-starting-baseline.mjs';
import {
  EXPECTED_OWNER_DEFAULT_ACL_FACTS,
  loadOwnerProofRepositoryInputs,
  validateApplicationObjectSetArtifact
} from './exact-application-object-owner-proof.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import { validateAclRemediationPlanIntegrity } from './production-acl-remediation-plan.mjs';
import { compareStructuralCatalogs, STRUCTURAL_CATALOG_QUERIES } from './rehearse-structural-schema-parity.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const STRUCTURAL_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const STRUCTURAL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const ACL_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json');
const ACL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.sha256');
const READINESS_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-final-readiness.expected.json');
const PLAN_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-acl-remediation-plan.expected.sha256');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ACL_REMEDIATION_PRECHECK_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ACL_REMEDIATION_PRECHECK_EVIDENCE.sha256');
const FAILURE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ACL_REMEDIATION_PRECHECK_FAILURE.json');
const FAILURE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_ACL_REMEDIATION_PRECHECK_FAILURE.sha256');

const PROVENANCE_PATHS = Object.freeze([
  'database/compare-production-acl-remediation-precheck.mjs',
  'database/production-acl-remediation-plan.expected.json',
  'database/production-acl-remediation-plan.expected.sha256',
  'database/production-acl-remediation-plan.mjs',
  'database/production-0001-0008-structural-baseline.json',
  'database/production-0001-0008-structural-baseline.sha256',
  'database/production-0001-0008-acl-semantic-baseline.json',
  'database/production-0001-0008-acl-semantic-baseline.sha256',
  'database/production-0001-0008-application-owner-object-set.json',
  'database/production-0001-0008-application-owner-object-set.sha256',
  'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_EVIDENCE.schema.json',
  'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_FAILURE.schema.json'
]);

export const ACL_REMEDIATION_PRECHECK_CONFIRMATION = 'PRECHECK_BANKE_PRODUCTION_ACL_REMEDIATION';
export const ACL_REMEDIATION_PRECHECK_MODEL_VERSION = 'bankeban-production-acl-remediation-precheck-v1';
export const EXPECTED_OBJECT_OWNER_ROLE = 'neondb_owner';
export const EXPECTED_PLATFORM_ROLE = 'cloud_admin';
export const EXPECTED_RUNTIME_ROLES = Object.freeze(['banke_api_production']);
export const ACL_REMEDIATION_PRECHECK_SCHEMA_VERSION = 1;

export const ACL_REMEDIATION_PRECHECK_STAGES = Object.freeze([
  'PRE_CONNECT_GUARD', 'QUERY_ALLOWLIST', 'REPOSITORY_PROVENANCE', 'ARTIFACT_PROVENANCE',
  'CA_LOAD', 'TLS_CONFIG', 'TLS_CONNECT', 'IDENTITY_GUARD', 'READER_ROLE_BOUNDARY_GUARD',
  'READ_ONLY_TRANSACTION', 'LEDGER', 'STRUCTURAL_COLLECTOR', 'DEFAULT_ACL_COLLECTOR',
  'PRINCIPAL_INVENTORY', 'TARGET_ROLE_BOUNDARY', 'ROLE_MEMBERSHIP', 'OPERATOR_CAPABILITY',
  'CURRENT_OBJECT_ACL', 'ACL_SEMANTIC_COLLECTOR', 'NORMALIZATION', 'SAFE_TARGET_EVALUATION',
  'CLEANUP', 'EVIDENCE_SANITIZATION', 'EVIDENCE_WRITE_HASH', 'UNKNOWN'
]);

const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i;
const ALLOWED_RELATIONS = new Set([
  'public.schema_migrations', 'pg_catalog.pg_database', 'pg_catalog.pg_namespace', 'pg_catalog.pg_class',
  'pg_catalog.pg_attribute', 'pg_catalog.pg_type', 'pg_catalog.pg_attrdef', 'pg_catalog.pg_constraint',
  'pg_catalog.pg_index', 'pg_catalog.pg_proc', 'pg_catalog.pg_language', 'pg_catalog.pg_depend',
  'pg_catalog.pg_extension', 'pg_catalog.pg_trigger', 'pg_catalog.pg_sequence', 'pg_catalog.pg_policies',
  'pg_catalog.pg_default_acl', 'pg_catalog.pg_auth_members', 'pg_catalog.pg_roles', 'pg_catalog.aclexplode'
]);
const ALLOWED_CTES = new Set(['expected', 'candidate', 'outbound', 'inbound', 'owned', 'acl_surface', 'modeled_objects', 'object']);
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const FORBIDDEN_EVIDENCE_KEY = /^(?:raw.*(?:oid|principal|acl)|principal.*(?:name|oid)|role.*name|user.*name|password|secret|credential|connectionString|databaseUrl|url|hostname|host|endpoint|cookie|authorization|databaseName|caBundle)$/i;
const FORBIDDEN_EVIDENCE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;
const SAFE_EXTERNAL_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

const DEFAULT_ACL_CONTEXT_SQL = `
  SELECT default_acl.defaclobjtype::text AS default_acl_type,
         default_acl.defaclrole::text AS owner_ref,
         acl.grantee::text AS grantee_ref,
         acl.grantor::text AS grantor_ref,
         acl.privilege_type,
         acl.is_grantable AS grant_option
    FROM pg_catalog.pg_default_acl AS default_acl
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
   WHERE namespace.nspname = 'public'
     AND default_acl.defaclobjtype IN ('r', 'S')
   ORDER BY default_acl.defaclobjtype, acl.privilege_type, acl.is_grantable`;

const PRINCIPAL_INVENTORY_SQL = `
  WITH expected(category, principal) AS (
    VALUES ('READER', $1::text), ('OBJECT_OWNER', $2::text), ('PLATFORM', $3::text),
           ('ACL_OPERATOR', $4::text), ('RUNTIME', $5::text)
  )
  SELECT expected.category,
         count(role.oid)::integer AS match_count,
         min(role.oid)::text AS role_ref,
         bool_and(NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole
           AND NOT role.rolreplication AND NOT role.rolbypassrls) AS dangerous_attributes_clear,
         bool_and(role.rolcanlogin) AS login_enabled
    FROM expected
    LEFT JOIN pg_catalog.pg_roles AS role ON role.rolname = expected.principal
   GROUP BY expected.category
   ORDER BY expected.category`;

const TARGET_ROLE_CONTEXT_SQL = `
  WITH RECURSIVE candidate AS (
    SELECT role.oid, role.rolname, role.rolsuper, role.rolcreatedb, role.rolcreaterole,
           role.rolreplication, role.rolbypassrls, role.rolcanlogin, role.rolinherit
      FROM pg_catalog.pg_roles AS role
     WHERE role.oid = $1::oid
  ), outbound(role_ref, effective) AS (
    SELECT membership.roleid, membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM pg_catalog.pg_auth_members AS membership CROSS JOIN candidate
     WHERE membership.member = candidate.oid
    UNION
    SELECT membership.roleid, outbound.effective OR membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM outbound JOIN pg_catalog.pg_auth_members AS membership ON membership.member = outbound.role_ref
  ), inbound(role_ref, effective) AS (
    SELECT membership.member, membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM pg_catalog.pg_auth_members AS membership CROSS JOIN candidate
     WHERE membership.roleid = candidate.oid
    UNION
    SELECT membership.member, inbound.effective OR membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM inbound JOIN pg_catalog.pg_auth_members AS membership ON membership.roleid = inbound.role_ref
  ), owned AS (
    SELECT database.oid FROM pg_catalog.pg_database AS database CROSS JOIN candidate WHERE database.datdba = candidate.oid
    UNION ALL SELECT namespace.oid FROM pg_catalog.pg_namespace AS namespace CROSS JOIN candidate WHERE namespace.nspowner = candidate.oid
    UNION ALL SELECT relation.oid FROM pg_catalog.pg_class AS relation CROSS JOIN candidate WHERE relation.relowner = candidate.oid
    UNION ALL SELECT procedure.oid FROM pg_catalog.pg_proc AS procedure CROSS JOIN candidate WHERE procedure.proowner = candidate.oid
  )
  SELECT candidate.rolname AS target_principal,
         candidate.rolsuper, candidate.rolcreatedb, candidate.rolcreaterole,
         candidate.rolreplication, candidate.rolbypassrls, candidate.rolcanlogin, candidate.rolinherit,
         (SELECT count(*)::integer FROM outbound) AS outbound_membership_count,
         (SELECT count(*)::integer FROM outbound WHERE effective) AS effective_outbound_membership_count,
         (SELECT count(*)::integer FROM inbound) AS inbound_membership_count,
         (SELECT count(*)::integer FROM inbound WHERE effective) AS effective_inbound_membership_count,
         (SELECT count(*)::integer FROM owned) AS owned_object_count
    FROM candidate`;

const OPERATOR_CAPABILITY_SQL = `
  WITH RECURSIVE outbound(role_ref, can_set) AS (
    SELECT membership.roleid, membership.set_option
      FROM pg_catalog.pg_auth_members AS membership
     WHERE membership.member = $1::oid
    UNION
    SELECT membership.roleid, outbound.can_set AND membership.set_option
      FROM outbound JOIN pg_catalog.pg_auth_members AS membership ON membership.member = outbound.role_ref
  )
  SELECT ($1::oid = $2::oid OR EXISTS (SELECT 1 FROM outbound WHERE role_ref = $2::oid AND can_set)) AS can_act_for_default_owner`;

const TARGET_ACL_SURFACE_SQL = `
  WITH acl_surface AS (
    SELECT 'DATABASE'::text AS object_type, 'DATABASE|CURRENT_DATABASE'::text AS object_identity,
           acl.privilege_type, acl.is_grantable AS grant_option
      FROM pg_catalog.pg_database AS database
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(database.datacl, '{}'::aclitem[])) AS acl
     WHERE database.datname = pg_catalog.current_database() AND acl.grantee = $1::oid
    UNION ALL
    SELECT 'SCHEMA', 'SCHEMA|' || namespace.nspname, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_namespace AS namespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(namespace.nspacl, '{}'::aclitem[])) AS acl
     WHERE namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema' AND acl.grantee = $1::oid
    UNION ALL
    SELECT CASE relation.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'RELATION' END,
           CASE relation.relkind WHEN 'S' THEN 'SEQUENCE|' ELSE 'RELATION|' END || namespace.nspname || '.' || relation.relname,
           acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, '{}'::aclitem[])) AS acl
     WHERE namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema'
       AND relation.relkind IN ('r', 'p', 'S') AND acl.grantee = $1::oid
    UNION ALL
    SELECT 'FUNCTION', 'FUNCTION|' || namespace.nspname || '.' || procedure.proname || '('
           || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')',
           acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl, '{}'::aclitem[])) AS acl
     WHERE namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema' AND acl.grantee = $1::oid
  )
  SELECT object_type, object_identity, privilege_type, grant_option
    FROM acl_surface
   ORDER BY object_type, object_identity, privilege_type, grant_option`;

export const ACL_REMEDIATION_PRECHECK_QUERY_SURFACE = Object.freeze({
  identity: SEMANTIC_LIVE_QUERY_SURFACE.identity,
  readerRoleBoundary: SEMANTIC_LIVE_QUERY_SURFACE.roleBoundary,
  transactionReadOnly: SEMANTIC_LIVE_QUERY_SURFACE.transactionReadOnly,
  ledger: SEMANTIC_LIVE_QUERY_SURFACE.ledger,
  structural: STRUCTURAL_CATALOG_QUERIES,
  aclSemantic: ACL_SEMANTIC_QUERIES,
  defaultAclContext: DEFAULT_ACL_CONTEXT_SQL,
  principalInventory: PRINCIPAL_INVENTORY_SQL,
  targetRoleContext: TARGET_ROLE_CONTEXT_SQL,
  operatorCapability: OPERATOR_CAPABILITY_SQL,
  targetAclSurface: TARGET_ACL_SURFACE_SQL
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function bool(value) { return value === true || value === 't' || value === 'true'; }
function unique(values) { return [...new Set(values.map(String))].sort(); }
function countBy(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())].sort());
}

function safeIdentifier(value) { return SAFE_IDENTIFIER.test(String(value || '')); }

export function aclRemediationPrecheckConnectionConfig(env = process.env) {
  const config = productionConnectionConfig(env, {
    confirmation: ACL_REMEDIATION_PRECHECK_CONFIRMATION,
    confirmationError: 'PRODUCTION_ACL_PRECHECK_CONFIRMATION_REQUIRED'
  });
  if (config.expectedDatabase !== EXPECTED_PRODUCTION_DATABASE || config.expectedRole !== EXPECTED_PRODUCTION_READONLY_ROLE) {
    throw new Error('PRODUCTION_ACL_PRECHECK_TARGET_IDENTITY_BLOCKED');
  }
  const objectOwnerRole = String(env.BANK_PRODUCTION_OBJECT_OWNER_ROLE || '').trim();
  const platformRole = String(env.BANK_PRODUCTION_PLATFORM_ROLE || '').trim();
  const runtimeRoles = unique(String(env.BANK_PRODUCTION_RUNTIME_ROLES || '').split(',').map(value => value.trim()).filter(Boolean));
  const aclOperatorRole = String(env.BANK_PRODUCTION_ACL_OPERATOR_ROLE || '').trim();
  const authorizedPlanSha256 = String(env.BANK_PRODUCTION_ACL_PLAN_SHA256 || '').trim();
  if (objectOwnerRole !== EXPECTED_OBJECT_OWNER_ROLE || platformRole !== EXPECTED_PLATFORM_ROLE
      || canonicalJson(runtimeRoles) !== canonicalJson(EXPECTED_RUNTIME_ROLES)
      || !safeIdentifier(aclOperatorRole) || !/^[a-f0-9]{64}$/.test(authorizedPlanSha256)) {
    throw new Error('PRODUCTION_ACL_PRECHECK_PRINCIPAL_INVENTORY_INPUT_BLOCKED');
  }
  if ([EXPECTED_PRODUCTION_READONLY_ROLE, ...EXPECTED_RUNTIME_ROLES].includes(aclOperatorRole)) {
    throw new Error('PRODUCTION_ACL_PRECHECK_OPERATOR_CLASS_BLOCKED');
  }
  return Object.freeze({
    ...config,
    effectiveTlsMode: 'verify-full',
    objectOwnerRole,
    platformRole,
    runtimeRoles: Object.freeze(runtimeRoles),
    aclOperatorRole,
    authorizedPlanSha256
  });
}

function inspectQuery(name, sql, failures) {
  const text = String(sql || '').trim();
  const executable = text.replace(/'(?:''|[^'])*'/g, "''");
  if (!/^(?:SELECT|WITH)\b/i.test(text)) failures.push(`ACL_PRECHECK_QUERY_NOT_SELECT_ONLY:${name}`);
  if (FORBIDDEN_SQL.test(executable)) failures.push(`ACL_PRECHECK_QUERY_MUTATION_TOKEN:${name}`);
  for (const match of executable.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?([A-Za-z0-9_."]+)/gi)) {
    const relation = match[1].replaceAll('"', '').toLowerCase();
    if (!ALLOWED_RELATIONS.has(relation) && !ALLOWED_CTES.has(relation)) failures.push(`ACL_PRECHECK_QUERY_SOURCE_BLOCKED:${name}:${relation}`);
  }
}

export function validateAclRemediationPrecheckQueryScope(surface = ACL_REMEDIATION_PRECHECK_QUERY_SURFACE) {
  const failures = [];
  if (validateSemanticQueryScope({
    identity: surface.identity,
    roleBoundary: surface.readerRoleBoundary,
    transactionReadOnly: surface.transactionReadOnly,
    ledger: surface.ledger,
    structural: surface.structural,
    aclSemantic: surface.aclSemantic
  }).status !== 'PASS') failures.push('REUSED_SEMANTIC_QUERY_SCOPE_BLOCKED');
  const expectedKeys = ['aclSemantic', 'defaultAclContext', 'identity', 'ledger', 'operatorCapability', 'principalInventory',
    'readerRoleBoundary', 'structural', 'targetAclSurface', 'targetRoleContext', 'transactionReadOnly'];
  if (canonicalJson(Object.keys(surface || {}).sort()) !== canonicalJson(expectedKeys)) failures.push('ACL_PRECHECK_QUERY_SECTION_SET_MISMATCH');
  for (const key of ['identity', 'readerRoleBoundary', 'transactionReadOnly', 'ledger', 'defaultAclContext',
    'principalInventory', 'targetRoleContext', 'operatorCapability', 'targetAclSurface']) inspectQuery(key, surface[key], failures);
  for (const [section, sql] of Object.entries(surface.structural || {})) inspectQuery(`structural.${section}`, sql, failures);
  for (const [section, sql] of Object.entries(surface.aclSemantic || {})) inspectQuery(`acl.${section}`, sql, failures);
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: unique(failures) });
}

function gitOutput(args, execFileSyncImpl = execFileSync) {
  return execFileSyncImpl('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function validateAclRemediationPrecheckRepositoryProvenance(env = process.env, { execFileSyncImpl = execFileSync } = {}) {
  const failures = [];
  const authorizedCommit = String(env.BANK_PRODUCTION_EVIDENCE_COMMIT_SHA || '').trim();
  let head = '';
  try {
    head = gitOutput(['rev-parse', 'HEAD'], execFileSyncImpl);
    if (!/^[a-f0-9]{40}$/.test(head)) failures.push('ACL_PRECHECK_HEAD_INVALID');
    if (authorizedCommit !== head) failures.push('ACL_PRECHECK_AUTHORIZED_COMMIT_MISMATCH');
    if (gitOutput(['branch', '--show-current'], execFileSyncImpl) !== 'main') failures.push('ACL_PRECHECK_BRANCH_NOT_MAIN');
    if (gitOutput(['rev-parse', 'origin/main'], execFileSyncImpl) !== head) failures.push('ACL_PRECHECK_ORIGIN_NOT_AT_HEAD');
    if (gitOutput(['status', '--porcelain', '--untracked-files=no'], execFileSyncImpl)) failures.push('ACL_PRECHECK_TRACKED_WORKTREE_NOT_CLEAN');
    const tracked = gitOutput(['ls-files', '--error-unmatch', '--', ...PROVENANCE_PATHS], execFileSyncImpl).split(/\r?\n/).filter(Boolean);
    if (tracked.length !== PROVENANCE_PATHS.length) failures.push('ACL_PRECHECK_PROVENANCE_FILE_NOT_TRACKED');
  } catch { failures.push('ACL_PRECHECK_REPOSITORY_PROVENANCE_COMMAND_FAILED'); }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: unique(failures), commitSha: /^[a-f0-9]{40}$/.test(head) ? head : null });
}

export async function loadPrecheckArtifacts() {
  const [structuralText, structuralHash, aclText, aclHash, readinessText, planHashText, ownerInputs, planIntegrity] = await Promise.all([
    readFile(STRUCTURAL_PATH, 'utf8'), readFile(STRUCTURAL_HASH_PATH, 'utf8'),
    readFile(ACL_PATH, 'utf8'), readFile(ACL_HASH_PATH, 'utf8'), readFile(READINESS_PATH, 'utf8'),
    readFile(PLAN_HASH_PATH, 'utf8'), loadOwnerProofRepositoryInputs(), validateAclRemediationPlanIntegrity()
  ]);
  const readiness = JSON.parse(readinessText);
  const structural = validateStartingBaselineProvenance({ artifactText: structuralText, hashText: structuralHash, readiness, tracked: true });
  const acl = validateAclSemanticBaseline({ text: aclText, hashText: aclHash, tracked: true });
  const owner = validateApplicationObjectSetArtifact(ownerInputs.artifact, ownerInputs.structuralBaseline, ownerInputs.aclBaseline, ownerInputs.companionSha256);
  const planCompanion = String(planHashText).trim().split(/\s+/)[0];
  if (structural.status !== 'PASS' || acl.status !== 'PASS' || owner.status !== 'PASS' || planIntegrity.status !== 'PASS'
      || planCompanion !== planIntegrity.planSha256) throw new Error('ACL_PRECHECK_ARTIFACT_PROVENANCE_BLOCKED');
  return Object.freeze({ structural, acl, ownerInputs, planSha256: planIntegrity.planSha256 });
}

function relationObjectKeys(structuralArtifact) {
  return new Set((structuralArtifact?.catalog?.relations || []).map(row => {
    const type = row.relation_kind === 'S' ? 'SEQUENCE' : 'RELATION';
    return `${type}|${row.schema_name}.${row.relation_name}`;
  }));
}

function defaultAclFact(row) {
  const type = row.default_acl_type === 'r' ? 'RELATION' : row.default_acl_type === 'S' ? 'SEQUENCE' : 'UNSUPPORTED';
  return `PUBLIC_SCHEMA|${type}|${String(row.privilege_type || '').toUpperCase()}|${bool(row.grant_option)}`;
}

function replaceTargetPrincipal(rawFacts, targetPrincipal) {
  const replace = value => value === targetPrincipal ? '$REMEDIATION_TARGET' : value;
  return {
    defaultsExpanded: rawFacts.defaultsExpanded,
    objects: rawFacts.objects.map(row => ({ ...row, owner_principal: replace(row.owner_principal) })),
    entries: rawFacts.entries.map(row => ({ ...row, grantee_principal: replace(row.grantee_principal), grantor_principal: replace(row.grantor_principal) })),
    defaultPrivileges: rawFacts.defaultPrivileges.map(row => ({ ...row,
      owner_principal: replace(row.owner_principal), grantee_principal: replace(row.grantee_principal), grantor_principal: replace(row.grantor_principal) })),
    memberships: rawFacts.memberships.map(row => ({ ...row,
      member_principal: replace(row.member_principal), granted_role_principal: replace(row.granted_role_principal) }))
  };
}

function inventoryMap(rows) { return new Map((rows || []).map(row => [String(row.category), row])); }

function withoutAcl(catalog) {
  return canonicalValue({
    ...catalog,
    schemas: (catalog?.schemas || []).map(({ acl: _acl, ...row }) => row),
    relations: (catalog?.relations || []).map(({ acl: _acl, ...row }) => row),
    functions: (catalog?.functions || []).map(({ acl: _acl, ...row }) => row)
  });
}

export function evaluateAclRemediationPrecheck({ artifacts, config, collection, sourceCommit }) {
  const blockers = [];
  if (collection?.ledgerResult?.status !== 'PASS') blockers.push('EXACT_0001_0008_LEDGER_AND_CHECKSUM_BLOCKED');
  const inventory = inventoryMap(collection.principalInventory);
  const requiredCategories = ['READER', 'OBJECT_OWNER', 'PLATFORM', 'ACL_OPERATOR', 'RUNTIME'];
  if (canonicalJson([...inventory.keys()].sort()) !== canonicalJson([...requiredCategories].sort())
      || requiredCategories.some(category => Number(inventory.get(category)?.match_count) !== 1 || !inventory.get(category)?.role_ref)) {
    blockers.push('RUNTIME_PRINCIPAL_INVENTORY_INCOMPLETE');
  }
  const runtimeInventoryResult = blockers.includes('RUNTIME_PRINCIPAL_INVENTORY_INCOMPLETE') ? 'BLOCKED' : 'PASS';
  const ref = category => String(inventory.get(category)?.role_ref || '');
  const reviewedRefs = unique(requiredCategories.map(ref).filter(Boolean));

  const defaultRows = collection.defaultAclContext || [];
  const ownerRefs = unique(defaultRows.map(row => row.owner_ref));
  const granteeRefs = unique(defaultRows.map(row => row.grantee_ref));
  const grantorRefs = unique(defaultRows.map(row => row.grantor_ref));
  const facts = defaultRows.map(defaultAclFact).sort();
  const exactDefaultFacts = canonicalJson(facts) === canonicalJson(EXPECTED_OWNER_DEFAULT_ACL_FACTS);
  const ownerRef = ownerRefs.length === 1 ? ownerRefs[0] : '';
  const targetRef = granteeRefs.length === 1 ? granteeRefs[0] : '';
  const grantorRef = grantorRefs.length === 1 ? grantorRefs[0] : '';
  const ownerCategory = ownerRef === ref('OBJECT_OWNER') ? 'EXPECTED_OBJECT_OWNER'
    : ownerRef === ref('PLATFORM') ? 'SYSTEM_PLATFORM_MANAGED' : 'UNCLASSIFIED';
  if (!exactDefaultFacts || ownerRefs.length !== 1 || granteeRefs.length !== 1 || grantorRefs.length !== 1
      || targetRef === '0' || ownerCategory === 'UNCLASSIFIED' || grantorRef !== ownerRef) blockers.push('DEFAULT_ACL_OWNER_GRANTEE_CLASSIFICATION_BLOCKED');
  if (reviewedRefs.includes(targetRef)) blockers.push('DEFAULT_ACL_GRANTEE_MATCHES_REVIEWED_PRINCIPAL');

  const target = collection.targetRoleContext || {};
  const dangerous = ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].filter(key => target[key] !== false && target[key] !== 'f').length;
  const membershipCounts = ['outbound_membership_count','effective_outbound_membership_count','inbound_membership_count','effective_inbound_membership_count']
    .map(key => Number(target[key] ?? -1));
  const roleMembershipResult = membershipCounts.every(value => value === 0) ? 'PASS' : 'BLOCKED';
  if (!target.target_principal || dangerous !== 0 || bool(target.rolcanlogin) || bool(target.rolinherit)
      || roleMembershipResult !== 'PASS' || Number(target.owned_object_count ?? -1) !== 0) blockers.push('TARGET_ROLE_BOUNDARY_OR_MEMBERSHIP_BLOCKED');

  const operator = inventory.get('ACL_OPERATOR') || {};
  const operatorSafe = bool(operator.dangerous_attributes_clear);
  const operatorCapability = bool(collection.operatorCapability?.can_act_for_default_owner);
  if (!operatorSafe || !operatorCapability || ref('ACL_OPERATOR') === targetRef) blockers.push('ACL_OPERATOR_CAPABILITY_BLOCKED');

  const expectedObjectKeys = relationObjectKeys(artifacts.structural.artifact);
  const aclSurface = (collection.targetAclSurface || []).map(row => ({
    objectType: String(row.object_type || ''),
    objectKey: String(row.object_identity || ''),
    privilege: String(row.privilege_type || '').toUpperCase(),
    grantOption: bool(row.grant_option)
  }));
  const candidates = aclSurface.filter(row => ['RELATION','SEQUENCE'].includes(row.objectType) && expectedObjectKeys.has(row.objectKey));
  const unsupported = aclSurface.filter(row => !['RELATION','SEQUENCE'].includes(row.objectType) || !expectedObjectKeys.has(row.objectKey));
  if (unsupported.length) blockers.push('TARGET_HAS_NON_REMEDIABLE_ACL');

  const rawCatalog = collection.rawCatalog;
  const migrationOwner = rawCatalog?.schemas?.find(row => row.schema_name === 'app_private')?.owner_name;
  if (!migrationOwner || migrationOwner !== config.objectOwnerRole) blockers.push('APPLICATION_OBJECT_OWNER_INPUT_MISMATCH');
  const observedStructural = migrationOwner ? normalizeStartingCatalog(rawCatalog, migrationOwner) : {};
  const structuralComparison = compareStructuralCatalogs(
    withoutAcl(observedStructural),
    withoutAcl(artifacts.structural.artifact.catalog)
  );
  const structuralNonAclResult = structuralComparison.status === 'PASS' ? 'PASS' : 'BLOCKED';
  if (structuralNonAclResult !== 'PASS') blockers.push('STRUCTURAL_OBJECT_ALLOWLIST_MISMATCH');

  let semanticComparison = { status: 'BLOCKED', blockers: ['TARGET_PRINCIPAL_UNAVAILABLE'], differences: [] };
  if (target.target_principal && migrationOwner) {
    const remapped = replaceTargetPrincipal(collection.aclFacts, target.target_principal);
    const observedAcl = buildAclSemanticSnapshot(remapped, {
      expectedOwners: [migrationOwner, 'pg_database_owner'],
      expectedReadonlyRole: EXPECTED_PRODUCTION_READONLY_ROLE,
      expectedRuntimeRoles: config.runtimeRoles,
      extensionOwners: { pgcrypto: [config.platformRole] },
      systemManagedPrincipals: [config.platformRole, '$REMEDIATION_TARGET']
    });
    semanticComparison = compareAclSemanticSnapshots(artifacts.acl.artifact.snapshot, observedAcl);
  }
  const allowedPrivilegeKeys = new Set(candidates.map(row => `${row.objectType}|${row.objectKey.split('|').slice(1).join('|')}|SYSTEM_PLATFORM_MANAGED|${row.privilege}`));
  const semanticDifferences = semanticComparison.differences || [];
  const semanticDifferenceAttributable = semanticComparison.status === 'SEMANTIC_MISMATCH'
    && !(semanticComparison.blockers || []).length
    && semanticDifferences.every(difference => difference.type === 'DEFAULT_PRIVILEGES_CHANGED'
      || difference.type === 'PRIVILEGE_ADDED' && allowedPrivilegeKeys.has(difference.key));
  if (!semanticDifferenceAttributable) blockers.push('ACL_SEMANTIC_DIFFERENCE_NOT_EXACTLY_ATTRIBUTABLE');

  const currentObjectAclResult = unsupported.length === 0 && structuralNonAclResult === 'PASS' && semanticDifferenceAttributable ? 'PASS' : 'BLOCKED';
  const defaultAclResult = blockers.some(code => ['DEFAULT_ACL_OWNER_GRANTEE_CLASSIFICATION_BLOCKED','DEFAULT_ACL_GRANTEE_MATCHES_REVIEWED_PRINCIPAL'].includes(code)) ? 'BLOCKED' : 'PASS';
  const targetBoundaryResult = blockers.includes('TARGET_ROLE_BOUNDARY_OR_MEMBERSHIP_BLOCKED') ? 'BLOCKED' : 'PASS';
  const exactSafe = blockers.length === 0;
  const remediationObjectKeys = unique(candidates.map(row => row.objectKey));
  const targetProofFingerprint = sha256(canonicalJson({
    modelVersion: ACL_REMEDIATION_PRECHECK_MODEL_VERSION,
    ownerCategory,
    targetCategory: exactSafe ? 'ISOLATED_NONLOGIN_NO_MEMBERSHIP_NO_OWNERSHIP' : 'UNCLASSIFIED',
    facts,
    currentObjectAcl: candidates,
    remediationObjectKeys,
    sourceCommit,
    planSha256: artifacts.planSha256
  }));

  return canonicalValue({
    schemaVersion: ACL_REMEDIATION_PRECHECK_SCHEMA_VERSION,
    modelVersion: ACL_REMEDIATION_PRECHECK_MODEL_VERSION,
    sprintNumberingCappedAt: 65,
    generatedAt: new Date().toISOString(),
    repositoryCommitSha: sourceCommit,
    planSha256: artifacts.planSha256,
    identityResult: 'PASS',
    tlsVerification: 'VERIFY_FULL_PASS',
    readerRoleBoundaryResult: 'PASS',
    transactionReadOnlyResult: 'PASS',
    ledgerResult: collection.ledgerResult,
    structuralObjectAllowlistResult: structuralNonAclResult,
    defaultAclClassification: {
      result: defaultAclResult,
      ownerCategory,
      granteeCategory: exactSafe ? 'ISOLATED_NONLOGIN_NO_MEMBERSHIP_NO_OWNERSHIP' : 'UNCLASSIFIED',
      grantorMatchesOwner: grantorRef === ownerRef,
      relationFactCount: facts.filter(value => value.includes('|RELATION|')).length,
      sequenceFactCount: facts.filter(value => value.includes('|SEQUENCE|')).length,
      grantOptionTrueCount: facts.filter(value => value.endsWith('|true')).length,
      expectedBaselineDefaultPrivilegeCount: artifacts.acl.artifact.snapshot.defaultPrivileges.length
    },
    roleMembership: {
      result: roleMembershipResult,
      outboundCount: membershipCounts[0], effectiveOutboundCount: membershipCounts[1],
      inboundCount: membershipCounts[2], effectiveInboundCount: membershipCounts[3]
    },
    runtimePrincipalInventory: {
      result: runtimeInventoryResult,
      expectedCount: EXPECTED_RUNTIME_ROLES.length,
      observedCount: Number(inventory.get('RUNTIME')?.match_count || 0),
      reviewedCategoryCount: reviewedRefs.length,
      targetMatchesReviewedPrincipal: reviewedRefs.includes(targetRef)
    },
    targetRoleBoundary: {
      result: targetBoundaryResult,
      dangerousAttributeCount: dangerous,
      loginEnabled: bool(target.rolcanlogin),
      inheritEnabled: bool(target.rolinherit),
      ownedObjectCount: Number(target.owned_object_count ?? -1)
    },
    operatorCapability: { result: operatorSafe && operatorCapability && ref('ACL_OPERATOR') !== targetRef ? 'PASS' : 'BLOCKED' },
    currentObjectAclComparison: {
      result: currentObjectAclResult,
      remediationObjectCount: remediationObjectKeys.length,
      remediationPrivilegeCount: candidates.length,
      unsupportedPrivilegeCount: unsupported.length,
      remediationObjectKeys,
      semanticDifferenceCounts: countBy(semanticDifferences.map(item => item.type)),
      differencesExactlyAttributableToTarget: semanticDifferenceAttributable,
      differenceFingerprint: sha256(canonicalJson(candidates))
    },
    exactSafeRemediationTarget: {
      result: exactSafe ? 'PASS' : 'BLOCKED',
      category: exactSafe ? 'ISOLATED_NONLOGIN_NO_MEMBERSHIP_NO_OWNERSHIP' : 'UNCLASSIFIED',
      targetProofFingerprint,
      blockerCodes: unique(blockers)
    },
    connectionAttemptCount: 1,
    retryCount: 0,
    productionConnectionAttempted: true,
    productionMutation: false,
    businessRowsRead: false,
    rawPrincipalPersisted: false,
    rawOidPersisted: false,
    rawAclPersisted: false,
    finalStatus: exactSafe ? 'PASS' : 'BLOCKED'
  });
}

function visitEvidence(value, failures, parts = []) {
  if (typeof value === 'string' && FORBIDDEN_EVIDENCE_VALUE.test(value)) failures.push('FORBIDDEN_EVIDENCE_VALUE');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_EVIDENCE_FIELD:${[...parts, key].join('.')}`);
    visitEvidence(child, failures, [...parts, key]);
  }
}

export function validateAclRemediationPrecheckEvidence(value) {
  const failures = [];
  visitEvidence(value, failures);
  const required = ['schemaVersion','modelVersion','sprintNumberingCappedAt','generatedAt','repositoryCommitSha','planSha256',
    'identityResult','tlsVerification','readerRoleBoundaryResult','transactionReadOnlyResult','ledgerResult',
    'structuralObjectAllowlistResult','defaultAclClassification','roleMembership','runtimePrincipalInventory',
    'targetRoleBoundary','operatorCapability','currentObjectAclComparison','exactSafeRemediationTarget',
    'connectionAttemptCount','retryCount','productionConnectionAttempted','productionMutation','businessRowsRead',
    'rawPrincipalPersisted','rawOidPersisted','rawAclPersisted','finalStatus'];
  if (canonicalJson(Object.keys(value || {}).sort()) !== canonicalJson([...required].sort())) failures.push('ACL_PRECHECK_EVIDENCE_FIELD_SET_INVALID');
  if (value?.schemaVersion !== ACL_REMEDIATION_PRECHECK_SCHEMA_VERSION || value?.modelVersion !== ACL_REMEDIATION_PRECHECK_MODEL_VERSION
      || value?.sprintNumberingCappedAt !== 65 || Number.isNaN(Date.parse(value?.generatedAt || ''))
      || !/^[a-f0-9]{40}$/.test(value?.repositoryCommitSha || '') || !/^[a-f0-9]{64}$/.test(value?.planSha256 || '')) failures.push('ACL_PRECHECK_EVIDENCE_PROVENANCE_INVALID');
  if (value?.connectionAttemptCount !== 1 || value?.retryCount !== 0 || value?.productionConnectionAttempted !== true
      || value?.productionMutation !== false || value?.businessRowsRead !== false || value?.rawPrincipalPersisted !== false
      || value?.rawOidPersisted !== false || value?.rawAclPersisted !== false) failures.push('ACL_PRECHECK_EXECUTION_BOUNDARY_INVALID');
  const subResults = [value?.identityResult, value?.tlsVerification === 'VERIFY_FULL_PASS' ? 'PASS' : value?.tlsVerification,
    value?.readerRoleBoundaryResult, value?.transactionReadOnlyResult, value?.ledgerResult?.status,
    value?.structuralObjectAllowlistResult, value?.defaultAclClassification?.result, value?.roleMembership?.result,
    value?.runtimePrincipalInventory?.result, value?.targetRoleBoundary?.result, value?.operatorCapability?.result,
    value?.currentObjectAclComparison?.result, value?.exactSafeRemediationTarget?.result];
  if (!subResults.every(result => ['PASS','BLOCKED'].includes(result))) failures.push('ACL_PRECHECK_SUBRESULT_INVALID');
  const shouldPass = subResults.every(result => result === 'PASS');
  if (value?.finalStatus !== (shouldPass ? 'PASS' : 'BLOCKED')) failures.push('ACL_PRECHECK_FINAL_STATUS_INCONSISTENT');
  if (value?.finalStatus === 'PASS' && (value?.defaultAclClassification?.relationFactCount !== 8
      || value?.defaultAclClassification?.sequenceFactCount !== 3 || value?.defaultAclClassification?.grantOptionTrueCount !== 11
      || value?.defaultAclClassification?.expectedBaselineDefaultPrivilegeCount !== 0
      || value?.runtimePrincipalInventory?.targetMatchesReviewedPrincipal !== false
      || value?.currentObjectAclComparison?.unsupportedPrivilegeCount !== 0
      || value?.currentObjectAclComparison?.differencesExactlyAttributableToTarget !== true
      || value?.exactSafeRemediationTarget?.category !== 'ISOLATED_NONLOGIN_NO_MEMBERSHIP_NO_OWNERSHIP'
      || value?.exactSafeRemediationTarget?.blockerCodes?.length !== 0)) failures.push('ACL_PRECHECK_PASS_CONTRACT_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: unique(failures) });
}

export function validateAclRemediationPrecheckFailureEvidence(value) {
  const failures = [];
  visitEvidence(value, failures);
  const required = ['schemaVersion','modelVersion','sprintNumberingCappedAt','generatedAt','repositoryCommitSha','planSha256',
    'diagnosticStage','errorCode','connectionAttemptCount','retryCount','cleanupResult','productionConnectionAttempted',
    'productionMutation','businessRowsRead','originalErrorPersisted','finalStatus'];
  if (canonicalJson(Object.keys(value || {}).sort()) !== canonicalJson([...required].sort())) failures.push('ACL_PRECHECK_FAILURE_FIELD_SET_INVALID');
  if (value?.schemaVersion !== ACL_REMEDIATION_PRECHECK_SCHEMA_VERSION || value?.modelVersion !== ACL_REMEDIATION_PRECHECK_MODEL_VERSION
      || value?.sprintNumberingCappedAt !== 65 || !ACL_REMEDIATION_PRECHECK_STAGES.includes(value?.diagnosticStage)
      || !/^(?:ACL_PRECHECK|PRODUCTION|PROTECTED|EXTERNAL)_[A-Z0-9_]{2,100}$/.test(value?.errorCode || '')) failures.push('ACL_PRECHECK_FAILURE_DIAGNOSTIC_INVALID');
  if (value?.repositoryCommitSha !== null && !/^[a-f0-9]{40}$/.test(value?.repositoryCommitSha || '')) failures.push('ACL_PRECHECK_FAILURE_COMMIT_INVALID');
  if (value?.planSha256 !== null && !/^[a-f0-9]{64}$/.test(value?.planSha256 || '')) failures.push('ACL_PRECHECK_FAILURE_PLAN_HASH_INVALID');
  if (!Number.isInteger(value?.connectionAttemptCount) || value.connectionAttemptCount < 0 || value.connectionAttemptCount > 1
      || value?.retryCount !== 0 || value?.productionConnectionAttempted !== (value.connectionAttemptCount === 1)
      || value?.productionMutation !== false || value?.businessRowsRead !== false || value?.originalErrorPersisted !== false
      || !['PASS','FAILED','NOT_STARTED'].includes(value?.cleanupResult) || value?.finalStatus !== 'BLOCKED') failures.push('ACL_PRECHECK_FAILURE_BOUNDARY_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: unique(failures) });
}

function safeFailure(error, context) {
  const internal = String(error?.message || '').split(':')[0];
  const external = String(error?.code || '').trim().toUpperCase();
  const externalCode = /^[0-9A-Z]{5}$/.test(external) ? `EXTERNAL_SQLSTATE_${external}`
    : SAFE_EXTERNAL_ERROR_CODES.has(external) ? `EXTERNAL_${external}` : null;
  const errorCode = /^(?:ACL_PRECHECK|PRODUCTION|PROTECTED)_[A-Z0-9_]{2,100}$/.test(internal)
    ? internal : externalCode || 'ACL_PRECHECK_SANITIZED_FAILURE';
  return Object.freeze({
    stage: ACL_REMEDIATION_PRECHECK_STAGES.includes(context.stage) ? context.stage : 'UNKNOWN',
    errorCode,
    connectionAttemptCount: Number(context.connectionAttemptCount || 0),
    repositoryCommitSha: /^[a-f0-9]{40}$/.test(context.repositoryCommitSha || '') ? context.repositoryCommitSha : null,
    planSha256: /^[a-f0-9]{64}$/.test(context.planSha256 || '') ? context.planSha256 : null,
    cleanupResult: context.cleanupResult || 'NOT_STARTED'
  });
}

async function writeValidatedEvidence(value, evidencePath, hashPath, validator) {
  if (validator(value).status !== 'PASS') throw new Error('ACL_PRECHECK_EVIDENCE_SANITIZATION_BLOCKED');
  const serialized = canonicalJson(value);
  const digest = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(hashPath, `${digest}  ${path.basename(evidencePath)}\n`, 'utf8');
  return digest;
}

export async function collectAclRemediationPrecheckFacts(client, artifacts, config, onStage = () => {}) {
  onStage('LEDGER');
  const ledger = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.ledger)).rows;
  const ledgerResult = compareExactStartingLedger(artifacts.structural.artifact.catalog.migrationLedger, ledger);
  if (ledgerResult.status !== 'PASS') throw new Error('ACL_PRECHECK_STARTING_LEDGER_BLOCKED');
  onStage('STRUCTURAL_COLLECTOR');
  const rawCatalog = { migrationLedger: ledger };
  for (const [section, sql] of Object.entries(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.structural)) rawCatalog[section] = (await client.query(sql)).rows;
  onStage('DEFAULT_ACL_COLLECTOR');
  const defaultAclContext = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.defaultAclContext)).rows;
  const granteeRefs = unique(defaultAclContext.map(row => row.grantee_ref));
  if (granteeRefs.length !== 1 || granteeRefs[0] === '0') throw new Error('ACL_PRECHECK_GRANTEE_RESOLUTION_BLOCKED');
  onStage('PRINCIPAL_INVENTORY');
  const principalInventory = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.principalInventory,
    [EXPECTED_PRODUCTION_READONLY_ROLE, config.objectOwnerRole, config.platformRole, config.aclOperatorRole, config.runtimeRoles[0]])).rows;
  onStage('TARGET_ROLE_BOUNDARY');
  const targetRoleContext = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.targetRoleContext, [granteeRefs[0]])).rows[0];
  if (!targetRoleContext) throw new Error('ACL_PRECHECK_TARGET_ROLE_MISSING');
  onStage('ROLE_MEMBERSHIP');
  const inventory = inventoryMap(principalInventory);
  onStage('OPERATOR_CAPABILITY');
  const ownerRefs = unique(defaultAclContext.map(row => row.owner_ref));
  const operatorCapability = ownerRefs.length === 1 && inventory.get('ACL_OPERATOR')?.role_ref
    ? (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.operatorCapability, [inventory.get('ACL_OPERATOR').role_ref, ownerRefs[0]])).rows[0]
    : { can_act_for_default_owner: false };
  onStage('CURRENT_OBJECT_ACL');
  const targetAclSurface = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.targetAclSurface, [granteeRefs[0]])).rows;
  onStage('ACL_SEMANTIC_COLLECTOR');
  const aclFacts = await collectAclSemanticFacts(client);
  return { ledger, ledgerResult, rawCatalog, defaultAclContext, principalInventory, targetRoleContext, operatorCapability, targetAclSurface, aclFacts };
}

export async function compareProductionAclRemediationPrecheck({
  env = process.env,
  ClientImpl = Client,
  repositoryVerifier = validateAclRemediationPrecheckRepositoryProvenance,
  artifactLoader = loadPrecheckArtifacts,
  collectorImpl = collectAclRemediationPrecheckFacts,
  evidencePath = EVIDENCE_PATH,
  evidenceHashPath = EVIDENCE_HASH_PATH
} = {}) {
  let stage = 'PRE_CONNECT_GUARD';
  let sourceCommit = null;
  let planSha256 = null;
  let client = null;
  let transactionOpen = false;
  let connectionAttemptCount = 0;
  let cleanupResult = 'NOT_STARTED';
  let evidence = null;
  let caught = null;
  try {
    const config = aclRemediationPrecheckConnectionConfig(env);
    stage = 'QUERY_ALLOWLIST';
    if (validateAclRemediationPrecheckQueryScope().status !== 'PASS') throw new Error('ACL_PRECHECK_QUERY_SCOPE_BLOCKED');
    stage = 'REPOSITORY_PROVENANCE';
    const repository = await repositoryVerifier(env);
    if (repository?.status !== 'PASS' || !/^[a-f0-9]{40}$/.test(repository?.commitSha || '')) throw new Error('ACL_PRECHECK_REPOSITORY_PROVENANCE_BLOCKED');
    sourceCommit = repository.commitSha;
    stage = 'ARTIFACT_PROVENANCE';
    const artifacts = await artifactLoader();
    planSha256 = artifacts.planSha256;
    if (config.authorizedPlanSha256 !== planSha256) throw new Error('ACL_PRECHECK_AUTHORIZED_PLAN_HASH_MISMATCH');
    stage = 'CA_LOAD';
    const ca = await readFile(config.caPath, 'utf8');
    stage = 'TLS_CONFIG';
    client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
    stage = 'TLS_CONNECT';
    connectionAttemptCount += 1;
    await client.connect();
    stage = 'IDENTITY_GUARD';
    const identity = (await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.identity,
      [EXPECTED_PRODUCTION_DATABASE, EXPECTED_PRODUCTION_READONLY_ROLE])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('ACL_PRECHECK_IDENTITY_BOUNDARY_BLOCKED');
    stage = 'READER_ROLE_BOUNDARY_GUARD';
    if (!(await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.readerRoleBoundary)).rows[0]?.role_safe) throw new Error('ACL_PRECHECK_READER_ROLE_BOUNDARY_BLOCKED');
    stage = 'READ_ONLY_TRANSACTION';
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    if (!(await client.query(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.transactionReadOnly)).rows[0]?.read_only_ok) throw new Error('ACL_PRECHECK_READ_ONLY_TRANSACTION_BLOCKED');
    const collection = await collectorImpl(client, artifacts, config, nextStage => { stage = nextStage; });
    stage = 'NORMALIZATION';
    evidence = evaluateAclRemediationPrecheck({ artifacts, config, collection, sourceCommit });
    stage = 'SAFE_TARGET_EVALUATION';
    await client.query('ROLLBACK');
    transactionOpen = false;
  } catch (error) { caught = error; }
  finally {
    if (transactionOpen && client) {
      try { await client.query('ROLLBACK'); } catch { cleanupResult = 'FAILED'; }
      transactionOpen = false;
    }
    if (client) {
      try { await client.end(); if (cleanupResult !== 'FAILED') cleanupResult = 'PASS'; } catch { cleanupResult = 'FAILED'; }
    }
  }
  if (caught) {
    caught.safeDiagnostic = safeFailure(caught, { stage, connectionAttemptCount, repositoryCommitSha: sourceCommit, planSha256, cleanupResult });
    throw caught;
  }
  if (cleanupResult !== 'PASS') {
    const error = new Error('ACL_PRECHECK_CONNECTION_CLEANUP_BLOCKED');
    error.safeDiagnostic = safeFailure(error, { stage: 'CLEANUP', connectionAttemptCount, repositoryCommitSha: sourceCommit, planSha256, cleanupResult });
    throw error;
  }
  try {
    stage = 'EVIDENCE_SANITIZATION';
    if (validateAclRemediationPrecheckEvidence(evidence).status !== 'PASS') throw new Error('ACL_PRECHECK_EVIDENCE_SANITIZATION_BLOCKED');
    stage = 'EVIDENCE_WRITE_HASH';
    const evidenceSha256 = await writeValidatedEvidence(evidence, evidencePath, evidenceHashPath, validateAclRemediationPrecheckEvidence);
    return { evidence, evidenceSha256 };
  } catch (error) {
    error.safeDiagnostic = safeFailure(error, { stage, connectionAttemptCount, repositoryCommitSha: sourceCommit, planSha256, cleanupResult });
    throw error;
  }
}

export async function runProductionAclRemediationPrecheckCli({
  env = process.env,
  failurePath = FAILURE_PATH,
  failureHashPath = FAILURE_HASH_PATH,
  comparatorOptions = {}
} = {}) {
  try {
    const result = await compareProductionAclRemediationPrecheck({ env, ...comparatorOptions });
    return { exitCode: result.evidence.finalStatus === 'PASS' ? 0 : 2, result, failure: null };
  } catch (error) {
    const safe = error?.safeDiagnostic || safeFailure(error, {
      stage: 'PRE_CONNECT_GUARD', connectionAttemptCount: 0, repositoryCommitSha: null, planSha256: null, cleanupResult: 'NOT_STARTED'
    });
    const failure = canonicalValue({
      schemaVersion: ACL_REMEDIATION_PRECHECK_SCHEMA_VERSION,
      modelVersion: ACL_REMEDIATION_PRECHECK_MODEL_VERSION,
      sprintNumberingCappedAt: 65,
      generatedAt: new Date().toISOString(),
      repositoryCommitSha: safe.repositoryCommitSha,
      planSha256: safe.planSha256,
      diagnosticStage: safe.stage,
      errorCode: safe.errorCode,
      connectionAttemptCount: safe.connectionAttemptCount,
      retryCount: 0,
      cleanupResult: safe.cleanupResult,
      productionConnectionAttempted: safe.connectionAttemptCount === 1,
      productionMutation: false,
      businessRowsRead: false,
      originalErrorPersisted: false,
      finalStatus: 'BLOCKED'
    });
    let failureSha256 = null;
    try { failureSha256 = await writeValidatedEvidence(failure, failurePath, failureHashPath, validateAclRemediationPrecheckFailureEvidence); } catch { /* terminal output remains sanitized */ }
    return { exitCode: 1, result: null, failure, failureSha256 };
  }
}

async function main() {
  const outcome = await runProductionAclRemediationPrecheckCli();
  if (outcome.result) {
    process.stdout.write(`PRODUCTION_ACL_REMEDIATION_PRECHECK=${outcome.result.evidence.finalStatus}\n`);
    process.stdout.write(`EXACT_SAFE_REMEDIATION_TARGET=${outcome.result.evidence.exactSafeRemediationTarget.result}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${outcome.result.evidenceSha256}\n`);
  } else {
    process.stderr.write('PRODUCTION_ACL_REMEDIATION_PRECHECK=BLOCKED\n');
    process.stderr.write(`PRODUCTION_ACL_REMEDIATION_PRECHECK_STAGE=${outcome.failure.diagnosticStage}\n`);
    process.stderr.write(`PRODUCTION_ACL_REMEDIATION_PRECHECK_ERROR=${outcome.failure.errorCode}\n`);
    process.stderr.write(`SANITIZED_FAILURE_EVIDENCE_WRITTEN=${Boolean(outcome.failureSha256)}\n`);
  }
  process.exitCode = outcome.exitCode;
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
