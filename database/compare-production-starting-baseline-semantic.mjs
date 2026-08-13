import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ACL_SEMANTIC_MODEL_VERSION,
  ACL_SEMANTIC_QUERIES,
  buildAclSemanticSnapshot,
  collectAclSemanticFacts,
  combineStructuralAndAclGate,
  compareAclSemanticSnapshots
} from './acl-semantic-model.mjs';
import { authenticatedTlsConfig, productionConnectionConfig } from './compare-production-catalog.mjs';
import {
  EXPECTED_STARTING_ARTIFACT_SHA256,
  EXPECTED_STARTING_FINGERPRINT,
  compareExactStartingLedger,
  normalizeStartingCatalog,
  validateCatalogQueryScope,
  validateStartingBaselineProvenance
} from './compare-production-starting-baseline.mjs';
import { STARTING_BASELINE_VERSIONS } from './materialize-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import { compareStructuralCatalogs, STRUCTURAL_CATALOG_QUERIES } from './rehearse-structural-schema-parity.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const STRUCTURAL_ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const STRUCTURAL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const ACL_ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json');
const ACL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.sha256');
const READINESS_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-final-readiness.expected.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256');
const PROVENANCE_PATHS = Object.freeze([
  'database/acl-semantic-model.mjs',
  'database/compare-production-starting-baseline-semantic.mjs',
  'database/production-0001-0008-structural-baseline.json',
  'database/production-0001-0008-structural-baseline.sha256',
  'database/production-0001-0008-acl-semantic-baseline.json',
  'database/production-0001-0008-acl-semantic-baseline.sha256',
  'database/production-migration-final-readiness.expected.json'
]);

export const SEMANTIC_STARTING_CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTICS';
export const EXPECTED_PRODUCTION_DATABASE = 'neondb';
export const EXPECTED_PRODUCTION_READONLY_ROLE = 'banke_production_readonly';
export const EXPECTED_ACL_SEMANTIC_BASELINE_SHA256 = '485097ac88f068cc46a73583ceff4ac6d64ad97e007c4ac20262fda0bf8394ec';
export const SEMANTIC_LIVE_EVIDENCE_SCHEMA_VERSION = 1;

const RUNTIME_ROLE = 'banke_api_production';
const ALLOWED_RELATIONS = new Set([
  'public.schema_migrations',
  'pg_catalog.pg_namespace', 'pg_catalog.pg_class', 'pg_catalog.pg_attribute', 'pg_catalog.pg_type',
  'pg_catalog.pg_attrdef', 'pg_catalog.pg_constraint', 'pg_catalog.pg_index', 'pg_catalog.pg_proc',
  'pg_catalog.pg_language', 'pg_catalog.pg_depend', 'pg_catalog.pg_extension', 'pg_catalog.pg_trigger',
  'pg_catalog.pg_sequence', 'pg_catalog.pg_policies', 'pg_catalog.pg_default_acl',
  'pg_catalog.pg_auth_members', 'pg_catalog.pg_roles', 'pg_catalog.pg_database', 'pg_catalog.aclexplode'
]);
const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i;
const FORBIDDEN_EVIDENCE_KEY = /^(?:connectionString|databaseUrl|hostname|endpoint|username|password|credential|secret|token|cookie|authorization|authorizationHeader|projectId|branchId|businessRows|databaseName|roleName|port|rawAcl|principalName)$/i;
const FORBIDDEN_EVIDENCE_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY)-----|\bBearer\s+[A-Za-z0-9._~-]+)/i;
const LEDGER_SQL = 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version';
const TRANSACTION_READ_ONLY_SQL = "SELECT current_setting('transaction_read_only') = 'on' AS read_only_ok";
const IDENTITY_SQL = `SELECT current_database() = $1 AS database_ok, current_user = $2 AS current_role_ok,
  session_user = $2 AS session_role_ok, current_setting('transaction_read_only') = 'on' AS read_only_ok,
  current_setting('server_version_num')::integer AS server_version_number`;
