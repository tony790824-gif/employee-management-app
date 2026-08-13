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
  compareExactStartingLedger,
  normalizeStartingCatalog,
  validateCatalogQueryScope,
  validateStartingBaselineProvenance
} from './compare-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import { compareStructuralCatalogs, STRUCTURAL_CATALOG_QUERIES } from './rehearse-structural-schema-parity.mjs';
import { validateSanitizedEvidence } from './rehearse-production-migration-upgrade.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const STRUCTURAL_ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const STRUCTURAL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.sha256');
const ACL_ARTIFACT_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json');
const ACL_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.sha256');
const READINESS_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-final-readiness.expected.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256');
const CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTIC';
const RUNTIME_ROLE = 'banke_api_production';
const ALLOWED_RELATIONS = new Set([
  'pg_catalog.pg_namespace', 'pg_catalog.pg_class', 'pg_catalog.pg_attribute', 'pg_catalog.pg_type',
  'pg_catalog.pg_attrdef', 'pg_catalog.pg_constraint', 'pg_catalog.pg_index', 'pg_catalog.pg_proc',
  'pg_catalog.pg_language', 'pg_catalog.pg_depend', 'pg_catalog.pg_extension', 'pg_catalog.pg_trigger',
  'pg_catalog.pg_sequence', 'pg_catalog.pg_policies', 'pg_catalog.pg_default_acl',
  'pg_catalog.pg_auth_members', 'pg_catalog.pg_roles', 'pg_catalog.aclexplode'
]);
const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX|LOCK|SET|RESET|DISCARD|LISTEN|NOTIFY|UNLISTEN)\b/i;
const LEDGER_SQL = 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version';
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

function withoutAcl(value) {
  if (Array.isArray(value)) return value.map(withoutAcl);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'acl').map(([key, child]) => [key, withoutAcl(child)]));
}

function companionHash(text, fileName) {
  return String(text || '').trim().match(new RegExp(`^([a-f0-9]{64})\\s+${fileName.replaceAll('.', '\\.')}$`))?.[1] || null;
}

