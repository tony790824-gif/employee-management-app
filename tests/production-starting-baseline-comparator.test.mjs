import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compareExactStartingLedger,
  compareProductionStartingBaseline,
  EXPECTED_STARTING_ARTIFACT_SHA256,
  EXPECTED_STARTING_FINGERPRINT,
  normalizeStartingCatalog,
  STARTING_BASELINE_CONFIRMATION,
  startingBaselineConnectionConfig,
  validateCatalogQueryScope,
  validateStartingBaselineProvenance,
  validateStartingEvidence
} from '../database/compare-production-starting-baseline.mjs';
import { canonicalJson } from '../database/materialize-expected-catalog.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from '../database/rehearse-structural-schema-parity.mjs';

const artifactText = await readFile(new URL('../database/production-0001-0008-structural-baseline.json', import.meta.url), 'utf8');
const artifactHashText = await readFile(new URL('../database/production-0001-0008-structural-baseline.sha256', import.meta.url), 'utf8');
const artifact = JSON.parse(artifactText);
const readiness = JSON.parse(await readFile(new URL('../database/production-migration-final-readiness.expected.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../database/compare-production-starting-baseline.mjs', import.meta.url), 'utf8');
const schema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const placeholderText = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json', import.meta.url), 'utf8');
const placeholderHash = (await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.sha256', import.meta.url), 'utf8')).trim();
const hash = value => createHash('sha256').update(value).digest('hex');

assert.equal(EXPECTED_STARTING_FINGERPRINT, '885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e');
assert.equal(EXPECTED_STARTING_ARTIFACT_SHA256, '6f09dd605cd939fc6bb9de778a6690d93cc66764334722fd2afbf7d5d6e70076');
assert.equal(STARTING_BASELINE_CONFIRMATION, 'COMPARE_BANKE_PRODUCTION_STARTING_BASELINE');
assert.equal(placeholderHash, `${hash(placeholderText)}  PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json`);
assert.equal(schema.properties.phase.const, 'PRODUCTION_CLOSURE_PHASE_2A');

const fixture = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: STARTING_BASELINE_CONFIRMATION,
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: 'postgresql://reader_only:password@db.example.invalid:5432/neondb?sslmode=require',
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'reader_only',
  BANK_PRODUCTION_CA_BUNDLE: path.join(os.tmpdir(), 'banke-starting-baseline-ca.pem')
};
assert.equal(startingBaselineConnectionConfig(fixture).expectedRole, 'reader_only');
assert.throws(() => startingBaselineConnectionConfig({ ...fixture, BANK_PRODUCTION_PARITY_CONFIRMATION: '' }), /PRODUCTION_STARTING_BASELINE_CONFIRMATION_REQUIRED/);
assert.throws(() => startingBaselineConnectionConfig({ ...fixture, BANK_PRODUCTION_PARITY_CONFIRMATION: 'COMPARE_BANKE_PRODUCTION_CATALOG' }), /PRODUCTION_STARTING_BASELINE_CONFIRMATION_REQUIRED/);
assert.throws(() => startingBaselineConnectionConfig({ ...fixture, BANK_PRODUCTION_DATABASE_NAME: 'other' }), /PRODUCTION_URL_IDENTITY_BLOCKED/);
assert.throws(() => startingBaselineConnectionConfig({ ...fixture, BANK_PRODUCTION_READONLY_ROLE: 'different_reader' }), /PRODUCTION_URL_IDENTITY_BLOCKED/);
assert.throws(() => startingBaselineConnectionConfig({
  ...fixture,
  DATABASE_READONLY_URL: fixture.DATABASE_READONLY_URL.replace('reader_only', 'banke_admin_production'),
  BANK_PRODUCTION_READONLY_ROLE: 'banke_admin_production'
}), /PRODUCTION_IDENTITY_EXPECTATION_BLOCKED/);
assert.throws(() => startingBaselineConnectionConfig({
  ...fixture,
  DATABASE_READONLY_URL: fixture.DATABASE_READONLY_URL.replace('db.example.invalid', '127.0.0.1')
}), /PRODUCTION_LOOPBACK_TARGET_BLOCKED/);
assert.throws(() => startingBaselineConnectionConfig({ ...fixture, BANK_PRODUCTION_CA_BUNDLE: path.resolve('ca.pem') }), /PRODUCTION_CA_BUNDLE_MUST_BE_TEMPORARY/);

const expectedLedger = artifact.catalog.migrationLedger;
assert.equal(compareExactStartingLedger(expectedLedger, expectedLedger).status, 'PASS');
assert.ok(compareExactStartingLedger(expectedLedger, expectedLedger.slice(0, -1)).differences.includes('MISSING:0008'));
for (const version of ['0009', '0010', '0011', '9999']) {
  const result = compareExactStartingLedger(expectedLedger, [...expectedLedger, { version, name: 'blocked', checksum: '0'.repeat(64) }]);
  assert.ok(result.differences.includes(`UNEXPECTED:${version}`));
}
assert.ok(compareExactStartingLedger(expectedLedger, [expectedLedger[1], expectedLedger[0], ...expectedLedger.slice(2)]).differences.includes('ORDER_MISMATCH'));
assert.ok(compareExactStartingLedger(expectedLedger, [...expectedLedger, expectedLedger[0]]).differences.includes('DUPLICATE:0001'));
assert.ok(compareExactStartingLedger(expectedLedger, expectedLedger.map(row => row.version === '0001' ? { ...row, checksum: '0'.repeat(64) } : row)).differences.includes('CHECKSUM_MISMATCH:0001'));
assert.ok(compareExactStartingLedger(expectedLedger, expectedLedger.map(row => row.version === '0001' ? { ...row, name: 'wrong' } : row)).differences.includes('NAME_MISMATCH:0001'));

assert.equal(validateCatalogQueryScope().status, 'PASS');
const businessRead = Object.fromEntries(Object.keys(STRUCTURAL_CATALOG_QUERIES).map(section => [section,
  section === 'schemas' ? 'SELECT * FROM app_private.employees' : STRUCTURAL_CATALOG_QUERIES[section]
]));
assert.ok(validateCatalogQueryScope(businessRead).failures.includes('BUSINESS_RELATION_BLOCKED:schemas:app_private.employees'));
assert.equal(validateStartingEvidence(JSON.parse(placeholderText)).status, 'PASS');
assert.equal(validateStartingEvidence({ safe: true }).status, 'BLOCKED');
assert.equal(validateStartingEvidence({ password: 'redacted' }).status, 'BLOCKED');
assert.equal(validateStartingEvidence({ value: 'postgresql://hidden' }).status, 'BLOCKED');

const provenance = validateStartingBaselineProvenance({ artifactText, hashText: artifactHashText, readiness, tracked: true });
assert.equal(provenance.status, 'PASS');
assert.equal(provenance.artifactSha256, EXPECTED_STARTING_ARTIFACT_SHA256);
assert.equal(validateStartingBaselineProvenance({ artifactText: `${artifactText} `, hashText: artifactHashText, readiness, tracked: true }).status, 'BLOCKED');
assert.equal(validateStartingBaselineProvenance({ artifactText, hashText: `0${artifactHashText.slice(1)}`, readiness, tracked: true }).status, 'BLOCKED');
assert.equal(validateStartingBaselineProvenance({ artifactText, hashText: artifactHashText, readiness, tracked: false }).status, 'BLOCKED');
const wrongNormalization = structuredClone(artifact);
wrongNormalization.normalization.model = 'WRONG';
assert.equal(validateStartingBaselineProvenance({ artifactText: canonicalJson(wrongNormalization), hashText: artifactHashText, readiness, tracked: true }).status, 'BLOCKED');
const wrongFingerprint = structuredClone(artifact);
wrongFingerprint.structuralFingerprint = '0'.repeat(64);
assert.equal(validateStartingBaselineProvenance({ artifactText: canonicalJson(wrongFingerprint), hashText: artifactHashText, readiness, tracked: true }).status, 'BLOCKED');

function materializeOwner(value) {
  if (Array.isArray(value)) return value.map(materializeOwner);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string'
      ? value.replaceAll('$MIGRATION_OWNER', 'banke_owner').replace(/\$EXTENSION_OWNER:[A-Za-z0-9_-]+/g, 'banke_owner')
      : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, materializeOwner(child)]));
}