const ROLE_BOUNDARY_SQL = `SELECT NOT roles.rolsuper AND NOT roles.rolcreatedb AND NOT roles.rolcreaterole
  AND NOT roles.rolreplication AND NOT roles.rolbypassrls AND roles.rolcanlogin AND NOT roles.rolinherit
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS granted_role WHERE granted_role.oid <> roles.oid
    AND pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'MEMBER')
    AND (pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'MEMBER WITH ADMIN OPTION')
      OR pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'USAGE') OR pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'SET')))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = roles.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = roles.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = roles.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = roles.oid) AS role_safe
  FROM pg_catalog.pg_roles AS roles WHERE roles.rolname = current_user`;

export const SEMANTIC_LIVE_QUERY_SURFACE = Object.freeze({
  identity: IDENTITY_SQL,
  roleBoundary: ROLE_BOUNDARY_SQL,
  transactionReadOnly: TRANSACTION_READ_ONLY_SQL,
  ledger: LEDGER_SQL,
  structural: STRUCTURAL_CATALOG_QUERIES,
  aclSemantic: ACL_SEMANTIC_QUERIES
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function withoutAcl(value) {
  if (Array.isArray(value)) return value.map(withoutAcl);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'acl').map(([key, child]) => [key, withoutAcl(child)]));
}

function objectCounts(catalog) {
  return Object.fromEntries(Object.entries(catalog || {}).map(([section, rows]) => [section, Array.isArray(rows) ? rows.length : 0]).sort());
}

function companionHash(text, fileName) {
  return String(text || '').trim().match(new RegExp(`^([a-f0-9]{64})\\s+${fileName.replaceAll('.', '\\.')}$`))?.[1] || null;
}

function gitOutput(args, execFileSyncImpl = execFileSync) {
  return execFileSyncImpl('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function validateRepositoryExecutionProvenance(env = process.env, { execFileSyncImpl = execFileSync } = {}) {
  const failures = [];
  const authorizedCommit = String(env.BANK_PRODUCTION_EVIDENCE_COMMIT_SHA || '').trim();
  let head = '';
  try {
    head = gitOutput(['rev-parse', 'HEAD'], execFileSyncImpl);
    if (!/^[a-f0-9]{40}$/.test(head)) failures.push('REPOSITORY_HEAD_INVALID');
    if (authorizedCommit !== head) failures.push('AUTHORIZED_COMMIT_MISMATCH');
    if (gitOutput(['branch', '--show-current'], execFileSyncImpl) !== 'main') failures.push('REPOSITORY_BRANCH_NOT_MAIN');
    if (gitOutput(['rev-parse', 'origin/main'], execFileSyncImpl) !== head) failures.push('ORIGIN_MAIN_NOT_AT_HEAD');
    if (gitOutput(['status', '--porcelain', '--untracked-files=no'], execFileSyncImpl)) failures.push('TRACKED_WORKTREE_NOT_CLEAN');
    const tracked = gitOutput(['ls-files', '--error-unmatch', '--', ...PROVENANCE_PATHS], execFileSyncImpl).split(/\r?\n/).filter(Boolean);
    if (tracked.length !== PROVENANCE_PATHS.length) failures.push('PROVENANCE_FILE_NOT_TRACKED');
  } catch {
    failures.push('REPOSITORY_PROVENANCE_COMMAND_FAILED');
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), commitSha: /^[a-f0-9]{40}$/.test(head) ? head : null });
}

export function semanticStartingConnectionConfig(env = process.env) {
  const config = productionConnectionConfig(env, {
    confirmation: SEMANTIC_STARTING_CONFIRMATION,
    confirmationError: 'PRODUCTION_STARTING_SEMANTIC_CONFIRMATION_REQUIRED'
  });
  if (config.expectedDatabase !== EXPECTED_PRODUCTION_DATABASE || config.expectedRole !== EXPECTED_PRODUCTION_READONLY_ROLE) {
    throw new Error('PRODUCTION_STARTING_SEMANTIC_TARGET_IDENTITY_BLOCKED');
  }
  return Object.freeze({ ...config, effectiveTlsMode: 'verify-full' });
}

