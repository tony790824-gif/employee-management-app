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
import { validateDefaultAclEvidence } from './default-acl-principal-classification.mjs';
import {
  OPAQUE_GRANTEE_CLASSIFICATION_SQL,
  OPAQUE_GRANTEE_MODEL_VERSION,
  buildOpaqueGranteeClassification,
  validateOpaqueGranteeEvidence,
  validateOpaqueGranteeQuery
} from './default-acl-opaque-grantee-classification.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json');
const SOURCE_EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.sha256');
const STARTING_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.sha256');
const PROVENANCE_PATHS = Object.freeze([
  'database/default-acl-opaque-grantee-classification.mjs',
  'database/compare-production-default-acl-opaque-grantee.mjs',
  'database/production-0001-0008-structural-baseline.json',
  'docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json',
  'docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.sha256',
  'docs/PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.schema.json'
]);

export const OPAQUE_GRANTEE_CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE';
export const SOURCE_PHASE_2I_EVIDENCE_SHA256 = 'bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c';
export const OPAQUE_GRANTEE_SCOPE = 'UNRESOLVED_PUBLIC_SCHEMA_RELATION_SEQUENCE_GRANTEE_ONLY';
export const EXPECTED_RUNTIME_ROLE = 'banke_api_production';
export const EXPECTED_PLATFORM_ROLE = 'cloud_admin';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function companionHash(text, fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '').trim().match(new RegExp(`^([a-f0-9]{64})\\s+${escaped}$`))?.[1] || null;
}

function gitOutput(args, execFileSyncImpl = execFileSync) {
  return execFileSyncImpl('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function opaqueGranteeConnectionConfig(env = process.env) {
  const config = productionConnectionConfig(env, {
    confirmation: OPAQUE_GRANTEE_CONFIRMATION,
    confirmationError: 'PRODUCTION_OPAQUE_GRANTEE_CONFIRMATION_REQUIRED'
  });
  if (config.expectedDatabase !== EXPECTED_PRODUCTION_DATABASE || config.expectedRole !== EXPECTED_PRODUCTION_READONLY_ROLE) {
    throw new Error('PRODUCTION_OPAQUE_GRANTEE_TARGET_IDENTITY_BLOCKED');
  }
  return Object.freeze({ ...config, effectiveTlsMode: 'verify-full' });
}

export function validateOpaqueGranteeRepositoryProvenance(env = process.env, { execFileSyncImpl = execFileSync } = {}) {
  const failures = [];
  const authorizedCommit = String(env.BANK_PRODUCTION_EVIDENCE_COMMIT_SHA || '').trim();
  let head = '';
  try {
    head = gitOutput(['rev-parse', 'HEAD'], execFileSyncImpl);
    if (!/^[a-f0-9]{40}$/.test(head)) failures.push('OPAQUE_GRANTEE_HEAD_INVALID');
    if (authorizedCommit !== head) failures.push('OPAQUE_GRANTEE_AUTHORIZED_COMMIT_MISMATCH');
    if (gitOutput(['branch', '--show-current'], execFileSyncImpl) !== 'main') failures.push('OPAQUE_GRANTEE_BRANCH_NOT_MAIN');
    if (gitOutput(['rev-parse', 'origin/main'], execFileSyncImpl) !== head) failures.push('OPAQUE_GRANTEE_ORIGIN_NOT_AT_HEAD');
    if (gitOutput(['status', '--porcelain', '--untracked-files=no'], execFileSyncImpl)) failures.push('OPAQUE_GRANTEE_TRACKED_WORKTREE_NOT_CLEAN');
    const tracked = gitOutput(['ls-files', '--error-unmatch', '--', ...PROVENANCE_PATHS], execFileSyncImpl).split(/\r?\n/).filter(Boolean);
    if (tracked.length !== PROVENANCE_PATHS.length) failures.push('OPAQUE_GRANTEE_PROVENANCE_FILE_NOT_TRACKED');
  } catch {
    failures.push('OPAQUE_GRANTEE_REPOSITORY_PROVENANCE_COMMAND_FAILED');
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), commitSha: /^[a-f0-9]{40}$/.test(head) ? head : null });
}

