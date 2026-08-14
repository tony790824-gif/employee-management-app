import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { authenticatedTlsConfig, productionConnectionConfig } from './compare-production-catalog.mjs';
import {
  EXPECTED_PRODUCTION_DATABASE,
  EXPECTED_PRODUCTION_READONLY_ROLE,
  SEMANTIC_LIVE_QUERY_SURFACE
} from './compare-production-starting-baseline-semantic.mjs';
import { compareExactStartingLedger } from './compare-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  APPLICATION_OBJECT_SET_VERSION,
  EXACT_OWNER_PROOF_VERSION,
  EXPECTED_OWNER_DEFAULT_ACL_FACTS,
  applicationObjectIdentitySetSha256,
  evaluateExactApplicationObjectOwnerRelation,
  loadOwnerProofRepositoryInputs,
  validateApplicationObjectSetArtifact
} from './exact-application-object-owner-proof.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.sha256');
const FAILURE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_FAILURE.json');
const FAILURE_EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_FAILURE.sha256');
const PROVENANCE_PATHS = Object.freeze([
  'database/compare-production-application-owner-relation.mjs',
  'database/exact-application-object-owner-proof.mjs',
  'database/production-0001-0008-application-owner-object-set.json',
  'database/production-0001-0008-application-owner-object-set.sha256',
  'database/production-0001-0008-structural-baseline.json',
  'database/production-0001-0008-acl-semantic-baseline.json',
  'docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.schema.json',
  'docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_FAILURE.schema.json'
]);

export const APPLICATION_OWNER_RELATION_CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_APPLICATION_OWNER_RELATION';
export const APPLICATION_OWNER_RELATION_MODEL_VERSION = 'bankeban-production-application-owner-relation-collector-v1';
export const EXPECTED_APPLICATION_OBJECT_SET_FINGERPRINT = 'ce84209b37fe81c7ec93d211327f2e0f3cb4576a5966d48803dae6ddd2bf6200';
export const EXPECTED_RUNTIME_ROLE = 'banke_api_production';
export const EXPECTED_PLATFORM_ROLE = 'cloud_admin';

export const APPLICATION_OWNER_RELATION_STAGES = Object.freeze([
  'PRE_CONNECT_GUARD', 'QUERY_ALLOWLIST', 'REPOSITORY_PROVENANCE', 'ARTIFACT_PROVENANCE',
  'CA_LOAD', 'TLS_CONFIG', 'TLS_CONNECT', 'IDENTITY_GUARD', 'READER_ROLE_BOUNDARY_GUARD',
  'READ_ONLY_TRANSACTION', 'LEDGER', 'APPLICATION_OBJECT_COLLECTOR', 'DEFAULT_ACL_COLLECTOR',
  'OWNER_ROLE_BOUNDARY_GUARD', 'OWNERSHIP_SCOPE_COLLECTOR', 'NORMALIZATION', 'PROOF_EVALUATION',
  'CLEANUP', 'EVIDENCE_SANITIZATION', 'EVIDENCE_WRITE_HASH', 'UNKNOWN'
]);

const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i;
const ALLOWED_RELATIONS = new Set([
  'public.schema_migrations', 'pg_catalog.pg_database', 'pg_catalog.pg_namespace', 'pg_catalog.pg_class',
  'pg_catalog.pg_proc', 'pg_catalog.pg_roles', 'pg_catalog.pg_auth_members', 'pg_catalog.pg_default_acl',
  'pg_catalog.pg_depend', 'pg_catalog.pg_extension', 'pg_catalog.aclexplode'
]);
const FORBIDDEN_EVIDENCE_KEY = /^(?:raw.*(?:oid|principal|acl)|principal.*(?:name|oid)|role.*name|user.*name|password|secret|credential|connectionString|databaseUrl|url|hostname|host|endpoint|cookie|authorization|databaseName)$/i;
const FORBIDDEN_EVIDENCE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;
const SAFE_EXTERNAL_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

