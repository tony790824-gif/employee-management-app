import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-exact-manifest.json');
const COMPATIBILITY_PATH = path.join(PROJECT_ROOT, 'database', 'production-migration-runtime-compatibility.expected.json');
export const APPROVED_VERSIONS = Object.freeze(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022']);
export const UPGRADE_VERSIONS = Object.freeze(['0009', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022']);
export const CHECKPOINTS = Object.freeze(['0008', ...UPGRADE_VERSIONS]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function migrationFileName(version, direction, trackedPaths) {
  const pattern = new RegExp(`^database/migrations/${version}_[a-z0-9_]+\\.${direction}\\.sql$`);
  const matches = trackedPaths.filter(item => pattern.test(item.replaceAll('\\\\', '/')));
  if (matches.length !== 1) throw new Error(`MIGRATION_${direction.toUpperCase()}_FILE_COUNT:${version}:${matches.length}`);
  return matches[0].replaceAll('\\\\', '/');
}

export function validateTrackedInventory(trackedPaths) {
  const normalized = trackedPaths.map(item => item.replaceAll('\\\\', '/')).sort();
  if (normalized.some(item => /^database\/migrations\/0010_/.test(item))) throw new Error('MIGRATION_0010_REJECTED');
  const versions = [...new Set(normalized.map(item => item.match(/^database\/migrations\/(\d{4})_/i)?.[1]).filter(Boolean))];
  if (JSON.stringify(versions) !== JSON.stringify(APPROVED_VERSIONS)) throw new Error('MIGRATION_VERSION_INVENTORY_MISMATCH');
  for (const version of APPROVED_VERSIONS) {
    migrationFileName(version, 'up', normalized);
    migrationFileName(version, 'down', normalized);
  }
  if (normalized.length !== APPROVED_VERSIONS.length * 2) throw new Error('UNEXPECTED_MIGRATION_FILE');
  return normalized;
}

export async function buildExactManifest({ trackedPaths, read = readFile, migrationSourceCommitSha, compatibilityContent }) {
  const inventory = validateTrackedInventory(trackedPaths);
  const migrations = [];
  for (const version of APPROVED_VERSIONS) {
    const upPath = migrationFileName(version, 'up', inventory);
    const downPath = migrationFileName(version, 'down', inventory);
    const [up, down] = await Promise.all([read(path.join(PROJECT_ROOT, upPath)), read(path.join(PROJECT_ROOT, downPath))]);
    migrations.push({ version, up: { path: upPath, sha256: sha256(up) }, down: { path: downPath, sha256: sha256(down) } });
  }
  const compatibilityBytes = compatibilityContent || await read(COMPATIBILITY_PATH);
  const body = {
    schemaVersion: 1,
    mode: 'IMMUTABLE_EXACT_MIGRATION_MANIFEST',
    migrationSourceCommitSha,
    candidateCommitAuthorization: 'NOT_GRANTED',
    exactMigrationCount: 21,
    orderedMigrationIds: [...APPROVED_VERSIONS],
    intentionalExcludedVersions: ['0010'],
    upgradeExecutionOrder: [...UPGRADE_VERSIONS],
    compatibilityEvidence: 'database/production-migration-runtime-compatibility.expected.json',
    compatibilityEvidenceSha256: sha256(compatibilityBytes),
    generationMethod: 'pnpm db:migration:repository-closure -- --write-manifest',
    safety: { productionExecutionAuthorization: 'NOT_GRANTED', genericDirectoryScanningExecutorAllowed: false, oneVersionPerTransactionRequired: true, humanStopAfterEachVersionRequired: true },
    migrations
  };
  return { ...body, manifestSha256: sha256(canonicalJson(body)) };
}

function trackedMigrationPaths() {
  return execFileSync('git', ['ls-files', '--', 'database/migrations/*.sql'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
}
function migrationSourceCommitSha() {
  return execFileSync('git', ['log', '-1', '--format=%H', '--', 'database/migrations'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
}
export async function expectedManifest() {
  return buildExactManifest({ trackedPaths: trackedMigrationPaths(), migrationSourceCommitSha: migrationSourceCommitSha() });
}

export async function validateExactManifest(value, expected) {
  const expectedValue = expected || await expectedManifest();
  const failures = [];
  const { manifestSha256, ...body } = value || {};
  if (manifestSha256 !== sha256(canonicalJson(body))) failures.push('MANIFEST_HASH_MISMATCH');
  if (canonicalJson(value) !== canonicalJson(expectedValue)) failures.push('MANIFEST_CONTENT_MISMATCH');
  if (value?.exactMigrationCount !== 21 || value?.migrations?.length !== 21) failures.push('MANIFEST_COUNT_MISMATCH');
  if (JSON.stringify(value?.orderedMigrationIds) !== JSON.stringify(APPROVED_VERSIONS)) failures.push('MANIFEST_ORDER_MISMATCH');
  if (JSON.stringify(value?.upgradeExecutionOrder) !== JSON.stringify(UPGRADE_VERSIONS)) failures.push('UPGRADE_ORDER_MISMATCH');
  if (JSON.stringify(value?.intentionalExcludedVersions) !== JSON.stringify(['0010']) || value?.orderedMigrationIds?.includes('0010') || value?.upgradeExecutionOrder?.includes('0010')) failures.push('0010_EXCLUSION_FAILURE');
  if (value?.candidateCommitAuthorization !== 'NOT_GRANTED' || value?.safety?.productionExecutionAuthorization !== 'NOT_GRANTED') failures.push('AUTHORIZATION_BOUNDARY_WEAKENED');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export function validateRuntimeCompatibility(value) {
  const failures = [];
  if (value?.schemaVersion !== 1 || value?.mode !== 'REPOSITORY_ONLY_RUNTIME_COMPATIBILITY' || value?.lastReviewedSprint !== 63 || value?.result !== 'PASS') failures.push('COMPATIBILITY_FORMAT_MISMATCH');
  if (JSON.stringify(value?.approvedCheckpoints) !== JSON.stringify(CHECKPOINTS)) failures.push('CHECKPOINT_SET_MISMATCH');
  for (const checkpoint of CHECKPOINTS.slice(0, -1)) if (!/DRAINED/.test(value?.checkpointPolicy?.[checkpoint] || '')) failures.push(`INTERMEDIATE_RUNTIME_NOT_DRAINED:${checkpoint}`);
  if (value?.checkpointPolicy?.['0022'] !== 'CURRENT_API_WORKER_FRONTEND_ALLOWED_ONLY_AFTER_FINAL_LEDGER_AND_CATALOG_PASS') failures.push('FINAL_RUNTIME_GATE_MISMATCH');
  for (const component of ['api', 'pushWorker', 'frontend']) if (value?.components?.[component]?.productionObserved !== 'NOT_CONFIGURED') failures.push(`PRODUCTION_RUNTIME_FALSE_OBSERVATION:${component}`);
  for (const runtime of ['node', 'packageManager', 'databaseDriver', 'postgresql', 'extensions', 'transactions']) {
    const row = value?.runtimeMatrix?.[runtime];
    if (!row?.required || !row?.tested || !row?.productionObserved || !Array.isArray(row?.unknown)) failures.push(`RUNTIME_MATRIX_INCOMPLETE:${runtime}`);
  }
  if (value?.claims?.mixedVersionOperation !== 'PROHIBITED_NOT_PROVEN' || value?.claims?.zeroDowntime !== 'NOT_CLAIMED' || value?.claims?.productionCompatibility !== 'NOT_OBSERVED' || value?.claims?.repositoryCompatibilityContract !== 'PASS') failures.push('COMPATIBILITY_CLAIM_WEAKENED');
  if (value?.productionConnectionAttempted !== false || value?.productionMutation !== false) failures.push('PRODUCTION_BOUNDARY_FAILURE');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export function validateRepositoryRuntimeEvidence({ packageValue, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText, nodeVersion = process.versions.node }) {
  const failures = [];
  const nodeMajor = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 20) failures.push('NODE_RUNTIME_BELOW_REQUIRED_MAJOR');
  if (packageValue?.engines?.node !== '>=20' || !/^pnpm@11\./.test(packageValue?.packageManager || '')) failures.push('PACKAGE_RUNTIME_METADATA_DRIFT');
  if (packageValue?.dependencies?.pg !== '^8.22.0' || !/\bpg:\s*\r?\n\s+specifier: \^8\.22\.0\r?\n\s+version: 8\.22\.0\b/.test(lockText)) failures.push('DATABASE_DRIVER_LOCK_DRIFT');
  if (upgradeEvidence?.postgresMajorVersion !== 18 || upgradeEvidence?.deterministic !== 'PASS') failures.push('UPGRADE_POSTGRES_EVIDENCE_MISMATCH');
  if (structuralEvidence?.postgresMajorVersion !== 18 || structuralEvidence?.comparison?.status !== 'PASS') failures.push('STRUCTURAL_POSTGRES_EVIDENCE_MISMATCH');
  if (!/"extension_name": "pgcrypto"/.test(expectedCatalogText)) failures.push('PGCRYPTO_EXPECTED_CATALOG_EVIDENCE_MISSING');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export async function repositoryClosureGate() {
  const [manifest, compatibility, packageValue, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText] = await Promise.all([
    readFile(MANIFEST_PATH, 'utf8').then(JSON.parse),
    readFile(COMPATIBILITY_PATH, 'utf8').then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json'), 'utf8').then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json'), 'utf8').then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json'), 'utf8')
  ]);
  const manifestResult = await validateExactManifest(manifest);
  const compatibilityResult = validateRuntimeCompatibility(compatibility);
  const runtimeEvidenceResult = validateRepositoryRuntimeEvidence({ packageValue, lockText, upgradeEvidence, structuralEvidence, expectedCatalogText });
  if (manifestResult.status !== 'PASS' || compatibilityResult.status !== 'PASS' || runtimeEvidenceResult.status !== 'PASS') throw new Error(`REPOSITORY_CLOSURE_BLOCKED:${[...manifestResult.failures, ...compatibilityResult.failures, ...runtimeEvidenceResult.failures].join(',')}`);
  return Object.freeze({
    runtimeCompatibility: 'PASS', immutableExactManifest: 'PASS', manifestSha256: manifest.manifestSha256,
    migrationCount: manifest.exactMigrationCount, upgradeSubsetCount: manifest.upgradeExecutionOrder.length,
    excluded0010: !manifest.orderedMigrationIds.includes('0010') && !manifest.upgradeExecutionOrder.includes('0010'),
    candidateCommitAuthorization: manifest.candidateCommitAuthorization,
    productionConnectionAttempted: false, productionMutation: false
  });
}

if (process.argv.includes('--write-manifest')) {
  const manifest = await expectedManifest();
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`Manifest written: ${manifest.manifestSha256}\n`);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryClosureGate().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Repository migration closure gate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