export function validateSourcePhase2IEvidence({ evidenceText, hashText }) {
  const failures = [];
  let evidence = null;
  try { evidence = JSON.parse(evidenceText); } catch { failures.push('OPAQUE_GRANTEE_SOURCE_JSON_INVALID'); }
  const actualHash = sha256(evidenceText);
  if (actualHash !== SOURCE_PHASE_2I_EVIDENCE_SHA256) failures.push('OPAQUE_GRANTEE_SOURCE_HASH_MISMATCH');
  if (companionHash(hashText, 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json') !== actualHash) failures.push('OPAQUE_GRANTEE_SOURCE_COMPANION_HASH_MISMATCH');
  if (evidence && validateDefaultAclEvidence(evidence).status !== 'PASS') failures.push('OPAQUE_GRANTEE_SOURCE_SCHEMA_BLOCKED');
  const exactBlockers = [
    'DEFAULT_ACL_OTHER_PRINCIPAL_REVIEW_REQUIRED:PUBLIC_SCHEMA|RELATION|GRANTEE',
    'DEFAULT_ACL_OTHER_PRINCIPAL_REVIEW_REQUIRED:PUBLIC_SCHEMA|SEQUENCE|GRANTEE'
  ];
  if (evidence?.finalStatus !== 'BLOCKED' || evidence?.defaultAclSemanticResult !== 'BLOCKED'
      || canonicalJson(evidence?.blockers || []) !== canonicalJson(exactBlockers)
      || evidence?.identityResult !== 'PASS' || evidence?.tlsVerification !== 'VERIFY_FULL_PASS'
      || evidence?.roleBoundaryResult !== 'PASS' || evidence?.transactionReadOnlyResult !== 'PASS'
      || evidence?.ledgerResult?.status !== 'PASS') failures.push('OPAQUE_GRANTEE_SOURCE_SCOPE_MISMATCH');
  const unresolved = (evidence?.entries || []).filter(entry => entry.aclState === 'EXPLICIT_DEFAULT_ACL' && entry.principalClassifications?.some(position => position.position === 'GRANTEE' && position.category === 'OTHER_NAMED_PRINCIPAL'));
  if (unresolved.length !== 11 || new Set(unresolved.map(entry => entry.defaultAclKey)).size !== 2 || unresolved.some(entry => entry.grantOption !== true)) failures.push('OPAQUE_GRANTEE_SOURCE_UNRESOLVED_SET_MISMATCH');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), evidence, evidenceSha256: actualHash });
}

async function loadProvenance() {
  const [sourceText, sourceHashText, baselineText] = await Promise.all([
    readFile(SOURCE_EVIDENCE_PATH, 'utf8'),
    readFile(SOURCE_EVIDENCE_HASH_PATH, 'utf8'),
    readFile(STARTING_BASELINE_PATH, 'utf8')
  ]);
  const source = validateSourcePhase2IEvidence({ evidenceText: sourceText, hashText: sourceHashText });
  if (source.status !== 'PASS') throw new Error('OPAQUE_GRANTEE_SOURCE_EVIDENCE_BLOCKED');
  const baseline = JSON.parse(baselineText);
  if (!Array.isArray(baseline?.catalog?.migrationLedger) || baseline.catalog.migrationLedger.length !== 8) throw new Error('OPAQUE_GRANTEE_STARTING_LEDGER_MISSING');
  return { source, expectedLedger: baseline.catalog.migrationLedger };
}

