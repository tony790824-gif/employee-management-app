import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  ACL_SEMANTIC_MODEL_VERSION,
  buildAclSemanticSnapshot,
  collectAclSemanticFacts,
  compareAclSemanticSnapshots
} from './acl-semantic-model.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  loadExactMigrationSet,
  resolvePostgresBin,
  runOneRehearsal,
  validateRehearsalEnvironment,
  validateSanitizedEvidence
} from './rehearse-production-migration-upgrade.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json');
const SOURCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.sha256');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.json');
const OUTPUT_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.sha256');
const BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.json');
const BASELINE_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-0001-0008-acl-semantic-baseline.sha256');
const CONFIRMATION = 'ANALYZE_BANKE_DISPOSABLE_ACL_SEMANTICS';
const DISPOSABLE_PREFIX = 'banke-disposable-upgrade-';
const OWNER = 'banke_rehearsal_owner';
const READONLY = 'banke_acl_readonly';
const RUNTIME = 'banke_acl_runtime';
const OTHER_OWNER = 'banke_acl_owner_variant';
const OTHER = 'banke_acl_unexpected';
const CARRIER = 'banke_acl_membership_carrier';

function sourceHash(hashText) {
  return String(hashText || '').trim().match(/^([a-f0-9]{64})\s+PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE\.json$/)?.[1] || null;
}

function context(overrides = {}) {
  return {
    expectedOwners: [OWNER, OTHER_OWNER, 'pg_database_owner'],
    expectedReadonlyRole: READONLY,
    expectedRuntimeRoles: [RUNTIME],
    extensionOwners: { pgcrypto: [OWNER, OTHER_OWNER] },
    systemManagedPrincipals: ['cloud_admin'],
    ...overrides
  };
}

function syntheticFacts({
  owner = OWNER,
  aclIsNull = true,
  entries = [],
  memberships = [],
  objectType = 'RELATION',
  objectIdentity = 'app_private.fixture',
  extensionName = ''
} = {}) {
  const defaults = {
    SCHEMA: [['EXPECTED_OWNER', 'USAGE'], ['EXPECTED_OWNER', 'CREATE']],
    RELATION: ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'].map(privilege => ['EXPECTED_OWNER', privilege]),
    FUNCTION: [['PUBLIC', 'EXECUTE'], ['EXPECTED_OWNER', 'EXECUTE']],
    SEQUENCE: [['EXPECTED_OWNER', 'SELECT'], ['EXPECTED_OWNER', 'UPDATE'], ['EXPECTED_OWNER', 'USAGE']]
  };
  const principal = category => ({
    EXPECTED_OWNER: owner,
    EXPECTED_READONLY_ROLE: READONLY,
    EXPECTED_RUNTIME_ROLE: RUNTIME,
    PUBLIC: 'PUBLIC',
    OTHER_NAMED_PRINCIPAL: OTHER,
    READONLY_MEMBERSHIP_CARRIER: CARRIER
  }[category]);
  const defaultEntries = aclIsNull ? (defaults[objectType] || []).map(([category, privilege]) => ({
    object_type: objectType,
    object_identity: objectIdentity,
    grantee_principal: principal(category),
    grantor_principal: owner,
    privilege_type: privilege,
    grant_option: category === 'EXPECTED_OWNER'
  })) : [];
  return {
    defaultsExpanded: true,
    objects: [{ object_type: objectType, schema_name: objectIdentity.split('.')[0], object_identity: objectIdentity, extension_name: extensionName, owner_principal: owner, acl_is_null: aclIsNull }],
    entries: [...defaultEntries, ...entries.map(entry => ({ object_type: objectType, object_identity: objectIdentity, grantor_principal: owner, ...entry }))],
    defaultPrivileges: [],
    memberships
  };
}

