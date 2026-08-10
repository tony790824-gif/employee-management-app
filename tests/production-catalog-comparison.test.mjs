import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  compareCatalogSection,
  compareCatalogs,
  compareMigrationLedger,
  productionConnectionConfig
} from '../database/compare-production-catalog.mjs';

const baseline = JSON.parse(await readFile('database/production-expected-catalog-baseline.json', 'utf8'));
const eolAttributes = execFileSync('git', ['check-attr', 'eol', '--',
  'database/production-expected-catalog-baseline.json',
  'docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.json'], { encoding: 'utf8' });
assert.match(eolAttributes, /production-expected-catalog-baseline\.json: eol: lf/);
assert.match(eolAttributes, /PRODUCTION_SCHEMA_PARITY_EVIDENCE\.json: eol: lf/);
assert.equal(compareMigrationLedger(baseline.catalog.migrationLedger, baseline.catalog.migrationLedger).status, 'PASS');
assert.deepEqual(
  compareMigrationLedger(baseline.catalog.migrationLedger, baseline.catalog.migrationLedger.slice(1)).differences,
  ['MISSING:0001']
);
assert.deepEqual(compareMigrationLedger(baseline.catalog.migrationLedger, [
  ...baseline.catalog.migrationLedger,
  { version: '0010', name: 'unapproved', checksum: '0'.repeat(64) }
]).differences, ['UNEXPECTED:0010']);
assert.deepEqual(compareMigrationLedger(
  baseline.catalog.migrationLedger,
  baseline.catalog.migrationLedger.map(row => row.version === '0001'
    ? { ...row, checksum: '0'.repeat(64) }
    : row)
).differences, ['MISMATCH:0001']);

assert.equal(compareCatalogs(baseline.catalog, baseline.catalog).schemaParityResult.status, 'PASS');
const changedCatalog = structuredClone(baseline.catalog);
changedCatalog.relations[0].rls_enabled = !changedCatalog.relations[0].rls_enabled;
const changed = compareCatalogs(baseline.catalog, changedCatalog);
assert.equal(changed.schemaParityResult.status, 'BLOCKED');
assert.equal(changed.rlsPolicyResult.status, 'BLOCKED');
assert.match(changed.schemaParityResult.differences[0], /^MISMATCH:relations:/);
assert.equal(compareCatalogSection('extensions', baseline.catalog.extensions, []).status, 'BLOCKED');

const protectedFixture = {
  BANK_PRODUCTION_PARITY_CONFIRMATION: 'COMPARE_BANKE_PRODUCTION_CATALOG',
  BANK_ENV: 'production',
  DATABASE_READONLY_URL: 'postgresql://reader_only:password@db.example.invalid:5432/neondb?sslmode=require',
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_READONLY_ROLE: 'reader_only',
  BANK_PRODUCTION_CA_BUNDLE: `${process.env.TEMP || 'C:\\Temp'}\\banke-ca.pem`
};
assert.equal(productionConnectionConfig(protectedFixture).expectedDatabase, 'neondb');
assert.throws(
  () => productionConnectionConfig({ ...protectedFixture, BANK_ENV: 'staging' }),
  /PRODUCTION_ENVIRONMENT_REQUIRED/
);
assert.throws(
  () => productionConnectionConfig({ ...protectedFixture, BANK_PRODUCTION_READONLY_ROLE: 'banke_api_production' }),
  /PRODUCTION_IDENTITY_EXPECTATION_BLOCKED/
);
assert.throws(
  () => productionConnectionConfig({
    ...protectedFixture,
    DATABASE_READONLY_URL: protectedFixture.DATABASE_READONLY_URL.replace('reader_only', 'owner')
  }),
  /PRODUCTION_URL_IDENTITY_BLOCKED/
);
assert.throws(
  () => productionConnectionConfig({
    ...protectedFixture,
    DATABASE_READONLY_URL: protectedFixture.DATABASE_READONLY_URL.replace('db.example.invalid', 'localhost')
  }),
  /PRODUCTION_LOOPBACK_TARGET_BLOCKED/
);

const source = await readFile('database/compare-production-catalog.mjs', 'utf8');
assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:error\.message|connectionString|DATABASE_READONLY_URL)/);
assert.match(source, /BEGIN TRANSACTION READ ONLY/);
assert.match(source, /ledgerResult\.status !== 'PASS'/);
assert.match(source, /rejectUnauthorized: true/);
assert.match(source, /pg_has_role\(roles\.oid, granted_role\.oid, 'MEMBER'\)/);
assert.doesNotMatch(
  source,
  /membership\.member\s*=\s*roles\.oid\s+OR\s+membership\.roleid\s*=\s*roles\.oid/i
);

console.log('Production catalog comparison passed sanitized fail-closed tests');