const OBJECT_SQL = `
  SELECT 'DATABASE'::text AS object_type, 'DATABASE|CURRENT_DATABASE'::text AS object_identity,
         database.oid::text AS object_ref, database.datdba::text AS owner_ref
    FROM pg_catalog.pg_database AS database
   WHERE database.datname = pg_catalog.current_database()
  UNION ALL
  SELECT 'SCHEMA', 'SCHEMA|' || namespace.nspname, namespace.oid::text, namespace.nspowner::text
    FROM pg_catalog.pg_namespace AS namespace
   WHERE namespace.nspname = 'app_private'
  UNION ALL
  SELECT CASE relation.relkind WHEN 'r' THEN 'RELATION' WHEN 'p' THEN 'RELATION'
             WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED_VIEW' END,
         CASE relation.relkind WHEN 'r' THEN 'RELATION|' WHEN 'p' THEN 'RELATION|'
             WHEN 'S' THEN 'SEQUENCE|' WHEN 'v' THEN 'VIEW|' WHEN 'm' THEN 'MATERIALIZED_VIEW|' END
             || namespace.nspname || '.' || relation.relname,
         relation.oid::text, relation.relowner::text
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname IN ('app_private', 'public') AND relation.relkind IN ('r', 'p', 'S', 'v', 'm')
  UNION ALL
  SELECT 'INDEX', 'INDEX|' || namespace.nspname || '.' || relation.relname,
         relation.oid::text, relation.relowner::text
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname IN ('app_private', 'public') AND relation.relkind = 'i'
  UNION ALL
  SELECT 'FUNCTION', 'FUNCTION|' || namespace.nspname || '.' || procedure.proname || '('
         || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')',
         procedure.oid::text, procedure.proowner::text
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname IN ('app_private', 'public')
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
                      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                        AND dependency.objid = procedure.oid AND dependency.deptype = 'e')
   ORDER BY object_type, object_identity`;

const DEFAULT_ACL_SQL = `
  SELECT default_acl.defaclobjtype::text AS default_acl_type, acl.grantee::text AS grantee_ref,
         acl.privilege_type, acl.is_grantable AS grant_option
    FROM pg_catalog.pg_default_acl AS default_acl
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
   WHERE namespace.nspname = 'public' AND default_acl.defaclobjtype IN ('r', 'S')
   ORDER BY default_acl.defaclobjtype, acl.privilege_type, acl.is_grantable`;

const OWNER_ROLE_SQL = `
  WITH RECURSIVE candidate AS (
    SELECT role.oid, role.rolsuper, role.rolcreatedb, role.rolcreaterole, role.rolreplication, role.rolbypassrls
      FROM pg_catalog.pg_roles AS role WHERE role.oid = $1::oid
  ), outbound(role_ref, effective) AS (
    SELECT membership.roleid, membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM pg_catalog.pg_auth_members AS membership CROSS JOIN candidate
     WHERE membership.member = candidate.oid
    UNION
    SELECT membership.roleid, outbound.effective OR membership.inherit_option OR membership.set_option OR membership.admin_option
      FROM outbound JOIN pg_catalog.pg_auth_members AS membership ON membership.member = outbound.role_ref
  ), reviewed AS (
    SELECT (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $2) AS reader_ref,
           (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $3) AS runtime_ref,
           (SELECT role.oid FROM pg_catalog.pg_roles AS role WHERE role.rolname = $4) AS platform_ref,
           (SELECT extension.extowner FROM pg_catalog.pg_extension AS extension WHERE extension.extname = 'pgcrypto') AS extension_owner_ref
  )
  SELECT candidate.rolsuper, candidate.rolcreatedb, candidate.rolcreaterole, candidate.rolreplication, candidate.rolbypassrls,
         (SELECT count(*)::integer FROM outbound) AS outbound_membership_count,
         (SELECT count(*)::integer FROM outbound WHERE effective) AS effective_outbound_membership_count,
         (COALESCE((candidate.oid = reviewed.reader_ref)::integer, 0) + COALESCE((candidate.oid = reviewed.runtime_ref)::integer, 0)
          + COALESCE((candidate.oid = reviewed.platform_ref)::integer, 0) + COALESCE((candidate.oid = reviewed.extension_owner_ref)::integer, 0)) AS other_reviewed_category_count,
         reviewed.reader_ref IS NOT NULL AND reviewed.runtime_ref IS NOT NULL AND reviewed.platform_ref IS NOT NULL
           AND reviewed.extension_owner_ref IS NOT NULL AS reviewed_context_complete,
         (SELECT count(*)::integer FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = candidate.oid
             AND membership.member IN (reviewed.reader_ref, reviewed.runtime_ref, reviewed.platform_ref, reviewed.extension_owner_ref)
             AND (membership.inherit_option OR membership.set_option OR membership.admin_option)) AS inbound_reviewed_membership_count
    FROM candidate CROSS JOIN reviewed`;