export function runSyntheticAclMatrix() {
  const expected = buildAclSemanticSnapshot(syntheticFacts(), context());
  const explicitEquivalent = buildAclSemanticSnapshot(syntheticFacts({ aclIsNull: false, entries: syntheticFacts().entries }), context());
  const ownerVariant = buildAclSemanticSnapshot(syntheticFacts({ owner: OTHER_OWNER }), context());
  const publicAdded = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: 'PUBLIC', privilege_type: 'SELECT', grant_option: false }] }), context());
  const readonlyWrite = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: READONLY, privilege_type: 'UPDATE', grant_option: false }] }), context());
  const unexpected = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: OTHER, privilege_type: 'SELECT', grant_option: false }] }), context());
  const grantOption = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: RUNTIME, privilege_type: 'SELECT', grant_option: true }] }), context());
  const noGrantOption = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: RUNTIME, privilege_type: 'SELECT', grant_option: false }] }), context());
  const differentTrustedGrantor = buildAclSemanticSnapshot(syntheticFacts({ entries: [{ grantee_principal: RUNTIME, grantor_principal: OTHER_OWNER, privilege_type: 'SELECT', grant_option: false }] }), context());
  const membership = buildAclSemanticSnapshot(syntheticFacts({ memberships: [{ member_principal: READONLY, granted_role_principal: CARRIER, admin_option: false, inherit_option: true, set_option: false }] }), context());
  const nullFunction = buildAclSemanticSnapshot(syntheticFacts({ objectType: 'FUNCTION', objectIdentity: 'public.fixture()' }), context());
  const revokedPublicFunction = buildAclSemanticSnapshot(syntheticFacts({ objectType: 'FUNCTION', objectIdentity: 'public.fixture()', aclIsNull: false, entries: [{ grantee_principal: OWNER, privilege_type: 'EXECUTE', grant_option: true }] }), context());
  const extensionA = buildAclSemanticSnapshot(syntheticFacts({ objectType: 'FUNCTION', objectIdentity: 'public.digest(bytea,text)', extensionName: 'pgcrypto' }), context());
  const extensionB = buildAclSemanticSnapshot(syntheticFacts({ objectType: 'FUNCTION', objectIdentity: 'public.digest(bytea,text)', extensionName: 'pgcrypto', owner: OTHER_OWNER }), context());
  return {
    identicalRaw: compareAclSemanticSnapshots(expected, expected).status,
    nullVsExplicitDefault: compareAclSemanticSnapshots(expected, explicitEquivalent).status,
    ownerIdentityEquivalent: compareAclSemanticSnapshots(expected, ownerVariant).status,
    extensionOwnerEquivalent: compareAclSemanticSnapshots(extensionA, extensionB).status,
    publicPrivilegeAdded: compareAclSemanticSnapshots(expected, publicAdded).status,
    readonlyWriteAdded: compareAclSemanticSnapshots(expected, readonlyWrite).status,
    unexpectedPrincipal: compareAclSemanticSnapshots(expected, unexpected).status,
    grantOptionAdded: compareAclSemanticSnapshots(noGrantOption, grantOption).status,
    differentTrustedGrantorEquivalent: compareAclSemanticSnapshots(noGrantOption, differentTrustedGrantor).status,
    membershipExpansion: compareAclSemanticSnapshots(expected, membership).status,
    nullVsPublicRevoked: compareAclSemanticSnapshots(nullFunction, revokedPublicFunction).status,
    unknownAcl: buildAclSemanticSnapshot({ defaultsExpanded: false }, context()).status,
    modelVersionMismatch: compareAclSemanticSnapshots(expected, { ...expected, modelVersion: 'unknown' }).status
  };
}

