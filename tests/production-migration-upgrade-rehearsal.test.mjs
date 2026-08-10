import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyMigrationStep,
  migrationPreconditionSql,
  validateMigrationDependencies,
  validateRehearsalEnvironment,
  validateRollbackRequest,
  validateSanitizedEvidence,
  validateUpgradeSequence
} from '../database/rehearse-production-migration-upgrade.mjs';
import { REQUIRED_MISSING_VERSIONS } from '../database/production-migration-gap-remediation-plan.mjs';
import { validateRemediationInventory } from '../database/production-migration-gap-remediation-plan.mjs';

const baselineVersions = ['0001','0002','0003','0004','0005','0006','0007','0008'];
const baselineMigrations = baselineVersions.map(version => ({ version, name: `baseline-${version}`, checksum: version.repeat(16) }));
const baselineLedger = baselineMigrations.map(({ version, name, checksum }) => ({ version, name, checksum }));

assert.equal(validateRehearsalEnvironment({}).status, 'PASS');
for (const name of [
  'DATABASE_URL', 'DATABASE_MIGRATOR_URL', 'DATABASE_READONLY_URL',
  'BANK_PRODUCTION_DATABASE_HOST', 'BANK_PRODUCTION_DATABASE_NAME', 'BANK_PRODUCTION_READONLY_ROLE'
]) {
  assert.throws(() => validateRehearsalEnvironment({ [name]: 'present' }), new RegExp(`PRODUCTION_INPUT_PRESENT:${name}`));
}

assert.equal(validateUpgradeSequence(REQUIRED_MISSING_VERSIONS).status, 'PASS');
assert.throws(
  () => validateUpgradeSequence(['0011', '0009', ...REQUIRED_MISSING_VERSIONS.slice(2)]),
  /MIGRATION_ORDER_REJECTED/
);
assert.throws(() => validateUpgradeSequence(REQUIRED_MISSING_VERSIONS.slice(1)), /MIGRATION_SKIPPED_OR_EXTRA/);
assert.throws(
  () => validateUpgradeSequence(['0010', ...REQUIRED_MISSING_VERSIONS.slice(1)]),
  /MIGRATION_0010_REJECTED/
);
assert.throws(
  () => validateUpgradeSequence(REQUIRED_MISSING_VERSIONS, [...REQUIRED_MISSING_VERSIONS.slice(0, -1), '0099']),
  /MIGRATION_ALLOWLIST_MISMATCH/
);
assert.equal(validateMigrationDependencies('0009', baselineVersions).status, 'PASS');
assert.equal(validateMigrationDependencies('0018', [...baselineVersions, ...REQUIRED_MISSING_VERSIONS.slice(0, 8)]).status, 'PASS');
assert.throws(
  () => validateMigrationDependencies('0018', [...baselineVersions, ...REQUIRED_MISSING_VERSIONS.slice(0, 7)]),
  /MISSING_OR_OUT_OF_ORDER_DEPENDENCY:0018/
);
assert.throws(
  () => validateMigrationDependencies('0020', [...baselineVersions, ...REQUIRED_MISSING_VERSIONS.slice(0, 9)]),
  /MISSING_OR_OUT_OF_ORDER_DEPENDENCY:0020/
);
assert.match(migrationPreconditionSql('0018'), /api_execute_push_command/);
assert.match(migrationPreconditionSql('0020'), /enqueue_notification_push/);
assert.match(migrationPreconditionSql('0020'), /api_execute_push_command/);
assert.throws(() => validateRollbackRequest({ rollbackClass: 'CONDITIONALLY_REVERSIBLE' }), /ROLLBACK_NOT_AUTHORIZED/);
assert.equal(validateRollbackRequest({ rollbackClass: 'REVERSIBLE' }).status, 'PASS');

assert.equal(validateSanitizedEvidence({ status: 'PASS', migrationVersion: '0009' }).status, 'PASS');
assert.equal(validateSanitizedEvidence({ password: 'forbidden' }).status, 'BLOCKED');
assert.equal(validateSanitizedEvidence({ connectionString: 'forbidden' }).status, 'BLOCKED');

function fakeClient({ failSql = false, ledger = [], checkResults = [true, true] } = {}) {
  const calls = [];
  let checkIndex = 0;
  return {
    calls,
    async query(sql) {
      const text = String(sql);
      calls.push(text);
      if (failSql && text === 'SELECT migration sql') throw new Error('synthetic transaction failure');
      if (text.startsWith('SELECT version, name, checksum')) return { rows: ledger };
      if (text === 'SELECT precondition' || text === 'SELECT postcondition') return { rows: [{ ok: checkResults[checkIndex++] }] };
      if (text.includes('FROM pg_catalog.pg_locks')) {
        return { rows: [{ granted_modes: ['AccessShareLock'], waiting_lock_count: 0, blocker_count: 0 }] };
      }
      return { rows: [] };
    }
  };
}

const migration = { version: '0009', name: 'test', checksum: 'a'.repeat(64), sql: 'SELECT migration sql' };

const preconditionFailure = fakeClient({ ledger: baselineLedger, checkResults: [false] });
await assert.rejects(
  applyMigrationStep(preconditionFailure, migration, baselineMigrations, { preconditionSql: 'SELECT precondition', postconditionSql: 'SELECT postcondition' }),
  /PRECONDITION_FAILED:0009/
);
assert.deepEqual(preconditionFailure.calls.slice(-1), ['ROLLBACK']);
assert.equal(preconditionFailure.calls.includes('SELECT migration sql'), false);

const transactionFailure = fakeClient({ failSql: true, ledger: baselineLedger, checkResults: [true] });
await assert.rejects(
  applyMigrationStep(transactionFailure, migration, baselineMigrations, { preconditionSql: 'SELECT precondition', postconditionSql: 'SELECT postcondition' }),
  /synthetic transaction failure/
);
assert.deepEqual(transactionFailure.calls.slice(-1), ['ROLLBACK']);

const postconditionFailure = fakeClient({ ledger: baselineLedger, checkResults: [true, false] });
await assert.rejects(
  applyMigrationStep(postconditionFailure, migration, baselineMigrations, { preconditionSql: 'SELECT precondition', postconditionSql: 'SELECT postcondition' }),
  /POSTCONDITION_FAILED:0009/
);
assert.deepEqual(postconditionFailure.calls.slice(-1), ['ROLLBACK']);

const checksumSource = await readFile(new URL('../database/production-migration-gap-remediation.expected.json', import.meta.url), 'utf8');
const tampered = JSON.parse(checksumSource);
tampered.migrations[0].upSha256 = '0'.repeat(64);
const tamperedValidation = await validateRemediationInventory(tampered);
assert.equal(tamperedValidation.status, 'BLOCKED');
assert.ok(tamperedValidation.failures.includes('HASH_MISMATCH:0009:upFile'));

console.log('Disposable Production Migration upgrade rehearsal guards passed');
