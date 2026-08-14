import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  APPLICATION_OWNER_RELATION_CONFIRMATION,
  APPLICATION_OWNER_RELATION_MODEL_VERSION,
  APPLICATION_OWNER_RELATION_QUERY_SURFACE,
  APPLICATION_OWNER_RELATION_STAGES,
  EXPECTED_APPLICATION_OBJECT_SET_FINGERPRINT,
  applicationOwnerRelationConnectionConfig,
  applicationOwnerRelationEvidence,
  buildApplicationOwnerRelationProof,
  compareProductionApplicationOwnerRelation,
  expectedApplicationObjectIdentities,
  runProductionApplicationOwnerRelationCli,
  validateApplicationOwnerRelationEvidence,
  validateApplicationOwnerRelationFailureEvidence,
  validateApplicationOwnerRelationQueryScope,
  validateApplicationOwnerRelationRepositoryProvenance
} from '../database/compare-production-application-owner-relation.mjs';
import {
  EXPECTED_OWNER_DEFAULT_ACL_FACTS,
  loadOwnerProofRepositoryInputs
} from '../database/exact-application-object-owner-proof.mjs';

const COMMIT = 'a'.repeat(40);
const inputs = await loadOwnerProofRepositoryInputs();
const expectedIdentities = expectedApplicationObjectIdentities(inputs.structuralBaseline);
assert.equal(expectedIdentities.length, 65);
assert.equal(validateApplicationOwnerRelationQueryScope().status, 'PASS');
assert.equal(APPLICATION_OWNER_RELATION_MODEL_VERSION, 'bankeban-production-application-owner-relation-collector-v1');
assert.equal(EXPECTED_APPLICATION_OBJECT_SET_FINGERPRINT, inputs.artifact.objectSetFingerprint);
assert.ok(APPLICATION_OWNER_RELATION_STAGES.includes('OWNER_ROLE_BOUNDARY_GUARD'));

const temp = await mkdtemp(path.join(os.tmpdir(), 'banke-owner-relation-'));
const caPath = path.join(temp, 'ca.pem');
await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----\n', 'utf8');
const baseEnv = {
  BANK_ENV: 'production',
  BANK_PRODUCTION_PARITY_CONFIRMATION: APPLICATION_OWNER_RELATION_CONFIRMATION,
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'banke_production_readonly',
  BANK_PRODUCTION_CA_BUNDLE: caPath,
  BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: COMMIT,
  DATABASE_READONLY_URL: 'postgresql://banke_production_readonly:synthetic-not-a-real-secret@db.example.invalid:5432/neondb?sslmode=verify-full'
};
assert.equal(applicationOwnerRelationConnectionConfig(baseEnv).effectiveTlsMode, 'verify-full');
assert.throws(() => applicationOwnerRelationConnectionConfig({ ...baseEnv, BANK_PRODUCTION_PARITY_CONFIRMATION: 'WRONG' }), /CONFIRMATION_REQUIRED/);
assert.throws(() => applicationOwnerRelationConnectionConfig({ ...baseEnv, BANK_PRODUCTION_DATABASE_NAME: 'other' }), /URL_IDENTITY_BLOCKED|TARGET_IDENTITY_BLOCKED/);
assert.throws(() => applicationOwnerRelationConnectionConfig({ ...baseEnv, DATABASE_READONLY_URL: baseEnv.DATABASE_READONLY_URL.replace('banke_production_readonly', 'other_reader'), BANK_PRODUCTION_READONLY_ROLE: 'other_reader' }), /TARGET_IDENTITY_BLOCKED/);
assert.throws(() => applicationOwnerRelationConnectionConfig({ ...baseEnv, DATABASE_READONLY_URL: baseEnv.DATABASE_READONLY_URL.replace('db.example.invalid', '127.0.0.1') }), /LOOPBACK_TARGET_BLOCKED/);
assert.throws(() => applicationOwnerRelationConnectionConfig({ ...baseEnv, BANK_PRODUCTION_CA_BUNDLE: path.resolve('ca.pem') }), /CA_BUNDLE_MUST_BE_TEMPORARY/);

