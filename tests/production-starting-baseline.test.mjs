import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  STARTING_BASELINE_VERSIONS,
  STRUCTURAL_SECTIONS,
  UNAPPLIED_VERSIONS,
  validateStartingBaselineArtifact
} from '../database/materialize-production-starting-baseline.mjs';

const artifactText = await readFile(new URL('../database/production-0001-0008-structural-baseline.json', import.meta.url), 'utf8');
const artifactHashLine = (await readFile(new URL('../database/production-0001-0008-structural-baseline.sha256', import.meta.url), 'utf8')).trim();
const evidenceText = await readFile(new URL('../docs/PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.json', import.meta.url), 'utf8');
const evidenceHashLine = (await readFile(new URL('../docs/PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.sha256', import.meta.url), 'utf8')).trim();
const readiness = JSON.parse(await readFile(new URL('../database/production-migration-final-readiness.expected.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../database/materialize-production-starting-baseline.mjs', import.meta.url), 'utf8');

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const artifact = JSON.parse(artifactText);
const evidence = JSON.parse(evidenceText);
const artifactHash = sha256(artifactText);
const evidenceHash = sha256(evidenceText);

assert.deepEqual(STARTING_BASELINE_VERSIONS, ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
assert.deepEqual(UNAPPLIED_VERSIONS, [
  '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);
assert.equal(artifactHashLine, `${artifactHash}  production-0001-0008-structural-baseline.json`);
assert.equal(evidenceHashLine, `${evidenceHash}  PRODUCTION_0001_0008_STRUCTURAL_BASELINE_EVIDENCE.json`);
assert.equal(validateStartingBaselineArtifact(artifact).status, 'PASS');
assert.equal(artifact.scope, 'REPOSITORY_0001_0008_STRUCTURAL_BASELINE');
assert.equal(artifact.postgresMajorVersion, 18);
assert.deepEqual(artifact.appliedMigrations, STARTING_BASELINE_VERSIONS);
assert.equal(artifact.catalog.migrationLedger.length, 8);
assert.deepEqual(artifact.catalog.migrationLedger.map(item => item.version), STARTING_BASELINE_VERSIONS);
assert.equal(artifact.catalog.migrationLedger.some(item => item.version === '0010'), false);
assert.deepEqual(artifact.unappliedVersions, UNAPPLIED_VERSIONS);
for (const section of STRUCTURAL_SECTIONS) assert.ok(Array.isArray(artifact.catalog[section]), section);
assert.ok(artifact.objectCounts.tables > 0);
assert.ok(artifact.objectCounts.columns > 0);
assert.ok(artifact.objectCounts.constraints > 0);
assert.ok(artifact.objectCounts.indexes > 0);
assert.ok(artifact.objectCounts.functions > 0);
assert.ok(artifact.objectCounts.extensions > 0);

assert.equal(evidence.phase, 'PRODUCTION_CLOSURE_PHASE_1');
assert.equal(evidence.sprintNumberingCappedAt, 65);
assert.equal(evidence.repository00010008StructuralBaseline, 'PASS');
assert.equal(evidence.liveProductionStructuralStartingBaseline, 'NOT_EVALUATED');
assert.equal(evidence.authoritativeStructuralStartingBaseline, 'BLOCKED');
assert.equal(evidence.productionConnectionAttempted, false);
assert.equal(evidence.productionMutation, false);
assert.equal(evidence.migration0010Excluded, true);
assert.equal(evidence.independentRebuilds.length, 2);
assert.equal(evidence.independentRebuilds[0].catalogSha256, evidence.independentRebuilds[1].catalogSha256);
assert.equal(evidence.independentRebuilds[0].structuralFingerprint, evidence.independentRebuilds[1].structuralFingerprint);
assert.equal(evidence.independentRebuilds[0].structuralFingerprint, artifact.structuralFingerprint);
assert.equal(evidence.determinism.status, 'PASS');
assert.equal(evidence.determinism.byteIdenticalArtifacts, true);
assert.equal(evidence.cleanup.residualDisposableResourceCount, 0);

assert.equal(readiness.repositoryStartingBaseline.status, 'PASS');
assert.equal(readiness.repositoryStartingBaseline.artifactSha256, artifactHash);
assert.equal(readiness.repositoryStartingBaseline.structuralFingerprint, artifact.structuralFingerprint);
assert.equal(readiness.repositoryStartingBaseline.liveProductionComparison, 'BLOCKED');
assert.equal(readiness.liveStartingBaselineComparison.status, 'BLOCKED');
assert.equal(readiness.liveStartingBaselineComparison.productionAuthorization, 'CONSUMED_SINGLE_READONLY_CONNECTION');
assert.equal(readiness.liveStartingBaselineComparison.productionConnectionAttempted, true);
assert.deepEqual(readiness.liveStartingBaselineComparison.exactLedger, STARTING_BASELINE_VERSIONS);
assert.equal(readiness.currentGateEvidence.STRUCTURAL_STARTING_BASELINE.status, 'BLOCKED');
assert.equal(readiness.currentGateEvidence.FRESH_LEDGER_AND_CHECKSUM.status, 'BLOCKED');
assert.deepEqual(readiness.gateClosureMatrix.STRUCTURAL_STARTING_BASELINE.dependencies, ['ZERO_UNEXPECTED_MIGRATIONS']);
assert.equal(readiness.decision.productionReadiness, '70_PERCENT_NOT_READY');
assert.equal(readiness.decision.productionMigrationTechnicalReadiness, 'NO_GO');

assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /neon\.tech|onrender\.com|netlify\.app/i);
assert.match(source, /baselineOnly: true/);
assert.match(source, /STARTING_BASELINE_REPRODUCIBILITY_MISMATCH/);
assert.match(source, /PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED/);
assert.match(source, /DISPOSABLE_RESOURCE_CLEANUP_FAILED/);

console.log('Production 0001-0008 repository structural starting baseline tests passed');
