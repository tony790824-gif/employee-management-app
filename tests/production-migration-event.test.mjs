import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_NEON_MIGRATION_OPERATOR,
  APPROVED_UPGRADE_SEQUENCE,
  INPUT_GUARD_ERROR_CODES,
  MAINTENANCE_CONFIRMATION,
  PRODUCTION_EVENT_CONFIRMATION,
  RESTORE_POINT_CONFIRMATION,
  assertApprovedMigrationSet,
  assertMigrationOperatorEvidence,
  productionMigrationEventConfig,
  sanitizedInputGuardErrorCode,
  validateProductionMigrationEventInput,
  verifyIdentityAndOperator
} from '../database/production-migration-event.mjs';

const head = 'a'.repeat(40);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'banke-production-input-guard-'));
const caPath = path.join(temporaryRoot, 'banke-production-event-test.pem');
await writeFile(caPath, '-----BEGIN CERTIFICATE-----\nsynthetic-test-ca\n-----END CERTIFICATE-----\n', 'utf8');
const valid = {
  CI: 'true',
  BANK_ENV: 'production',
  BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION: PRODUCTION_EVENT_CONFIRMATION,
  BANK_PRODUCTION_RESTORE_POINT_STATUS: RESTORE_POINT_CONFIRMATION,
  BANK_PRODUCTION_MAINTENANCE_STATUS: MAINTENANCE_CONFIRMATION,
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE: APPROVED_NEON_MIGRATION_OPERATOR,
  BANK_PRODUCTION_MIGRATION_COMMIT_SHA: head,
  BANK_PRODUCTION_CA_BUNDLE: caPath,
  DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require'
};