const ownerRef = '900';
const objectRows = expectedIdentities.map((identity, index) => ({
  object_type: identity.split('|')[0], object_identity: identity, object_ref: String(index + 1), owner_ref: ownerRef
}));
const allOwnedRows = objectRows.map(row => ({ object_type: row.object_type, object_ref: row.object_ref, extension_managed: false }));
const defaultAclRows = EXPECTED_OWNER_DEFAULT_ACL_FACTS.map(fact => {
  const [scope, objectType, privilege, grantOption] = fact.split('|');
  assert.equal(scope, 'PUBLIC_SCHEMA');
  return { default_acl_type: objectType === 'RELATION' ? 'r' : 'S', grantee_ref: ownerRef, privilege_type: privilege, grant_option: grantOption === 'true' };
});
assert.equal(defaultAclRows.filter(row => row.default_acl_type === 'r').length, 8);
assert.equal(defaultAclRows.filter(row => row.default_acl_type === 'S').length, 3);
assert.equal(defaultAclRows.filter(row => row.grant_option).length, 11);
const safeOwnerRole = {
  rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
  outbound_membership_count: 0, effective_outbound_membership_count: 0,
  other_reviewed_category_count: 0, inbound_reviewed_membership_count: 0,
  reviewed_context_complete: true
};
const validCollection = {
  objects: objectRows,
  defaultAcl: defaultAclRows,
  ownerRole: safeOwnerRole,
  allOwned: [...allOwnedRows, { object_type: 'FUNCTION', object_ref: '999', extension_managed: true }],
  exclusions: { public_schema_owner_ok: true, extension_function_count: 37, extension_count: 2 }
};
const proof = buildApplicationOwnerRelationProof({ inputs, collection: validCollection, sourceCommit: COMMIT });
assert.equal(proof.finalProofStatus, 'PASS');
assert.equal(proof.ownershipCoverageCount, 65);
assert.equal(proof.ownerSetCount, 1);
assert.equal(proof.unrelatedOwnershipCount, 0);
assert.equal(proof.grantOptionSemanticResult, 'SEMANTIC_MISMATCH');

function blocked(collectionPatch) {
  return buildApplicationOwnerRelationProof({ inputs, collection: { ...validCollection, ...collectionPatch }, sourceCommit: COMMIT });
}
assert.equal(blocked({ objects: objectRows.slice(0, 64) }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ objects: [...objectRows, { object_type: 'RELATION', object_identity: 'RELATION|public.unexpected', object_ref: '66', owner_ref: ownerRef }] }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ defaultAcl: defaultAclRows.map(row => ({ ...row, grantee_ref: '901' })) }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ defaultAcl: [...defaultAclRows, { ...defaultAclRows[0], grantee_ref: '901' }] }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ allOwned: [...allOwnedRows, { object_type: 'RELATION', object_ref: '999', extension_managed: false }] }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, rolsuper: true } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, rolcreatedb: true } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, rolcreaterole: true } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, rolreplication: true } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, rolbypassrls: true } }).finalProofStatus, 'BLOCKED');
const missingAttributeRole = { ...safeOwnerRole };
delete missingAttributeRole.rolsuper;
assert.equal(blocked({ ownerRole: missingAttributeRole }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, outbound_membership_count: 1 } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, effective_outbound_membership_count: 1 } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ ownerRole: { ...safeOwnerRole, inbound_reviewed_membership_count: 1 } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ defaultAcl: defaultAclRows.map(row => ({ ...row, grantee_ref: '0' })) }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ defaultAcl: defaultAclRows.slice(1) }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ exclusions: { ...validCollection.exclusions, extension_function_count: 36 } }).finalProofStatus, 'BLOCKED');
assert.equal(blocked({ exclusions: { ...validCollection.exclusions, public_schema_owner_ok: false } }).finalProofStatus, 'BLOCKED');

