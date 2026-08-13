import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ACL_SEMANTIC_MODEL_VERSION,
  ACL_SEMANTIC_QUERIES,
  OBJECT_PRIVILEGES,
  PRINCIPAL_CATEGORIES,
  buildAclSemanticSnapshot,
  combineStructuralAndAclGate,
  compareAclSemanticSnapshots
} from '../database/acl-semantic-model.mjs';
import { runSyntheticAclMatrix } from '../database/analyze-production-acl-semantics.mjs';
import { validateSemanticQueryScope } from '../database/compare-production-starting-baseline-semantic.mjs';

const matrix = runSyntheticAclMatrix();
assert.deepEqual(matrix, {
  extensionOwnerEquivalent: 'SEMANTIC_MATCH',
  differentTrustedGrantorEquivalent: 'SEMANTIC_MATCH',
  grantOptionAdded: 'SEMANTIC_MISMATCH',
  identicalRaw: 'SEMANTIC_MATCH',
  membershipExpansion: 'SEMANTIC_MISMATCH',
  modelVersionMismatch: 'BLOCKED',
  nullVsExplicitDefault: 'SEMANTIC_MATCH',
  nullVsPublicRevoked: 'SEMANTIC_MISMATCH',
  ownerIdentityEquivalent: 'SEMANTIC_MATCH',
  publicPrivilegeAdded: 'SEMANTIC_MISMATCH',
  readonlyWriteAdded: 'SEMANTIC_MISMATCH',
  unexpectedPrincipal: 'BLOCKED',
  unknownAcl: 'BLOCKED'
});

assert.equal(ACL_SEMANTIC_MODEL_VERSION, 'bankeban-acl-semantics-v1');
assert.deepEqual(PRINCIPAL_CATEGORIES, [
  'EXPECTED_OWNER', 'EXPECTED_READONLY_ROLE', 'EXPECTED_RUNTIME_ROLE', 'PUBLIC',
  'EXTENSION_OWNER', 'SYSTEM_PLATFORM_MANAGED', 'READONLY_MEMBERSHIP_CARRIER', 'OTHER_NAMED_PRINCIPAL'
]);
assert.deepEqual(OBJECT_PRIVILEGES.SCHEMA, ['CREATE', 'USAGE']);
assert.deepEqual(OBJECT_PRIVILEGES.RELATION, ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
assert.deepEqual(OBJECT_PRIVILEGES.FUNCTION, ['EXECUTE']);
assert.deepEqual(OBJECT_PRIVILEGES.SEQUENCE, ['SELECT', 'UPDATE', 'USAGE']);

for (const sql of Object.values(ACL_SEMANTIC_QUERIES)) {
  assert.match(sql.trim(), /^(?:WITH|SELECT)\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY)\b/i);
}
assert.match(ACL_SEMANTIC_QUERIES.entries, /pg_catalog\.aclexplode/);
assert.match(ACL_SEMANTIC_QUERIES.entries, /pg_catalog\.acldefault/);
assert.match(ACL_SEMANTIC_QUERIES.memberships, /pg_catalog\.pg_auth_members/);
assert.match(ACL_SEMANTIC_QUERIES.defaultPrivileges, /pg_catalog\.pg_default_acl/);
assert.deepEqual(validateSemanticQueryScope(), { status: 'PASS', failures: [] });

assert.equal(combineStructuralAndAclGate('PASS', 'SEMANTIC_MATCH'), 'PASS');
assert.equal(combineStructuralAndAclGate('PASS', 'SEMANTIC_MISMATCH'), 'MISMATCH');
assert.equal(combineStructuralAndAclGate('MISMATCH', 'SEMANTIC_MATCH'), 'MISMATCH');
assert.equal(combineStructuralAndAclGate('BLOCKED', 'SEMANTIC_MATCH'), 'BLOCKED');
assert.equal(combineStructuralAndAclGate('PASS', 'BLOCKED'), 'BLOCKED');

