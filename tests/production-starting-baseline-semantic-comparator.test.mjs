import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  EXPECTED_ACL_SEMANTIC_BASELINE_SHA256,
  EXPECTED_PRODUCTION_DATABASE,
  EXPECTED_PRODUCTION_READONLY_ROLE,
  SEMANTIC_COMPARATOR_STAGES,
  SEMANTIC_LIVE_QUERY_SURFACE,
  SEMANTIC_STARTING_CONFIRMATION,
  compareProductionStartingBaselineSemantics,
  runProductionStartingBaselineSemanticCli,
  semanticStartingConnectionConfig,
  validateAclSemanticBaseline,
  validateRepositoryExecutionProvenance,
  validateSemanticLiveEvidence,
  validateSemanticFailureEvidence,
  validateSemanticQueryScope
} from '../database/compare-production-starting-baseline-semantic.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from '../database/rehearse-structural-schema-parity.mjs';

const structuralArtifact = JSON.parse(await readFile(new URL('../database/production-0001-0008-structural-baseline.json', import.meta.url), 'utf8'));
const aclText = await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.json', import.meta.url), 'utf8');
const aclHashText = await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.sha256', import.meta.url), 'utf8');
const aclArtifact = JSON.parse(aclText);
const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const failureEvidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_FAILURE.schema.json', import.meta.url), 'utf8'));
const comparatorSource = await readFile(new URL('../database/compare-production-starting-baseline-semantic.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

assert.equal(SEMANTIC_STARTING_CONFIRMATION, 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTICS');
assert.equal(EXPECTED_PRODUCTION_DATABASE, 'neondb');
assert.equal(EXPECTED_PRODUCTION_READONLY_ROLE, 'banke_production_readonly');
assert.equal(EXPECTED_ACL_SEMANTIC_BASELINE_SHA256, '485097ac88f068cc46a73583ceff4ac6d64ad97e007c4ac20262fda0bf8394ec');
assert.equal(evidenceSchema.properties.phase.const, 'PRODUCTION_CLOSURE_PHASE_2E');
assert.equal(evidenceSchema.properties.retryCount.const, 0);
assert.equal(evidenceSchema.additionalProperties, false);
assert.equal(failureEvidenceSchema.additionalProperties, false);
assert.deepEqual(failureEvidenceSchema.properties.diagnosticStage.enum, SEMANTIC_COMPARATOR_STAGES);
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
assert.doesNotMatch(comparatorSource, /PRODUCTION_STARTING_BASELINE_SEMANTIC_ERROR=SANITIZED_FAILURE/);
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

function mockClient({ identity = {}, roleSafe = true, transactionReadOnly = true, ledger = structuralArtifact.catalog.migrationLedger, catalog = rawCatalog, connectError = null, queryErrorContains = null, endError = null, stats }) {
  return class MockClient {
    constructor(config) {
      stats.clients += 1;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.ssl.servername, 'db.example.invalid');
    }
    async connect() { stats.connects += 1; if (connectError) throw connectError; }
    async end() { stats.ends += 1; if (endError) throw endError; }
    async query(sql) {
      const text = String(sql).trim();
      stats.queries.push(text);
      if (queryErrorContains && text.includes(queryErrorContains)) throw new Error('postgresql://user:secret@host.invalid/neondb');
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
  }), error => error.safeDiagnostic?.stage === 'TLS_CONNECT' && error.message === 'TLS_CONNECT_FAILED');
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

  const failurePath = path.join(temporary, 'failure.json');
  const failureHashPath = path.join(temporary, 'failure.sha256');
  const secretBearingConnectError = new Error('could not connect to postgresql://reader:secret@host.invalid/neondb');
  const cliStats = { clients: 0, connects: 0, ends: 0, queries: [] };
  const failedCli = await runProductionStartingBaselineSemanticCli({
    env,
    failureEvidencePath: failurePath,
    failureEvidenceHashPath: failureHashPath,
    comparatorOptions: {
      ClientImpl: mockClient({ stats: cliStats, connectError: secretBearingConnectError }),
      evidencePath,
      evidenceHashPath,
      repositoryVerifier,
      collectAclFactsImpl,
      buildAclSnapshotImpl
    }
  });
  assert.equal(failedCli.exitCode, 1);
  assert.equal(failedCli.failure.diagnosticStage, 'TLS_CONNECT');
  assert.equal(failedCli.failure.errorCode, 'TLS_CONNECT_FAILED');
  assert.equal(failedCli.failure.originalErrorPersisted, false);
  assert.equal(validateSemanticFailureEvidence(failedCli.failure).status, 'PASS');
  const failureText = await readFile(failurePath, 'utf8');
  assert.doesNotMatch(failureText, /host\.invalid|secret|postgresql:\/\//i);
  assert.equal((await readFile(failureHashPath, 'utf8')).trim(), `${hash(await readFile(failurePath))}  failure.json`);

  const preconnectFailure = await runProductionStartingBaselineSemanticCli({
    env: { ...env, BANK_PRODUCTION_PARITY_CONFIRMATION: '' },
    failureEvidencePath: path.join(temporary, 'preconnect-failure.json'),
    failureEvidenceHashPath: path.join(temporary, 'preconnect-failure.sha256'),
    comparatorOptions: { ClientImpl: mockClient({ stats: { clients: 0, connects: 0, ends: 0, queries: [] } }) }
  });
  assert.equal(preconnectFailure.failure.diagnosticStage, 'PRE_CONNECT_GUARD');
  assert.equal(preconnectFailure.failure.connectionAttemptCount, 0);

  async function diagnosticFor(options = {}, overrides = {}) {
    const stageStats = { clients: 0, connects: 0, ends: 0, queries: [] };
    try {
      await compareProductionStartingBaselineSemantics({
        env,
        ClientImpl: mockClient({ stats: stageStats, ...options }),
        evidencePath,
        evidenceHashPath,
        repositoryVerifier,
        collectAclFactsImpl,
        buildAclSnapshotImpl,
        ...overrides
      });
      assert.fail('expected fail-closed diagnostic');
    } catch (error) {
      return error.safeDiagnostic;
    }
  }
  assert.equal((await diagnosticFor({ identity: { current_role_ok: false } })).stage, 'IDENTITY_GUARD');
  assert.equal((await diagnosticFor({ roleSafe: false })).stage, 'ROLE_BOUNDARY_GUARD');
  assert.equal((await diagnosticFor({ transactionReadOnly: false })).stage, 'READ_ONLY_TRANSACTION');
  assert.equal((await diagnosticFor({ ledger: structuralArtifact.catalog.migrationLedger.slice(0, -1) })).stage, 'LEDGER');
  assert.equal((await diagnosticFor({ queryErrorContains: 'attribute.attnum > 0' })).stage, 'NON_ACL_CATALOG_COLLECTOR');
  const ownerless = structuredClone(rawCatalog);
  ownerless.schemas = ownerless.schemas.filter(row => row.schema_name !== 'app_private');
  assert.equal((await diagnosticFor({ catalog: ownerless })).stage, 'NORMALIZATION');
  assert.equal((await diagnosticFor({}, { collectAclFactsImpl: async () => { throw new Error('unsafe raw principal'); } })).stage, 'ACL_SEMANTIC_COLLECTOR');
  assert.equal((await diagnosticFor({}, { compareAclSnapshotsImpl: () => { throw new Error('comparison internal failure'); } })).stage, 'FINGERPRINT_COMPARISON');
  assert.equal((await diagnosticFor({ endError: new Error('cleanup failed') })).stage, 'CLEANUP');
  const unsafeSnapshot = () => ({ ...structuredClone(aclArtifact.snapshot), fingerprint: 'postgresql://sensitive' });
  assert.equal((await diagnosticFor({}, { buildAclSnapshotImpl: unsafeSnapshot })).stage, 'EVIDENCE_SANITIZATION');
  assert.equal((await diagnosticFor({}, { artifactLoader: async () => { throw new Error('artifact failed'); } })).stage, 'ARTIFACT_PROVENANCE');
  assert.equal((await diagnosticFor({}, { repositoryVerifier: async () => ({ status: 'BLOCKED', commitSha: null }) })).stage, 'REPOSITORY_PROVENANCE');
  assert.equal((await diagnosticFor({}, { evidencePath: path.join(temporary, 'missing-parent', 'evidence.json') })).stage, 'EVIDENCE_WRITE_HASH');

  const unpersisted = await runProductionStartingBaselineSemanticCli({
    env: { ...env, BANK_PRODUCTION_PARITY_CONFIRMATION: '' },
    failureEvidencePath: path.join(temporary, 'missing-failure-parent', 'failure.json'),
    failureEvidenceHashPath: path.join(temporary, 'missing-failure-parent', 'failure.sha256')
  });
  assert.equal(unpersisted.exitCode, 1);
  assert.equal(unpersisted.failure.diagnosticStage, 'PRE_CONNECT_GUARD');
  assert.equal(unpersisted.failureEvidenceSha256, null);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log('Production Closure Phase 2E live semantic comparator preflight tests passed');
