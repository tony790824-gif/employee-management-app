import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const evidenceUrl = new URL('../docs/PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.json', import.meta.url);
const hashUrl = new URL('../docs/PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.sha256', import.meta.url);
const readinessUrl = new URL('../database/production-migration-final-readiness.expected.json', import.meta.url);

const evidenceBytes = await readFile(evidenceUrl);
const evidence = JSON.parse(evidenceBytes);
const hashRecord = (await readFile(hashUrl, 'utf8')).trim();
const readiness = JSON.parse(await readFile(readinessUrl, 'utf8'));
const actualHash = createHash('sha256').update(evidenceBytes).digest('hex');

assert.equal(hashRecord, `${actualHash}  PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.json`);
assert.equal(evidence.schemaVersion, 1);
assert.equal(evidence.repositoryCommitSha, '6a1d69fe9e3a6579536253103cdf2cd29312d137');
assert.equal(evidence.manifestSha256, '769fcc39a0a9aa0a8e18355e31dcd859018295cdb7f4940f75a30ce244217cbf');
assert.equal(evidence.authorization.productionMigrationAuthorized, false);
assert.equal(evidence.authorization.productionMutationAuthorized, false);
assert.deepEqual(new Set(Object.values(evidence.processInputs)), new Set(['ABSENT']));
assert.deepEqual(evidence.collectionBoundary, {
  productionConnectionAttempted: false,
  productionSqlExecuted: false,
  productionCatalogCollected: false,
  productionMutation: false,
  substituteCredentialUsed: false
});

for (const gateId of [
  'TARGET_IDENTITY',
  'TLS_VERIFY_FULL',
  'FRESH_LEDGER_AND_CHECKSUM',
  'ZERO_UNEXPECTED_MIGRATIONS',
  'STRUCTURAL_STARTING_BASELINE'
]) {
  assert.equal(evidence.results[gateId].status, 'BLOCKED');
  assert.equal(readiness.currentGateEvidence[gateId].status, 'BLOCKED');
}

assert.equal(evidence.results.ROLE_BOUNDARY.status, 'NOT_EVALUATED');
assert.equal(readiness.currentGateEvidence.ROLE_BOUNDARY.status, 'BLOCKED');
assert.equal(readiness.gateClosureMatrix.ROLE_BOUNDARY.category, 'BLOCKED_BY_DEPENDENCY');
assert.equal(evidence.results.EVIDENCE_FRESHNESS.status, 'NOT_EVALUATED');
assert.equal(readiness.currentGateEvidence.EVIDENCE_FRESHNESS.status, 'BLOCKED');
assert.ok(readiness.gateClosureMatrix.EVIDENCE_FRESHNESS.dependencies.includes('PRE_MIGRATION_RESTORE_POINT'));
assert.deepEqual(evidence.gateMatrix, {
  before: { pass: 6, nonPass: 16 },
  after: { pass: 6, nonPass: 16 },
  transitions: []
});
assert.equal(evidence.productionMigrationInventory.currentSprintObservation, 'NOT_OBSERVED');
assert.equal(evidence.productionMigrationInventory.historicalProvenanceOnly.mayBeUsedAsFreshEvidence, false);
assert.equal(evidence.decision.sprintStatus, 'BLOCKED');
assert.equal(evidence.decision.blocker, 'DEDICATED_READ_ONLY_CREDENTIAL_UNAVAILABLE');
assert.equal(evidence.decision.productionReadinessPercent, 70);
assert.equal(evidence.decision.productionMigrationAuthorization, 'NOT_GRANTED');
assert.equal(evidence.decision.productionMigrationTechnicalReadiness, 'NO_GO');

const serialized = evidenceBytes.toString('utf8');
assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(serialized, /(?:password|private[_-]?key|access[_-]?token|connection[_-]?string|hostname|endpoint[_-]?id)\s*[":=]/i);
assert.doesNotMatch(serialized, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);

console.log('Sprint 64 event-time read-only blocked-evidence contract tests passed');