const incomplete = buildAclSemanticSnapshot({ defaultsExpanded: false }, {});
assert.equal(incomplete.status, 'BLOCKED');
assert.equal(compareAclSemanticSnapshots(incomplete, incomplete).status, 'BLOCKED');
const sensitive = buildAclSemanticSnapshot({ defaultsExpanded: true, objects: [], entries: [], defaultPrivileges: [], memberships: [], password: 'redacted-value' }, { expectedOwners: ['owner'], expectedReadonlyRole: 'reader' });
assert.equal(sensitive.status, 'BLOCKED');
assert.equal(sensitive.blockers.includes('FORBIDDEN_ACL_FACT_FIELD:password'), true);

const sourceEvidence = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json', import.meta.url));
const sourceHash = createHash('sha256').update(sourceEvidence).digest('hex');
assert.equal(sourceHash, '373de2d509da8a2b1b419430ba89573371f9632ff253c72e07ed99193bf479a7');

const derivedText = await readFile(new URL('../docs/PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.json', import.meta.url), 'utf8');
const derived = JSON.parse(derivedText);
const derivedHash = (await readFile(new URL('../docs/PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.sha256', import.meta.url), 'utf8')).trim();
assert.equal(derivedHash, `${createHash('sha256').update(derivedText).digest('hex')}  PRODUCTION_CLOSURE_PHASE_2D_ACL_SEMANTIC_EVIDENCE.json`);
assert.equal(derived.derivedEvidence, true);
assert.equal(derived.sourcePhase2BEvidenceSha256, sourceHash);
assert.equal(derived.sourcePhase2BEvidencePreserved, true);
assert.equal(derived.aclSemanticModelVersion, ACL_SEMANTIC_MODEL_VERSION);
assert.equal(derived.historicalAclDifferences.total, 57);
assert.equal(derived.historicalAclDifferences.semanticallyReclassifiable, 0);
assert.equal(derived.historicalAclDifferences.classification, 'INSUFFICIENT_EVIDENCE');
assert.equal(derived.structuralStartingBaseline, 'BLOCKED');
assert.equal(derived.freshLedgerAndChecksum, 'BLOCKED');
assert.deepEqual(derived.gateState, { nonPass: 13, pass: 9 });
assert.equal(derived.productionConnectionAttempted, false);
assert.equal(derived.productionMutation, false);
assert.equal(derived.cleanup.residualDisposableResourceCount, 0);
assert.equal(derived.disposablePostgres18.independentRebuildEquivalent, true);
assert.equal(derived.disposablePostgres18.semanticFingerprint, derived.disposablePostgres18.independentRebuildSemanticFingerprint);
assert.equal(derived.disposablePostgres18.expectedPolicySnapshot.fingerprint, derived.disposablePostgres18.independentRebuildPolicyFingerprint);

const baselineText = await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.json', import.meta.url), 'utf8');
const baseline = JSON.parse(baselineText);
const baselineHash = (await readFile(new URL('../database/production-0001-0008-acl-semantic-baseline.sha256', import.meta.url), 'utf8')).trim();
assert.equal(baselineHash, `${createHash('sha256').update(baselineText).digest('hex')}  production-0001-0008-acl-semantic-baseline.json`);
assert.equal(baseline.modelVersion, ACL_SEMANTIC_MODEL_VERSION);
assert.equal(baseline.snapshot.status, 'PASS');
assert.equal(baseline.snapshot.audit.rawPrincipalNamesPersisted, false);
assert.equal(derived.expectedAclSemanticArtifactSha256, createHash('sha256').update(baselineText).digest('hex'));
assert.equal(derived.expectedAclSemanticFingerprint, baseline.snapshot.fingerprint);

const liveComparatorSource = await readFile(new URL('../database/compare-production-starting-baseline-semantic.mjs', import.meta.url), 'utf8');
assert.match(liveComparatorSource, /COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTIC/);
assert.match(liveComparatorSource, /BEGIN TRANSACTION READ ONLY/);
assert.match(liveComparatorSource, /collectAclSemanticFacts/);
assert.match(liveComparatorSource, /combineStructuralAndAclGate/);
assert.doesNotMatch(liveComparatorSource, /COMPARE_BANKE_PRODUCTION_STARTING_BASELINE['"]/);

console.log('Production ACL semantic comparator and fail-closed model tests passed');