async function localPgcryptoObserver({ client }) {
  await client.query(`CREATE ROLE ${READONLY} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${RUNTIME} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${OTHER_OWNER} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${OTHER} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${CARRIER} NOLOGIN NOINHERIT`);
  try {
    const raw = await collectAclSemanticFacts(client);
    const first = buildAclSemanticSnapshot(raw, context());
    const pgcryptoFunctions = first.objects.filter(object => object.extensionName === 'pgcrypto' && object.objectType === 'FUNCTION');
    const publicExecutable = pgcryptoFunctions.filter(object => object.privileges.some(privilege => privilege.granteeCategory === 'PUBLIC' && privilege.privilege === 'EXECUTE'));
    const rawAgain = await collectAclSemanticFacts(client);
    const second = buildAclSemanticSnapshot(rawAgain, context());
    await client.query(`GRANT USAGE ON SCHEMA public, app_private TO ${READONLY}, ${RUNTIME}`);
    await client.query(`GRANT SELECT ON TABLE public.schema_migrations TO ${READONLY}`);
    for (const signature of [
      'app_private.api_establish_session(text,text,text)',
      'app_private.api_logout_session(text,text,text)',
      'app_private.api_list_employees(text,text,text)',
      'app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'
    ]) await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${RUNTIME}`);
    const expectedPolicySnapshot = buildAclSemanticSnapshot(await collectAclSemanticFacts(client), context());
    const objectSnapshot = async (objectType, objectIdentity, canonicalIdentity = objectIdentity) => {
      const facts = await collectAclSemanticFacts(client);
      return buildAclSemanticSnapshot({
        defaultsExpanded: true,
        objects: facts.objects.filter(row => row.object_type === objectType && row.object_identity === objectIdentity)
          .map(row => ({ ...row, object_identity: canonicalIdentity })),
        entries: facts.entries.filter(row => row.object_type === objectType && row.object_identity === objectIdentity)
          .map(row => ({ ...row, object_identity: canonicalIdentity })),
        defaultPrivileges: [],
        memberships: facts.memberships.filter(row => row.member_principal === READONLY)
      }, context());
    };
    await client.query('CREATE TABLE app_private.acl_semantic_fixture (id integer)');
    const nullAcl = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`GRANT ALL PRIVILEGES ON TABLE app_private.acl_semantic_fixture TO ${OWNER}`);
    const explicitDefault = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`ALTER TABLE app_private.acl_semantic_fixture OWNER TO ${OTHER_OWNER}`);
    const ownerVariant = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`ALTER TABLE app_private.acl_semantic_fixture OWNER TO ${OWNER}`);
    await client.query('GRANT SELECT ON TABLE app_private.acl_semantic_fixture TO PUBLIC');
    const publicAdded = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query('REVOKE SELECT ON TABLE app_private.acl_semantic_fixture FROM PUBLIC');
    await client.query(`GRANT UPDATE ON TABLE app_private.acl_semantic_fixture TO ${READONLY}`);
    const readonlyWrite = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`REVOKE UPDATE ON TABLE app_private.acl_semantic_fixture FROM ${READONLY}`);
    await client.query(`GRANT SELECT ON TABLE app_private.acl_semantic_fixture TO ${OTHER}`);
    const unexpectedPrincipal = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`REVOKE SELECT ON TABLE app_private.acl_semantic_fixture FROM ${OTHER}`);
    await client.query(`GRANT SELECT ON TABLE app_private.acl_semantic_fixture TO ${RUNTIME}`);
    const runtimeSelect = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`GRANT SELECT ON TABLE app_private.acl_semantic_fixture TO ${RUNTIME} WITH GRANT OPTION`);
    const runtimeGrantOption = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`REVOKE SELECT ON TABLE app_private.acl_semantic_fixture FROM ${RUNTIME}`);
    const noMembership = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`GRANT ${CARRIER} TO ${READONLY} WITH INHERIT TRUE, SET TRUE`);
    const membershipExpansion = await objectSnapshot('RELATION', 'app_private.acl_semantic_fixture');
    await client.query(`REVOKE ${CARRIER} FROM ${READONLY}`);
    await client.query(`CREATE FUNCTION app_private.acl_semantic_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'`);
    const nullFunctionAcl = await objectSnapshot('FUNCTION', 'app_private.acl_semantic_function()');
    await client.query('REVOKE EXECUTE ON FUNCTION app_private.acl_semantic_function() FROM PUBLIC');
    const publicRevokedFunction = await objectSnapshot('FUNCTION', 'app_private.acl_semantic_function()');
    await client.query('CREATE SEQUENCE app_private.acl_semantic_sequence');
    const sequenceSnapshot = await objectSnapshot('SEQUENCE', 'app_private.acl_semantic_sequence');
    const digestIdentity = pgcryptoFunctions.find(object => object.objectIdentity.startsWith('public.digest('))?.objectIdentity;
    let extensionOwnerEquivalent = 'BLOCKED';
    if (digestIdentity) {
      const before = await objectSnapshot('FUNCTION', digestIdentity, 'public.pgcrypto_fixture()');
      await client.query(`ALTER FUNCTION ${digestIdentity} OWNER TO ${OTHER_OWNER}`);
      const after = await objectSnapshot('FUNCTION', digestIdentity, 'public.pgcrypto_fixture()');
      extensionOwnerEquivalent = compareAclSemanticSnapshots(before, after).status;
      await client.query(`ALTER FUNCTION ${digestIdentity} OWNER TO ${OWNER}`);
    }
    const disposableMatrix = {
      identicalRaw: compareAclSemanticSnapshots(nullAcl, nullAcl).status,
      nullVsExplicitDefault: compareAclSemanticSnapshots(nullAcl, explicitDefault).status,
      ownerIdentityEquivalent: compareAclSemanticSnapshots(nullAcl, ownerVariant).status,
      extensionOwnerEquivalent,
      publicPrivilegeAdded: compareAclSemanticSnapshots(nullAcl, publicAdded).status,
      readonlyWriteAdded: compareAclSemanticSnapshots(nullAcl, readonlyWrite).status,
      unexpectedPrincipal: compareAclSemanticSnapshots(nullAcl, unexpectedPrincipal).status,
      grantOptionAdded: compareAclSemanticSnapshots(runtimeSelect, runtimeGrantOption).status,
      membershipExpansion: compareAclSemanticSnapshots(noMembership, membershipExpansion).status,
      nullVsPublicRevoked: compareAclSemanticSnapshots(nullFunctionAcl, publicRevokedFunction).status,
      sequenceModel: sequenceSnapshot.status
    };
    return {
      status: first.status === 'PASS' && second.status === 'PASS' && first.fingerprint === second.fingerprint
        && Object.values(disposableMatrix).every(value => ['SEMANTIC_MATCH', 'SEMANTIC_MISMATCH', 'BLOCKED', 'PASS'].includes(value))
        ? 'PASS' : 'BLOCKED',
      semanticFingerprint: first.fingerprint,
      repeatedFingerprint: second.fingerprint,
      pgcryptoFunctionCount: pgcryptoFunctions.length,
      pgcryptoPublicExecuteCount: publicExecutable.length,
      pgcryptoOwnerCategories: [...new Set(pgcryptoFunctions.map(object => object.ownerCategory))].sort(),
      rawPrincipalNamesPersisted: first.audit.rawPrincipalNamesPersisted,
      blockerTypes: [...new Set([...(first.blockers || []), ...(second.blockers || [])].map(value => value.split(':')[0]))].sort(),
      disposableMatrix,
      expectedPolicySnapshot
    };
  } finally {
    await client.query('DROP SEQUENCE IF EXISTS app_private.acl_semantic_sequence').catch(() => {});
    await client.query('DROP FUNCTION IF EXISTS app_private.acl_semantic_function()').catch(() => {});
    await client.query('DROP TABLE IF EXISTS app_private.acl_semantic_fixture').catch(() => {});
    await client.query(`REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM ${READONLY}`).catch(() => {});
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public, app_private FROM ${READONLY}, ${RUNTIME}`).catch(() => {});
    for (const signature of [
      'app_private.api_establish_session(text,text,text)',
      'app_private.api_logout_session(text,text,text)',
      'app_private.api_list_employees(text,text,text)',
      'app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'
    ]) await client.query(`REVOKE ALL PRIVILEGES ON FUNCTION ${signature} FROM ${RUNTIME}`).catch(() => {});
    await client.query(`REVOKE ${CARRIER} FROM ${READONLY}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${CARRIER}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${OTHER}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${OTHER_OWNER}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${RUNTIME}`).catch(() => {});
    await client.query(`DROP ROLE IF EXISTS ${READONLY}`).catch(() => {});
  }
}

async function residuals() {
  return (await readdir(os.tmpdir(), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(DISPOSABLE_PREFIX))
    .map(entry => entry.name);
}

export async function analyzeProductionAclSemantics({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_ACL_SEMANTIC_CONFIRMATION !== CONFIRMATION) throw new Error('DISPOSABLE_ACL_SEMANTIC_CONFIRMATION_REQUIRED');
  validateRehearsalEnvironment(env);
  const [sourceBytes, companion] = await Promise.all([readFile(SOURCE_PATH), readFile(SOURCE_HASH_PATH, 'utf8')]);
  const actualSourceHash = sha256(sourceBytes);
  if (sourceHash(companion) !== actualSourceHash) throw new Error('PHASE_2B_SOURCE_HASH_MISMATCH');
  const source = JSON.parse(sourceBytes.toString('utf8'));
  if (source.fingerprintComparison !== 'MISMATCH' || source.mismatchedObjects?.length !== 57
      || source.mismatchedObjects.some(item => item.changedFields?.length !== 1 || item.changedFields[0] !== 'acl')) {
    throw new Error('PHASE_2B_ACL_SOURCE_CONTRACT_MISMATCH');
  }
  if ((await residuals()).length) throw new Error('PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED');
  const migrationSet = await loadExactMigrationSet();
  const firstLocal = await runOneRehearsal({
    postgresBin: resolvePostgresBin(env),
    migrationSet,
    runLabel: 'PHASE_2D_ACL_SEMANTICS_A',
    baselineOnly: true,
    baselineObserver: localPgcryptoObserver
  });
  const secondLocal = await runOneRehearsal({
    postgresBin: resolvePostgresBin(env),
    migrationSet,
    runLabel: 'PHASE_2D_ACL_SEMANTICS_B',
    baselineOnly: true,
    baselineObserver: localPgcryptoObserver
  });
  const cleanupResiduals = await residuals();
  if (cleanupResiduals.length) throw new Error('DISPOSABLE_RESOURCE_CLEANUP_FAILED');
  const matrix = runSyntheticAclMatrix();
  const expectedMatrix = {
    identicalRaw: 'SEMANTIC_MATCH',
    nullVsExplicitDefault: 'SEMANTIC_MATCH',
    ownerIdentityEquivalent: 'SEMANTIC_MATCH',
    extensionOwnerEquivalent: 'SEMANTIC_MATCH',
    publicPrivilegeAdded: 'SEMANTIC_MISMATCH',
    readonlyWriteAdded: 'SEMANTIC_MISMATCH',
    unexpectedPrincipal: 'BLOCKED',
    grantOptionAdded: 'SEMANTIC_MISMATCH',
    differentTrustedGrantorEquivalent: 'SEMANTIC_MATCH',
    membershipExpansion: 'SEMANTIC_MISMATCH',
    nullVsPublicRevoked: 'SEMANTIC_MISMATCH',
    unknownAcl: 'BLOCKED',
    modelVersionMismatch: 'BLOCKED'
  };
  if (canonicalJson(matrix) !== canonicalJson(expectedMatrix)) throw new Error('ACL_SYNTHETIC_MATRIX_BLOCKED');
  const local = firstLocal.baselineObserverResult;
  const independent = secondLocal.baselineObserverResult;
  if (local.status !== 'PASS' || independent.status !== 'PASS') {
    const safe = local.status !== 'PASS' ? local : independent;
    throw new Error(`ACL_DISPOSABLE_MATRIX_BLOCKED:PGCRYPTO=${safe.pgcryptoFunctionCount}:PUBLIC_EXECUTE=${safe.pgcryptoPublicExecuteCount}:OWNER_CATEGORIES=${(safe.pgcryptoOwnerCategories || []).join(',') || 'NONE'}:BLOCKERS=${(safe.blockerTypes || []).join(',') || 'NONE'}:RAW_NAMES=${safe.rawPrincipalNamesPersisted}`);
  }
  const disposableExpected = {
    identicalRaw: 'SEMANTIC_MATCH',
    nullVsExplicitDefault: 'SEMANTIC_MATCH',
    ownerIdentityEquivalent: 'SEMANTIC_MATCH',
    extensionOwnerEquivalent: 'SEMANTIC_MATCH',
    publicPrivilegeAdded: 'SEMANTIC_MISMATCH',
    readonlyWriteAdded: 'SEMANTIC_MISMATCH',
    unexpectedPrincipal: 'BLOCKED',
    grantOptionAdded: 'SEMANTIC_MISMATCH',
    membershipExpansion: 'SEMANTIC_MISMATCH',
    nullVsPublicRevoked: 'SEMANTIC_MISMATCH',
    sequenceModel: 'PASS'
  };
  if (canonicalJson(local.disposableMatrix) !== canonicalJson(disposableExpected)
      || canonicalJson(independent.disposableMatrix) !== canonicalJson(disposableExpected)) throw new Error('ACL_DISPOSABLE_CASE_MATRIX_BLOCKED');
  if (local.expectedPolicySnapshot?.status !== 'PASS' || independent.expectedPolicySnapshot?.status !== 'PASS') throw new Error('ACL_EXPECTED_POLICY_BASELINE_BLOCKED');
  if (local.semanticFingerprint !== independent.semanticFingerprint
      || local.expectedPolicySnapshot.fingerprint !== independent.expectedPolicySnapshot.fingerprint
      || local.pgcryptoFunctionCount !== independent.pgcryptoFunctionCount
      || local.pgcryptoPublicExecuteCount !== independent.pgcryptoPublicExecuteCount) throw new Error('ACL_INDEPENDENT_REBUILD_NOT_DETERMINISTIC');
  const baseline = {
    schemaVersion: 1,
    scope: 'REPOSITORY_0001_0008_ACL_SEMANTIC_BASELINE',
    postgresMajorVersion: 18,
    appliedMigrations: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008'],
    modelVersion: ACL_SEMANTIC_MODEL_VERSION,
    policyProfile: 'MIGRATION_BASELINE_PLUS_APPROVED_RUNTIME_AND_READONLY_OPERATIONAL_GRANTS',
    snapshot: local.expectedPolicySnapshot
  };
  const baselineSerialized = canonicalJson(baseline);
  const baselineHash = sha256(baselineSerialized);
  await writeFile(BASELINE_PATH, baselineSerialized, 'utf8');
  await writeFile(BASELINE_HASH_PATH, `${baselineHash}  production-0001-0008-acl-semantic-baseline.json\n`, 'utf8');
  const output = {
    schemaVersion: 1,
    phase: 'PRODUCTION_CLOSURE_PHASE_2D',
    sprintNumberingCappedAt: 65,
    generatedAt: new Date().toISOString(),
    repositoryCommitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
    derivedEvidence: true,
    sourcePhase2BEvidenceSha256: actualSourceHash,
    sourcePhase2BEvidencePreserved: true,
    aclSemanticModelVersion: ACL_SEMANTIC_MODEL_VERSION,
    expectedAclSemanticArtifactSha256: baselineHash,
    expectedAclSemanticFingerprint: baseline.snapshot.fingerprint,
    fingerprintArchitecture: 'NON_ACL_STRUCTURAL_FINGERPRINT_PLUS_SEMANTIC_ACL_FINGERPRINT',
    historicalAclDifferences: { total: 57, semanticallyReclassifiable: 0, classification: 'INSUFFICIENT_EVIDENCE' },
    syntheticMatrix: matrix,
    disposablePostgres18: {
      ...local,
      independentRebuildEquivalent: true,
      independentRebuildSemanticFingerprint: independent.semanticFingerprint,
      independentRebuildPolicyFingerprint: independent.expectedPolicySnapshot.fingerprint
    },
    structuralStartingBaseline: 'BLOCKED',
    freshLedgerAndChecksum: 'BLOCKED',
    gateState: { pass: 9, nonPass: 13 },
    productionReadiness: '70_PERCENT_NOT_READY',
    productionStatus: 'NOT_READY',
    productionAuthorization: 'NOT_GRANTED',
    productionConnectionAttempted: false,
    productionMutation: false,
    cleanup: { residualDisposableResourceCount: cleanupResiduals.length, temporaryCredentialsRemoved: true, temporaryDataRemoved: true }
  };
  const sanitization = validateSanitizedEvidence(output);
  if (sanitization.status !== 'PASS') throw new Error(`ACL_EVIDENCE_SANITIZATION_BLOCKED:${sanitization.failures.join(',')}`);
  const serialized = canonicalJson(output);
  const hash = sha256(serialized);
  await writeFile(OUTPUT_PATH, serialized, 'utf8');
  await writeFile(OUTPUT_HASH_PATH, `${hash}  PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.json\n`, 'utf8');
  return { status: 'PASS', evidence: output, evidenceSha256: hash };
}

async function main() {
  try {
    const result = await analyzeProductionAclSemantics();
    process.stdout.write(`PHASE_2D_ACL_SEMANTICS=${result.status}\n`);
    process.stdout.write(`ACL_SEMANTIC_MODEL_VERSION=${result.evidence.aclSemanticModelVersion}\n`);
    process.stdout.write(`PHASE_2D_EVIDENCE_SHA256=${result.evidenceSha256}\n`);
  } catch (error) {
    process.stderr.write('PHASE_2D_ACL_SEMANTICS=BLOCKED\n');
    process.stderr.write(`PHASE_2D_ERROR=${String(error?.message || 'SANITIZED_FAILURE').replace(/[^A-Z0-9_:,-]/gi, '_')}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) main();