function inspectQuery(section, sql, failures) {
  const text = String(sql || '').trim();
  const executableText = text.replace(/'(?:''|[^'])*'/g, "''");
  if (!/^(?:WITH|SELECT)\b/i.test(text)) failures.push(`NON_SELECT_QUERY:${section}`);
  if (FORBIDDEN_SQL.test(executableText)) failures.push(`MUTATING_SQL_TOKEN:${section}`);
  for (const match of executableText.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?([A-Za-z0-9_."]+)/gi)) {
    const relation = match[1].replaceAll('"', '').toLowerCase();
    if (!ALLOWED_RELATIONS.has(relation) && !['modeled_objects', 'object'].includes(relation)) failures.push(`CATALOG_RELATION_BLOCKED:${section}:${relation}`);
  }
}

export function validateSemanticQueryScope(surface = SEMANTIC_LIVE_QUERY_SURFACE) {
  const failures = [];
  if (validateCatalogQueryScope(surface.structural).status !== 'PASS') failures.push('STRUCTURAL_QUERY_SCOPE_BLOCKED');
  if (canonicalJson(Object.keys(surface.aclSemantic || {}).sort()) !== canonicalJson(Object.keys(ACL_SEMANTIC_QUERIES).sort())) failures.push('ACL_QUERY_SECTION_SET_MISMATCH');
  for (const key of ['identity', 'roleBoundary', 'transactionReadOnly', 'ledger']) inspectQuery(key, surface[key], failures);
  for (const [section, sql] of Object.entries(surface.structural || {})) inspectQuery(`structural.${section}`, sql, failures);
  for (const [section, sql] of Object.entries(surface.aclSemantic || {})) inspectQuery(`acl.${section}`, sql, failures);
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

export function validateAclSemanticBaseline({ text, hashText, tracked = true }) {
  const failures = [];
  let artifact = null;
  try { artifact = JSON.parse(text); } catch { failures.push('ACL_ARTIFACT_JSON_INVALID'); }
  const actualHash = sha256(text);
  if (!tracked) failures.push('ACL_ARTIFACT_NOT_GIT_TRACKED');
  if (companionHash(hashText, 'production-0001-0008-acl-semantic-baseline.json') !== actualHash) failures.push('ACL_ARTIFACT_COMPANION_HASH_MISMATCH');
  if (actualHash !== EXPECTED_ACL_SEMANTIC_BASELINE_SHA256) failures.push('ACL_ARTIFACT_SHA256_MISMATCH');
  if (artifact?.scope !== 'REPOSITORY_0001_0008_ACL_SEMANTIC_BASELINE'
      || artifact?.modelVersion !== ACL_SEMANTIC_MODEL_VERSION || artifact?.snapshot?.status !== 'PASS'
      || canonicalJson(artifact?.appliedMigrations) !== canonicalJson(STARTING_BASELINE_VERSIONS)) failures.push('ACL_ARTIFACT_CONTRACT_BLOCKED');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), artifact, artifactSha256: actualHash });
}

