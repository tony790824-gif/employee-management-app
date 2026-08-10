import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const inventoryUrl = new URL('./production-migration-gap-remediation.expected.json', import.meta.url);
const genericMigratorUrl = new URL('./migrate.mjs', import.meta.url);

export const REQUIRED_MISSING_VERSIONS = Object.freeze([
  '0009', '0011', '0012', '0013', '0014', '0015', '0016',
  '0017', '0018', '0019', '0020', '0021', '0022'
]);

export const ROLLBACK_CLASSES = Object.freeze([
  'REVERSIBLE', 'CONDITIONALLY_REVERSIBLE', 'FORWARD_FIX_ONLY', 'UNKNOWN'
]);

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'TARGET_IDENTITY_MISMATCH',
  'AUTHORIZATION_MISSING',
  'TLS_VERIFY_FULL_FAILURE',
  'LEDGER_DRIFT',
  'UNEXPECTED_MIGRATION_VERSION',
  'CHECKSUM_MISMATCH',
  '0010_PRESENT_IN_EXECUTION_SET',
  'STRUCTURAL_PRECONDITION_UNKNOWN_OR_FAILED',
  'OBJECT_OWNERSHIP_OR_ACL_MISMATCH',
  'REQUIRED_EXTENSION_MISSING_OR_UNEXPECTED',
  'BACKUP_OR_RESTORE_PREREQUISITE_FAILED',
  'LOCK_BUDGET_EXCEEDED',
  'STATEMENT_TIMEOUT_OR_LONG_TRANSACTION',
  'RUNTIME_COMPATIBILITY_NOT_PROVEN',
  'MIGRATION_VERIFICATION_FAILED',
  'EVIDENCE_INCOMPLETE_OR_HASH_MISMATCH'
]);

const FORBIDDEN_EVIDENCE_FIELD = /(?:connection|string|hostname|endpoint|username|password|token|cookie|authorization|project.?id|branch.?id|business.?rows)/i;