const rawCatalog = materializeOwner(artifact.catalog);
const platformOwnedCatalog = structuredClone(rawCatalog);
for (const row of platformOwnedCatalog.extensions) row.owner_name = 'platform_extension_owner';
for (const row of platformOwnedCatalog.functions.filter(item => item.extension_name)) row.owner_name = 'platform_extension_owner';
assert.equal(
  hash(canonicalJson(Object.fromEntries(Object.keys(artifact.catalog).filter(key => key !== 'migrationLedger').map(key => [key, normalizeStartingCatalog(platformOwnedCatalog, 'banke_owner')[key]])))) ,
  EXPECTED_STARTING_FINGERPRINT
);
let actualNetworkConnections = 0;
function mockClient({ serverVersion = 180004, roleSafe = true, ledger = expectedLedger, catalog = rawCatalog } = {}) {
  return class MockClient {
    constructor(config) {
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.ssl.servername, 'db.example.invalid');
    }
    async connect() { actualNetworkConnections += 0; }
    async end() {}
    async query(sql) {
      const text = String(sql).trim();
      if (text === 'BEGIN TRANSACTION READ ONLY' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('AS database_ok')) return { rows: [{ database_ok: true, current_role_ok: true, session_role_ok: true, read_only_ok: true, server_version_number: serverVersion }] };
      if (text.includes('AS role_safe')) return { rows: [{ role_safe: roleSafe }] };
      if (text === 'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version') return { rows: ledger };
      for (const [section, query] of Object.entries(STRUCTURAL_CATALOG_QUERIES)) if (text === query.trim()) return { rows: catalog[section] };
      throw new Error(`UNEXPECTED_TEST_QUERY:${text.slice(0, 40)}`);
    }
  };
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'banke-starting-comparator-test-'));
try {
  const caPath = path.join(temporary, 'ca.pem');
  const evidencePath = path.join(temporary, 'evidence.json');
  const evidenceHashPath = path.join(temporary, 'evidence.sha256');
  await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nTEST-ONLY\n-----END CERTIFICATE-----\n', 'utf8');
  const env = { ...fixture, BANK_PRODUCTION_CA_BUNDLE: caPath };
  const pass = await compareProductionStartingBaseline({
    env, ClientImpl: mockClient(), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40)
  });
  assert.equal(pass.evidence.finalStatus, 'PASS');
  assert.equal(pass.evidence.fingerprintComparison, 'MATCH');
  assert.equal(pass.evidence.observedStructuralFingerprint, EXPECTED_STARTING_FINGERPRINT);
  assert.equal(pass.evidence.liveProduction00010008StructuralMatch, 'PASS');
  assert.equal(validateStartingEvidence(pass.evidence).status, 'PASS');
  assert.equal((await readFile(evidenceHashPath, 'utf8')).trim(), `${hash(await readFile(evidencePath))}  evidence.json`);
  await assert.rejects(
    compareProductionStartingBaseline({ env, ClientImpl: mockClient({ serverVersion: 170000 }), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40) }),
    /PRODUCTION_STARTING_IDENTITY_BOUNDARY_BLOCKED/
  );
  await assert.rejects(
    compareProductionStartingBaseline({ env, ClientImpl: mockClient({ roleSafe: false }), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40) }),
    /PRODUCTION_STARTING_ROLE_BOUNDARY_BLOCKED/
  );
  const ledgerBlocked = await compareProductionStartingBaseline({
    env, ClientImpl: mockClient({ ledger: expectedLedger.slice(0, -1) }), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40)
  });
  assert.equal(ledgerBlocked.evidence.finalStatus, 'BLOCKED');
  assert.equal(ledgerBlocked.evidence.observedStructuralFingerprint, null);
  const changedCatalog = structuredClone(rawCatalog);
  changedCatalog.relations[0].rls_enabled = !changedCatalog.relations[0].rls_enabled;
  const structuralBlocked = await compareProductionStartingBaseline({
    env, ClientImpl: mockClient({ catalog: changedCatalog }), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40)
  });
  assert.equal(structuralBlocked.evidence.fingerprintComparison, 'MISMATCH');
  await assert.rejects(
    compareProductionStartingBaseline({
      env: { ...fixture, BANK_PRODUCTION_CA_BUNDLE: path.join(temporary, 'missing.pem') },
      ClientImpl: mockClient(), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40)
    }),
    /ENOENT/
  );
  const invalidCaPath = path.join(temporary, 'invalid-ca.pem');
  await writeFile(invalidCaPath, 'NOT A CERTIFICATE', 'utf8');
  await assert.rejects(
    compareProductionStartingBaseline({
      env: { ...fixture, BANK_PRODUCTION_CA_BUNDLE: invalidCaPath },
      ClientImpl: mockClient(), evidencePath, evidenceHashPath, commitSha: 'a'.repeat(40)
    }),
    /PRODUCTION_CA_BUNDLE_INVALID/
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

assert.equal(actualNetworkConnections, 0);
assert.match(source, /BEGIN TRANSACTION READ ONLY/);
assert.match(source, /ROLLBACK/);
assert.match(source, /STRUCTURAL_CATALOG_QUERIES/);
assert.match(source, /authenticatedTlsConfig/);
assert.doesNotMatch(source, /COMPARE_BANKE_PRODUCTION_CATALOG['"]/);
assert.doesNotMatch(source, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+(?:INTO|TABLE|ROLE|SCHEMA|DATABASE|ON)/i);
assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:error\.message|DATABASE_READONLY_URL)/);

console.log('Production 0001-0008 dedicated starting-baseline comparator passed fail-closed synthetic tests');