export function validateSemanticLiveEvidence(value) {
  const failures = [];
  const visit = input => {
    if (typeof input === 'string' && FORBIDDEN_EVIDENCE_VALUE.test(input)) failures.push('FORBIDDEN_EVIDENCE_VALUE');
    if (!input || typeof input !== 'object') return;
    for (const [key, child] of Object.entries(input)) {
      if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_EVIDENCE_FIELD:${key}`);
      visit(child);
    }
  };
  visit(value);
  const required = [
    'schemaVersion', 'phase', 'sprintNumberingCappedAt', 'generatedAt', 'repositoryCommitSha', 'comparatorModelVersion',
    'expectedStructuralArtifactSha256', 'expectedStructuralFingerprint', 'expectedAclArtifactSha256', 'expectedAclSemanticFingerprint',
    'expectedMigrationSequence', 'identityResult', 'tlsVerification', 'roleBoundaryResult', 'transactionReadOnlyResult',
    'ledgerResult', 'structuralNonAclResult', 'semanticAclResult', 'expectedStructuralSectionCounts', 'observedStructuralSectionCounts',
    'expectedAclObjectCount', 'observedAclObjectCount', 'expectedNonAclFingerprint', 'observedNonAclFingerprint',
    'observedAclSemanticFingerprint', 'structuralMismatchSummary', 'semanticAclMismatchSummary', 'structuralStartingBaseline',
    'connectionAttemptCount', 'retryCount', 'productionConnectionAttempted', 'productionMutation', 'finalStatus'
  ];
  for (const key of required) if (!Object.hasOwn(value || {}, key)) failures.push(`REQUIRED_EVIDENCE_FIELD_MISSING:${key}`);
  if (value?.schemaVersion !== SEMANTIC_LIVE_EVIDENCE_SCHEMA_VERSION || value?.phase !== 'PRODUCTION_CLOSURE_PHASE_2E'
      || value?.sprintNumberingCappedAt !== 65 || value?.comparatorModelVersion !== ACL_SEMANTIC_MODEL_VERSION) failures.push('EVIDENCE_CONTRACT_MISMATCH');
  if (value?.expectedStructuralArtifactSha256 !== EXPECTED_STARTING_ARTIFACT_SHA256
      || value?.expectedStructuralFingerprint !== EXPECTED_STARTING_FINGERPRINT
      || value?.expectedAclArtifactSha256 !== EXPECTED_ACL_SEMANTIC_BASELINE_SHA256
      || canonicalJson(value?.expectedMigrationSequence) !== canonicalJson(STARTING_BASELINE_VERSIONS)) failures.push('EVIDENCE_PROVENANCE_MISMATCH');
  if (value?.connectionAttemptCount !== 1 || value?.retryCount !== 0 || value?.productionConnectionAttempted !== true || value?.productionMutation !== false) failures.push('EVIDENCE_CONNECTION_BOUNDARY_MISMATCH');
  const expectedCountKeys = ['columns', 'constraints', 'extensions', 'functions', 'indexes', 'migrationLedger', 'policies', 'relations', 'schemas', 'sequences', 'triggers'];
  for (const field of ['expectedStructuralSectionCounts', 'observedStructuralSectionCounts']) {
    const counts = value?.[field];
    if (canonicalJson(Object.keys(counts || {}).sort()) !== canonicalJson(expectedCountKeys)
        || Object.values(counts || {}).some(count => !Number.isInteger(count) || count < 0)) failures.push(`EVIDENCE_SECTION_COUNTS_INVALID:${field}`);
  }
  const expectedGate = combineStructuralAndAclGate(value?.structuralNonAclResult, value?.semanticAclResult);
  if (value?.structuralStartingBaseline !== expectedGate || value?.finalStatus !== (expectedGate === 'PASS' ? 'PASS' : 'BLOCKED')) failures.push('EVIDENCE_GATE_RESULT_INCONSISTENT');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

async function tracked(paths) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', ...paths], { cwd: PROJECT_ROOT, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

async function loadArtifacts() {
  const [structuralText, structuralHash, aclText, aclHash, readiness, structuralTracked, aclTracked] = await Promise.all([
    readFile(STRUCTURAL_ARTIFACT_PATH, 'utf8'), readFile(STRUCTURAL_HASH_PATH, 'utf8'),
    readFile(ACL_ARTIFACT_PATH, 'utf8'), readFile(ACL_HASH_PATH, 'utf8'), readFile(READINESS_PATH, 'utf8').then(JSON.parse),
    tracked(['database/production-0001-0008-structural-baseline.json', 'database/production-0001-0008-structural-baseline.sha256']),
    tracked(['database/production-0001-0008-acl-semantic-baseline.json', 'database/production-0001-0008-acl-semantic-baseline.sha256'])
  ]);
  const structural = validateStartingBaselineProvenance({ artifactText: structuralText, hashText: structuralHash, readiness, tracked: structuralTracked });
  if (structural.status !== 'PASS') throw new Error('SEMANTIC_STRUCTURAL_ARTIFACT_BLOCKED');
  const acl = validateAclSemanticBaseline({ text: aclText, hashText: aclHash, tracked: aclTracked });
  if (acl.status !== 'PASS') throw new Error('SEMANTIC_ACL_ARTIFACT_BLOCKED');
  return { structural, acl };
}

async function writeEvidence(evidence, evidencePath, evidenceHashPath) {
  const validation = validateSemanticLiveEvidence(evidence);
  if (validation.status !== 'PASS') throw new Error(`SEMANTIC_LIVE_EVIDENCE_SANITIZATION_BLOCKED:${validation.failures.join(',')}`);
  const serialized = canonicalJson(evidence);
  const evidenceHash = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(evidenceHashPath, `${evidenceHash}  ${path.basename(evidencePath)}\n`, 'utf8');
  return evidenceHash;
}

export async function compareProductionStartingBaselineSemantics({
  env = process.env,
  ClientImpl = Client,
  evidencePath = EVIDENCE_PATH,
  evidenceHashPath = EVIDENCE_HASH_PATH,
  repositoryVerifier = validateRepositoryExecutionProvenance,
  collectAclFactsImpl = collectAclSemanticFacts,
  buildAclSnapshotImpl = buildAclSemanticSnapshot
} = {}) {
  const config = semanticStartingConnectionConfig(env);
  const queryValidation = validateSemanticQueryScope();
  if (queryValidation.status !== 'PASS') throw new Error('SEMANTIC_QUERY_SCOPE_BLOCKED');
  const repository = await repositoryVerifier(env);
  if (repository?.status !== 'PASS' || !/^[a-f0-9]{40}$/.test(repository?.commitSha || '')) throw new Error('SEMANTIC_REPOSITORY_PROVENANCE_BLOCKED');
  const artifacts = await loadArtifacts();
  const ca = await readFile(config.caPath, 'utf8');
  const client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
  let transactionOpen = false;
  let connectionAttemptCount = 0;
  try {
    connectionAttemptCount += 1;
    await client.connect();
    const identity = (await client.query(IDENTITY_SQL, [EXPECTED_PRODUCTION_DATABASE, EXPECTED_PRODUCTION_READONLY_ROLE])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('SEMANTIC_IDENTITY_BOUNDARY_BLOCKED');
    if (!(await client.query(ROLE_BOUNDARY_SQL)).rows[0]?.role_safe) throw new Error('SEMANTIC_ROLE_BOUNDARY_BLOCKED');
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    if (!(await client.query(TRANSACTION_READ_ONLY_SQL)).rows[0]?.read_only_ok) throw new Error('SEMANTIC_READ_ONLY_TRANSACTION_BLOCKED');
    const ledger = (await client.query(LEDGER_SQL)).rows;
    const ledgerResult = compareExactStartingLedger(artifacts.structural.artifact.catalog.migrationLedger, ledger);
    if (ledgerResult.status !== 'PASS') throw new Error('SEMANTIC_STARTING_LEDGER_BLOCKED');
    const rawCatalog = { migrationLedger: ledger };
    for (const [section, sql] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) rawCatalog[section] = (await client.query(sql)).rows;
    const migrationOwner = rawCatalog.schemas.find(row => row.schema_name === 'app_private')?.owner_name;
    if (!migrationOwner) throw new Error('SEMANTIC_MIGRATION_OWNER_UNRESOLVED');
    const observedStructural = normalizeStartingCatalog(rawCatalog, migrationOwner);
    const expectedNonAcl = withoutAcl(artifacts.structural.artifact.catalog);
    const observedNonAcl = withoutAcl(observedStructural);
    const structuralComparison = compareStructuralCatalogs(observedNonAcl, expectedNonAcl);
    const structuralNonAclResult = structuralComparison.status === 'PASS' ? 'PASS' : 'MISMATCH';
    const aclFacts = await collectAclFactsImpl(client);
    const observedAcl = buildAclSnapshotImpl(aclFacts, {
      expectedOwners: [migrationOwner, 'pg_database_owner'],
      expectedReadonlyRole: EXPECTED_PRODUCTION_READONLY_ROLE,
      expectedRuntimeRoles: [RUNTIME_ROLE],
      extensionOwners: { pgcrypto: ['cloud_admin'] },
      systemManagedPrincipals: ['cloud_admin']
    });
    const aclComparison = compareAclSemanticSnapshots(artifacts.acl.artifact.snapshot, observedAcl);
    const finalGate = combineStructuralAndAclGate(structuralNonAclResult, aclComparison.status);
    await client.query('ROLLBACK');
    transactionOpen = false;
    const evidence = canonicalValue({
      schemaVersion: SEMANTIC_LIVE_EVIDENCE_SCHEMA_VERSION,
      phase: 'PRODUCTION_CLOSURE_PHASE_2E',
      sprintNumberingCappedAt: 65,
      generatedAt: new Date().toISOString(),
      repositoryCommitSha: repository.commitSha,
      comparatorModelVersion: ACL_SEMANTIC_MODEL_VERSION,
      expectedStructuralArtifactSha256: artifacts.structural.artifactSha256,
      expectedStructuralFingerprint: EXPECTED_STARTING_FINGERPRINT,
      expectedAclArtifactSha256: artifacts.acl.artifactSha256,
      expectedAclSemanticFingerprint: artifacts.acl.artifact.snapshot.fingerprint,
      expectedMigrationSequence: STARTING_BASELINE_VERSIONS,
      identityResult: 'PASS',
      tlsVerification: 'VERIFY_FULL_PASS',
      roleBoundaryResult: 'PASS',
      transactionReadOnlyResult: 'PASS',
      ledgerResult,
      structuralNonAclResult,
      semanticAclResult: aclComparison.status,
      expectedStructuralSectionCounts: objectCounts(expectedNonAcl),
      observedStructuralSectionCounts: objectCounts(observedNonAcl),
      expectedAclObjectCount: artifacts.acl.artifact.snapshot.audit.objectCount,
      observedAclObjectCount: observedAcl.audit?.objectCount ?? null,
      expectedNonAclFingerprint: sha256(canonicalJson(expectedNonAcl)),
      observedNonAclFingerprint: sha256(canonicalJson(observedNonAcl)),
      observedAclSemanticFingerprint: observedAcl.fingerprint || null,
      structuralMismatchSummary: {
        missing: structuralComparison.missingObjects || [],
        unexpected: structuralComparison.unexpectedObjects || [],
        mismatched: (structuralComparison.mismatchedObjects || []).map(item => ({ section: item.section, key: item.key, changedFields: item.changedFields }))
      },
      semanticAclMismatchSummary: { blockers: aclComparison.blockers || [], differences: aclComparison.differences || [] },
      structuralStartingBaseline: finalGate,
      connectionAttemptCount,
      retryCount: 0,
      productionConnectionAttempted: true,
      productionMutation: false,
      finalStatus: finalGate === 'PASS' ? 'PASS' : 'BLOCKED'
    });
    const evidenceSha256 = await writeEvidence(evidence, evidencePath, evidenceHashPath);
    return { evidence, evidenceSha256 };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  try {
    const result = await compareProductionStartingBaselineSemantics();
    process.stdout.write(`PRODUCTION_STARTING_BASELINE_SEMANTIC=${result.evidence.finalStatus}\n`);
    process.stdout.write(`STRUCTURAL_NON_ACL=${result.evidence.structuralNonAclResult}\n`);
    process.stdout.write(`ACL_SEMANTIC=${result.evidence.semanticAclResult}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${result.evidenceSha256}\n`);
    if (result.evidence.finalStatus !== 'PASS') process.exitCode = 2;
  } catch {
    process.stderr.write('PRODUCTION_STARTING_BASELINE_SEMANTIC=BLOCKED\n');
    process.stderr.write('PRODUCTION_STARTING_BASELINE_SEMANTIC_ERROR=SANITIZED_FAILURE\n');
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
