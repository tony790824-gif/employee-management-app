import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  evaluateProductionMigrationReadiness,
  loadFinalReadinessPackage,
  validateFinalReadinessPackage
} from './production-migration-final-readiness-gate.mjs';
import {
  loadExactMigrationSet,
  resolvePostgresBin,
  runOneRehearsal,
  validateRehearsalEnvironment,
  validateSanitizedEvidence
} from './rehearse-production-migration-upgrade.mjs';
import { STRUCTURAL_CATALOG_QUERIES, compareStructuralCatalogs } from './rehearse-structural-schema-parity.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED_CATALOG_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_FINAL_READINESS_SIMULATION_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_FINAL_READINESS_SIMULATION_EVIDENCE.sha256');
const CONFIRMATION = 'REHEARSE_BANKE_DISPOSABLE_FINAL_READINESS';
const DISPOSABLE_PREFIX = 'banke-disposable-upgrade-';

function allPassSimulationGates(requiredGateIds) {
  return Object.fromEntries(requiredGateIds.map(gateId => [gateId, {
    status: 'PASS',
    reason: 'DISPOSABLE_SIMULATION_ONLY_NOT_PRODUCTION_EVIDENCE'
  }]));
}

async function residualDisposableResources() {
  return (await readdir(os.tmpdir(), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(DISPOSABLE_PREFIX))
    .map(entry => entry.name);
}

export async function rehearseProductionMigrationFinalReadiness({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_FINAL_READINESS_CONFIRMATION !== CONFIRMATION) {
    throw new Error('DISPOSABLE_FINAL_READINESS_CONFIRMATION_REQUIRED');
  }
  validateRehearsalEnvironment(env);
  const initialResiduals = await residualDisposableResources();
  if (initialResiduals.length) throw new Error('PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED');

  const packageValue = await loadFinalReadinessPackage();
  const packageValidation = await validateFinalReadinessPackage(packageValue);
  if (packageValidation.status !== 'PASS') throw new Error(`FINAL_READINESS_PACKAGE_BLOCKED:${packageValidation.failures.join(',')}`);
  const currentProductionGate = evaluateProductionMigrationReadiness(packageValue.currentGateEvidence, packageValue.requiredGateIds);
  if (currentProductionGate.status !== 'NO_GO') throw new Error('PRODUCTION_GATE_MUST_REMAIN_NO_GO');

  const [migrationSet, expectedCatalogText] = await Promise.all([
    loadExactMigrationSet(),
    readFile(EXPECTED_CATALOG_PATH, 'utf8')
  ]);
  const expectedCatalog = JSON.parse(expectedCatalogText);
  const run = await runOneRehearsal({
    postgresBin: resolvePostgresBin(env),
    migrationSet,
    expectedCatalog: expectedCatalog.catalog,
    runLabel: 'FINAL_READINESS_DISPOSABLE_SIMULATION',
    includeCatalog: true,
    structuralQueries: STRUCTURAL_CATALOG_QUERIES
  });

  const baselineComparison = compareStructuralCatalogs(run.baselineCatalog, run.baselineCatalog);
  const finalComparison = compareStructuralCatalogs(run.finalCatalog, run.finalCatalog);
  if (baselineComparison.upgradeFingerprint !== packageValue.productionBaseline.expectedStructuralFingerprint) throw new Error('SIMULATED_STARTING_BASELINE_MISMATCH');
  if (finalComparison.upgradeFingerprint !== packageValue.expectedFinalStructuralFingerprint) throw new Error('SIMULATED_FINAL_FINGERPRINT_MISMATCH');
  const simulationGate = evaluateProductionMigrationReadiness(allPassSimulationGates(packageValue.requiredGateIds), packageValue.requiredGateIds);
  if (simulationGate.status !== 'GO') throw new Error('DISPOSABLE_GATE_SIMULATION_FAILED');

  const residuals = await residualDisposableResources();
  if (residuals.length) throw new Error('DISPOSABLE_RESOURCE_CLEANUP_FAILED');
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    postgresMajorVersion: 18,
    productionReadiness: '70_PERCENT_NOT_READY',
    productionStatus: 'NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionMigrationAuthorization: 'NOT_GRANTED',
    productionMigrationTechnicalReadiness: 'NO_GO',
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    productionMutation: false,
    simulation: {
      status: 'PASS',
      gateResult: simulationGate.status,
      gateScope: 'TEST_ONLY_NON_PRODUCTION',
      identity: run.identityVerification,
      baselineLedger: run.baselineLedger.map(item => item.version),
      baselineFingerprint: baselineComparison.upgradeFingerprint,
      executionOrder: run.upgrades.map(item => item.version),
      migrationResults: run.upgrades.map(item => ({
        version: item.version,
        checksum: item.checksum,
        durationMs: item.durationMs,
        transaction: item.transaction,
        precondition: item.precondition,
        postcondition: item.postcondition,
        blockingDetected: item.locks.blockingDetected
      })),
      finalLedger: run.finalLedger.map(item => item.version),
      finalFingerprint: finalComparison.upgradeFingerprint,
      expectedCatalogMatch: run.expectedCatalogMatch,
      failureProbes: run.failureProbes,
      rollbackGuards: run.rollbackGuards
    },
    currentProductionGate: {
      status: currentProductionGate.status,
      blockerCount: currentProductionGate.blockers.length,
      blockers: currentProductionGate.blockers
    },
    cleanup: {
      postgresProcessesTerminated: true,
      temporaryDataRemoved: true,
      temporaryCredentialRemoved: true,
      temporaryConfigRemoved: true,
      residualDisposableResourceCount: residuals.length
    }
  };
  const sanitized = validateSanitizedEvidence(evidence);
  if (sanitized.status !== 'PASS') throw new Error(`EVIDENCE_SANITIZATION_BLOCKED:${sanitized.failures.join(',')}`);
  const serialized = canonicalJson(evidence);
  const evidenceHash = sha256(serialized);
  await writeFile(EVIDENCE_PATH, serialized, 'utf8');
  await writeFile(EVIDENCE_HASH_PATH, `${evidenceHash}  PRODUCTION_MIGRATION_FINAL_READINESS_SIMULATION_EVIDENCE.json\n`, 'utf8');
  return Object.freeze({
    status: 'PASS',
    scope: evidence.scope,
    postgresMajorVersion: 18,
    baseline: 'PASS',
    migrationSequence: 'PASS',
    finalStructuralParity: 'PASS',
    disposableGateSimulation: simulationGate.status,
    productionMigrationTechnicalReadiness: currentProductionGate.status,
    productionMigrationAuthorization: 'NOT_GRANTED',
    evidenceSha256: evidenceHash,
    residualDisposableResourceCount: residuals.length,
    productionConnectionAttempted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseProductionMigrationFinalReadiness().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Production Migration final readiness simulation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
