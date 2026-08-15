import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  canonicalJson,
  loadApprovedMigrations,
  normalizeCatalog,
  sha256,
  validateDisposableIdentity,
  validateNoProductionInputs
} from '../database/materialize-expected-catalog.mjs';

const migrations = await loadApprovedMigrations();
assert.equal(migrations.length, 21);
assert.deepEqual(migrations.map(item => item.version), [
  '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009',
  '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019',
  '0020', '0021', '0022'
]);
assert.equal(migrations.some(item => item.version === '0010' || item.file?.startsWith('0010_')), false);

assert.equal(validateNoProductionInputs({}).status, 'PASS');
for (const key of ['DATABASE_URL', 'DATABASE_MIGRATOR_URL', 'DATABASE_READONLY_URL', 'BANK_PRODUCTION_DATABASE_HOST']) {
  assert.throws(() => validateNoProductionInputs({ [key]: 'present-but-never-consumed' }), new RegExp(`PRODUCTION_INPUT_PRESENT:${key}`));
}

const rootDirectory = 'C:\\Temp\\banke-disposable-catalog-test';
const safeIdentity = {
  database_name: 'banke_expected_catalog_test',
  role_name: 'banke_baseline_owner',
  session_role: 'banke_baseline_owner',
  server_address: '127.0.0.1/32',
  listen_addresses: '127.0.0.1',
  data_directory: `${rootDirectory}\\data`,
  server_version_num: '180000'
};
assert.equal(validateDisposableIdentity(safeIdentity, {
  databaseName: 'banke_expected_catalog_test',
  rootDirectory
}).status, 'PASS');
for (const [field, unsafeValue] of [
  ['database_name', 'neondb'],
  ['role_name', 'production_owner'],
  ['session_role', 'production_owner'],
  ['server_address', '203.0.113.10'],
  ['listen_addresses', '*'],
  ['data_directory', 'C:\\Production\\data'],
  ['server_version_num', '170000']
]) {
  const result = validateDisposableIdentity({ ...safeIdentity, [field]: unsafeValue }, {
    databaseName: 'banke_expected_catalog_test',
    rootDirectory
  });
  assert.equal(result.status, 'BLOCKED', `${field} must fail closed`);
}

const unorderedCatalog = {
  relations: [
    { relation_name: 'z', owner_name: 'owner_a', acl: '{owner_a=arwdDxt/owner_a}' },
    { relation_name: 'a', owner_name: 'owner_a', acl: '' }
  ],
  schemas: [{ schema_name: 'public', owner_name: 'owner_a', acl: '' }]
};
const normalizedA = normalizeCatalog(unorderedCatalog, 'owner_a');
const normalizedB = normalizeCatalog({
  schemas: [{ acl: '', owner_name: 'owner_b', schema_name: 'public' }],
  relations: [
    { acl: '{owner_b=arwdDxt/owner_b}', owner_name: 'owner_b', relation_name: 'z' },
    { acl: '', owner_name: 'owner_b', relation_name: 'a' }
  ]
}, 'owner_b');
assert.equal(canonicalJson(normalizedA), canonicalJson(normalizedB));
assert.equal(sha256(canonicalJson(normalizedA)), sha256(canonicalJson(normalizedB)));
const normalizedExtension = normalizeCatalog({
  functions: [{ extension_name: 'pgcrypto', owner_name: 'owner_a', acl: '{owner_a=X/owner_a}' }],
  extensions: [{ extension_name: 'pgcrypto', owner_name: 'owner_a' }]
}, 'owner_a');
assert.equal(normalizedExtension.functions[0].owner_name, '$EXTENSION_OWNER:pgcrypto');
assert.equal(normalizedExtension.functions[0].acl, '{$EXTENSION_OWNER:pgcrypto=X/$EXTENSION_OWNER:pgcrypto}');
assert.equal(normalizedExtension.extensions[0].owner_name, '$EXTENSION_OWNER:pgcrypto');

const artifactText = await readFile(new URL('../database/production-expected-catalog-baseline.json', import.meta.url), 'utf8');
const hashLine = (await readFile(new URL('../database/production-expected-catalog-baseline.sha256', import.meta.url), 'utf8')).trim();
const artifact = JSON.parse(artifactText);
const expectedHash = createHash('sha256').update(artifactText, 'utf8').digest('hex');
assert.equal(hashLine, `${expectedHash}  production-expected-catalog-baseline.json`);
assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.postgresMajorVersion, 18);
assert.deepEqual(artifact.intentionalGaps, ['0010']);
assert.equal(artifact.migrationInventory.length, 21);
assert.equal(artifact.migrationInventory.some(item => item.version === '0010'), false);
assert.deepEqual(artifact.catalog.migrationLedger.map(item => item.version), migrations.map(item => item.version));
assert.equal(artifact.objectCounts.migrationLedger, 21);
assert.ok(artifact.objectCounts.relations > 0);
assert.ok(artifact.objectCounts.columns > 0);
assert.ok(artifact.objectCounts.constraints > 0);
assert.ok(artifact.objectCounts.indexes > 0);
assert.ok(artifact.objectCounts.functions > 0);
assert.ok(artifact.objectCounts.triggers > 0);
assert.equal(Array.isArray(artifact.catalog.sequences), true);
assert.equal(artifact.objectCounts.sequences, artifact.catalog.sequences.length);
assert.ok(artifact.objectCounts.extensions > 0);
assert.equal(
  artifact.catalog.columns.find(item => item.table_name === 'push_subscriptions' && item.column_name === 'endpoint_hash')?.column_default,
  ''
);

const source = await readFile(new URL('../database/materialize-expected-catalog.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /neon\.tech|onrender\.com/i);
assert.doesNotMatch(source, /env\.(?:DATABASE_URL|DATABASE_MIGRATOR_URL|DATABASE_READONLY_URL)/);
assert.match(source, /127\.0\.0\.1/);
assert.match(source, /DISPOSABLE_CONFIRMATION_REQUIRED/);
assert.match(source, /BASELINE_REPRODUCIBILITY_MISMATCH/);
assert.match(source, /CASE WHEN attribute\.attgenerated = ''[\s\S]*ELSE ''[\s\S]*END AS column_default/);

console.log('Disposable expected catalog baseline passed deterministic and fail-closed validation');