function trackedMigrationFiles() {
  return new Set(execFileSync('git', ['ls-files', '--', 'database/migrations/*.sql'], {
    cwd: projectRoot,
    encoding: 'utf8'
  }).trim().split(/\r?\n/).filter(Boolean).map(file => path.basename(file)));
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function loadRemediationInventory() {
  return JSON.parse(await readFile(inventoryUrl, 'utf8'));
}

export function validateEvidenceContract(contract) {
  const failures = [];
  if (!Array.isArray(contract?.requiredFields) || !contract.requiredFields.length) failures.push('REQUIRED_FIELDS_MISSING');
  if (!Array.isArray(contract?.forbiddenFields) || !contract.forbiddenFields.length) failures.push('FORBIDDEN_FIELDS_MISSING');
  for (const field of contract?.requiredFields || []) {
    if (FORBIDDEN_EVIDENCE_FIELD.test(field)) failures.push(`SENSITIVE_REQUIRED_FIELD:${field}`);
  }
  for (const field of [
    'connectionString', 'hostname', 'endpoint', 'username', 'password', 'token',
    'cookie', 'authorizationHeader', 'projectId', 'branchId', 'businessRows'
  ]) {
    if (!contract?.forbiddenFields?.includes(field)) failures.push(`MISSING_FORBIDDEN_FIELD:${field}`);
  }
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export async function validateRemediationInventory(inventory) {
  const plan = inventory || await loadRemediationInventory();
  const failures = [];
  const tracked = trackedMigrationFiles();

  if (plan.schemaVersion !== 1 || plan.mode !== 'REPOSITORY_ONLY_PLAN') failures.push('PLAN_FORMAT_MISMATCH');
  if (JSON.stringify(plan.productionBaseline?.observedVersions) !== JSON.stringify(['0001','0002','0003','0004','0005','0006','0007','0008'])) {
    failures.push('PRODUCTION_BASELINE_MISMATCH');
  }
  if (JSON.stringify(plan.productionBaseline?.missingVersions) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) failures.push('MISSING_INVENTORY_MISMATCH');
  if (JSON.stringify(plan.executionOrder) !== JSON.stringify(REQUIRED_MISSING_VERSIONS)) failures.push('EXECUTION_ORDER_MISMATCH');
  if (JSON.stringify(plan.intentionalExcludedVersions) !== JSON.stringify(['0010'])) failures.push('0010_EXCLUSION_MISMATCH');
  if (plan.executionOrder?.includes('0010') || plan.migrations?.some(item => item.version === '0010')) failures.push('0010_INCLUDED');
  if (plan.executionAuthorization !== 'NOT_GRANTED' || plan.executionStatus !== 'BLOCKED') failures.push('EXECUTION_GATE_WEAKENED');
  if (plan.recoveryPrerequisite?.status !== 'BLOCKED') failures.push('RECOVERY_GATE_WEAKENED');
  if (plan.maintenanceWindow?.status !== 'REQUIRED' || plan.maintenanceWindow?.zeroDowntimeClaim !== 'UNKNOWN') failures.push('DOWNTIME_GATE_WEAKENED');
  if (plan.executionToolGate?.status !== 'BLOCKED') failures.push('EXECUTION_TOOL_GATE_WEAKENED');
  for (const stop of REQUIRED_STOP_CONDITIONS) {
    if (!plan.stopConditions?.includes(stop)) failures.push(`STOP_CONDITION_MISSING:${stop}`);
  }
  if (plan.migrations?.length !== REQUIRED_MISSING_VERSIONS.length) failures.push('MIGRATION_DETAIL_COUNT_MISMATCH');

  const orderIndex = new Map((plan.executionOrder || []).map((version, index) => [version, index]));
  for (const item of plan.migrations || []) {
    if (!REQUIRED_MISSING_VERSIONS.includes(item.version)) failures.push(`UNAPPROVED_VERSION:${item.version}`);
    if (item.preconditionStatus !== 'BLOCKED') failures.push(`PRECONDITION_NOT_BLOCKED:${item.version}`);
    if (!ROLLBACK_CLASSES.includes(item.rollbackClass)) failures.push(`INVALID_ROLLBACK_CLASS:${item.version}`);
    if (!item.productionPreconditions?.length || !item.lockRisks?.length || !item.mutationClasses?.length) failures.push(`INCOMPLETE_RISK_RECORD:${item.version}`);
    if (!item.rollbackCondition || !item.compatibility) failures.push(`INCOMPLETE_RECOVERY_RECORD:${item.version}`);
    for (const fileField of ['upFile', 'downFile']) {
      const file = item[fileField];
      if (!file || !tracked.has(file)) failures.push(`UNTRACKED_FILE:${item.version}:${fileField}`);
    }
    for (const [fileField, hashField] of [['upFile', 'upSha256'], ['downFile', 'downSha256']]) {
      if (!/^[a-f0-9]{64}$/.test(item[hashField] || '')) {
        failures.push(`INVALID_HASH:${item.version}:${hashField}`);
      } else if (item[fileField] && tracked.has(item[fileField])) {
        const actual = await sha256File(path.join(projectRoot, 'database', 'migrations', item[fileField]));
        if (actual !== item[hashField]) failures.push(`HASH_MISMATCH:${item.version}:${fileField}`);
      }
    }
    for (const dependency of item.dependsOn || []) {
      if (dependency === '0010') failures.push(`0010_DEPENDENCY:${item.version}`);
      if (REQUIRED_MISSING_VERSIONS.includes(dependency) && orderIndex.get(dependency) >= orderIndex.get(item.version)) {
        failures.push(`NON_FORWARD_DEPENDENCY:${item.version}:${dependency}`);
      }
    }
  }

  const evidence = validateEvidenceContract(plan.evidenceContract);
  failures.push(...evidence.failures.map(item => `EVIDENCE:${item}`));

  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    plannedVersions: Object.freeze([...(plan.executionOrder || [])]),
    intentionalExcludedVersions: Object.freeze([...(plan.intentionalExcludedVersions || [])]),
    executionStatus: plan.executionStatus,
    recoveryStatus: plan.recoveryPrerequisite?.status,
    zeroDowntimeClaim: plan.maintenanceWindow?.zeroDowntimeClaim,
    failures: Object.freeze(failures)
  });
}

export async function inspectGenericMigratorSafety() {
  const source = await readFile(genericMigratorUrl, 'utf8');
  const directoryDiscovery = /readdir\(MIGRATION_DIR\)/.test(source);
  const upLoopsAllPending = /if \(command === 'up'\)[\s\S]*for \(const migration of migrations\)[\s\S]*if \(appliedByVersion\.has\(migration\.version\)\) continue/.test(source);
  const upHonorsTarget = /if \(command === 'up'\)[\s\S]*migration\.version\s*>\s*target/.test(source);
  return Object.freeze({
    status: directoryDiscovery && upLoopsAllPending && !upHonorsTarget ? 'BLOCKED' : 'UNKNOWN',
    directoryDiscovery,
    upLoopsAllPending,
    upHonorsTarget,
    productionExecutionApproved: false
  });
}

export async function repositoryRemediationDryRun() {
  const inventory = await validateRemediationInventory();
  const runner = await inspectGenericMigratorSafety();
  return Object.freeze({
    mode: 'REPOSITORY_ONLY_DRY_RUN',
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    migrationExecuted: false,
    productionMutation: false,
    planValidation: inventory,
    genericRunnerAssessment: runner,
    planStatus: inventory.status === 'PASS' ? 'COMPLETE' : 'BLOCKED',
    productionExecutionStatus: 'BLOCKED'
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryRemediationDryRun().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.planValidation.status !== 'PASS') process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(`Production Migration remediation plan validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