const ALL_OWNED_SQL = `
  SELECT 'DATABASE'::text AS object_type, database.oid::text AS object_ref, false AS extension_managed
    FROM pg_catalog.pg_database AS database WHERE database.datdba = $1::oid
  UNION ALL
  SELECT 'SCHEMA', namespace.oid::text, false
    FROM pg_catalog.pg_namespace AS namespace
   WHERE namespace.nspowner = $1::oid AND namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema'
  UNION ALL
  SELECT CASE relation.relkind WHEN 'i' THEN 'INDEX' WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW'
             WHEN 'm' THEN 'MATERIALIZED_VIEW' ELSE 'RELATION' END,
         relation.oid::text,
         EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
                  WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
                    AND dependency.objid = relation.oid AND dependency.deptype = 'e')
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE relation.relowner = $1::oid AND namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema'
  UNION ALL
  SELECT 'FUNCTION', procedure.oid::text,
         EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
                  WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                    AND dependency.objid = procedure.oid AND dependency.deptype = 'e')
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE procedure.proowner = $1::oid AND namespace.nspname !~ '^pg_' AND namespace.nspname <> 'information_schema'`;

const EXCLUSION_SQL = `
  SELECT (SELECT namespace.nspowner = role.oid FROM pg_catalog.pg_namespace AS namespace
           CROSS JOIN pg_catalog.pg_roles AS role WHERE namespace.nspname = 'public' AND role.rolname = 'pg_database_owner') AS public_schema_owner_ok,
         (SELECT count(*)::integer FROM pg_catalog.pg_proc AS procedure
           WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
                          WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                            AND dependency.objid = procedure.oid AND dependency.deptype = 'e')) AS extension_function_count,
         (SELECT count(*)::integer FROM pg_catalog.pg_extension) AS extension_count`;

