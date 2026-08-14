import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION,
  DEFAULT_ACL_CLASSIFICATION_SQL,
  buildDefaultAclClassification,
  validateDefaultAclClassificationQuery,
  validateDefaultAclEvidence
} from '../database/default-acl-principal-classification.mjs';
import {
  DEFAULT_ACL_SUPPLEMENT_CONFIRMATION,
  SOURCE_LIVE_SEMANTIC_EVIDENCE_SHA256,
  compareProductionDefaultAclPrincipals,
  defaultAclSupplementConnectionConfig,
  validateDefaultAclRepositoryProvenance,
  validateSourceLiveSemanticEvidence
} from '../database/compare-production-default-acl-principals.mjs';

const sourceEvidenceText = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json', import.meta.url), 'utf8');
const sourceHashText = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256', import.meta.url), 'utf8');
const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const comparatorSource = await readFile(new URL('../database/compare-production-default-acl-principals.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

function row(overrides = {}) {
  return {
    schema_name: 'public',
    default_acl_type: 'r',
    acl_state: 'EXPLICIT_DEFAULT_ACL',
    privilege_type: 'SELECT',
    grant_option: false,
    owner_category: 'EXPECTED_OWNER',
    grantee_category: 'EXPECTED_OWNER',
    grantor_category: 'EXPECTED_OWNER',
    ...overrides
  };
}

function pair(overrides = {}, builtinOverrides = {}) {
  return [row(overrides), row({ ...overrides, acl_state: 'BUILTIN_DEFAULT', ...builtinOverrides })];
}

assert.equal(DEFAULT_ACL_CLASSIFICATION_MODEL_VERSION, 'bankeban-default-acl-principal-classification-v1');
assert.equal(DEFAULT_ACL_SUPPLEMENT_CONFIRMATION, 'COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_PRINCIPALS');
assert.equal(SOURCE_LIVE_SEMANTIC_EVIDENCE_SHA256, 'bea7076ab4972fb3874a99be9fa3652a873bfdbe53fb74e4dc0e9606e3d37a02');
assert.equal(validateDefaultAclClassificationQuery().status, 'PASS');
assert.equal(validateDefaultAclClassificationQuery('DELETE FROM pg_catalog.pg_default_acl').status, 'BLOCKED');
assert.match(DEFAULT_ACL_CLASSIFICATION_SQL, /expanded\.grantee_oid\s*=\s*0\s+THEN\s+'PUBLIC'/);
assert.match(DEFAULT_ACL_CLASSIFICATION_SQL, /namespace\.nspname\s*=\s*'public'/);
assert.match(DEFAULT_ACL_CLASSIFICATION_SQL, /defaclobjtype\s+IN\s*\('r',\s*'S'\)/);
assert.doesNotMatch(DEFAULT_ACL_CLASSIFICATION_SQL, /information_schema|app_private\.(?:employees|attendance|leave_requests)/i);
assert.doesNotMatch(comparatorSource, /db:parity:production-starting-baseline-semantic|STRUCTURAL_CATALOG_QUERIES|collectAclSemanticFacts/);
assert.equal(evidenceSchema.additionalProperties, false);
assert.equal(evidenceSchema.properties.connectionAttemptCount.const, 1);
assert.equal(evidenceSchema.properties.retryCount.const, 0);
assert.equal(evidenceSchema.properties.businessRowReads.const, 'NONE');

const publicPrincipal = buildDefaultAclClassification(pair({ grantee_category: 'PUBLIC' }));
assert.equal(publicPrincipal.status, 'SEMANTIC_MATCH');
assert.equal(publicPrincipal.entries.every(entry => entry.granteeCategory === 'PUBLIC'), true);

const schemaPublicIsNotPrincipal = buildDefaultAclClassification(pair({ grantee_category: 'OTHER_NAMED_PRINCIPAL' }));
assert.equal(schemaPublicIsNotPrincipal.entries[0].schemaKey, 'PUBLIC_SCHEMA');
assert.notEqual(schemaPublicIsNotPrincipal.entries[0].granteeCategory, 'PUBLIC');
assert.equal(schemaPublicIsNotPrincipal.status, 'BLOCKED');

const owner = buildDefaultAclClassification(pair());
assert.equal(owner.entries[0].principalClassifications[0].position, 'OWNER');
assert.equal(owner.entries[0].ownerCategory, 'EXPECTED_OWNER');
assert.equal(owner.status, 'SEMANTIC_MATCH');

for (const category of ['EXPECTED_READONLY_ROLE', 'EXPECTED_RUNTIME_ROLE']) {
  const result = buildDefaultAclClassification(pair({ grantee_category: category }));
  assert.equal(result.entries[0].granteeCategory, category);
  assert.equal(result.status, 'SEMANTIC_MATCH');
}

const extensionOwner = buildDefaultAclClassification(pair({ owner_category: 'EXTENSION_OWNER', grantor_category: 'EXTENSION_OWNER' }));
assert.equal(extensionOwner.entries[0].ownerCategory, 'EXTENSION_OWNER');
assert.equal(extensionOwner.status, 'SEMANTIC_MATCH');

const unknown = buildDefaultAclClassification(pair({ grantee_category: 'OTHER_NAMED_PRINCIPAL' }));
assert.equal(unknown.status, 'BLOCKED');
assert.match(unknown.blockers.join(','), /OTHER_PRINCIPAL_REVIEW_REQUIRED/);

const missing = buildDefaultAclClassification(pair({ grantee_category: undefined }));
assert.equal(missing.status, 'BLOCKED');
assert.match(missing.blockers.join(','), /PRINCIPAL_UNCLASSIFIED/);

const trustedGrantorDifference = buildDefaultAclClassification([
  row({ grantor_category: 'EXTENSION_OWNER' }),
  row({ acl_state: 'BUILTIN_DEFAULT', grantor_category: 'EXPECTED_OWNER' })
]);
assert.equal(trustedGrantorDifference.status, 'SEMANTIC_MATCH');

const grantOptionExpansion = buildDefaultAclClassification([
  row({ grant_option: true }),
  row({ acl_state: 'BUILTIN_DEFAULT', grant_option: false })
]);
assert.equal(grantOptionExpansion.status, 'SEMANTIC_MISMATCH');
assert.equal(grantOptionExpansion.differences.some(diff => diff.type === 'DEFAULT_PRIVILEGE_ADDED' && diff.grantOption && diff.dangerous), true);

const writeExpansion = buildDefaultAclClassification([
  row({ grantee_category: 'EXPECTED_READONLY_ROLE', privilege_type: 'UPDATE' }),
  ...pair()
]);
assert.equal(writeExpansion.status, 'SEMANTIC_MISMATCH');
assert.equal(writeExpansion.differences.some(diff => diff.privilege === 'UPDATE' && diff.dangerous), true);

const rawIdentity = buildDefaultAclClassification(pair({ grantee_principal: 'must-never-persist' }));
assert.equal(rawIdentity.status, 'BLOCKED');
assert.match(rawIdentity.blockers.join(','), /RAW_IDENTITY_FIELD_BLOCKED/);
assert.doesNotMatch(JSON.stringify(publicPrincipal), /owner_principal|grantee_principal|grantor_principal|must-never-persist/i);

const sourceValidation = validateSourceLiveSemanticEvidence({ evidenceText: sourceEvidenceText, hashText: sourceHashText });
assert.equal(sourceValidation.status, 'PASS');
assert.equal(sourceValidation.evidence.semanticAclResult, 'BLOCKED');
assert.equal(validateSourceLiveSemanticEvidence({ evidenceText: `${sourceEvidenceText} `, hashText: sourceHashText }).status, 'BLOCKED');

const commitSha = 'a'.repeat(40);
const gitRunner = (_file, args) => {
  const command = args.join(' ');
  if (command === 'rev-parse HEAD' || command === 'rev-parse origin/main') return `${commitSha}\n`;
  if (command === 'branch --show-current') return 'main\n';
  if (command === 'status --porcelain --untracked-files=no') return '';
  if (command.startsWith('ls-files --error-unmatch -- ')) return `${Array.from({ length: 6 }, (_, index) => `tracked-${index}`).join('\n')}\n`;
  throw new Error(`UNEXPECTED_GIT_COMMAND:${command}`);
};
assert.equal(validateDefaultAclRepositoryProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha }, { execFileSyncImpl: gitRunner }).status, 'PASS');
assert.equal(validateDefaultAclRepositoryProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: 'b'.repeat(40) }, { execFileSyncImpl: gitRunner }).status, 'BLOCKED');

