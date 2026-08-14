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
  SEMANTIC_LIVE_QUERY_SURFACE,
  validateSemanticLiveEvidence
} from './compare-production-starting-baseline-semantic.mjs';
import { compareExactStartingLedger } from './compare-production-starting-baseline.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION,
  DEFAULT_ACL_CLASSIFICATION_SQL,
  buildDefaultAclClassification,
  validateDefaultAclClassificationQuery,
  validateDefaultAclEvidence
} from './default-acl-principal-classification.mjs';

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json');
const SOURCE_EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256');
const STARTING_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-structural-baseline.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.sha256');
const PROVENANCE_PATHS = Object.freeze([
  'database/default-acl-principal-classification.mjs',
  'database/compare-production-default-acl-principals.mjs',
  'database/production-0001-0008-structural-baseline.json',
  'docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json',
  'docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256',
  'docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.schema.json'
]);

export const DEFAULT_ACL_SUPPLEMENT_CONFIRMATION = 'COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_PRINCIPALS';
export const SOURCE_LIVE_SEMANTIC_EVIDENCE_SHA256 = 'bea7076ab4972fb3874a99be9fa3652a873bfdbe53fb74e4dc0e9606e3d37a02';
export const DEFAULT_ACL_SUPPLEMENT_SCOPE = 'PUBLIC_SCHEMA_RELATION_AND_SEQUENCE_DEFAULT_ACL_ONLY';
export const DEFAULT_ACL_RUNTIME_ROLE = 'banke_api_production';
export const DEFAULT_ACL_PLATFORM_ROLE = 'cloud_admin';

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

export function defaultAclSupplementConnectionConfig(env = process.env) {
  const config = productionConnectionConfig(env, {
    confirmation: DEFAULT_ACL_SUPPLEMENT_CONFIRMATION,
    confirmationError: 'PRODUCTION_DEFAULT_ACL_CONFIRMATION_REQUIRED'
  });
  if (config.expectedDatabase !== EXPECTED_PRODUCTION_DATABASE || config.expectedRole !== EXPECTED_PRODUCTION_READONLY_ROLE) {
    throw new Error('PRODUCTION_DEFAULT_ACL_TARGET_IDENTITY_BLOCKED');
  }
  return Object.freeze({ ...config, effectiveTlsMode: 'verify-full' });
}

export function validateDefaultAclRepositoryProvenance(env = process.env, { execFileSyncImpl = execFileSync } = {}) {
  const failures = [];
  const authorizedCommit = String(env.BANK_PRODUCTION_EVIDENCE_COMMIT_SHA || '').trim();
  let head = '';
  try {
    head = gitOutput(['rev-parse', 'HEAD'], execFileSyncImpl);
    if (!/^[a-f0-9]{40}$/.test(head)) failures.push('DEFAULT_ACL_HEAD_INVALID');
    if (authorizedCommit !== head) failures.push('DEFAULT_ACL_AUTHORIZED_COMMIT_MISMATCH');
    if (gitOutput(['branch', '--show-current'], execFileSyncImpl) !== 'main') failures.push('DEFAULT_ACL_BRANCH_NOT_MAIN');
    if (gitOutput(['rev-parse', 'origin/main'], execFileSyncImpl) !== head) failures.push('DEFAULT_ACL_ORIGIN_NOT_AT_HEAD');
    if (gitOutput(['status', '--porcelain', '--untracked-files=no'], execFileSyncImpl)) failures.push('DEFAULT_ACL_TRACKED_WORKTREE_NOT_CLEAN');
    const tracked = gitOutput(['ls-files', '--error-unmatch', '--', ...PROVENANCE_PATHS], execFileSyncImpl).split(/\r?\n/).filter(Boolean);
    if (tracked.length !== PROVENANCE_PATHS.length) failures.push('DEFAULT_ACL_PROVENANCE_FILE_NOT_TRACKED');
  } catch {
    failures.push('DEFAULT_ACL_REPOSITORY_PROVENANCE_COMMAND_FAILED');
  }
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), commitSha: /^[a-f0-9]{40}$/.test(head) ? head : null });
}

