import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REQUIRED_MISSING_VERSIONS,
  inspectGenericMigratorSafety,
  loadRemediationInventory,
  repositoryRemediationDryRun,
  validateEvidenceContract,
  validateRemediationInventory
} from '../database/production-migration-gap-remediation-plan.mjs';

const plan = await loadRemediationInventory();
assert.deepEqual(plan.productionBaseline.observedVersions, ['0001','0002','0003','0004','0005','0006','0007','0008']);
assert.deepEqual(plan.productionBaseline.missingVersions, REQUIRED_MISSING_VERSIONS);
assert.deepEqual(plan.executionOrder, REQUIRED_MISSING_VERSIONS);
assert.deepEqual(plan.intentionalExcludedVersions, ['0010']);
assert.equal(plan.executionOrder.includes('0010'), false);
assert.equal(plan.migrations.some(item => item.version === '0010'), false);
assert.equal(plan.executionAuthorization, 'NOT_GRANTED');
assert.equal(plan.executionStatus, 'BLOCKED');
assert.equal(plan.recoveryPrerequisite.status, 'BLOCKED');
assert.equal(plan.maintenanceWindow.status, 'REQUIRED');
assert.equal(plan.maintenanceWindow.zeroDowntimeClaim, 'UNKNOWN');

const validation = await validateRemediationInventory(plan);
assert.equal(validation.status, 'PASS');
assert.deepEqual(validation.failures, []);
assert.deepEqual(validation.plannedVersions, REQUIRED_MISSING_VERSIONS);
assert.deepEqual(validation.intentionalExcludedVersions, ['0010']);

for (const migration of plan.migrations) {
  assert.equal(migration.preconditionStatus, 'BLOCKED');
  assert.ok(migration.dependsOn.length >= 1);
  assert.ok(migration.productionPreconditions.length >= 2);
  assert.ok(migration.mutationClasses.length >= 2);
  assert.ok(migration.lockRisks.length >= 1);
  assert.match(migration.upSha256, /^[a-f0-9]{64}$/);
  assert.match(migration.downSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(migration.rollbackClass, 'REVERSIBLE', 'No rollback may be declared unconditional before Production data/runtime evidence.');
}

const edge = plan.migrations.find(item => item.version === '0018');
const priority = plan.migrations.find(item => item.version === '0020');
assert.ok(edge.mutationClasses.includes('DYNAMIC_REPLACE_FUNCTION_FROM_VALIDATED_SOURCE'));
assert.ok(priority.mutationClasses.includes('DYNAMIC_REPLACE_FUNCTION_FROM_VALIDATED_SOURCE'));
assert.ok(priority.dependsOn.includes('0019'));

const evidence = validateEvidenceContract(plan.evidenceContract);
assert.equal(evidence.status, 'PASS');
assert.deepEqual(evidence.failures, []);
assert.equal(validateEvidenceContract({ requiredFields: ['hostname'], forbiddenFields: [] }).status, 'BLOCKED');

const runner = await inspectGenericMigratorSafety();
assert.equal(runner.status, 'BLOCKED');
assert.equal(runner.directoryDiscovery, true);
assert.equal(runner.upLoopsAllPending, true);
assert.equal(runner.upHonorsTarget, false);
assert.equal(runner.productionExecutionApproved, false);

const genericMigrator = await readFile(new URL('../database/migrate.mjs', import.meta.url), 'utf8');
assert.match(genericMigrator, /readdir\(MIGRATION_DIR\)/);
assert.doesNotMatch(genericMigrator, /if \(command === 'up'\)[\s\S]*migration\.version\s*>\s*target/);

const dryRun = await repositoryRemediationDryRun();
assert.equal(dryRun.mode, 'REPOSITORY_ONLY_DRY_RUN');
assert.equal(dryRun.productionConnectionAttempted, false);
assert.equal(dryRun.productionSqlExecuted, false);
assert.equal(dryRun.migrationExecuted, false);
assert.equal(dryRun.productionMutation, false);
assert.equal(dryRun.planStatus, 'COMPLETE');
assert.equal(dryRun.productionExecutionStatus, 'BLOCKED');

console.log('Production Migration gap remediation plan passed repository-only fail-closed validation');
