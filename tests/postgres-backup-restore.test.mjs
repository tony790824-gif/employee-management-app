import assert from 'node:assert/strict';
import { stagingRestoreConfig } from '../database/staging-backup-restore.mjs';

const direct = 'postgresql://migrator:secret@staging.example.invalid:5432/banke?sslmode=verify-full';
const pooler = 'postgresql://api:secret@staging-pooler.example.invalid:5432/banke?sslmode=verify-full';
const base = {
  BANK_ENV: 'staging',
  DATABASE_MIGRATOR_URL: direct,
  DATABASE_API_URL: pooler,
  DATABASE_SSL: 'require',
  BANK_STAGING_DATABASE_HOST: 'staging.example.invalid',
  BANK_STAGING_RESTORE_CONFIRM: 'RESTORE_BANKE_STAGING_BACKUP'
};

const valid = stagingRestoreConfig(base);
assert.equal(valid.targetMigratorUrl.pathname, '/banke_restore_sprint2');
assert.equal(valid.targetApiUrl.pathname, '/banke_restore_sprint2');
assert.equal(valid.migratorUrl.pathname, '/banke');

assert.throws(() => stagingRestoreConfig({ ...base, BANK_ENV: 'production' }), /Production Migration|staging/);
assert.throws(() => stagingRestoreConfig({ ...base, BANK_STAGING_RESTORE_CONFIRM: '' }), /明確確認|需要/);
assert.throws(() => stagingRestoreConfig({ ...base, DATABASE_MIGRATOR_URL: pooler }), /direct PostgreSQL endpoint/);
assert.throws(() => stagingRestoreConfig({ ...base, DATABASE_API_URL: pooler.replace('/banke?', '/other?') }), /來源資料庫/);
assert.throws(() => stagingRestoreConfig({ ...base, DATABASE_MIGRATOR_URL: direct.replace('staging.', 'other.') }), /Staging PostgreSQL host/);
assert.throws(() => stagingRestoreConfig({
  ...base,
  DATABASE_MIGRATOR_URL: direct.replace('/banke?', '/banke_restore_sprint2?'),
  DATABASE_API_URL: pooler.replace('/banke?', '/banke_restore_sprint2?')
}), /來源資料庫不可等於/);

console.log('PostgreSQL Staging 備份／還原安全閘門測試通過。');