export function validateSourceLiveSemanticEvidence({ evidenceText, hashText }) {
  const failures = [];
  let evidence = null;
  try { evidence = JSON.parse(evidenceText); } catch { failures.push('SOURCE_LIVE_EVIDENCE_JSON_INVALID'); }
  const actualHash = sha256(evidenceText);
  if (actualHash !== SOURCE_LIVE_SEMANTIC_EVIDENCE_SHA256) failures.push('SOURCE_LIVE_EVIDENCE_HASH_MISMATCH');
  if (companionHash(hashText, 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json') !== actualHash) failures.push('SOURCE_LIVE_EVIDENCE_COMPANION_HASH_MISMATCH');
  if (evidence && validateSemanticLiveEvidence(evidence).status !== 'PASS') failures.push('SOURCE_LIVE_EVIDENCE_SCHEMA_BLOCKED');
  const blockers = evidence?.semanticAclMismatchSummary?.blockers || [];
  const exactBlockers = [
    'OBSERVED:DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:public|S',
    'OBSERVED:DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:public|r',
    'OBSERVED_ACL_SNAPSHOT_BLOCKED'
  ];
  if (evidence?.structuralNonAclResult !== 'PASS' || evidence?.semanticAclResult !== 'BLOCKED'
      || evidence?.structuralStartingBaseline !== 'BLOCKED'
      || canonicalJson(blockers) !== canonicalJson(exactBlockers)
      || evidence?.identityResult !== 'PASS' || evidence?.tlsVerification !== 'VERIFY_FULL_PASS'
      || evidence?.roleBoundaryResult !== 'PASS' || evidence?.transactionReadOnlyResult !== 'PASS'
      || evidence?.ledgerResult?.status !== 'PASS') failures.push('SOURCE_LIVE_EVIDENCE_SCOPE_MISMATCH');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort(), evidence, evidenceSha256: actualHash });
}

async function loadProvenance() {
  const [sourceText, sourceHashText, baselineText] = await Promise.all([
    readFile(SOURCE_EVIDENCE_PATH, 'utf8'),
    readFile(SOURCE_EVIDENCE_HASH_PATH, 'utf8'),
    readFile(STARTING_BASELINE_PATH, 'utf8')
  ]);
  const source = validateSourceLiveSemanticEvidence({ evidenceText: sourceText, hashText: sourceHashText });
  if (source.status !== 'PASS') throw new Error('DEFAULT_ACL_SOURCE_EVIDENCE_BLOCKED');
  const baseline = JSON.parse(baselineText);
  if (!Array.isArray(baseline?.catalog?.migrationLedger) || baseline.catalog.migrationLedger.length !== 8) throw new Error('DEFAULT_ACL_STARTING_LEDGER_MISSING');
  return { source, expectedLedger: baseline.catalog.migrationLedger };
}

