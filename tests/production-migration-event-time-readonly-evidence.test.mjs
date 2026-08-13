import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const evidenceUrl = new URL('../docs/PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.json', import.meta.url);
const hashUrl = new URL('../docs/PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.sha256', import.meta.url);
const sourceUrl = new URL('../docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.json', import.meta.url);
const sourceHashUrl = new URL('../docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.sha256', import.meta.url);
const readinessUrl = new URL('../database/production-migration-final-readiness.expected.json', import.meta.url);

const evidenceBytes = await readFile(evidenceUrl);
const evidence = JSON.parse(evidenceBytes);
const hashRecord = (await readFile(hashUrl, 'utf8')).trim();
const sourceBytes = await readFile(sourceUrl);
const source = JSON.parse(sourceBytes);
const sourceHashRecord = (await readFile(sourceHashUrl, 'utf8')).trim();
const readiness = JSON.parse(await readFile(readinessUrl, 'utf8'));
const actualHash = createHash('sha256').update(evidenceBytes).digest('hex');
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');

assert.equal(hashRecord, `${actualHash}  PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.json`);
assert.equal(sourceHashRecord, `${sourceHash}  PRODUCTION_SCHEMA_PARITY_EVIDENCE.json`);
assert.equal(evidence.sourceEvidence.sha256, sourceHash);
assert.equal(readiness.sourceEvidence.productionReadOnlyEvidenceSha256, sourceHash);
assert.equal(evidence.schemaVersion, 2);
assert.equal(evidence.repositoryCommitSha, source.commitSha);
assert.equal(evidence.authorization.scope, 'ONE_DEDICATED_PRODUCTION_READONLY_CONNECTION');
assert.equal(evidence.authorization.consumed, true);
assert.equal(evidence.authorization.secondConnectionAuthorized, false);
assert.equal(evidence.authorization.productionMigrationAuthorized, false);
assert.equal(evidence.authorization.productionMutationAuthorized, false);
assert.deepEqual(evidence.collectionBoundary, {
  productionConnectionAttempted: true,
  productionReadOnlyMetadataSqlExecuted: true,
  migrationLedgerCollected: true,
  structuralCatalogCollected: false,
  productionMutation: false,
  secondProductionConnectionAttemptedBySprint65Analysis: false,
  substituteCredentialUsed: false
});

assert.equal(source.identityResult, 'PASS');
assert.equal(source.tlsVerification, 'VERIFY_FULL_PASS');
assert.equal(source.finalStatus, 'BLOCKED');
assert.deepEqual(source.stopReasons, ['MIGRATION_LEDGER_MISMATCH']);
assert.equal(source.productionCatalogHash, null);
assert.equal(evidence.identityObservation.databaseExpected, 'neondb');
assert.equal(evidence.identityObservation.databaseLiteralPersistedBySource, false);
assert.equal(evidence.identityObservation.databaseMatchedProtectedExpectation, true);
assert.equal(evidence.identityObservation.roleExpected, 'banke_production_readonly');
assert.equal(evidence.identityObservation.roleLiteralPersistedBySource, false);
assert.equal(evidence.identityObservation.currentAndSessionRoleMatchedProtectedExpectation, true);
assert.equal(evidence.tlsObservation.status, 'PASS');

for (const gateId of ['TARGET_IDENTITY', 'TLS_VERIFY_FULL', 'ZERO_UNEXPECTED_MIGRATIONS']) {
  assert.equal(evidence.results[gateId].status, 'PASS');
  assert.equal(readiness.currentGateEvidence[gateId].status, 'PASS');
}
for (const gateId of ['FRESH_LEDGER_AND_CHECKSUM', 'STRUCTURAL_STARTING_BASELINE']) {
  assert.equal(evidence.results[gateId].status, 'BLOCKED');
  assert.equal(readiness.currentGateEvidence[gateId].status, 'BLOCKED');
}
assert.equal(evidence.results.ROLE_BOUNDARY.status, 'NOT_EVALUATED');
assert.equal(readiness.currentGateEvidence.ROLE_BOUNDARY.status, 'BLOCKED');
assert.equal(evidence.results.EVIDENCE_FRESHNESS.status, 'NOT_EVALUATED');
assert.equal(readiness.currentGateEvidence.EVIDENCE_FRESHNESS.status, 'BLOCKED');
assert.deepEqual(evidence.productionMigrationInventory.observedVersionsDerivedFromSanitizedRangeAndDifferences,
  ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
assert.deepEqual(evidence.productionMigrationInventory.missingExpectedVersions,
  ['0009', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022']);
assert.deepEqual(evidence.productionMigrationInventory.unexpectedVersions, []);
assert.deepEqual(evidence.productionMigrationInventory.checksumMismatchVersions, []);
assert.equal(evidence.productionMigrationInventory.structuralCollection, 'NOT_STARTED');
assert.equal(evidence.productionMigrationInventory.structuralMismatchObserved, false);
assert.equal(evidence.executionResult.exitCode, 2);
assert.equal(evidence.executionResult.stopReason, 'MIGRATION_LEDGER_MISMATCH');
assert.deepEqual(evidence.gateMatrix, {
  before: { pass: 6, nonPass: 16 },
  after: { pass: 9, nonPass: 13 },
  transitions: [
    { gateId: 'TARGET_IDENTITY', from: 'BLOCKED', to: 'PASS' },
    { gateId: 'TLS_VERIFY_FULL', from: 'BLOCKED', to: 'PASS' },
    { gateId: 'ZERO_UNEXPECTED_MIGRATIONS', from: 'BLOCKED', to: 'PASS' }
  ]
});
assert.equal(evidence.decision.productionReadinessPercent, 70);
assert.equal(evidence.decision.productionMigrationAuthorization, 'NOT_GRANTED');
assert.equal(evidence.decision.productionMigrationTechnicalReadiness, 'NO_GO');

const serialized = evidenceBytes.toString('utf8');
assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(serialized, /(?:password|private[_-]?key|access[_-]?token|connection[_-]?string|hostname|endpoint[_-]?id)\s*[":=]/i);
assert.doesNotMatch(serialized, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);

console.log('Sprint 65 authorized read-only evidence analysis contract tests passed');