// Same transient OID relationship survives a display-name-only rename; a recreated principal with another OID does not inherit it.
assert.equal(buildApplicationOwnerRelationProof({ inputs, collection: { ...validCollection, ignoredDisplayName: 'renamed' }, sourceCommit: COMMIT }).finalProofStatus, 'PASS');
assert.equal(blocked({ defaultAcl: defaultAclRows.map(row => ({ ...row, grantee_ref: '901' })) }).proofEnum, 'EXACT_APPLICATION_OBJECT_OWNER_RELATION_NOT_PROVEN');

const validEvidence = applicationOwnerRelationEvidence(proof, { timestamp: '2026-08-14T00:00:00.000Z', sourceCommit: COMMIT, connectionAttemptCount: 1 });
assert.equal(validateApplicationOwnerRelationEvidence(validEvidence).status, 'PASS');
assert.equal(validateApplicationOwnerRelationEvidence({ ...validEvidence, rawOid: '900' }).status, 'BLOCKED');
assert.equal(validateApplicationOwnerRelationEvidence({ ...validEvidence, principalName: 'forbidden' }).status, 'BLOCKED');
assert.equal(validateApplicationOwnerRelationEvidence({ ...validEvidence, rawAcl: 'forbidden' }).status, 'BLOCKED');
assert.equal(validateApplicationOwnerRelationEvidence({ ...validEvidence, unknown: true }).status, 'BLOCKED');
assert.equal(validateApplicationOwnerRelationEvidence({ ...validEvidence, result: 'PASS', grantOptionSemanticResult: 'PASS' }).status, 'BLOCKED');

const failureEvidence = {
  timestamp: '2026-08-14T00:00:00.000Z', sourceCommit: COMMIT, stage: 'TLS_CONNECT', errorCode: 'EXTERNAL_XX000',
  connectionAttemptCount: 1, retryCount: 0, cleanupResult: 'PASS', result: 'BLOCKED'
};
assert.equal(validateApplicationOwnerRelationFailureEvidence(failureEvidence).status, 'PASS');
assert.equal(validateApplicationOwnerRelationFailureEvidence({ ...failureEvidence, errorMessage: 'postgresql://forbidden' }).status, 'BLOCKED');

const badSurface = { ...APPLICATION_OWNER_RELATION_QUERY_SURFACE, objects: 'SELECT * FROM public.employees' };
assert.equal(validateApplicationOwnerRelationQueryScope(badSurface).status, 'BLOCKED');
assert.equal(validateApplicationOwnerRelationQueryScope({ ...APPLICATION_OWNER_RELATION_QUERY_SURFACE, objects: 'DELETE FROM pg_catalog.pg_class' }).status, 'BLOCKED');

function fakeGit(_command, args) {
  const key = args.join(' ');
  if (key === 'rev-parse HEAD' || key === 'rev-parse origin/main') return `${COMMIT}\n`;
  if (key === 'branch --show-current') return 'main\n';
  if (key === 'status --porcelain --untracked-files=no') return '';
  if (args[0] === 'ls-files') return args.slice(args.indexOf('--') + 1).join('\n');
  throw new Error('unexpected git command');
}
assert.equal(validateApplicationOwnerRelationRepositoryProvenance(baseEnv, { execFileSyncImpl: fakeGit }).status, 'PASS');
assert.equal(validateApplicationOwnerRelationRepositoryProvenance({ ...baseEnv, BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: 'b'.repeat(40) }, { execFileSyncImpl: fakeGit }).status, 'BLOCKED');

