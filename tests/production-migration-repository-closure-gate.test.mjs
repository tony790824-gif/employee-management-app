import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  APPROVED_VERSIONS,
  UPGRADE_VERSIONS,
  buildExactManifest,
  repositoryClosureGate,
  validateExactManifest,
  validateRepositoryRuntimeEvidence,
  validateRuntimeCompatibility,
  validateTrackedInventory
} from '../database/production-migration-repository-closure-gate.mjs';

const manifest = JSON.parse(await readFile(new URL('../database/production-migration-exact-manifest.json', import.meta.url), 'utf8'));
const compatibility = JSON.parse(await readFile(new URL('../database/production-migration-runtime-compatibility.expected.json', import.meta.url), 'utf8'));
const packageValue = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lockText = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const upgradeEvidence = JSON.parse(await readFile(new URL('../docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json', import.meta.url), 'utf8'));
const structuralEvidence = JSON.parse(await readFile(new URL('../docs/PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json', import.meta.url), 'utf8'));
const expectedCatalogText = await readFile(new URL('../database/production-expected-catalog-baseline.json', import.meta.url), 'utf8');
const valid = await validateExactManifest(manifest);
assert.equal(valid.status, 'PASS');
assert.deepEqual(valid.failures, []);
assert.equal(validateRuntimeCompatibility(compatibility).status, 'PASS');
assert.equal(validateRepositoryRuntimeEvidence({ packageValue, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText }).status, 'PASS');
assert.equal(manifest.exactMigrationCount, 21);
assert.deepEqual(manifest.orderedMigrationIds, APPROVED_VERSIONS);
assert.deepEqual(manifest.upgradeExecutionOrder, UPGRADE_VERSIONS);
assert.deepEqual(manifest.intentionalExcludedVersions, ['0010']);
assert.equal(manifest.candidateCommitAuthorization, 'NOT_GRANTED');
assert.equal(manifest.migrations.some(item => item.version === '0010'), false);

const tracked = manifest.migrations.flatMap(item => [item.up.path, item.down.path]);
assert.deepEqual(validateTrackedInventory(tracked), [...tracked].sort());
assert.throws(() => validateTrackedInventory(tracked.slice(1)), /MIGRATION_UP_FILE_COUNT|MIGRATION_VERSION_INVENTORY_MISMATCH/);
assert.throws(() => validateTrackedInventory([...tracked, 'database/migrations/0010_commission_rules.up.sql', 'database/migrations/0010_commission_rules.down.sql']), /MIGRATION_0010_REJECTED/);
assert.throws(() => validateTrackedInventory([...tracked, 'database/migrations/0023_unexpected.up.sql', 'database/migrations/0023_unexpected.down.sql']), /MIGRATION_VERSION_INVENTORY_MISMATCH/);

const reordered = structuredClone(manifest);
[reordered.orderedMigrationIds[0], reordered.orderedMigrationIds[1]] = [reordered.orderedMigrationIds[1], reordered.orderedMigrationIds[0]];
assert.equal((await validateExactManifest(reordered)).status, 'BLOCKED');
const includes0010 = structuredClone(manifest);
includes0010.upgradeExecutionOrder.splice(1, 0, '0010');
assert.equal((await validateExactManifest(includes0010)).status, 'BLOCKED');
const badChecksum = structuredClone(manifest);
badChecksum.migrations[0].up.sha256 = '0'.repeat(64);
assert.equal((await validateExactManifest(badChecksum)).status, 'BLOCKED');
const tamperedHash = structuredClone(manifest);
tamperedHash.manifestSha256 = 'f'.repeat(64);
assert.equal((await validateExactManifest(tamperedHash)).status, 'BLOCKED');

const contentByPath = new Map();
for (const item of manifest.migrations) {
  contentByPath.set(item.up.path, await readFile(new URL(`../${item.up.path}`, import.meta.url)));
  contentByPath.set(item.down.path, await readFile(new URL(`../${item.down.path}`, import.meta.url)));
}
const changedContent = new Map(contentByPath);
changedContent.set(manifest.migrations[0].up.path, Buffer.from('changed'));
const rebuiltAfterChange = await buildExactManifest({
  trackedPaths: tracked,
  read: async filePath => {
    const normalized = filePath.replaceAll('\\', '/');
    const relative = normalized.slice(normalized.indexOf('database/migrations/'));
    return changedContent.get(relative);
  },
  migrationSourceCommitSha: manifest.migrationSourceCommitSha,
  compatibilityContent: await readFile(new URL('../database/production-migration-runtime-compatibility.expected.json', import.meta.url))
});
assert.notEqual(rebuiltAfterChange.migrations[0].up.sha256, manifest.migrations[0].up.sha256);
assert.equal((await validateExactManifest(manifest, rebuiltAfterChange)).status, 'BLOCKED');

const weakenedCompatibility = structuredClone(compatibility);
weakenedCompatibility.checkpointPolicy['0019'] = 'CURRENT_RUNTIME_ALLOWED';
assert.equal(validateRuntimeCompatibility(weakenedCompatibility).status, 'BLOCKED');
const falseProductionObservation = structuredClone(compatibility);
falseProductionObservation.components.api.productionObserved = 'PASS';
assert.equal(validateRuntimeCompatibility(falseProductionObservation).status, 'BLOCKED');
assert.equal(validateRepositoryRuntimeEvidence({ packageValue, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText, nodeVersion: '19.9.0' }).status, 'BLOCKED');
const wrongDriver = structuredClone(packageValue);
wrongDriver.dependencies.pg = '^9.0.0';
assert.equal(validateRepositoryRuntimeEvidence({ packageValue: wrongDriver, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText }).status, 'BLOCKED');

const gate = await repositoryClosureGate();
assert.equal(gate.runtimeCompatibility, 'PASS');
assert.equal(gate.immutableExactManifest, 'PASS');
assert.equal(gate.migrationCount, 21);
assert.equal(gate.upgradeSubsetCount, 13);
assert.equal(gate.excluded0010, true);
assert.equal(gate.candidateCommitAuthorization, 'NOT_GRANTED');
assert.equal(gate.productionConnectionAttempted, false);
assert.equal(gate.productionMutation, false);
assert.equal(path.extname(manifest.migrations[0].up.path), '.sql');

console.log('Production Migration repository closure manifest and runtime compatibility tests passed');