async function writeEvidence(evidence, evidencePath, evidenceHashPath) {
  const validation = validateDefaultAclEvidence(evidence);
  if (validation.status !== 'PASS') throw new Error('DEFAULT_ACL_EVIDENCE_SANITIZATION_BLOCKED');
  const serialized = canonicalJson(evidence);
  const evidenceSha256 = sha256(serialized);
  await writeFile(evidencePath, serialized, 'utf8');
  await writeFile(evidenceHashPath, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8');
  return evidenceSha256;
}

export async function compareProductionDefaultAclPrincipals({
  env = process.env,
  ClientImpl = Client,
  repositoryVerifier = validateDefaultAclRepositoryProvenance,
  provenanceLoader = loadProvenance,
  evidencePath = EVIDENCE_PATH,
  evidenceHashPath = EVIDENCE_HASH_PATH
} = {}) {
  const config = defaultAclSupplementConnectionConfig(env);
  if (validateDefaultAclClassificationQuery().status !== 'PASS') throw new Error('DEFAULT_ACL_QUERY_SCOPE_BLOCKED');
  const repository = await repositoryVerifier(env);
  if (repository?.status !== 'PASS' || !/^[a-f0-9]{40}$/.test(repository?.commitSha || '')) throw new Error('DEFAULT_ACL_REPOSITORY_PROVENANCE_BLOCKED');
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
        || Number(identity.server_version_number) < 180000 || Number(identity.server_version_number) >= 190000) throw new Error('DEFAULT_ACL_IDENTITY_BOUNDARY_BLOCKED');
    if (!(await client.query(SEMANTIC_LIVE_QUERY_SURFACE.roleBoundary)).rows[0]?.role_safe) throw new Error('DEFAULT_ACL_ROLE_BOUNDARY_BLOCKED');
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;
    if (!(await client.query(SEMANTIC_LIVE_QUERY_SURFACE.transactionReadOnly)).rows[0]?.read_only_ok) throw new Error('DEFAULT_ACL_READ_ONLY_TRANSACTION_BLOCKED');
    const ledger = (await client.query(SEMANTIC_LIVE_QUERY_SURFACE.ledger)).rows;
    const ledgerResult = compareExactStartingLedger(provenance.expectedLedger, ledger);
    if (ledgerResult.status !== 'PASS') throw new Error('DEFAULT_ACL_STARTING_LEDGER_BLOCKED');
    const rows = (await client.query(DEFAULT_ACL_CLASSIFICATION_SQL, [EXPECTED_PRODUCTION_READONLY_ROLE, DEFAULT_ACL_RUNTIME_ROLE, DEFAULT_ACL_PLATFORM_ROLE])).rows;
    const classification = buildDefaultAclClassification(rows);
    await client.query('ROLLBACK');
    transactionOpen = false;
    evidence = canonicalValue({
      schemaVersion: 1,
      phase: 'PRODUCTION_CLOSURE_PHASE_2H_DEFAULT_ACL_SUPPLEMENT',
      sprintNumberingCappedAt: 65,
      generatedAt: new Date().toISOString(),
      repositoryCommitSha: repository.commitSha,
      sourceLiveSemanticEvidenceSha256: provenance.source.evidenceSha256,
      modelVersion: DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION,
      scope: DEFAULT_ACL_SUPPLEMENT_SCOPE,
      identityResult: 'PASS',
      tlsVerification: 'VERIFY_FULL_PASS',
      roleBoundaryResult: 'PASS',
      transactionReadOnlyResult: 'PASS',
      ledgerResult,
      entries: classification.entries,
      blockers: classification.blockers,
      differences: classification.differences,
      defaultAclSemanticResult: classification.status,
      semanticFingerprint: classification.fingerprint,
      connectionAttemptCount,
      retryCount: 0,
      productionConnectionAttempted: true,
      productionMutation: false,
      businessRowReads: 'NONE',
      cleanupResult: 'PENDING',
      finalStatus: classification.status === 'SEMANTIC_MATCH' ? 'PASS' : 'BLOCKED'
    });
  } finally {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { cleanupResult = 'FAILED'; }
    }
    try { await client.end(); if (cleanupResult !== 'FAILED') cleanupResult = 'PASS'; }
    catch { cleanupResult = 'FAILED'; }
  }
  if (cleanupResult !== 'PASS') throw new Error('DEFAULT_ACL_CONNECTION_CLEANUP_BLOCKED');
  evidence.cleanupResult = cleanupResult;
  const evidenceSha256 = await writeEvidence(evidence, evidencePath, evidenceHashPath);
  return { evidence: canonicalValue(evidence), evidenceSha256 };
}

async function main() {
  try {
    const result = await compareProductionDefaultAclPrincipals();
    process.stdout.write(`PRODUCTION_DEFAULT_ACL_PRINCIPALS=${result.evidence.finalStatus}\n`);
    process.stdout.write(`DEFAULT_ACL_SEMANTIC=${result.evidence.defaultAclSemanticResult}\n`);
    process.stdout.write(`SANITIZED_EVIDENCE_SHA256=${result.evidenceSha256}\n`);
    process.exitCode = result.evidence.finalStatus === 'PASS' ? 0 : 2;
  } catch (error) {
    const code = /^(?:DEFAULT_ACL|PRODUCTION|PROTECTED)_[A-Z0-9_]{2,100}$/.test(String(error?.message || '')) ? error.message : 'DEFAULT_ACL_SANITIZED_FAILURE';
    process.stderr.write('PRODUCTION_DEFAULT_ACL_PRINCIPALS=BLOCKED\n');
    process.stderr.write(`PRODUCTION_DEFAULT_ACL_ERROR=${code}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
