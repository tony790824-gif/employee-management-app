import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  EXPECTED_ACL_SEMANTIC_BASELINE_SHA256,
  EXPECTED_PRODUCTION_DATABASE,
  EXPECTED_PRODUCTION_READONLY_ROLE,
  SEMANTIC_LIVE_QUERY_SURFACE,
  SEMANTIC_STARTING_CONFIRMATION,
  compareProductionStartingBaselineSemantics,
  semanticStartingConnectionConfig,
  validateAclSemanticBaseline,
  validateRepositoryExecutionProvenance,
  validateSemanticLiveEvidence,
  validateSemanticQueryScope
} from '../database/compare-production-starting-baseline-semantic.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from '../database/rehearse-structural-schema-parity.mjs';

const structuralArtifact = JSON.parse(await readFile(new URL('../database/production-0001-0008-structural-baseline.json', import.meta.url), 'utf8'));
const aclText = await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.json', import.meta.url), 'utf8');
const aclHashText = await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.sha256', import.meta.url), 'utf8');
const aclArtifact = JSON.parse(aclText);
const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const comparatorSource = await readFile(new URL('../database/compare-production-starting-baseline-semantic.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

assert.equal(SEMANTIC_STARTING_CONFIRMATION, 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTICS');
assert.equal(EXPECTED_PRODUCTION_DATABASE, 'neondb');
assert.equal(EXPECTED_PRODUCTION_READONLY_ROLE, 'banke_production_readonly');
assert.equal(EXPECTED_ACL_SEMANTIC_BASELINE_SHA256, '485097ac88f068cc46a73583ceff4ac6d64ad97e007c4ac20262fda0bf8394ec');
assert.equal(evidenceSchema.properties.phase.const, 'PRODUCTION_CLOSURE_PHASE_2E');
assert.equal(evidenceSchema.properties.retryCount.const, 0);
assert.equal(evidenceSchema.additionalProperties, false);
for (const field of [
  'generatedAt', 'expectedStructuralArtifactSha256', 'expectedAclArtifactSha256', 'expectedMigrationSequence',
  'identityResult', 'tlsVerification', 'roleBoundaryResult', 'transactionReadOnlyResult',
  'expectedStructuralSectionCounts', 'observedStructuralSectionCounts', 'expectedAclObjectCount', 'observedAclObjectCount',
  'expectedNonAclFingerprint', 'observedNonAclFingerprint', 'observedAclSemanticFingerprint',
  'structuralMismatchSummary', 'semanticAclMismatchSummary', 'productionConnectionAttempted'
]) assert.equal(evidenceSchema.required.includes(field), true, `evidence schema must require ${field}`);
assert.match(JSON.stringify(SEMANTIC_LIVE_QUERY_SURFACE.structural), /pg_catalog\.pg_attribute/);
assert.doesNotMatch(comparatorSource, /COMPARE_BANKE_PRODUCTION_CATALOG['"]/);
assert.doesNotMatch(comparatorSource, /new\s+(?:Pool|Client)\s*\([^)]*\).*new\s+(?:Pool|Client)/s);
assert.doesNotMatch(comparatorSource, /information_schema\.columns/);
for (const token of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls', 'rolinherit', 'pg_has_role', 'datdba', 'nspowner', 'relowner', 'proowner']) assert.match(comparatorSource, new RegExp(token));
assert.equal(validateSemanticQueryScope().status, 'PASS');
assert.equal(validateSemanticQueryScope({
  ...SEMANTIC_LIVE_QUERY_SURFACE,
  structural: { ...STRUCTURAL_CATALOG_QUERIES, schemas: 'SELECT * FROM app_private.employees' }
}).status, 'BLOCKED');
assert.equal(validateSemanticQueryScope({ ...SEMANTIC_LIVE_QUERY_SURFACE, ledger: 'DELETE FROM public.schema_migrations' }).status, 'BLOCKED');

assert.equal(validateAclSemanticBaseline({ text: aclText, hashText: aclHashText, tracked: true }).status, 'PASS');
assert.equal(validateAclSemanticBaseline({ text: `${aclText} `, hashText: aclHashText, tracked: true }).status, 'BLOCKED');
assert.equal(validateAclSemanticBaseline({ text: aclText, hashText: `0${aclHashText.slice(1)}`, tracked: true }).status, 'BLOCKED');
assert.equal(validateAclSemanticBaseline({ text: aclText, hashText: aclHashText, tracked: false }).status, 'BLOCKED');
const wrongModel = structuredClone(aclArtifact);
wrongModel.modelVersion = 'unknown';
assert.equal(validateAclSemanticBaseline({ text: JSON.stringify(wrongModel), hashText: aclHashText, tracked: true }).status, 'BLOCKED');

const commitSha = 'a'.repeat(40);
const gitRunner = (_file, args) => {
  const command = args.join(' ');
  if (command === 'rev-parse HEAD' || command === 'rev-parse origin/main') return `${commitSha}\n`;
  if (command === 'branch --show-current') return 'main\n';
  if (command === 'status --porcelain --untracked-files=no') return '';
  if (command.startsWith('ls-files --error-unmatch -- ')) return `${Array.from({ length: 7 }, (_, index) => `tracked-${index}`).join('\n')}\n`;
  throw new Error(`UNEXPECTED_GIT_COMMAND:${command}`);
};
assert.equal(validateRepositoryExecutionProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha }, { execFileSyncImpl: gitRunner }).status, 'PASS');
assert.equal(validateRepositoryExecutionProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: 'b'.repeat(40) }, { execFileSyncImpl: gitRunner }).status, 'BLOCKED');
assert.equal(validateRepositoryExecutionProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha }, {
  execFileSyncImpl: (file, args, options) => args.join(' ') === 'status --porcelain --untracked-files=no' ? ' M tracked.js\n' : gitRunner(file, args, options)
}).status, 'BLOCKED');

