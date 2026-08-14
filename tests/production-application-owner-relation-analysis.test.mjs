import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateApplicationOwnerRelationEvidence } from '../database/compare-production-application-owner-relation.mjs';

const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

const ownerText = await read('docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json');
const ownerHashText = await read('docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.sha256');
const owner = JSON.parse(ownerText);
const ownerHash = createHash('sha256').update(ownerText).digest('hex');
assert.equal(ownerHash, 'd3f8dfb23d2c8fcd4bbb14c1cbda3c77b07e9bbf7ba6513cf5596d726952d9b6');
assert.equal(ownerHashText, `${ownerHash}  PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json\n`);
assert.equal(validateApplicationOwnerRelationEvidence(owner).status, 'PASS');
assert.equal(owner.sourceCommit, '73953776254f7acaccf7fd9bb2828719ddd07203');
assert.ok(Number.isFinite(Date.parse(owner.timestamp)));
assert.equal(owner.connectionAttemptCount, 1);
assert.equal(owner.retryCount, 0);

assert.deepEqual({
  result: owner.result,
  expected: owner.expectedCoverageCount,
  observed: owner.observedCoverageCount,
  ownerSet: owner.ownerSetCount,
  unrelated: owner.unrelatedOwnershipCount,
  exact: owner.exactOwnerMatch,
  category: owner.reviewedCategory,
  proof: owner.proofEnum,
  ambiguity: owner.ambiguity,
  roleBoundary: owner.roleBoundaryResult,
  membership: owner.membershipClassification
}, {
  result: 'BLOCKED', expected: 65, observed: 0, ownerSet: 1, unrelated: 0, exact: false,
  category: 'UNCLASSIFIED', proof: 'EXACT_APPLICATION_OBJECT_OWNER_RELATION_NOT_PROVEN',
  ambiguity: true, roleBoundary: 'BLOCKED', membership: 'UNEXPECTED_OUTBOUND'
});

const aclText = await read('docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json');
const acl = JSON.parse(aclText);
assert.equal(createHash('sha256').update(aclText).digest('hex'), 'bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c');
const explicit = acl.entries.filter(entry => entry.aclState === 'EXPLICIT_DEFAULT_ACL');
assert.equal(explicit.length, 11);
assert.equal(explicit.filter(entry => entry.objectType === 'RELATION').length, 8);
assert.equal(explicit.filter(entry => entry.objectType === 'SEQUENCE').length, 3);
assert.equal(explicit.filter(entry => entry.grantOption === true).length, 11);
assert.deepEqual([...new Set(explicit.map(entry => entry.granteeCategory))], ['OTHER_NAMED_PRINCIPAL']);

const baseline = JSON.parse(await read('database/production-0001-0008-acl-semantic-baseline.json'));
assert.deepEqual(baseline.appliedMigrations, ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
assert.deepEqual(baseline.snapshot.defaultPrivileges, []);

const serializedSources = `${ownerText}\n${aclText}`;
assert.doesNotMatch(serializedSources, /postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s|password|connectionString|hostname|rawAcl|principalName|rawOid/i);

const analysis = await read('docs/PRODUCTION_CLOSURE_PHASE_2O_APPLICATION_OWNER_RELATION_ANALYSIS.md');
assert.match(analysis, /0\/65/);
assert.match(analysis, /owner-set count.*1/i);
assert.match(analysis, /EXPLICIT_DEFAULT_ACL/);
assert.match(analysis, /8 relation.*3 sequence.*11/i);
assert.match(analysis, /baseline.*zero default privileges/i);
assert.match(analysis, /ACL semantic drift.*PROVEN/i);
assert.match(analysis, /9 PASS \/ 13 non-PASS/);
assert.match(analysis, /Production connections.*0/i);
assert.match(analysis, /Production mutations.*NONE/i);

console.log('Production Closure Phase 2O application-owner/default-ACL analysis tests passed');