const baseEnv = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: DEFAULT_ACL_SUPPLEMENT_CONFIRMATION,
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: 'postgresql://banke_production_readonly:test-only@db.example.invalid:5432/neondb?sslmode=require',
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'banke_production_readonly',
  BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha
};

const temporary = await mkdtemp(path.join(os.tmpdir(), 'banke-default-acl-'));
try {
  const caPath = path.join(temporary, 'ca.pem');
  const evidencePath = path.join(temporary, 'evidence.json');
  const evidenceHashPath = path.join(temporary, 'evidence.sha256');
  await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nTEST-ONLY\n-----END CERTIFICATE-----\n', 'utf8');
  const env = { ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: caPath };
  assert.equal(defaultAclSupplementConnectionConfig(env).effectiveTlsMode, 'verify-full');
  assert.throws(() => defaultAclSupplementConnectionConfig({ ...env, BANK_PRODUCTION_PARITY_CONFIRMATION: '' }), /PRODUCTION_DEFAULT_ACL_CONFIRMATION_REQUIRED/);
  assert.throws(() => defaultAclSupplementConnectionConfig({ ...env, BANK_PRODUCTION_READONLY_ROLE: 'banke_api_production', DATABASE_READONLY_URL: baseEnv.DATABASE_READONLY_URL.replace('banke_production_readonly', 'banke_api_production') }), /PRODUCTION_IDENTITY_EXPECTATION_BLOCKED|PRODUCTION_DEFAULT_ACL_TARGET_IDENTITY_BLOCKED/);

  const expectedLedger = Array.from({ length: 8 }, (_, index) => ({ version: String(index + 1).padStart(4, '0'), name: `m${index + 1}`, checksum: String(index + 1).repeat(64).slice(0, 64) }));
  const stats = { clients: 0, connects: 0, ends: 0, queries: [] };
  class MockClient {
    constructor(config) {
      stats.clients += 1;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.ssl.servername, 'db.example.invalid');
    }
    async connect() { stats.connects += 1; }
    async end() { stats.ends += 1; }
    async query(sql) {
      const text = String(sql).trim();
      stats.queries.push(text);
      if (text === 'BEGIN TRANSACTION READ ONLY' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('AS database_ok')) return { rows: [{ database_ok: true, current_role_ok: true, session_role_ok: true, read_only_ok: true, server_version_number: 180004 }] };
      if (text.includes('AS role_safe')) return { rows: [{ role_safe: true }] };
      if (text.includes("current_setting('transaction_read_only') = 'on' AS read_only_ok") && !text.includes('AS database_ok')) return { rows: [{ read_only_ok: true }] };
      if (text === 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version') return { rows: expectedLedger };
      if (text === DEFAULT_ACL_CLASSIFICATION_SQL.trim()) return { rows: pair() };
      throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 80)}`);
    }
  }
  const result = await compareProductionDefaultAclPrincipals({
    env,
    ClientImpl: MockClient,
    repositoryVerifier: async () => ({ status: 'PASS', failures: [], commitSha }),
    provenanceLoader: async () => ({
      source: { evidenceSha256: SOURCE_LIVE_SEMANTIC_EVIDENCE_SHA256 },
      expectedLedger
    }),
    evidencePath,
    evidenceHashPath
  });
  assert.equal(result.evidence.finalStatus, 'PASS');
  assert.equal(result.evidence.defaultAclSemanticResult, 'SEMANTIC_MATCH');
  assert.equal(validateDefaultAclEvidence(result.evidence).status, 'PASS');
  assert.deepEqual({ clients: stats.clients, connects: stats.connects, ends: stats.ends }, { clients: 1, connects: 1, ends: 1 });
  assert.equal(stats.queries.filter(query => query === 'BEGIN TRANSACTION READ ONLY').length, 1);
  assert.equal(stats.queries.at(-1), 'ROLLBACK');
  assert.equal(stats.queries.some(query => /app_private\.(?:employees|attendance|leave_requests)/i.test(query)), false);
  const written = await readFile(evidencePath, 'utf8');
  assert.doesNotMatch(written, /banke_production_readonly|banke_api_production|cloud_admin|db\.example|postgresql:\/\//i);
  assert.equal((await readFile(evidenceHashPath, 'utf8')).trim(), `${hash(written)}  evidence.json`);
  assert.equal(validateDefaultAclEvidence({ ...result.evidence, role_name: 'hidden' }).status, 'BLOCKED');
  assert.equal(validateDefaultAclEvidence({ ...result.evidence, connectionAttemptCount: 2 }).status, 'BLOCKED');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log('Production Closure Phase 2H default ACL principal classification tests passed');