export const APPLICATION_OWNER_RELATION_QUERY_SURFACE = Object.freeze({
  identity: SEMANTIC_LIVE_QUERY_SURFACE.identity,
  readerRoleBoundary: SEMANTIC_LIVE_QUERY_SURFACE.roleBoundary,
  transactionReadOnly: SEMANTIC_LIVE_QUERY_SURFACE.transactionReadOnly,
  ledger: SEMANTIC_LIVE_QUERY_SURFACE.ledger,
  objects: OBJECT_SQL,
  defaultAcl: DEFAULT_ACL_SQL,
  ownerRole: OWNER_ROLE_SQL,
  allOwned: ALL_OWNED_SQL,
  exclusions: EXCLUSION_SQL
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function bool(value) { return value === true || value === 't' || value === 'true'; }
function strictBool(value) {
  if (value === true || value === 't' || value === 'true') return true;
  if (value === false || value === 'f' || value === 'false') return false;
  return null;
}
function objectKey(row) { return `${String(row.object_type)}:${String(row.object_ref)}`; }

function visitEvidence(value, failures, parts = []) {
  if (typeof value === 'string' && FORBIDDEN_EVIDENCE_VALUE.test(value)) failures.push('FORBIDDEN_EVIDENCE_VALUE');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_EVIDENCE_FIELD:${[...parts, key].join('.')}`);
    visitEvidence(child, failures, [...parts, key]);
  }
}

function inspectQuery(name, sql, failures) {
  const text = String(sql || '').trim();
  const executable = text.replace(/'(?:''|[^'])*'/g, "''");
  if (!/^(?:SELECT|WITH)\b/i.test(text)) failures.push(`OWNER_RELATION_QUERY_NOT_SELECT_ONLY:${name}`);
  if (FORBIDDEN_SQL.test(executable)) failures.push(`OWNER_RELATION_QUERY_MUTATION_TOKEN:${name}`);
  for (const match of executable.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?([A-Za-z0-9_."]+)/gi)) {
    const relation = match[1].replaceAll('"', '').toLowerCase();
    if (!ALLOWED_RELATIONS.has(relation) && !['candidate', 'outbound', 'reviewed'].includes(relation)) failures.push(`OWNER_RELATION_QUERY_SOURCE_BLOCKED:${name}:${relation}`);
  }
}

export function validateApplicationOwnerRelationQueryScope(surface = APPLICATION_OWNER_RELATION_QUERY_SURFACE) {
  const failures = [];
  const expected = ['allOwned', 'defaultAcl', 'exclusions', 'identity', 'ledger', 'objects', 'ownerRole', 'readerRoleBoundary', 'transactionReadOnly'];
  if (canonicalJson(Object.keys(surface || {}).sort()) !== canonicalJson(expected)) failures.push('OWNER_RELATION_QUERY_SECTION_SET_MISMATCH');
  for (const [name, sql] of Object.entries(surface || {})) inspectQuery(name, sql, failures);
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function applicationOwnerRelationConnectionConfig(env = process.env) {
  const config = productionConnectionConfig(env, {
    confirmation: APPLICATION_OWNER_RELATION_CONFIRMATION,
    confirmationError: 'PRODUCTION_APPLICATION_OWNER_RELATION_CONFIRMATION_REQUIRED'
  });
  if (config.expectedDatabase !== EXPECTED_PRODUCTION_DATABASE || config.expectedRole !== EXPECTED_PRODUCTION_READONLY_ROLE) {
    throw new Error('PRODUCTION_APPLICATION_OWNER_RELATION_TARGET_IDENTITY_BLOCKED');
  }
  return Object.freeze({ ...config, effectiveTlsMode: 'verify-full' });
}

function gitOutput(args, execFileSyncImpl = execFileSync) {
  return execFileSyncImpl('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function validateApplicationOwnerRelationRepositoryProvenance(env = process.env, { execFileSyncImpl = execFileSync } = {}) {
  const failures = [];
  const authorizedCommit = String(env.BANK_PRODUCTION_EVIDENCE_COMMIT_SHA || '').trim();
  let head = '';
  try {
    head = gitOutput(['rev-parse', 'HEAD'], execFileSyncImpl);
    if (!/^[a-f0-9]{40}$/.test(head)) failures.push('OWNER_RELATION_HEAD_INVALID');
    if (authorizedCommit !== head) failures.push('OWNER_RELATION_AUTHORIZED_COMMIT_MISMATCH');
    if (gitOutput(['branch', '--show-current'], execFileSyncImpl) !== 'main') failures.push('OWNER_RELATION_BRANCH_NOT_MAIN');
    if (gitOutput(['rev-parse', 'origin/main'], execFileSyncImpl) !== head) failures.push('OWNER_RELATION_ORIGIN_NOT_AT_HEAD');
    if (gitOutput(['status', '--porcelain', '--untracked-files=no'], execFileSyncImpl)) failures.push('OWNER_RELATION_TRACKED_WORKTREE_NOT_CLEAN');
    const tracked = gitOutput(['ls-files', '--error-unmatch', '--', ...PROVENANCE_PATHS], execFileSyncImpl).split(/\r?\n/).filter(Boolean);
    if (tracked.length !== PROVENANCE_PATHS.length) failures.push('OWNER_RELATION_PROVENANCE_FILE_NOT_TRACKED');
  } catch { failures.push('OWNER_RELATION_REPOSITORY_PROVENANCE_COMMAND_FAILED'); }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), commitSha: /^[a-f0-9]{40}$/.test(head) ? head : null });
}

export function expectedApplicationObjectIdentities(structuralBaseline) {
  const catalog = structuralBaseline?.catalog || {};
  return [
    'DATABASE|CURRENT_DATABASE',
    ...(catalog.schemas || []).filter(row => row.schema_name === 'app_private').map(row => `SCHEMA|${row.schema_name}`),
    ...(catalog.relations || []).map(row => `${({ r: 'RELATION', p: 'RELATION', S: 'SEQUENCE', v: 'VIEW', m: 'MATERIALIZED_VIEW' })[row.relation_kind]}|${row.schema_name}.${row.relation_name}`),
    ...(catalog.indexes || []).map(row => `INDEX|${row.schema_name}.${row.index_name}`),
    ...(catalog.functions || []).filter(row => !row.extension_name).map(row => `FUNCTION|${row.schema_name}.${row.function_name}(${row.identity_arguments})`)
  ].sort();
}

function defaultAclFacts(rows) {
  return (rows || []).map(row => `${row.default_acl_type === 'r' ? 'PUBLIC_SCHEMA|RELATION' : 'PUBLIC_SCHEMA|SEQUENCE'}|${String(row.privilege_type).toUpperCase()}|${bool(row.grant_option)}`).sort();
}

export function buildApplicationOwnerRelationProof({ inputs, collection, sourceCommit }) {
  const artifactValidation = validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256);
  const expectedIdentities = expectedApplicationObjectIdentities(inputs.structuralBaseline);
  const observed = Array.isArray(collection.objects) ? collection.objects : [];
  const observedIdentities = observed.map(row => String(row.object_identity)).sort();
  const granteeRefs = [...new Set((collection.defaultAcl || []).map(row => String(row.grantee_ref)))];
  const granteeRoleRef = granteeRefs.length === 1 ? granteeRefs[0] : null;
  const ownerRole = collection.ownerRole || {};
  const requiredKeys = new Set(observed.map(objectKey));
  const unrelatedOwnershipCount = (collection.allOwned || []).filter(row => !bool(row.extension_managed) && !requiredKeys.has(objectKey(row))).length;
  const exclusion = collection.exclusions || {};
  const otherReviewed = Number(ownerRole.other_reviewed_category_count || 0) + Number(ownerRole.inbound_reviewed_membership_count || 0)
    + (bool(ownerRole.reviewed_context_complete) ? 0 : 1);
  const facts = defaultAclFacts(collection.defaultAcl);
  const transient = {
    objectSetFingerprint: inputs.artifact.objectSetFingerprint,
    objectIdentitySetSha256: applicationObjectIdentitySetSha256(observedIdentities),
    granteeRoleRef,
    granteeRoleCount: granteeRefs.length,
    publicOidZero: granteeRoleRef === '0',
    objectOwnerRefs: observed.map(row => String(row.owner_ref)),
    expectedOwnershipCount: expectedIdentities.length,
    reviewedCategory: otherReviewed === 0 ? 'EXPECTED_OWNER' : 'UNCLASSIFIED',
    reviewedCategoryMatchCount: otherReviewed === 0 ? 1 : 1 + otherReviewed,
    otherReviewedCategoryMatchCount: otherReviewed,
    ambiguity: otherReviewed > 0,
    roleAttributes: {
      rolsuper: strictBool(ownerRole.rolsuper), rolcreatedb: strictBool(ownerRole.rolcreatedb), rolcreaterole: strictBool(ownerRole.rolcreaterole),
      rolreplication: strictBool(ownerRole.rolreplication), rolbypassrls: strictBool(ownerRole.rolbypassrls)
    },
    outboundMembershipCount: Number(ownerRole.outbound_membership_count ?? -1),
    outboundEffectiveMembershipCount: Number(ownerRole.effective_outbound_membership_count ?? -1),
    unrelatedOwnershipCount,
    excludedObjectOwnershipMismatchCount: bool(exclusion.public_schema_owner_ok) && Number(exclusion.extension_function_count) === 37 && Number(exclusion.extension_count) === 2 ? 0 : 1,
    businessRowsRead: false,
    rawOidPersisted: false,
    rawPrincipalNamePersisted: false,
    defaultAclFacts: facts,
    sourceCommitSha: sourceCommit
  };
  if (canonicalJson(observedIdentities) !== canonicalJson(expectedIdentities)) transient.objectIdentitySetSha256 = '0'.repeat(64);
  return evaluateExactApplicationObjectOwnerRelation({ artifact: inputs.artifact, artifactValidation, transient });
}

export function applicationOwnerRelationEvidence(proof, { timestamp, sourceCommit, connectionAttemptCount = 1 } = {}) {
  return canonicalValue({
    timestamp, sourceCommit, modelVersion: APPLICATION_OWNER_RELATION_MODEL_VERSION,
    objectSetVersion: proof.objectSetVersion, objectSetFingerprint: proof.objectSetFingerprint,
    expectedCoverageCount: proof.expectedOwnershipCount, observedCoverageCount: proof.ownershipCoverageCount,
    ownerSetCount: proof.ownerSetCount, exactOwnerMatch: proof.exactOwnerMatch,
    unrelatedOwnershipCount: proof.unrelatedOwnershipCount,
    ambiguity: proof.ambiguity, reviewedCategory: proof.reviewedCategory, proofEnum: proof.proofEnum,
    roleBoundaryResult: proof.roleBoundaryResult, membershipClassification: proof.membershipClassification,
    grantOptionSemanticResult: proof.grantOptionSemanticResult,
    connectionAttemptCount, retryCount: 0, result: proof.finalProofStatus
  });
}

export function validateApplicationOwnerRelationEvidence(value) {
  const failures = [];
  visitEvidence(value, failures);
  const required = ['timestamp', 'sourceCommit', 'modelVersion', 'objectSetVersion', 'objectSetFingerprint', 'expectedCoverageCount',
    'observedCoverageCount', 'ownerSetCount', 'exactOwnerMatch', 'unrelatedOwnershipCount', 'ambiguity', 'reviewedCategory', 'proofEnum',
    'roleBoundaryResult', 'membershipClassification', 'grantOptionSemanticResult', 'connectionAttemptCount', 'retryCount', 'result'];
  if (canonicalJson(Object.keys(value || {}).sort()) !== canonicalJson([...required].sort())) failures.push('OWNER_RELATION_EVIDENCE_FIELD_SET_INVALID');
  if (Number.isNaN(Date.parse(value?.timestamp || ''))) failures.push('OWNER_RELATION_EVIDENCE_TIMESTAMP_INVALID');
  if (!/^[a-f0-9]{40}$/.test(value?.sourceCommit || '')) failures.push('OWNER_RELATION_EVIDENCE_COMMIT_INVALID');
  if (value?.modelVersion !== APPLICATION_OWNER_RELATION_MODEL_VERSION || value?.objectSetVersion !== APPLICATION_OBJECT_SET_VERSION
      || value?.objectSetFingerprint !== EXPECTED_APPLICATION_OBJECT_SET_FINGERPRINT) failures.push('OWNER_RELATION_EVIDENCE_MODEL_INVALID');
  if (value?.expectedCoverageCount !== 65 || !Number.isInteger(value?.observedCoverageCount) || value.observedCoverageCount < 0
      || !Number.isInteger(value?.ownerSetCount) || value.ownerSetCount < 0 || !Number.isInteger(value?.unrelatedOwnershipCount) || value.unrelatedOwnershipCount < 0) failures.push('OWNER_RELATION_EVIDENCE_COUNT_INVALID');
  if (value?.connectionAttemptCount !== 1 || value?.retryCount !== 0 || !['PASS', 'BLOCKED'].includes(value?.result)) failures.push('OWNER_RELATION_EVIDENCE_EXECUTION_BOUNDARY_INVALID');
  if (value?.result === 'PASS' && (value?.observedCoverageCount !== 65 || value?.ownerSetCount !== 1 || value?.exactOwnerMatch !== true
      || value?.unrelatedOwnershipCount !== 0 || value?.ambiguity !== false || value?.reviewedCategory !== 'EXPECTED_OWNER'
      || value?.proofEnum !== 'EXACT_APPLICATION_OBJECT_OWNER_RELATION' || value?.roleBoundaryResult !== 'PASS'
      || value?.membershipClassification !== 'NONE' || value?.grantOptionSemanticResult !== 'SEMANTIC_MISMATCH')) failures.push('OWNER_RELATION_EVIDENCE_PASS_CONTRACT_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function validateApplicationOwnerRelationFailureEvidence(value) {
  const failures = [];
  visitEvidence(value, failures);
  const required = ['timestamp', 'sourceCommit', 'stage', 'errorCode', 'connectionAttemptCount', 'retryCount', 'cleanupResult', 'result'];
  if (canonicalJson(Object.keys(value || {}).sort()) !== canonicalJson([...required].sort())) failures.push('OWNER_RELATION_FAILURE_FIELD_SET_INVALID');
  if (value?.sourceCommit !== null && !/^[a-f0-9]{40}$/.test(value?.sourceCommit || '')) failures.push('OWNER_RELATION_FAILURE_COMMIT_INVALID');
  if (!APPLICATION_OWNER_RELATION_STAGES.includes(value?.stage) || !/^(?:OWNER_RELATION|PRODUCTION|PROTECTED|EXTERNAL)_[A-Z0-9_]{2,100}$/.test(value?.errorCode || '')) failures.push('OWNER_RELATION_FAILURE_DIAGNOSTIC_INVALID');
  if (!Number.isInteger(value?.connectionAttemptCount) || value.connectionAttemptCount < 0 || value.connectionAttemptCount > 1 || value?.retryCount !== 0
      || !['PASS', 'FAILED', 'NOT_STARTED'].includes(value?.cleanupResult) || value?.result !== 'BLOCKED') failures.push('OWNER_RELATION_FAILURE_BOUNDARY_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

async function loadInputs() {
  const inputs = await loadOwnerProofRepositoryInputs();
  const validation = validateApplicationObjectSetArtifact(inputs.artifact, inputs.structuralBaseline, inputs.aclBaseline, inputs.companionSha256);
  if (validation.status !== 'PASS') throw new Error('OWNER_RELATION_ARTIFACT_PROVENANCE_BLOCKED');
  return inputs;
}

async function writeValidatedEvidence(value, evidencePath, hashPath, validator) {
  if (validator(value).status !== 'PASS') throw new Error('OWNER_RELATION_EVIDENCE_SANITIZATION_BLOCKED');
  const serialized = canonicalJson(value);
  const digest = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(hashPath, `${digest}  ${path.basename(evidencePath)}\n`, 'utf8');
  return digest;
}

function safeFailure(error, context) {
  const internal = String(error?.message || '').split(':')[0];
  const external = String(error?.code || '').trim().toUpperCase();
  const externalCode = /^[0-9A-Z]{5}$/.test(external) ? `EXTERNAL_SQLSTATE_${external}`
    : (SAFE_EXTERNAL_ERROR_CODES.has(external) ? `EXTERNAL_${external}` : null);
  const errorCode = /^(?:OWNER_RELATION|PRODUCTION|PROTECTED)_[A-Z0-9_]{2,100}$/.test(internal)
    ? internal : (externalCode || 'OWNER_RELATION_SANITIZED_FAILURE');
  return Object.freeze({ stage: APPLICATION_OWNER_RELATION_STAGES.includes(context.stage) ? context.stage : 'UNKNOWN', errorCode,
    connectionAttemptCount: context.connectionAttemptCount, sourceCommit: context.sourceCommit, cleanupResult: context.cleanupResult });
}

export async function compareProductionApplicationOwnerRelation({
  env = process.env, ClientImpl = Client, repositoryVerifier = validateApplicationOwnerRelationRepositoryProvenance,
  inputLoader = loadInputs, evidencePath = EVIDENCE_PATH, evidenceHashPath = EVIDENCE_HASH_PATH
} = {}) {
  let stage = 'PRE_CONNECT_GUARD';
  let sourceCommit = null;
  let client = null;
  let transactionOpen = false;
  let connectionAttemptCount = 0;
  let cleanupResult = 'NOT_STARTED';
  let proof = null;
  let caught = null;
  try {
    const config = applicationOwnerRelationConnectionConfig(env);
    stage = 'QUERY_ALLOWLIST';
    if (validateApplicationOwnerRelationQueryScope().status !== 'PASS') throw new Error('OWNER_RELATION_QUERY_SCOPE_BLOCKED');
    stage = 'REPOSITORY_PROVENANCE';
    const repository = await repositoryVerifier(env);
    if (repository?.status !== 'PASS' || !/^[a-f0-9]{40}$/.test(repository?.commitSha || '')) throw new Error('OWNER_RELATION_REPOSITORY_PROVENANCE_BLOCKED');
    sourceCommit = repository.commitSha;
    stage = 'ARTIFACT_PROVENANCE';
    const inputs = await inputLoader();
    stage = 'CA_LOAD';
    const ca = await readFile(config.caPath, 'utf8');
    stage = 'TLS_CONFIG';
    client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
    stage = 'TLS_CONNECT';
    connectionAttemptCount += 1;
    await client.connect();
    stage = 'IDENTITY_GUARD';
    const identity = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.identity, [EXPECTED_PRODUCTION_DATABASE, EXPECTED_PRODUCTION_READONLY_ROLE])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('OWNER_RELATION_IDENTITY_BOUNDARY_BLOCKED');
    stage = 'READER_ROLE_BOUNDARY_GUARD';
    if (!(await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.readerRoleBoundary)).rows[0]?.role_safe) throw new Error('OWNER_RELATION_READER_ROLE_BOUNDARY_BLOCKED');
    stage = 'READ_ONLY_TRANSACTION';
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    if (!(await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.transactionReadOnly)).rows[0]?.read_only_ok) throw new Error('OWNER_RELATION_READ_ONLY_TRANSACTION_BLOCKED');
    stage = 'LEDGER';
    const ledger = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.ledger)).rows;
    if (compareExactStartingLedger(inputs.structuralBaseline.catalog.migrationLedger, ledger).status !== 'PASS') throw new Error('OWNER_RELATION_STARTING_LEDGER_BLOCKED');
    stage = 'APPLICATION_OBJECT_COLLECTOR';
    const objects = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.objects)).rows;
    stage = 'DEFAULT_ACL_COLLECTOR';
    const defaultAcl = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.defaultAcl)).rows;
    const granteeRefs = [...new Set(defaultAcl.map(row => String(row.grantee_ref)))];
    if (granteeRefs.length !== 1 || granteeRefs[0] === '0') throw new Error('OWNER_RELATION_GRANTEE_RESOLUTION_BLOCKED');
    stage = 'OWNER_ROLE_BOUNDARY_GUARD';
    const ownerRole = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.ownerRole,
      [granteeRefs[0], EXPECTED_PRODUCTION_READONLY_ROLE, EXPECTED_RUNTIME_ROLE, EXPECTED_PLATFORM_ROLE])).rows[0];
    if (!ownerRole) throw new Error('OWNER_RELATION_OWNER_ROLE_MISSING');
    stage = 'OWNERSHIP_SCOPE_COLLECTOR';
    const allOwned = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.allOwned, [granteeRefs[0]])).rows;
    const exclusions = (await client.query(APPLICATION_OWNER_RELATION_QUERY_SURFACE.exclusions)).rows[0];
    stage = 'NORMALIZATION';
    const collection = { objects, defaultAcl, ownerRole, allOwned, exclusions };
    stage = 'PROOF_EVALUATION';
    proof = buildApplicationOwnerRelationProof({ inputs, collection, sourceCommit });
    await client.query('ROLLBACK');
    transactionOpen = false;
  } catch (error) {
    caught = error;
  } finally {
    if (transactionOpen && client) {
      try { await client.query('ROLLBACK'); } catch { cleanupResult = 'FAILED'; }
      transactionOpen = false;
    }
    if (client) {
      try { await client.end(); if (cleanupResult !== 'FAILED') cleanupResult = 'PASS'; } catch { cleanupResult = 'FAILED'; }
    }
  }
  if (caught) {
    caught.safeDiagnostic = safeFailure(caught, { stage, connectionAttemptCount, sourceCommit, cleanupResult });
    throw caught;
  }
  if (cleanupResult !== 'PASS') {
    const error = new Error('OWNER_RELATION_CONNECTION_CLEANUP_BLOCKED');
    error.safeDiagnostic = safeFailure(error, { stage: 'CLEANUP', connectionAttemptCount, sourceCommit, cleanupResult });
    throw error;
  }
  try {
    stage = 'EVIDENCE_SANITIZATION';
    const evidence = applicationOwnerRelationEvidence(proof, { timestamp: new Date().toISOString(), sourceCommit, connectionAttemptCount });
    if (validateApplicationOwnerRelationEvidence(evidence).status !== 'PASS') throw new Error('OWNER_RELATION_EVIDENCE_SANITIZATION_BLOCKED');
    stage = 'EVIDENCE_WRITE_HASH';
    const evidenceSha256 = await writeValidatedEvidence(evidence, evidencePath, evidenceHashPath, validateApplicationOwnerRelationEvidence);
    return { evidence, evidenceSha256 };
  } catch (error) {
    error.safeDiagnostic = safeFailure(error, { stage, connectionAttemptCount, sourceCommit, cleanupResult });
    throw error;
  }
}

export async function runProductionApplicationOwnerRelationCli({
  env = process.env, failureEvidencePath = FAILURE_EVIDENCE_PATH, failureEvidenceHashPath = FAILURE_EVIDENCE_HASH_PATH,
  comparatorOptions = {}
} = {}) {
  try {
    const result = await compareProductionApplicationOwnerRelation({ env, ...comparatorOptions });
    return { exitCode: result.evidence.result === 'PASS' ? 0 : 2, result, failure: null };
  } catch (error) {
    const safe = error?.safeDiagnostic || safeFailure(error, { stage: 'PRE_CONNECT_GUARD', connectionAttemptCount: 0, sourceCommit: null, cleanupResult: 'NOT_STARTED' });
    const failure = canonicalValue({ timestamp: new Date().toISOString(), sourceCommit: safe.sourceCommit, stage: safe.stage,
      errorCode: safe.errorCode, connectionAttemptCount: safe.connectionAttemptCount, retryCount: 0,
      cleanupResult: safe.cleanupResult, result: 'BLOCKED' });
    let failureEvidenceSha256 = null;
    try { failureEvidenceSha256 = await writeValidatedEvidence(failure, failureEvidencePath, failureEvidenceHashPath, validateApplicationOwnerRelationFailureEvidence); } catch { /* fail closed with generic terminal output */ }
    return { exitCode: 1, result: null, failure, failureEvidenceSha256 };
  }
}

async function main() {
  const outcome = await runProductionApplicationOwnerRelationCli();
  if (outcome.result) {
    process.stdout.write(`PRODUCTION_APPLICATION_OWNER_RELATION=${outcome.result.evidence.result}\n`);
    process.stdout.write(`DEFAULT_ACL_GRANT_OPTION_SEMANTICS=${outcome.result.evidence.grantOptionSemanticResult}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${outcome.result.evidenceSha256}\n`);
  } else {
    process.stderr.write('PRODUCTION_APPLICATION_OWNER_RELATION=BLOCKED\n');
    process.stderr.write(`PRODUCTION_APPLICATION_OWNER_RELATION_STAGE=${outcome.failure.stage}\n`);
    process.stderr.write(`PRODUCTION_APPLICATION_OWNER_RELATION_ERROR=${outcome.failure.errorCode}\n`);
    process.stderr.write(`SANITIZED_FAILURE_EVIDENCE_WRITTEN=${Boolean(outcome.failureEvidenceSha256)}\n`);
  }
  process.exitCode = outcome.exitCode;
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