function mockClient({ stats, connectError = null, identityVersion = 180004, cleanupError = false, collection = validCollection } = {}) {
  return class MockClient {
    constructor(options) { stats.instances += 1; stats.options = options; }
    async connect() { stats.connects += 1; if (connectError) throw connectError; }
    async query(sql) {
      stats.queries.push(sql);
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.identity) return { rows: [{ database_ok: true, current_role_ok: true, session_role_ok: true, read_only_ok: true, server_version_number: identityVersion }] };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.readerRoleBoundary) return { rows: [{ role_safe: true }] };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.transactionReadOnly) return { rows: [{ read_only_ok: true }] };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.ledger) return { rows: inputs.structuralBaseline.catalog.migrationLedger };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.objects) return { rows: collection.objects };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.defaultAcl) return { rows: collection.defaultAcl };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.ownerRole) return { rows: [collection.ownerRole] };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.allOwned) return { rows: collection.allOwned };
      if (sql === APPLICATION_OWNER_RELATION_QUERY_SURFACE.exclusions) return { rows: [collection.exclusions] };
      if (sql === 'BEGIN TRANSACTION READ ONLY' || sql === 'ROLLBACK') return { rows: [] };
      throw new Error('unexpected query');
    }
    async end() { stats.ends += 1; if (cleanupError) throw new Error('cleanup failed'); }
  };
}

function stats() { return { instances: 0, connects: 0, ends: 0, queries: [], options: null }; }
const repositoryVerifier = async () => ({ status: 'PASS', failures: [], commitSha: COMMIT });
const inputLoader = async () => inputs;
const evidencePath = path.join(temp, 'evidence.json');
const evidenceHashPath = path.join(temp, 'evidence.sha256');
const successStats = stats();
const success = await compareProductionApplicationOwnerRelation({
  env: baseEnv, ClientImpl: mockClient({ stats: successStats }), repositoryVerifier, inputLoader, evidencePath, evidenceHashPath
});
assert.equal(success.evidence.result, 'PASS');
assert.equal(success.evidence.grantOptionSemanticResult, 'SEMANTIC_MISMATCH');
assert.equal(successStats.instances, 1);
assert.equal(successStats.connects, 1);
assert.equal(successStats.ends, 1);
assert.equal(successStats.queries.filter(sql => sql === 'BEGIN TRANSACTION READ ONLY').length, 1);
assert.equal(successStats.queries.filter(sql => sql === 'ROLLBACK').length, 1);
assert.equal(successStats.options.ssl.rejectUnauthorized, true);
assert.equal(successStats.options.ssl.servername, 'db.example.invalid');
assert.match(await readFile(evidenceHashPath, 'utf8'), new RegExp(`^[a-f0-9]{64}  ${path.basename(evidencePath)}\\n$`));