function materialize(value) {
  if (Array.isArray(value)) return value.map(materialize);
  if (!value || typeof value !== 'object') return typeof value === 'string'
    ? value.replaceAll('$MIGRATION_OWNER', 'banke_migration_owner').replace(/\$EXTENSION_OWNER:[A-Za-z0-9_-]+/g, 'cloud_admin') : value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, materialize(child)]));
}

const rawCatalog = materialize(structuralArtifact.catalog);
const baseEnv = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: SEMANTIC_STARTING_CONFIRMATION,
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: 'postgresql://banke_production_readonly:test-only@db.example.invalid:5432/neondb?sslmode=require',
  BANK_PRODUCTION_DATABASE_NAME: EXPECTED_PRODUCTION_DATABASE,
  BANK_PRODUCTION_READONLY_ROLE: EXPECTED_PRODUCTION_READONLY_ROLE,
  BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha
};

assert.equal(semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem') }).effectiveTlsMode, 'verify-full');
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem'), BANK_PRODUCTION_PARITY_CONFIRMATION: '' }), /PRODUCTION_STARTING_SEMANTIC_CONFIRMATION_REQUIRED/);
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem'), BANK_PRODUCTION_PARITY_CONFIRMATION: 'COMPARE_BANKE_PRODUCTION_CATALOG' }), /PRODUCTION_STARTING_SEMANTIC_CONFIRMATION_REQUIRED/);
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem'), BANK_PRODUCTION_DATABASE_NAME: 'other' }), /PRODUCTION_URL_IDENTITY_BLOCKED|PRODUCTION_STARTING_SEMANTIC_TARGET_IDENTITY_BLOCKED/);
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem'), DATABASE_READONLY_URL: baseEnv.DATABASE_READONLY_URL.replace('banke_production_readonly', 'reader_other'), BANK_PRODUCTION_READONLY_ROLE: 'reader_other' }), /PRODUCTION_STARTING_SEMANTIC_TARGET_IDENTITY_BLOCKED/);
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'ca.pem'), DATABASE_READONLY_URL: baseEnv.DATABASE_READONLY_URL.replace('db.example.invalid', '127.0.0.1') }), /PRODUCTION_LOOPBACK_TARGET_BLOCKED/);
assert.throws(() => semanticStartingConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.resolve('ca.pem') }), /PRODUCTION_CA_BUNDLE_MUST_BE_TEMPORARY/);

