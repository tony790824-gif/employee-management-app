import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ACL_REMEDIATION_PRECHECK_CONFIRMATION,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE,
  aclRemediationPrecheckConnectionConfig,
  compareProductionAclRemediationPrecheck,
  evaluateAclRemediationPrecheck,
  loadPrecheckArtifacts,
  runProductionAclRemediationPrecheckCli,
  validateAclRemediationPrecheckEvidence,
  validateAclRemediationPrecheckFailureEvidence,
  validateAclRemediationPrecheckQueryScope
} from '../database/compare-production-acl-remediation-precheck.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const artifacts = await loadPrecheckArtifacts();

function replaceOwners(value) {
  if (Array.isArray(value)) return value.map(replaceOwners);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceOwners(child)]));
  return typeof value === 'string'
    ? value.replaceAll('$MIGRATION_OWNER', 'neondb_owner').replaceAll('$EXTENSION_OWNER:pgcrypto', 'cloud_admin')
    : value;
}

const principalForCategory = Object.freeze({
  EXPECTED_OWNER: 'neondb_owner',
  EXPECTED_RUNTIME_ROLE: 'banke_api_production',
  EXPECTED_READONLY_ROLE: 'banke_production_readonly',
  EXTENSION_OWNER: 'cloud_admin',
  SYSTEM_PLATFORM_MANAGED: 'cloud_admin',
  PUBLIC: 'PUBLIC'
});

function rawAclFacts() {
  const objects = artifacts.acl.artifact.snapshot.objects.map(object => ({
    object_type: object.objectType,
    schema_name: object.schemaName,
    object_identity: object.objectIdentity,
    extension_name: object.extensionName,
    owner_principal: principalForCategory[object.ownerCategory],
    acl_is_null: false
  }));
  const entries = [];
  for (const object of artifacts.acl.artifact.snapshot.objects) {
    for (const privilege of object.privileges) {
      if (!privilege.sources.includes('ACL_EFFECTIVE')) continue;
      entries.push({
        object_type: object.objectType,
        schema_name: object.schemaName,
        object_identity: object.objectIdentity,
        extension_name: object.extensionName,
        grantee_principal: principalForCategory[privilege.granteeCategory],
        grantor_principal: principalForCategory[object.ownerCategory],
        privilege_type: privilege.privilege,
        grant_option: privilege.grantOption
      });
    }
  }
  return { defaultsExpanded: true, objects, entries, defaultPrivileges: [], memberships: [] };
}

function defaultAclRows() {
  const relation = ['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
  const sequence = ['SELECT','UPDATE','USAGE'];
  return [
    ...relation.map(privilege_type => ({ default_acl_type: 'r', privilege_type })),
    ...sequence.map(privilege_type => ({ default_acl_type: 'S', privilege_type }))
  ].map(row => ({ ...row, owner_ref: '103', grantee_ref: '105', grantor_ref: '103', grant_option: true }));
}

function passCollection() {
  const defaults = defaultAclRows();
  const aclFacts = rawAclFacts();
  aclFacts.defaultPrivileges = defaults.map(row => ({
    schema_name: 'public',
    default_acl_type: row.default_acl_type,
    owner_principal: 'cloud_admin',
    grantee_principal: 'legacy_acl_group',
    grantor_principal: 'cloud_admin',
    privilege_type: row.privilege_type,
    grant_option: true
  }));
  return {
    ledger: structuredClone(artifacts.structural.artifact.catalog.migrationLedger),
    ledgerResult: { status: 'PASS', differences: [] },
    rawCatalog: replaceOwners(artifacts.structural.artifact.catalog),
    defaultAclContext: defaults,
    principalInventory: [
      ['READER','101'], ['OBJECT_OWNER','102'], ['PLATFORM','103'], ['ACL_OPERATOR','103'], ['RUNTIME','104']
    ].map(([category, role_ref]) => ({ category, match_count: 1, role_ref, dangerous_attributes_clear: true, login_enabled: true })),
    targetRoleContext: {
      target_principal: 'legacy_acl_group',
      rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
      rolcanlogin: false, rolinherit: false,
      outbound_membership_count: 0, effective_outbound_membership_count: 0,
      inbound_membership_count: 0, effective_inbound_membership_count: 0,
      owned_object_count: 0
    },
    operatorCapability: { can_act_for_default_owner: true },
    targetAclSurface: [],
    aclFacts
  };
}

const config = Object.freeze({
  objectOwnerRole: 'neondb_owner',
  platformRole: 'cloud_admin',
  runtimeRoles: ['banke_api_production'],
  aclOperatorRole: 'cloud_admin'
});

assert.deepEqual(validateAclRemediationPrecheckQueryScope(), { failures: [], status: 'PASS' });
const unsafeSurface = { ...ACL_REMEDIATION_PRECHECK_QUERY_SURFACE, targetAclSurface: 'DELETE FROM public.schema_migrations' };
assert.match(validateAclRemediationPrecheckQueryScope(unsafeSurface).failures.join(','), /MUTATION_TOKEN/);
for (const sql of [
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.identity,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.readerRoleBoundary,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.transactionReadOnly,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.ledger,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.defaultAclContext,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.principalInventory,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.targetRoleContext,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.operatorCapability,
  ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.targetAclSurface,
  ...Object.values(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.structural),
  ...Object.values(ACL_REMEDIATION_PRECHECK_QUERY_SURFACE.aclSemantic)
]) {
  const executable = sql.replace(/'(?:''|[^'])*'/g, "''");
  assert.match(sql.trim(), /^(?:SELECT|WITH)\b/i);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO)\b/i);
}