// A failed first connect is never retried and emits only an allowlisted diagnostic.
const failureStats = stats();
const failurePath = path.join(temp, 'failure.json');
const failureHashPath = path.join(temp, 'failure.sha256');
const failed = await runProductionApplicationOwnerRelationCli({
  env: baseEnv, failureEvidencePath: failurePath, failureEvidenceHashPath: failureHashPath,
  comparatorOptions: { ClientImpl: mockClient({ stats: failureStats, connectError: Object.assign(new Error('host and credential must not persist'), { code: 'XX000' }) }), repositoryVerifier, inputLoader,
    evidencePath: path.join(temp, 'unused.json'), evidenceHashPath: path.join(temp, 'unused.sha256') }
});
assert.equal(failed.exitCode, 1);
assert.equal(failed.failure.stage, 'TLS_CONNECT');
assert.equal(failed.failure.errorCode, 'EXTERNAL_SQLSTATE_XX000');
assert.equal(failureStats.instances, 1);
assert.equal(failureStats.connects, 1);
assert.equal(failureStats.ends, 1);
assert.doesNotMatch(await readFile(failurePath, 'utf8'), /host and credential|postgresql:\/\//i);

const versionStats = stats();
const versionFailure = await runProductionApplicationOwnerRelationCli({
  env: baseEnv, failureEvidencePath: path.join(temp, 'version-failure.json'), failureEvidenceHashPath: path.join(temp, 'version-failure.sha256'),
  comparatorOptions: { ClientImpl: mockClient({ stats: versionStats, identityVersion: 170000 }), repositoryVerifier, inputLoader,
    evidencePath: path.join(temp, 'unused2.json'), evidenceHashPath: path.join(temp, 'unused2.sha256') }
});
assert.equal(versionFailure.failure.stage, 'IDENTITY_GUARD');
assert.equal(versionStats.connects, 1);
assert.equal(versionStats.ends, 1);

const cleanupStats = stats();
const cleanupFailure = await runProductionApplicationOwnerRelationCli({
  env: baseEnv, failureEvidencePath: path.join(temp, 'cleanup-failure.json'), failureEvidenceHashPath: path.join(temp, 'cleanup-failure.sha256'),
  comparatorOptions: { ClientImpl: mockClient({ stats: cleanupStats, cleanupError: true }), repositoryVerifier, inputLoader,
    evidencePath: path.join(temp, 'unused3.json'), evidenceHashPath: path.join(temp, 'unused3.sha256') }
});
assert.equal(cleanupFailure.failure.stage, 'CLEANUP');
assert.equal(cleanupFailure.failure.cleanupResult, 'FAILED');

const source = await readFile(new URL('../database/compare-production-application-owner-relation.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /new\s+Pool\s*\(|\.reconnect\s*\(|retry\s*\(/i);
assert.equal((source.match(/new ClientImpl\s*\(/g) || []).length, 1);
assert.doesNotMatch(source, /writeFile\([^\n]*(?:DATABASE_READONLY_URL|password|connectionString)/i);

const schema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const failureSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_FAILURE.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.additionalProperties, false);
assert.equal(failureSchema.additionalProperties, false);
assert.equal(Object.keys(schema.properties).some(key => /password|secret|credential|url|host|principal|oid|rawAcl/i.test(key)), false);

const committedEvidence = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json', import.meta.url), 'utf8'));
assert.equal(validateApplicationOwnerRelationEvidence(committedEvidence).status, 'PASS');
assert.equal(committedEvidence.result, 'BLOCKED');
assert.equal(committedEvidence.connectionAttemptCount, 1);
assert.equal(committedEvidence.retryCount, 0);
assert.equal(committedEvidence.sourceCommit, '73953776254f7acaccf7fd9bb2828719ddd07203');
assert.equal(committedEvidence.expectedCoverageCount, 65);
assert.equal(committedEvidence.observedCoverageCount, 0);
assert.equal(committedEvidence.ownerSetCount, 1);
assert.equal(committedEvidence.unrelatedOwnershipCount, 0);
assert.equal(committedEvidence.exactOwnerMatch, false);
assert.equal(committedEvidence.reviewedCategory, 'UNCLASSIFIED');
assert.equal(committedEvidence.proofEnum, 'EXACT_APPLICATION_OBJECT_OWNER_RELATION_NOT_PROVEN');
assert.equal(committedEvidence.ambiguity, true);
assert.equal(committedEvidence.roleBoundaryResult, 'BLOCKED');
assert.equal(committedEvidence.membershipClassification, 'UNEXPECTED_OUTBOUND');
assert.equal(committedEvidence.grantOptionSemanticResult, 'SEMANTIC_MISMATCH');
const committedEvidenceText = await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json', import.meta.url), 'utf8');
const committedEvidenceHash = createHash('sha256').update(committedEvidenceText).digest('hex');
const committedEvidenceCompanion = await readFile(new URL('../docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.sha256', import.meta.url), 'utf8');
assert.equal(committedEvidenceHash, 'd3f8dfb23d2c8fcd4bbb14c1cbda3c77b07e9bbf7ba6513cf5596d726952d9b6');
assert.equal(committedEvidenceCompanion, `${committedEvidenceHash}  PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json\n`);

await rm(temp, { recursive: true, force: true });
console.log('Production Closure Phase 2N minimal application owner-relation collector tests passed');
