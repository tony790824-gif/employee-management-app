import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EVIDENCE_FIELDS,
  EXPECTED_VERSIONS,
  PARITY_STOP_CONDITIONS,
  loadExpectedInventory,
  repositoryDryRun,
  validateEvidenceShape,
  validateExpectedInventory,
  validateReadOnlyCatalogSql
} from '../database/production-schema-parity-plan.mjs';

const inventory = await loadExpectedInventory();
assert.deepEqual(inventory.migrations.map(item => item.version), EXPECTED_VERSIONS);
assert.equal(inventory.expectedRange.start, '0001');
assert.equal(inventory.expectedRange.end, '0022');
assert.equal(inventory.migrations.length, 22);
assert.deepEqual(inventory.requiredExtensionsFromTrackedSources, ['pgcrypto']);

const gaps = inventory.migrations.filter(item => item.sourceStatus === 'INTENTIONAL_UNAPPROVED_GAP');
assert.deepEqual(gaps.map(item => item.version), ['0010']);
assert.equal(gaps[0].checksum, null);
assert.equal(gaps[0].file, null);

const inventoryResult = await validateExpectedInventory(inventory);
assert.equal(inventoryResult.status, 'PASS');
assert.equal(inventoryResult.trackedCount, 21);
assert.equal(inventoryResult.expectedLedgerEntryCount, 21);
assert.deepEqual(inventoryResult.intentionalGapVersions, ['0010']);
assert.deepEqual(inventoryResult.failures, []);
assert.equal(inventoryResult.failures.some(item => item.startsWith('CHECKSUM_MISMATCH:')), false);

const querySql = await readFile(new URL('../database/operator/production-schema-parity.readonly.sql', import.meta.url), 'utf8');
const queryResult = validateReadOnlyCatalogSql(querySql);
assert.equal(queryResult.status, 'PASS');
assert.ok(queryResult.statementCount >= 8);
assert.deepEqual(queryResult.failures, []);
assert.doesNotMatch(querySql, /pg_get_functiondef|\bprosrc\b/i);
assert.match(querySql, /public\.schema_migrations/);
assert.match(querySql, /pg_catalog\.pg_policies/);
assert.match(querySql, /pg_catalog\.pg_extension/);

for (const condition of [
  'TARGET_IDENTITY_UNPROVEN',
  'MIGRATION_MISSING',
  'MIGRATION_UNEXPECTED',
  'MIGRATION_CHECKSUM_MISMATCH',
  'SCHEMA_OBJECT_MISMATCH',
  'OWNERSHIP_MISMATCH',
  'ACL_MISMATCH',
  'UNEXPECTED_EXTENSION',
  'QUERY_NOT_PROVEN_READ_ONLY',
  'EXPECTED_SCHEMA_BASELINE_INCOMPLETE',
  'EVIDENCE_INCOMPLETE'
]) assert.ok(PARITY_STOP_CONDITIONS.includes(condition));

const invalidSql = 'SELECT 1; UPDATE public.schema_migrations SET version = version;';
assert.equal(validateReadOnlyCatalogSql(invalidSql).status, 'BLOCKED');
assert.equal(validateReadOnlyCatalogSql('SELECT * FROM employees;').status, 'BLOCKED');

const evidence = Object.fromEntries(EVIDENCE_FIELDS.map(field => [field, null]));
Object.assign(evidence, {
  timestamp: '2026-08-09T00:00:00.000Z',
  commitSha: '0'.repeat(40),
  expectedMigrationRange: { start: '0001', end: '0022', count: 22 },
  observedMigrationRange: null,
  checksumResult: { status: 'BLOCKED', differences: ['MISSING:0010'] },
  schemaParityResult: { status: 'BLOCKED', differences: [] },
  functionParityResult: { status: 'BLOCKED', differences: [] },
  aclResult: { status: 'BLOCKED', differences: [] },
  rlsPolicyResult: { status: 'BLOCKED', differences: [] },
  extensionResult: { status: 'BLOCKED', differences: [] },
  finalStatus: 'BLOCKED',
  stopReasons: ['MIGRATION_MISSING']
});
assert.equal(validateEvidenceShape(evidence).status, 'PASS');
assert.equal(validateEvidenceShape({ ...evidence, databaseHostname: 'forbidden' }).status, 'BLOCKED');

const dryRun = await repositoryDryRun();
assert.equal(dryRun.mode, 'REPOSITORY_ONLY_DRY_RUN');
assert.equal(dryRun.productionConnectionAttempted, false);
assert.equal(dryRun.productionSqlExecuted, false);
assert.equal(dryRun.catalogQueryPlan.status, 'PASS');
assert.equal(dryRun.finalStatus, 'BLOCKED');
assert.deepEqual(dryRun.expectedCatalogBaseline, {
  status: 'BLOCKED',
  reason: 'NOT_MATERIALIZED_FROM_REVIEWED_MIGRATIONS'
});
assert.deepEqual(dryRun.stopReasons, ['EXPECTED_SCHEMA_BASELINE_INCOMPLETE']);

console.log('Production schema parity repository-only plan passed fail-closed validation');
