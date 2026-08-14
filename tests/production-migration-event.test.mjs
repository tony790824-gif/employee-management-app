import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  APPROVED_UPGRADE_SEQUENCE,
  MAINTENANCE_CONFIRMATION,
  PRODUCTION_EVENT_CONFIRMATION,
  RESTORE_POINT_CONFIRMATION,
  productionMigrationEventConfig
} from '../database/production-migration-event.mjs';

const head = 'a'.repeat(40);
const caPath = path.join(os.tmpdir(), 'banke-production-event-test.pem');
const valid = {
  BANK_ENV: 'production',
  BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION: PRODUCTION_EVENT_CONFIRMATION,
  BANK_PRODUCTION_RESTORE_POINT_STATUS: RESTORE_POINT_CONFIRMATION,
  BANK_PRODUCTION_MAINTENANCE_STATUS: MAINTENANCE_CONFIRMATION,
  BANK_PRODUCTION_DATABASE_NAME: 'neondb',
  BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE: 'banke_production_migrator',
  BANK_PRODUCTION_MIGRATION_COMMIT_SHA: head,
  BANK_PRODUCTION_CA_BUNDLE: caPath,
  DATABASE_MIGRATOR_URL: 'postgresql://banke_production_migrator:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require'
};

const config = productionMigrationEventConfig(valid, { head });
assert.equal(config.expectedDatabase, 'neondb');
assert.equal(config.expectedOperator, 'banke_production_migrator');
assert.deepEqual(APPROVED_UPGRADE_SEQUENCE, [
  '0009', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);
assert.equal(APPROVED_UPGRADE_SEQUENCE.includes('0010'), false);

for (const [name, patch, pattern] of [
  ['authorization', { BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION: '' }, /EVENT_AUTHORIZATION_REQUIRED/],
  ['restore point', { BANK_PRODUCTION_RESTORE_POINT_STATUS: '' }, /EVENT_RESTORE_POINT_REQUIRED/],
  ['maintenance drain', { BANK_PRODUCTION_MAINTENANCE_STATUS: '' }, /EVENT_MAINTENANCE_DRAIN_REQUIRED/],
  ['commit identity', { BANK_PRODUCTION_MIGRATION_COMMIT_SHA: 'b'.repeat(40) }, /EVENT_COMMIT_IDENTITY_MISMATCH/],
  ['reader role', { BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE: 'banke_production_readonly', DATABASE_MIGRATOR_URL: 'postgresql://banke_production_readonly:masked@direct.example/neondb?sslmode=verify-full&channel_binding=require' }, /MIGRATION_OPERATOR_EXPECTATION_BLOCKED/],
  ['pooled endpoint', { DATABASE_MIGRATOR_URL: 'postgresql://banke_production_migrator:masked@host-pooler.example/neondb?sslmode=verify-full&channel_binding=require' }, /MIGRATOR_DIRECT_TARGET_REQUIRED/],
  ['TLS downgrade', { DATABASE_MIGRATOR_URL: 'postgresql://banke_production_migrator:masked@direct.example/neondb?sslmode=require&channel_binding=require' }, /TLS_VERIFY_FULL_REQUIRED/],
  ['channel binding', { DATABASE_MIGRATOR_URL: 'postgresql://banke_production_migrator:masked@direct.example/neondb?sslmode=verify-full' }, /CHANNEL_BINDING_REQUIRED/]
]) {
  assert.throws(() => productionMigrationEventConfig({ ...valid, ...patch }, { head }), pattern, name);
}

const source = await readFile(new URL('../database/production-migration-event.mjs', import.meta.url), 'utf8');
const executionPlan = await readFile(new URL('../docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_PLAN.md', import.meta.url), 'utf8');
assert.match(source, /loadExactMigrationSet/);
assert.match(source, /applyMigrationStep/);
assert.match(source, /BEGIN TRANSACTION READ ONLY/);
assert.match(source, /EVENT_NON_ACL_STARTING_BASELINE_BLOCKED/);
assert.match(source, /EVENT_NON_ACL_FINAL_BASELINE_BLOCKED/);
assert.match(source, /MIGRATION_0010_REJECTED/);
assert.match(source, /d\.deptype = 'e'/);
assert.match(source, /connectionCount \+= 1/);
assert.match(source, /retryCount: 0/);
assert.doesNotMatch(source, /setTimeout[\s\S]*client\.connect/);
assert.doesNotMatch(source, /readdir\(/);
assert.match(executionPlan, /\$env:CI = 'true'[\s\S]*pnpm run db:migration:production-event/);
assert.match(executionPlan, /Do not use\s+`--force`/);
assert.match(executionPlan, /do not set\s+`confirmModulesPurge=false`/);

console.log('Production migration event package tests passed');
