import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  OPAQUE_GRANTEE_CLASSIFICATION_SQL,
  OPAQUE_GRANTEE_MODEL_VERSION,
  buildOpaqueGranteeClassification,
  classifyOpaqueGrantee,
  validateOpaqueGranteeEvidence,
  validateOpaqueGranteeQuery
} from '../database/default-acl-opaque-grantee-classification.mjs';
import {
  OPAQUE_GRANTEE_CONFIRMATION,
  SOURCE_PHASE_2I_EVIDENCE_SHA256,
  compareProductionOpaqueDefaultAclGrantee,
  opaqueGranteeConnectionConfig,
  validateOpaqueGranteeRepositoryProvenance,
  validateSourcePhase2IEvidence
} from '../database/compare-production-default-acl-opaque-grantee.mjs';

const sourceEvidenceText = await readFile(new URL('../docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json', import.meta.url), 'utf8');
const sourceHashText = await readFile(new URL('../docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.sha256', import.meta.url), 'utf8');
const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const comparatorSource = await readFile(new URL('../database/compare-production-default-acl-opaque-grantee.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

function classify(identifier, overrides = {}) {
  return classifyOpaqueGrantee({
    granteeIdentifier: identifier,
    expectedOwnerIdentifiers: [101],
    expectedReadonlyIdentifier: 102,
    expectedRuntimeIdentifiers: [103],
    platformIdentifiers: [104],
    extensionOwnerIdentifiers: [105],
    membershipCarrierIdentifiers: [106],
    ...overrides
  });
}

function row(overrides = {}) {
  return {
    default_acl_key: 'PUBLIC_SCHEMA|RELATION',
    default_acl_type: 'r',
    acl_state: 'EXPLICIT_DEFAULT_ACL',
    principal_position: 'GRANTEE',
    privilege_type: 'SELECT',
    grant_option: true,
    category_match_count: 1,
    principal_category: 'EXPECTED_OWNER',
    classification_proof: 'EXPECTED_OWNER_OID_RELATION',
    membership_classification: 'NONE',
    ...overrides
  };
}

function completeRows(overrides = {}) {
  return [
    ...['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'].map(privilege => row({ privilege_type: privilege, ...overrides })),
    ...['SELECT', 'UPDATE', 'USAGE'].map(privilege => row({
      default_acl_key: 'PUBLIC_SCHEMA|SEQUENCE', default_acl_type: 'S', privilege_type: privilege, ...overrides
    }))
  ];
}

assert.equal(OPAQUE_GRANTEE_MODEL_VERSION, 'bankeban-default-acl-opaque-grantee-v1');
assert.equal(OPAQUE_GRANTEE_CONFIRMATION, 'COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE');
assert.equal(SOURCE_PHASE_2I_EVIDENCE_SHA256, 'bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c');
assert.equal(validateOpaqueGranteeQuery().status, 'PASS');
assert.equal(validateOpaqueGranteeQuery('DELETE FROM pg_catalog.pg_default_acl').status, 'BLOCKED');
assert.match(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /grantee_oid\s*=\s*0\s+AS\s+public_match/i);
assert.match(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /pg_catalog\.pg_auth_members/);
assert.match(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /pg_catalog\.pg_database/);
assert.match(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /namespace\.nspname\s*=\s*'public'/);
assert.match(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /defaclobjtype\s+IN\s*\('r',\s*'S'\)/);
assert.doesNotMatch(OPAQUE_GRANTEE_CLASSIFICATION_SQL, /pg_get_userbyid|app_private\.(?:employees|attendance|leave_requests)/i);
assert.doesNotMatch(comparatorSource, /db:parity:production-starting-baseline-semantic|collectAclSemanticFacts|STRUCTURAL_CATALOG_QUERIES/);
assert.equal(evidenceSchema.additionalProperties, false);
assert.equal(evidenceSchema.properties.rawOidPersisted.const, false);
assert.equal(evidenceSchema.properties.rawPrincipalNamePersisted.const, false);

const cases = [
  [0, 'PUBLIC', 'PUBLIC_OID_ZERO'],
  [101, 'EXPECTED_OWNER', 'EXPECTED_OWNER_OID_RELATION'],
  [102, 'EXPECTED_READONLY_ROLE', 'EXPECTED_READONLY_ROLE_OID_RELATION'],
  [103, 'EXPECTED_RUNTIME_ROLE', 'EXPECTED_RUNTIME_ROLE_OID_RELATION'],
  [104, 'SYSTEM_PLATFORM_MANAGED', 'SYSTEM_PLATFORM_OID_RELATION'],
  [105, 'EXTENSION_OWNER', 'EXTENSION_OWNER_OID_RELATION'],
  [106, 'READONLY_MEMBERSHIP_CARRIER', 'READONLY_OUTBOUND_MEMBERSHIP_RELATION']
];
for (const [identifier, category, proof] of cases) {
  const result = classify(identifier);
  assert.equal(result.status, 'PASS');
  assert.equal(result.category, category);
  assert.equal(result.classificationProof, proof);
  assert.doesNotMatch(JSON.stringify(result), /101|102|103|104|105|106/);
}

// Rename stability: display names are not inputs; the established identifier
// relationship remains the same before and after a role rename.
const beforeRename = classify(101);
const afterRename = classify(101, { ignoredDisplayName: 'renamed-for-test' });
assert.deepEqual(afterRename, beforeRename);

// Drop/recreate safety: a reused display name with a new identifier has no
// relationship to the reviewed identifier and cannot inherit classification.
const recreated = classify(201, { roleExists: true, ignoredDisplayName: 'same-name-for-test' });
assert.equal(recreated.status, 'BLOCKED');
assert.equal(recreated.category, 'OTHER_NAMED_PRINCIPAL');

const unrelated = classify(999, { roleExists: true });
assert.equal(unrelated.status, 'BLOCKED');
assert.equal(unrelated.classificationProof, 'NAMED_ROLE_WITHOUT_REVIEWED_RELATION');
const missingRole = classify(null, { roleExists: false });
assert.equal(missingRole.status, 'BLOCKED');
assert.equal(missingRole.category, 'UNCLASSIFIED');

const ambiguous = classify(103, { membershipCarrierIdentifiers: [103] });
assert.equal(ambiguous.status, 'BLOCKED');
assert.equal(ambiguous.classificationProof, 'AMBIGUOUS_OID_RELATION');
assert.equal(ambiguous.membershipClassification, 'AMBIGUOUS');

const relation = buildOpaqueGranteeClassification(completeRows());
assert.equal(relation.status, 'PASS');
assert.equal(relation.classifications[0].grantOption, true);
assert.equal(relation.classifications[0].semanticResult, 'CLASSIFICATION_PROVEN');
assert.equal(relation.classifications.some(entry => entry.objectType === 'SEQUENCE'), true);
assert.equal(buildOpaqueGranteeClassification(completeRows().slice(1)).status, 'BLOCKED');
const explicitNull = buildOpaqueGranteeClassification([]);
assert.equal(explicitNull.status, 'BLOCKED');
assert.match(explicitNull.blockers.join(','), /ROWS_MISSING/);
const unreviewedGrantOption = buildOpaqueGranteeClassification(completeRows({
  category_match_count: 0,
  principal_category: 'OTHER_NAMED_PRINCIPAL',
  classification_proof: 'NAMED_ROLE_WITHOUT_REVIEWED_RELATION'
}));
assert.equal(unreviewedGrantOption.status, 'BLOCKED');
assert.match(unreviewedGrantOption.blockers.join(','), /GRANT_OPTION_UNREVIEWED/);
const rawIdentifier = buildOpaqueGranteeClassification([row({ grantee_oid: 777 })]);
assert.equal(rawIdentifier.status, 'BLOCKED');
assert.match(rawIdentifier.blockers.join(','), /RAW_IDENTITY_FIELD_BLOCKED/);

const sourceValidation = validateSourcePhase2IEvidence({ evidenceText: sourceEvidenceText, hashText: sourceHashText });
assert.equal(sourceValidation.status, 'PASS');
assert.equal(sourceValidation.evidence.finalStatus, 'BLOCKED');
assert.equal(validateSourcePhase2IEvidence({ evidenceText: `${sourceEvidenceText} `, hashText: sourceHashText }).status, 'BLOCKED');

const commitSha = 'a'.repeat(40);
const gitRunner = (_file, args) => {
  const command = args.join(' ');
  if (command === 'rev-parse HEAD' || command === 'rev-parse origin/main') return `${commitSha}\n`;
  if (command === 'branch --show-current') return 'main\n';
  if (command === 'status --porcelain --untracked-files=no') return '';
  if (command.startsWith('ls-files --error-unmatch -- ')) return `${Array.from({ length: 6 }, (_, index) => `tracked-${index}`).join('\n')}\n`;
  throw new Error(`UNEXPECTED_GIT_COMMAND:${command}`);
};
assert.equal(validateOpaqueGranteeRepositoryProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha }, { execFileSyncImpl: gitRunner }).status, 'PASS');
assert.equal(validateOpaqueGranteeRepositoryProvenance({ BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: 'b'.repeat(40) }, { execFileSyncImpl: gitRunner }).status, 'BLOCKED');

