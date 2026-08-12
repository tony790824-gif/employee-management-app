import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PACKAGE_PATH = new URL('../docs/PRODUCTION_FINAL_GO_NO_GO_GATE.json', import.meta.url);
const ALLOWED_STATUSES = new Set(['PASS', 'BLOCKED', 'NOT_CONFIGURED', 'NOT_PROVEN', 'UNKNOWN']);
const ALLOWED_CLASSIFICATIONS = new Set([
  'MUST_BEFORE_GO',
  'CAN_DEFER',
  'REQUIRES_PAYMENT',
  'REQUIRES_PRODUCTION_MUTATION',
  'READ_ONLY_RESOLVABLE'
]);
const REQUIRED_AREAS = new Set([
  'Production Database / Schema',
  'Production Migration',
  'Backup / Restore / PITR',
  'RPO <=15 minutes',
  'Auth0 Production',
  'Render Production API',
  'Render Production Push Worker',
  'Netlify Production',
  'Domain',
  'DNS',
  'TLS',
  'Monitoring',
  'Alerting',
  'Logging',
  'Production secrets / environment configuration',
  'Production security configuration',
  'Operations ownership',
  'Incident / rollback / recovery responsibility',
  'Launch verification',
  'Traffic cutover / rollback readiness'
]);

export async function loadFinalGoNoGoPackage() {
  return JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
}

export function validateFinalGoNoGoPackage(value) {
  const failures = [];
  if (value?.schemaVersion !== 1 || value?.mode !== 'REPOSITORY_ONLY_FINAL_PRODUCTION_LAUNCH_GATE') {
    failures.push('PACKAGE_FORMAT_MISMATCH');
  }
  if (value?.productCompletionPercent !== 98 || value?.productionReadinessPercent !== 70) {
    failures.push('BASELINE_PERCENTAGE_DRIFT');
  }
  if (value?.productionStatus !== 'NOT_READY' || value?.finalDecision !== 'NO_GO') {
    failures.push('FINAL_DECISION_WEAKENED');
  }
  if (value?.gateA !== 'DEFER' || value?.productionProvisioning !== 'NO_GO') {
    failures.push('PROVISIONING_GATE_WEAKENED');
  }
  if (value?.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('MIGRATION_AUTHORIZATION_WEAKENED');
  if (value?.productionMutationAuthorized !== false || value?.paymentAuthorized !== false) failures.push('UNAUTHORIZED_SCOPE_ENABLED');

  const blockers = Array.isArray(value?.blockers) ? value.blockers : [];
  if (blockers.length !== REQUIRED_AREAS.size) failures.push('BLOCKER_COUNT_MISMATCH');
  const ids = new Set();
  const areas = new Set();
  for (const blocker of blockers) {
    if (!blocker?.id || ids.has(blocker.id)) failures.push(`INVALID_OR_DUPLICATE_BLOCKER_ID:${blocker?.id || 'MISSING'}`);
    ids.add(blocker?.id);
    areas.add(blocker?.area);
    if (!ALLOWED_STATUSES.has(blocker?.status)) failures.push(`INVALID_BLOCKER_STATUS:${blocker?.id || 'MISSING'}`);
    if (!blocker?.reason) failures.push(`BLOCKER_REASON_MISSING:${blocker?.id || 'MISSING'}`);
    if (!Array.isArray(blocker?.classifications) || !blocker.classifications.includes('MUST_BEFORE_GO')) {
      failures.push(`MUST_BEFORE_GO_MISSING:${blocker?.id || 'MISSING'}`);
    }
    for (const classification of blocker?.classifications || []) {
      if (!ALLOWED_CLASSIFICATIONS.has(classification)) failures.push(`INVALID_CLASSIFICATION:${blocker?.id || 'MISSING'}:${classification}`);
    }
  }
  for (const area of REQUIRED_AREAS) if (!areas.has(area)) failures.push(`REQUIRED_AREA_MISSING:${area}`);
  for (const area of areas) if (!REQUIRED_AREAS.has(area)) failures.push(`UNREVIEWED_AREA:${area}`);
  if (blockers.some(blocker => blocker.status === 'PASS')) failures.push('PASS_ITEM_MUST_NOT_REMAIN_IN_BLOCKER_INVENTORY');
  if (!Array.isArray(value?.deferredEnhancements) || value.deferredEnhancements.length < 5) failures.push('CAN_DEFER_LIST_INCOMPLETE');
  if (!Array.isArray(value?.safeExecutionOrder) || value.safeExecutionOrder.length !== 10) failures.push('EXECUTION_ORDER_INCOMPLETE');
  if (value?.nextMinimalAuthorization?.decision !== 'OWNER_GATE_A_BUDGET_DECISION') failures.push('NEXT_AUTHORIZATION_SCOPE_DRIFT');
  if (value?.nextMinimalAuthorization?.productionMutationAuthorized !== false || value?.nextMinimalAuthorization?.paymentExecuted !== false) {
    failures.push('NEXT_AUTHORIZATION_EXECUTED');
  }
  if (value?.knownCostEvidence?.fixedMonthlyLowerBoundUsd !== 49 || value?.knownCostEvidence?.fixedAnnualLowerBoundUsd !== 588) {
    failures.push('KNOWN_COST_BASELINE_DRIFT');
  }
  if (value?.rpo !== 'NOT_PROVEN' || value?.rto !== 'PASS_112_335_SECONDS') failures.push('RECOVERY_GATE_DRIFT');
  for (const field of [
    'productionConnectionAttempted',
    'productionSqlExecuted',
    'productionMutation',
    'externalResourceCreated',
    'deploymentExecuted',
    'paymentExecuted'
  ]) {
    if (value?.[field] !== false) failures.push(`PROHIBITED_ACTION_RECORDED:${field}`);
  }
  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    failures: Object.freeze(failures),
    blockerCount: blockers.length,
    mustBeforeGoCount: blockers.filter(blocker => blocker.classifications?.includes('MUST_BEFORE_GO')).length
  });
}

export async function runFinalGoNoGoGate() {
  const value = await loadFinalGoNoGoPackage();
  const validation = validateFinalGoNoGoPackage(value);
  if (validation.status !== 'PASS') throw new Error(validation.failures.join(','));
  return Object.freeze({
    mode: value.mode,
    packageValidation: validation.status,
    finalDecision: value.finalDecision,
    productionReadinessPercent: value.productionReadinessPercent,
    blockerCount: validation.blockerCount,
    mustBeforeGoCount: validation.mustBeforeGoCount,
    gateA: value.gateA,
    productionProvisioning: value.productionProvisioning,
    productionMigrationAuthorization: value.productionMigrationAuthorization,
    productionMutation: false,
    paymentExecuted: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFinalGoNoGoGate().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    process.stderr.write(`Final Production Go/No-Go gate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