async function writeEvidence(evidence, evidencePath, evidenceHashPath) {
  const validation = validateOpaqueGranteeEvidence(evidence);
  if (validation.status !== 'PASS') throw new Error('OPAQUE_GRANTEE_EVIDENCE_SANITIZATION_BLOCKED');
  const serialized = canonicalJson(evidence);
  const evidenceSha256 = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(evidenceHashPath, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8');
  return evidenceSha256;
}

export async function compareProductionOpaqueDefaultAclGrantee({
  env = process.env,
  ClientImpl = Client,
  repositoryVerifier = validateOpaqueGranteeRepositoryProvenance,
  provenanceLoader = loadProvenance,
  evidencePath = EVIDENCE_PATH,
  evidenceHashPath = EVIDENCE_HASH_PATH
} = {}) {
  const config = opaqueGranteeConnectionConfig(env);
  if (validateOpaqueGranteeQuery().status !== 'PASS') throw new Error('OPAQUE_GRANTEE_QUERY_SCOPE_BLOCKED');
  const repository = await repositoryVerifier(env);
  if (repository?.status !== 'PASS' || !/^[a-f0-9]{40}$/.test(repository?.commitSha || '')) throw new Error('OPAQUE_GRANTEE_REPOSITORY_PROVENANCE_BLOCKED');
  const provenance = await provenanceLoader();
  const ca = await readFile(config.caPath, 'utf8');
  const client = new ClientImpl({ ...config.client, ssl: authenticatedTlsConfig(config, ca) });
  let transactionOpen = false;
  let connectionAttemptCount = 0;
  let cleanupResult = 'NOT_STARTED';
  let evidence;
  try {
    connectionAttemptCount += 1;
    await client.connect();
    const identity = (await client.query(SEMANTIC_LIVE_QUERY_SURFACE.identity, [EXPECTED_PRODUCTION_DATABASE, EXPECTED_PRODUCTION_READONLY_ROLE])).rows[0];
    if (!identity?.database_ok || !identity?.current_role_ok || !identity?.session_role_ok || !identity?.read_only_ok
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('OPAQUE_GRANTEE_IDENTITY_BOUNDARY_BLOCKED');
    if (!(await client.query(SEMANTIC_LIVE_QUERY_SURFACE.roleBoundary)).rows[0]?.role_safe) throw new Error('OPAQUE_GRANTEE_ROLE_BOUNDARY_BLOCKED');
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    if (!(await client.query(SEMANTIC_LIVE_QUERY_SURFACE.transactionReadOnly)).rows[0]?.read_only_ok) throw new Error('OPAQUE_GRANTEE_READ_ONLY_TRANSACTION_BLOCKED');
    const ledger = (await client.query(SEMANTIC_LIVE_QUERY_SURFACE.ledger)).rows;
    const ledgerResult = compareExactStartingLedger(provenance.expectedLedger, ledger);
    if (ledgerResult.status !== 'PASS') throw new Error('OPAQUE_GRANTEE_STARTING_LEDGER_BLOCKED');
    const rows = (await client.query(OPAQUE_GRANTEE_CLASSIFICATION_SQL, [EXPECTED_PRODUCTION_READONLY_ROLE, EXPECTED_RUNTIME_ROLE, EXPECTED_PLATFORM_ROLE])).rows;
    const classification = buildOpaqueGranteeClassification(rows);
    await client.query('ROLLBACK');
    transactionOpen = false;
    evidence = canonicalValue({
      schemaVersion: 1,
      phase: 'PRODUCTION_CLOSURE_PHASE_2J_OPAQUE_GRANTEE_SUPPLEMENT',
      sprintNumberingCappedAt: 65,
      generatedAt: new Date().toISOString(),
      repositoryCommitSha: repository.commitSha,
      sourcePhase2IEvidenceSha256: provenance.source.evidenceSha256,
      modelVersion: OPAQUE_GRANTEE_MODEL_VERSION,
      scope: OPAQUE_GRANTEE_SCOPE,
      identityResult: 'PASS',
      tlsVerification: 'VERIFY_FULL_PASS',
      roleBoundaryResult: 'PASS',
      transactionReadOnlyResult: 'PASS',
      ledgerResult,
      classifications: classification.classifications,
      blockers: classification.blockers,
      classificationFingerprint: classification.fingerprint,
      opaqueGranteeResult: classification.status,
      aclSemanticGate: 'BLOCKED_PENDING_SEMANTIC_RECOMPOSITION',
      connectionAttemptCount,
      retryCount: 0,
      productionConnectionAttempted: true,
      productionMutation: false,
      businessRowReads: 'NONE',
      rawOidPersisted: false,
      rawPrincipalNamePersisted: false,
      cleanupResult: 'PENDING',
      finalStatus: classification.status
    });
  } finally {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { cleanupResult = 'FAILED'; }
    }
    try { await client.end(); if (cleanupResult !== 'FAILED') cleanupResult = 'PASS'; }
    catch { cleanupResult = 'FAILED'; }
  }
  if (cleanupResult !== 'PASS') throw new Error('OPAQUE_GRANTEE_CONNECTION_CLEANUP_BLOCKED');
  evidence.cleanupResult = cleanupResult;
  const evidenceSha256 = await writeEvidence(evidence, evidencePath, evidenceHashPath);
  return { evidence: canonicalValue(evidence), evidenceSha256 };
}

async function main() {
  try {
    const result = await compareProductionOpaqueDefaultAclGrantee();
    process.stdout.write(`PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE=${result.evidence.finalStatus}\n`);
    process.stdout.write(`ACL_SEMANTIC=${result.evidence.aclSemanticGate}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${result.evidenceSha256}\n`);
    process.exitCode = result.evidence.finalStatus === 'PASS' ? 0 : 2;
  } catch (error) {
    const code = /^(?:OPAQUE_GRANTEE|PRODUCTION|PROTECTED)_[A-Z0-9_]{2,100}$/.test(String(error?.message || '')) ? error.message : 'OPAQUE_GRANTEE_SANITIZED_FAILURE';
    process.stderr.write('PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE=BLOCKED\n');
    process.stderr.write(`PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE_ERROR=${code}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