const passingEvidence = evaluateAclRemediationPrecheck({ artifacts, config, collection: passCollection(), sourceCommit: SOURCE_COMMIT });
assert.equal(passingEvidence.finalStatus, 'PASS');
assert.equal(passingEvidence.ledgerResult.status, 'PASS');
assert.equal(passingEvidence.defaultAclClassification.result, 'PASS');
assert.equal(passingEvidence.defaultAclClassification.relationFactCount, 8);
assert.equal(passingEvidence.defaultAclClassification.sequenceFactCount, 3);
assert.equal(passingEvidence.defaultAclClassification.grantOptionTrueCount, 11);
assert.equal(passingEvidence.roleMembership.result, 'PASS');
assert.equal(passingEvidence.runtimePrincipalInventory.result, 'PASS');
assert.equal(passingEvidence.currentObjectAclComparison.result, 'PASS');
assert.equal(passingEvidence.exactSafeRemediationTarget.result, 'PASS');
assert.equal(validateAclRemediationPrecheckEvidence(passingEvidence).status, 'PASS');

for (const mutate of [
  value => { value.targetRoleContext.rolcanlogin = true; },
  value => { value.targetRoleContext.outbound_membership_count = 1; },
  value => { value.principalInventory.find(row => row.category === 'RUNTIME').role_ref = '105'; },
  value => { value.operatorCapability.can_act_for_default_owner = false; },
  value => { value.defaultAclContext.pop(); },
  value => { value.targetAclSurface.push({ object_type: 'FUNCTION', object_identity: 'FUNCTION|public.unsafe()', privilege_type: 'EXECUTE', grant_option: false }); }
]) {
  const value = passCollection();
  mutate(value);
  const evidence = evaluateAclRemediationPrecheck({ artifacts, config, collection: value, sourceCommit: SOURCE_COMMIT });
  assert.equal(evidence.finalStatus, 'BLOCKED');
  assert.equal(evidence.exactSafeRemediationTarget.result, 'BLOCKED');
  assert.ok(evidence.exactSafeRemediationTarget.blockerCodes.length > 0);
  assert.equal(validateAclRemediationPrecheckEvidence(evidence).status, 'PASS');
}