const config = productionMigrationEventConfig(valid, { head });
assert.equal(config.expectedDatabase, 'neondb');
assert.equal(config.expectedOperator, APPROVED_NEON_MIGRATION_OPERATOR);
assert.deepEqual(APPROVED_UPGRADE_SEQUENCE, [
  '0009', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);
assert.equal(APPROVED_UPGRADE_SEQUENCE.includes('0010'), false);

for (const [name, patch, pattern] of [
  ['missing connection input', { DATABASE_MIGRATOR_URL: '' }, /CLIPBOARD_INPUT_MISSING/],
  ['URL parse', { DATABASE_MIGRATOR_URL: 'not a connection URI' }, /URL_PARSE_BLOCKED/],
  ['protocol', { DATABASE_MIGRATOR_URL: 'https://neondb_owner:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /PROTOCOL_BLOCKED/],
  ['database', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@direct.example/other?sslmode=verify-full&channel_binding=require' }, /DATABASE_BLOCKED/],
  ['operator identity', { DATABASE_MIGRATOR_URL: 'postgresql://other:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /OPERATOR_BLOCKED/],
  ['password component', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /PASSWORD_COMPONENT_MISSING/],
  ['authorization', { BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION: '' }, /CONFIRMATION_BLOCKED/],
  ['restore point', { BANK_PRODUCTION_RESTORE_POINT_STATUS: '' }, /ENVIRONMENT_BLOCKED/],
  ['maintenance drain', { BANK_PRODUCTION_MAINTENANCE_STATUS: '' }, /ENVIRONMENT_BLOCKED/],
  ['commit identity', { BANK_PRODUCTION_MIGRATION_COMMIT_SHA: 'b'.repeat(40) }, /COMMIT_SHA_BLOCKED/],
  ['reader role', { BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE: 'banke_production_readonly', DATABASE_MIGRATOR_URL: 'postgresql://banke_production_readonly:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /OPERATOR_BLOCKED/],
  ['unapproved operator', { BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE: 'banke_production_migrator', DATABASE_MIGRATOR_URL: 'postgresql://banke_production_migrator:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /OPERATOR_BLOCKED/],
  ['pooled endpoint', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@host-pooler.example/neondb?sslmode=verify-full&channel_binding=require' }, /DIRECT_TARGET_BLOCKED/],
  ['loopback endpoint', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@localhost/neondb?sslmode=verify-full&channel_binding=require' }, /DIRECT_TARGET_BLOCKED/],
  ['TLS downgrade', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@direct.example/neondb?sslmode=require&channel_binding=require' }, /TLS_MODE_BLOCKED/],
  ['channel binding', { DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:masked@direct.example/neondb?sslmode=verify-full' }, /CHANNEL_BINDING_BLOCKED/],
  ['CA bundle input', { BANK_PRODUCTION_CA_BUNDLE: '' }, /CA_BUNDLE_BLOCKED/]
]) {
  assert.throws(() => productionMigrationEventConfig({ ...valid, ...patch }, { head }), pattern, name);
}

const validIdentity = Object.freeze({ database_ok: true, user_ok: true, session_ok: true, version_ok: true });
const validBoundary = Object.freeze({
  rolsuper: false,
  rolcreatedb: true,
  rolcreaterole: true,
  rolreplication: true,
  rolbypassrls: true,
  rolcanlogin: true,
  public_create: true,
  private_create: true,
  relation_owner_mismatch_count: 0,
  function_owner_mismatch_count: 0
});

assert.doesNotThrow(() => assertMigrationOperatorEvidence(validIdentity, validBoundary, config));
for (const field of ['rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
  assert.throws(
    () => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, [field]: false }, config),
    /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/,
    `${field} must match the explicitly approved Neon owner profile`
  );
}
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, rolsuper: true }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, rolcanlogin: false }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence({ ...validIdentity, database_ok: false }, validBoundary, config), /EVENT_IDENTITY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence({ ...validIdentity, user_ok: false }, validBoundary, config), /EVENT_IDENTITY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence({ ...validIdentity, session_ok: false }, validBoundary, config), /EVENT_IDENTITY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence({ ...validIdentity, version_ok: false }, validBoundary, config), /EVENT_IDENTITY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, public_create: false }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, private_create: false }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, relation_owner_mismatch_count: 1 }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);
assert.throws(() => assertMigrationOperatorEvidence(validIdentity, { ...validBoundary, function_owner_mismatch_count: 1 }, config), /MIGRATION_OPERATOR_BOUNDARY_BLOCKED/);

const queried = [];
await verifyIdentityAndOperator({
  async query(sql, parameters) {
    queried.push({ sql, parameters });
    return { rows: [queried.length === 1 ? validIdentity : validBoundary] };
  }
}, config);
assert.equal(queried.length, 2);
assert.deepEqual(queried[0].parameters, ['neondb', APPROVED_NEON_MIGRATION_OPERATOR]);
assert.match(queried[1].sql, /relation_owner_mismatch_count/);
assert.match(queried[1].sql, /function_owner_mismatch_count/);
assert.match(queried[1].sql, /d\.deptype = 'e'/);

const approvedMigrationSet = { upgrade: APPROVED_UPGRADE_SEQUENCE.map(version => ({ version })) };
assert.doesNotThrow(() => assertApprovedMigrationSet(approvedMigrationSet));
assert.throws(
  () => assertApprovedMigrationSet({ upgrade: [approvedMigrationSet.upgrade[1], approvedMigrationSet.upgrade[0], ...approvedMigrationSet.upgrade.slice(2)] }),
  /SEQUENCE_BLOCKED/
);
assert.throws(
  () => assertApprovedMigrationSet({ upgrade: [{ version: '0010' }, ...approvedMigrationSet.upgrade] }),
  /UNAPPROVED_0010_BLOCKED/
);

assert.equal(INPUT_GUARD_ERROR_CODES.length, 17);
assert.equal(sanitizedInputGuardErrorCode(new Error('CHANNEL_BINDING_BLOCKED')), 'CHANNEL_BINDING_BLOCKED');
assert.equal(sanitizedInputGuardErrorCode(new Error('MIGRATION_CHECKSUM_MISMATCH:0012')), 'MANIFEST_BLOCKED');
assert.equal(sanitizedInputGuardErrorCode(new Error('unsafe raw message')), 'MANIFEST_BLOCKED');

const validated = await validateProductionMigrationEventInput({
  env: valid,
  head,
  migrationSetLoader: async () => approvedMigrationSet
});
assert.equal(validated.config.expectedOperator, APPROVED_NEON_MIGRATION_OPERATOR);
assert.equal(validated.migrationSet, approvedMigrationSet);
assert.match(validated.ca, /BEGIN CERTIFICATE/);
await assert.rejects(
  validateProductionMigrationEventInput({ env: { ...valid, CI: 'false' }, head, migrationSetLoader: async () => approvedMigrationSet }),
  /CI_MODE_BLOCKED/
);
await assert.rejects(
  validateProductionMigrationEventInput({ env: valid, head, migrationSetLoader: async () => { throw new Error('MIGRATION_CHECKSUM_MISMATCH:0011'); } }),
  /MANIFEST_BLOCKED/
);

const source = await readFile(new URL('../database/production-migration-event.mjs', import.meta.url), 'utf8');
const executionPlan = await readFile(new URL('../docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_PLAN.md', import.meta.url), 'utf8');
assert.match(source, /loadExactMigrationSet/);
const migrationLoaderSource = await readFile(new URL('../database/rehearse-production-migration-upgrade.mjs', import.meta.url), 'utf8');
assert.match(migrationLoaderSource, /MIGRATION_CHECKSUM_MISMATCH/);
assert.match(source, /applyMigrationStep/);
assert.match(source, /BEGIN TRANSACTION READ ONLY/);
assert.match(source, /EVENT_NON_ACL_STARTING_BASELINE_BLOCKED/);
assert.match(source, /EVENT_NON_ACL_FINAL_BASELINE_BLOCKED/);
assert.match(source, /UNAPPROVED_0010_BLOCKED/);
assert.match(source, /d\.deptype = 'e'/);
assert.match(source, /connectionCount \+= 1/);
assert.match(source, /retryCount: 0/);
assert.doesNotMatch(source, /setTimeout[\s\S]*client\.connect/);
assert.doesNotMatch(source, /readdir\(/);
assert.match(source, /--validation-only/);
assert.match(source, /NETWORK_CONNECTION_ATTEMPTED=false/);
assert.match(source, /PRODUCTION_MUTATION=false/);
assert.match(source, /validateProductionMigrationEventInput[\s\S]*new Client/);
assert.match(executionPlan, /\$env:CI = 'true'[\s\S]*pnpm run db:migration:production-event/);
assert.match(executionPlan, /Do not use\s+`--force`/);
assert.match(executionPlan, /do not set\s+`confirmModulesPurge=false`/);

const wrapperSource = await readFile(new URL('../scripts/validate-production-migration-input.ps1', import.meta.url), 'utf8');
for (const code of INPUT_GUARD_ERROR_CODES) assert.match(wrapperSource, new RegExp(`['\"]${code}['\"]`));
assert.match(wrapperSource, /--validation-only/);
assert.match(wrapperSource, /Cert:\\CurrentUser\\Root/);
assert.match(wrapperSource, /Remove-Item -LiteralPath \$temporaryCa/);
assert.doesNotMatch(wrapperSource, /Write-(?:Output|Error)[^\n]*(?:rawInput|verifiedUri|Exception\.Message)/i);

const cli = spawnSync(process.execPath, ['database/production-migration-event.mjs', '--validation-only'], {
  cwd: projectRoot,
  env: { ...process.env, ...valid, BANK_PRODUCTION_MIGRATION_COMMIT_SHA: process.env.BANK_TEST_HEAD || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
  encoding: 'utf8'
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stderr, '');
assert.equal(cli.stdout, 'PRODUCTION_MIGRATION_INPUT_GUARD=PASS\nNETWORK_CONNECTION_ATTEMPTED=false\nPRODUCTION_MUTATION=false\n');

if (process.platform === 'win32') {
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  const wrapperEnv = {
    ...process.env,
    ...valid,
    PATH: `${path.dirname(process.execPath)};${process.env.PATH || ''}`,
    BANK_PRODUCTION_MIGRATION_COMMIT_SHA: currentHead,
    DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:synthetic@example.invalid/neondb?sslmode=require&channel_binding=require'
  };
  delete wrapperEnv.BANK_PRODUCTION_CA_BUNDLE;
  const wrapper = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/validate-production-migration-input.ps1', '-InputSource', 'ProcessEnvironment'], {
    cwd: projectRoot,
    env: wrapperEnv,
    encoding: 'utf8'
  });
  assert.equal(wrapper.status, 0, wrapper.stderr);
  assert.equal(wrapper.stderr, '');
  assert.equal(wrapper.stdout.replace(/\r\n/g, '\n'), 'PRODUCTION_MIGRATION_INPUT_GUARD=PASS\nNETWORK_CONNECTION_ATTEMPTED=false\nPRODUCTION_MUTATION=false\n');

  const blockedWrapper = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/validate-production-migration-input.ps1', '-InputSource', 'ProcessEnvironment'], {
    cwd: projectRoot,
    env: { ...wrapperEnv, DATABASE_MIGRATOR_URL: 'postgresql://neondb_owner:synthetic@example.invalid/neondb?sslmode=require' },
    encoding: 'utf8'
  });
  assert.equal(blockedWrapper.status, 2);
  assert.equal(blockedWrapper.stderr, '');
  assert.equal(blockedWrapper.stdout.replace(/\r\n/g, '\n'), 'PRODUCTION_MIGRATION_INPUT_GUARD=BLOCKED\nPRODUCTION_MIGRATION_INPUT_GUARD_ERROR=CHANNEL_BINDING_BLOCKED\nNETWORK_CONNECTION_ATTEMPTED=false\nPRODUCTION_MUTATION=false\n');
}

await rm(temporaryRoot, { recursive: true, force: true });

console.log('Production migration event package tests passed');