function mockClient({ identity = {}, roleSafe = true, transactionReadOnly = true, ledger = structuralArtifact.catalog.migrationLedger, catalog = rawCatalog, connectError = null, stats }) {
  return class MockClient {
    constructor(config) {
      stats.clients += 1;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.ssl.servername, 'db.example.invalid');
    }
    async connect() { stats.connects += 1; if (connectError) throw connectError; }
    async end() { stats.ends += 1; }
    async query(sql) {
      const text = String(sql).trim();
      stats.queries.push(text);
      if (text === 'BEGIN TRANSACTION READ ONLY' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('AS database_ok')) return { rows: [{ database_ok: true, current_role_ok: true, session_role_ok: true, read_only_ok: true, server_version_number: 180004, ...identity }] };
      if (text.includes('AS role_safe')) return { rows: [{ role_safe: roleSafe }] };
      if (text === "SELECT current_setting('transaction_read_only') = 'on' AS read_only_ok") return { rows: [{ read_only_ok: transactionReadOnly }] };
      if (text === 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version') return { rows: ledger };
      for (const [section, query] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) if (text === query.trim()) return { rows: catalog[section] };
      throw new Error(`UNEXPECTED_TEST_QUERY:${text.slice(0, 60)}`);
    }
  };
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'banke-semantic-live-preflight-'));
try {
  const caPath = path.join(temporary, 'ca.pem');
  const evidencePath = path.join(temporary, 'evidence.json');
  const evidenceHashPath = path.join(temporary, 'evidence.sha256');
  await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nTEST-ONLY\n-----END CERTIFICATE-----\n', 'utf8');
  const env = { ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: caPath };
  const repositoryVerifier = async () => ({ status: 'PASS', failures: [], commitSha });
  const buildAclSnapshotImpl = () => structuredClone(aclArtifact.snapshot);
  const collectAclFactsImpl = async () => ({ defaultsExpanded: true, objects: [], entries: [], defaultPrivileges: [], memberships: [] });
  const run = async options => {
    const stats = { clients: 0, connects: 0, ends: 0, queries: [] };
    const output = await compareProductionStartingBaselineSemantics({
      env, ClientImpl: mockClient({ stats, ...options }), evidencePath, evidenceHashPath,
      repositoryVerifier, collectAclFactsImpl, buildAclSnapshotImpl
    });
    return { output, stats };
  };
  const { output: pass, stats } = await run({});
  assert.equal(pass.evidence.finalStatus, 'PASS');
  assert.equal(pass.evidence.structuralNonAclResult, 'PASS');
  assert.equal(pass.evidence.semanticAclResult, 'SEMANTIC_MATCH');
  assert.equal(pass.evidence.connectionAttemptCount, 1);
  assert.equal(pass.evidence.retryCount, 0);
  assert.equal(stats.clients, 1);
  assert.equal(stats.connects, 1);
  assert.equal(stats.ends, 1);
  assert.equal(stats.queries.includes('BEGIN TRANSACTION READ ONLY'), true);
  assert.equal(stats.queries.at(-1), 'ROLLBACK');
assert.equal(validateSemanticLiveEvidence(pass.evidence).status, 'PASS');
assert.equal(validateSemanticLiveEvidence({ ...pass.evidence, observedStructuralSectionCounts: { schemas: 1 } }).status, 'BLOCKED');
assert.equal((await readFile(evidenceHashPath, 'utf8')).trim(), `${hash(await readFile(evidencePath))}  evidence.json`);
  assert.equal(validateSemanticLiveEvidence({ ...pass.evidence, password: 'redacted' }).status, 'BLOCKED');
  assert.equal(validateSemanticLiveEvidence({ ...pass.evidence, note: 'postgresql://hidden' }).status, 'BLOCKED');

  for (const identity of [
    { database_ok: false }, { current_role_ok: false }, { session_role_ok: false }, { read_only_ok: false }, { server_version_number: 170000 }
  ]) await assert.rejects(run({ identity }), /SEMANTIC_IDENTITY_BOUNDARY_BLOCKED/);
  await assert.rejects(run({ roleSafe: false }), /SEMANTIC_ROLE_BOUNDARY_BLOCKED/);
  await assert.rejects(run({ transactionReadOnly: false }), /SEMANTIC_READ_ONLY_TRANSACTION_BLOCKED/);
  for (const ledger of [
    structuralArtifact.catalog.migrationLedger.slice(0, -1),
    [...structuralArtifact.catalog.migrationLedger, { version: '0009', name: 'blocked', checksum: '0'.repeat(64) }],
    [...structuralArtifact.catalog.migrationLedger, { version: '0010', name: 'blocked', checksum: '0'.repeat(64) }],
    [...structuralArtifact.catalog.migrationLedger, { version: '0011', name: 'blocked', checksum: '0'.repeat(64) }],
    [...structuralArtifact.catalog.migrationLedger].reverse(),
    structuralArtifact.catalog.migrationLedger.map(row => row.version === '0001' ? { ...row, checksum: '0'.repeat(64) } : row),
    structuralArtifact.catalog.migrationLedger.map(row => row.version === '0001' ? { ...row, name: 'wrong' } : row)
  ]) await assert.rejects(run({ ledger }), /SEMANTIC_STARTING_LEDGER_BLOCKED/);

  const changedCatalog = structuredClone(rawCatalog);
  changedCatalog.relations[0].rls_enabled = !changedCatalog.relations[0].rls_enabled;
  const { output: structuralBlocked } = await run({ catalog: changedCatalog });
  assert.equal(structuralBlocked.evidence.structuralNonAclResult, 'MISMATCH');
  assert.equal(structuralBlocked.evidence.finalStatus, 'BLOCKED');

  const tlsStats = { clients: 0, connects: 0, ends: 0, queries: [] };
  await assert.rejects(compareProductionStartingBaselineSemantics({
    env, ClientImpl: mockClient({ stats: tlsStats, connectError: new Error('sanitized TLS failure') }), evidencePath, evidenceHashPath,
    repositoryVerifier, collectAclFactsImpl, buildAclSnapshotImpl
  }), /sanitized TLS failure/);
  assert.deepEqual({ clients: tlsStats.clients, connects: tlsStats.connects, ends: tlsStats.ends }, { clients: 1, connects: 1, ends: 1 });

  await assert.rejects(compareProductionStartingBaselineSemantics({
    env: { ...env, BANK_PRODUCTION_CA_BUNDLE: path.join(temporary, 'missing.pem') },
    ClientImpl: mockClient({ stats: { clients: 0, connects: 0, ends: 0, queries: [] } }), evidencePath, evidenceHashPath,
    repositoryVerifier, collectAclFactsImpl, buildAclSnapshotImpl
  }), /ENOENT/);
  const invalidCa = path.join(temporary, 'invalid.pem');
  await writeFile(invalidCa, 'NOT A CERTIFICATE', 'utf8');
  await assert.rejects(compareProductionStartingBaselineSemantics({
    env: { ...env, BANK_PRODUCTION_CA_BUNDLE: invalidCa },
    ClientImpl: mockClient({ stats: { clients: 0, connects: 0, ends: 0, queries: [] } }), evidencePath, evidenceHashPath,
    repositoryVerifier, collectAclFactsImpl, buildAclSnapshotImpl
  }), /PRODUCTION_CA_BUNDLE_INVALID/);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log('Production Closure Phase 2E live semantic comparator preflight tests passed');