const badLedger = passCollection();
badLedger.ledgerResult = { status: 'BLOCKED', differences: ['MISSING:0008'] };
assert.match(
  evaluateAclRemediationPrecheck({ artifacts, config, collection: badLedger, sourceCommit: SOURCE_COMMIT })
    .exactSafeRemediationTarget.blockerCodes.join(','),
  /EXACT_0001_0008_LEDGER_AND_CHECKSUM_BLOCKED/
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'bankeban-acl-precheck-test-'));
const caPath = path.join(tempRoot, 'root.pem');
await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n');
const fixturePassword = ['fixture', 'only'].join('-');
const env = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: ACL_REMEDIATION_PRECHECK_CONFIRMATION,
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: `postgresql://banke_production_readonly:${fixturePassword}@db.example.invalid:5432/neondb?sslmode=require`,
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'banke_production_readonly',
  BANK_PRODUCTION_CA_BUNDLE: caPath,
  BANK_PRODUCTION_OBJECT_OWNER_ROLE: 'neondb_owner',
  BANK_PRODUCTION_PLATFORM_ROLE: 'cloud_admin',
  BANK_PRODUCTION_RUNTIME_ROLES: 'banke_api_production',
  BANK_PRODUCTION_ACL_OPERATOR_ROLE: 'cloud_admin',
  BANK_PRODUCTION_ACL_PLAN_SHA256: artifacts.planSha256,
  BANK_PRODUCTION_EVIDENCE_COMMIT_SHA: SOURCE_COMMIT
};
const parsed = aclRemediationPrecheckConnectionConfig(env);
assert.equal(parsed.effectiveTlsMode, 'verify-full');
assert.equal(parsed.runtimeRoles.length, 1);
assert.equal(parsed.client.connectionTimeoutMillis, 10_000);
assert.throws(() => aclRemediationPrecheckConnectionConfig({ ...env, BANK_PRODUCTION_PARITY_CONFIRMATION: 'WRONG' }), /PRODUCTION_ACL_PRECHECK_CONFIRMATION_REQUIRED/);
assert.throws(() => aclRemediationPrecheckConnectionConfig({ ...env, BANK_PRODUCTION_ACL_OPERATOR_ROLE: 'banke_api_production' }), /OPERATOR_CLASS_BLOCKED/);
assert.throws(() => aclRemediationPrecheckConnectionConfig({ ...env, BANK_PRODUCTION_RUNTIME_ROLES: '' }), /PRINCIPAL_INVENTORY_INPUT_BLOCKED/);

let connectCount = 0;
let endCount = 0;
const issued = [];
class MockClient {
  async connect() { connectCount += 1; }
  async query(sql) {
    issued.push(sql);
    if (/server_version_num/.test(sql)) return { rows: [{ database_ok: true, current_role_ok: true, session_role_ok: true, read_only_ok: true, server_version_number: 180000 }] };
    if (/AS role_safe/.test(sql)) return { rows: [{ role_safe: true }] };
    if (/transaction_read_only/.test(sql)) return { rows: [{ read_only_ok: true }] };
    return { rows: [] };
  }
  async end() { endCount += 1; }
}
const successPath = path.join(tempRoot, 'success.json');
const successHashPath = path.join(tempRoot, 'success.sha256');
const result = await compareProductionAclRemediationPrecheck({
  env,
  ClientImpl: MockClient,
  repositoryVerifier: async () => ({ status: 'PASS', failures: [], commitSha: SOURCE_COMMIT }),
  artifactLoader: async () => artifacts,
  collectorImpl: async () => passCollection(),
  evidencePath: successPath,
  evidenceHashPath: successHashPath
});
assert.equal(result.evidence.finalStatus, 'PASS');
assert.equal(connectCount, 1);
assert.equal(endCount, 1);
assert.equal(issued.filter(sql => sql === 'BEGIN TRANSACTION READ ONLY').length, 1);
assert.equal(issued.filter(sql => sql === 'ROLLBACK').length, 1);
assert.equal((await readFile(successHashPath, 'utf8')).trim().split(/\s+/)[0], result.evidenceSha256);

let blockedClientConstructed = false;
class NeverClient { constructor() { blockedClientConstructed = true; } }
const failurePath = path.join(tempRoot, 'failure.json');
const failureHashPath = path.join(tempRoot, 'failure.sha256');
const failed = await runProductionAclRemediationPrecheckCli({
  env: {},
  failurePath,
  failureHashPath,
  comparatorOptions: { ClientImpl: NeverClient }
});
assert.equal(failed.exitCode, 1);
assert.equal(blockedClientConstructed, false);
assert.equal(failed.failure.connectionAttemptCount, 0);
assert.equal(failed.failure.productionConnectionAttempted, false);
assert.equal(failed.failure.productionMutation, false);
assert.equal(validateAclRemediationPrecheckFailureEvidence(failed.failure).status, 'PASS');
const unsafeFailure = { ...failed.failure, databaseUrl: 'forbidden' };
assert.equal(validateAclRemediationPrecheckFailureEvidence(unsafeFailure).status, 'BLOCKED');

await rm(tempRoot, { recursive: true, force: true });
console.log('Production ACL remediation pre-check runner passed local fail-closed regression tests');