const baseEnv = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: OPAQUE_GRANTEE_CONFIRMATION,
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: 'postgresql://banke_production_readonly:test-only@db.example.invalid:5432/neondb?sslmode=require',
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'banke_production_readonly',
  BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: commitSha
};

const temporary = await mkdtemp(path.join(os.tmpdir(), 'banke-opaque-grantee-'));
try {
  const caPath = path.join(temporary, 'ca.pem');
  const evidencePath = path.join(temporary, 'evidence.json');
  const evidenceHashPath = path.join(temporary, 'evidence.sha256');
  await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nTEST-ONLY\n-----END CERTIFICATE-----\n', 'utf8');
  const env = { ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: caPath };
  assert.equal(opaqueGranteeConnectionConfig(env).effectiveTlsMode, 'verify-full');
  assert.throws(() => opaqueGranteeConnectionConfig({ ...env, BANK_PRODUCTION_PARITY_CONFIRMATION: '' }), /PRODUCTION_OPAQUE_GRANTEE_CONFIRMATION_REQUIRED/);

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
      if (text === OPAQUE_GRANTEE_CLASSIFICATION_SQL.trim()) return { rows: completeRows() };
      throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 80)}`);
    }
  }
  const result = await compareProductionOpaqueDefaultAclGrantee({
    env,
    ClientImpl: MockClient,
    repositoryVerifier: async () => ({ status: 'PASS', failures: [], commitSha }),
    provenanceLoader: async () => ({ source: { evidenceSha256: SOURCE_PHASE_2I_EVIDENCE_SHA256 }, expectedLedger }),
    evidencePath,
    evidenceHashPath
  });
  assert.equal(result.evidence.finalStatus, 'PASS');
  assert.equal(result.evidence.aclSemanticGate, 'BLOCKED_PENDING_SEMANTIC_RECOMPOSITION');
  assert.equal(validateOpaqueGranteeEvidence(result.evidence).status, 'PASS');
  assert.deepEqual({ clients: stats.clients, connects: stats.connects, ends: stats.ends }, { clients: 1, connects: 1, ends: 1 });
  assert.equal(stats.queries.filter(query => query === 'BEGIN TRANSACTION READ ONLY').length, 1);
  assert.equal(stats.queries.at(-1), 'ROLLBACK');
  assert.equal(stats.queries.some(query => /app_private\.(?:employees|attendance|leave_requests)/i.test(query)), false);
  const written = await readFile(evidencePath, 'utf8');
  assert.doesNotMatch(written, /banke_production_readonly|banke_api_production|cloud_admin|db\.example|postgresql:\/\/|grantee_oid|rolname/i);
  assert.equal((await readFile(evidenceHashPath, 'utf8')).trim(), `${hash(written)}  evidence.json`);
  assert.equal(validateOpaqueGranteeEvidence({ ...result.evidence, rawOid: 777 }).status, 'BLOCKED');
  assert.equal(validateOpaqueGranteeEvidence({ ...result.evidence, connectionAttemptCount: 2 }).status, 'BLOCKED');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log('Production Closure Phase 2J opaque grantee classification tests passed');