export function validateSemanticQueryScope() {
  const failures = [];
  for (const [section, sql] of Object.entries(ACL_SEMANTIC_QUERIES)) {
    const text = String(sql || '').trim();
    if (!/^(?:WITH|SELECT)\b/i.test(text)) failures.push(`NON_SELECT_QUERY:${section}`);
    if (FORBIDDEN_SQL.test(text)) failures.push(`MUTATING_SQL_TOKEN:${section}`);
    for (const match of text.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?([A-Za-z0-9_."]+)/gi)) {
      const relation = match[1].replaceAll('"', '').toLowerCase();
      if (!ALLOWED_RELATIONS.has(relation) && !['modeled_objects', 'object'].includes(relation)) failures.push(`CATALOG_RELATION_BLOCKED:${section}:${relation}`);
    }
  }
  return { status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() };
}

async function loadArtifacts() {
  const [structuralText, structuralHash, aclText, aclHash, readiness] = await Promise.all([
    readFile(STRUCTURAL_ARTIFACT_PATH, 'utf8'), readFile(STRUCTURAL_HASH_PATH, 'utf8'),
    readFile(ACL_ARTIFACT_PATH, 'utf8'), readFile(ACL_HASH_PATH, 'utf8'), readFile(READINESS_PATH, 'utf8').then(JSON.parse)
  ]);
  const structural = validateStartingBaselineProvenance({ artifactText: structuralText, hashText: structuralHash, readiness, tracked: true });
  if (structural.status !== 'PASS') throw new Error('SEMANTIC_STRUCTURAL_ARTIFACT_BLOCKED');
  const aclSha = sha256(aclText);
  if (companionHash(aclHash, 'production-0001-0008-acl-semantic-baseline.json') !== aclSha) throw new Error('SEMANTIC_ACL_ARTIFACT_HASH_BLOCKED');
  const acl = JSON.parse(aclText);
  if (acl.scope !== 'REPOSITORY_0001_0008_ACL_SEMANTIC_BASELINE' || acl.modelVersion !== ACL_SEMANTIC_MODEL_VERSION || acl.snapshot?.status !== 'PASS') throw new Error('SEMANTIC_ACL_ARTIFACT_CONTRACT_BLOCKED');
  return { structural, acl, aclSha };
}

export async function compareProductionStartingBaselineSemantics({ env = process.env, ClientImpl = Client } = {}) {
  const config = productionConnectionConfig(env, { confirmation: CONFIRMATION, confirmationError: 'PRODUCTION_STARTING_SEMANTIC_CONFIRMATION_REQUIRED' });
  if (validateCatalogQueryScope().status !== 'PASS' || validateSemanticQueryScope().status !== 'PASS') throw new Error('SEMANTIC_QUERY_SCOPE_BLOCKED');
  const artifacts = await loadArtifacts();
  const ca = await readFile(config.caPath, 'utf8');
  const client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
  await client.connect();
  let transactionOpen = false;
  try {
    const identity = (await client.query(IDENTITY_SQL, [config.expectedDatabase, config.expectedRole])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('SEMANTIC_IDENTITY_BOUNDARY_BLOCKED');
    if (!(await client.query(ROLE_BOUNDARY_SQL)).rows[0]?.role_safe) throw new Error('SEMANTIC_ROLE_BOUNDARY_BLOCKED');
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    const ledger = (await client.query(LEDGER_SQL)).rows;
    const ledgerResult = compareExactStartingLedger(artifacts.structural.artifact.catalog.migrationLedger, ledger);
    if (ledgerResult.status !== 'PASS') throw new Error('SEMANTIC_STARTING_LEDGER_BLOCKED');
    const rawCatalog = { migrationLedger: ledger };
    for (const [section, sql] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) rawCatalog[section] = (await client.query(sql)).rows;
    const migrationOwner = rawCatalog.schemas.find(row => row.schema_name === 'app_private')?.owner_name;
    if (!migrationOwner) throw new Error('SEMANTIC_MIGRATION_OWNER_UNRESOLVED');
    const observedStructural = normalizeStartingCatalog(rawCatalog, migrationOwner);
    const structuralComparison = compareStructuralCatalogs(withoutAcl(observedStructural), withoutAcl(artifacts.structural.artifact.catalog));
    const aclFacts = await collectAclSemanticFacts(client);
    const observedAcl = buildAclSemanticSnapshot(aclFacts, {
      expectedOwners: [migrationOwner, 'pg_database_owner'],
      expectedReadonlyRole: config.expectedRole,
      expectedRuntimeRoles: [RUNTIME_ROLE],
      extensionOwners: { pgcrypto: ['cloud_admin'] },
      systemManagedPrincipals: ['cloud_admin']
    });
    const aclComparison = compareAclSemanticSnapshots(artifacts.acl.snapshot, observedAcl);
    const finalGate = combineStructuralAndAclGate(structuralComparison.status, aclComparison.status);
    await client.query('ROLLBACK');
    transactionOpen = false;
    const evidence = {
      schemaVersion: 1,
      phase: 'PRODUCTION_CLOSURE_PHASE_2E',
      sprintNumberingCappedAt: 65,
      generatedAt: new Date().toISOString(),
      repositoryCommitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
      modelVersion: ACL_SEMANTIC_MODEL_VERSION,
      structuralArtifactSha256: artifacts.structural.artifactSha256,
      aclArtifactSha256: artifacts.aclSha,
      identityResult: 'PASS',
      tlsVerification: 'VERIFY_FULL_PASS',
      roleBoundaryResult: 'PASS',
      ledgerResult,
      structuralNonAclResult: structuralComparison.status,
      semanticAclResult: aclComparison.status,
      expectedAclSemanticFingerprint: artifacts.acl.snapshot.fingerprint,
      observedAclSemanticFingerprint: observedAcl.fingerprint,
      semanticAclDifferences: aclComparison.differences || [],
      structuralStartingBaseline: finalGate,
      productionConnectionAttempted: true,
      productionMutation: false,
      finalStatus: finalGate === 'PASS' ? 'PASS' : 'BLOCKED'
    };
    const sanitized = validateSanitizedEvidence(evidence);
    if (sanitized.status !== 'PASS') throw new Error('SEMANTIC_LIVE_EVIDENCE_SANITIZATION_BLOCKED');
    const serialized = canonicalJson(evidence);
    const evidenceHash = sha256(serialized);
    await writeFile(EVIDENCE_PATH, serialized, 'utf8');
    await writeFile(EVIDENCE_HASH_PATH, `${evidenceHash}  ${path.basename(EVIDENCE_PATH)}\n`, 'utf8');
    return { evidence, evidenceSha256: evidenceHash };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
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
