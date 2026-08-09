import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const inventoryUrl = new URL('./production-schema-parity.expected.json', import.meta.url);
const queryUrl = new URL('./operator/production-schema-parity.readonly.sql', import.meta.url);

export const EXPECTED_VERSIONS = Object.freeze(
  Array.from({ length: 22 }, (_, index) => String(index + 1).padStart(4, '0'))
);

export const PARITY_STOP_CONDITIONS = Object.freeze([
  'TARGET_IDENTITY_UNPROVEN',
  'READONLY_ROLE_IDENTITY_MISMATCH',
  'DANGEROUS_ROLE_ATTRIBUTE',
  'MIGRATION_MISSING',
  'MIGRATION_UNEXPECTED',
  'MIGRATION_CHECKSUM_MISMATCH',
  'SCHEMA_OBJECT_MISMATCH',
  'OWNERSHIP_MISMATCH',
  'ACL_MISMATCH',
  'UNEXPECTED_EXTENSION',
  'QUERY_NOT_PROVEN_READ_ONLY',
  'EXPECTED_SCHEMA_BASELINE_INCOMPLETE',
  'EVIDENCE_INCOMPLETE'
]);

export const EVIDENCE_FIELDS = Object.freeze([
  'timestamp',
  'commitSha',
  'expectedMigrationRange',
  'observedMigrationRange',
  'checksumResult',
  'schemaParityResult',
  'functionParityResult',
  'aclResult',
  'rlsPolicyResult',
  'extensionResult',
  'finalStatus',
  'stopReasons'
]);

const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY|TRUNCATE|VACUUM|ANALYZE|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY\s+LABEL|LOCK)\b/i;
const FORBIDDEN_FUNCTION_DETAIL = /\b(?:pg_get_functiondef|prosrc)\b/i;
const FORBIDDEN_EVIDENCE_KEY = /(?:credential|connection|string|hostname|endpoint|project.?id|branch.?id|password|secret|token|cookie|authorization)/i;
const ALLOWED_RELATION = /^(?:pg_catalog\.[a-z_][a-z0-9_]*|information_schema\.[a-z_][a-z0-9_]*|public\.schema_migrations)$/i;

function trackedMigrationFiles() {
  return new Set(execFileSync('git', ['ls-files', '--', 'database/migrations/*.up.sql'], {
    cwd: projectRoot,
    encoding: 'utf8'
  }).trim().split(/\r?\n/).filter(Boolean).map(file => path.basename(file)));
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function loadExpectedInventory() {
  return JSON.parse(await readFile(inventoryUrl, 'utf8'));
}

export async function validateExpectedInventory(inventory) {
  const expectedInventory = inventory || await loadExpectedInventory();
  const tracked = trackedMigrationFiles();
  const failures = [];
  const observedVersions = expectedInventory.migrations.map(item => item.version);
  if (JSON.stringify(observedVersions) !== JSON.stringify(EXPECTED_VERSIONS)) {
    failures.push('EXPECTED_RANGE_NOT_CONTIGUOUS');
  }
  if (expectedInventory.expectedRange?.start !== '0001' || expectedInventory.expectedRange?.end !== '0022') {
    failures.push('EXPECTED_RANGE_DECLARATION_MISMATCH');
  }
  if (JSON.stringify(expectedInventory.requiredExtensionsFromTrackedSources) !== JSON.stringify(['pgcrypto'])) {
    failures.push('EXPECTED_EXTENSION_INVENTORY_MISMATCH');
  }
  for (const item of expectedInventory.migrations) {
    if (item.sourceStatus === 'INTENTIONAL_UNAPPROVED_GAP') {
      if (item.version !== '0010' || item.name !== null || item.file !== null || item.checksum !== null) {
        failures.push(`INVALID_INTENTIONAL_GAP:${item.version}`);
      }
      continue;
    }
    if (item.sourceStatus !== 'TRACKED' || !item.file || !tracked.has(item.file)) {
      failures.push(`TRACKED_SOURCE_MISMATCH:${item.version}`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(item.checksum || '')) {
      failures.push(`INVALID_CHECKSUM:${item.version}`);
      continue;
    }
    const actual = await sha256File(path.join(projectRoot, 'database', 'migrations', item.file));
    if (actual !== item.checksum) failures.push(`CHECKSUM_MISMATCH:${item.version}`);
  }
  const declaredTracked = new Set(expectedInventory.migrations.filter(item => item.sourceStatus === 'TRACKED').map(item => item.file));
  for (const file of tracked) {
    if (!declaredTracked.has(file)) failures.push(`UNDECLARED_TRACKED_MIGRATION:${file}`);
  }
  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    expectedRange: Object.freeze({ start: '0001', end: '0022', count: 22 }),
    expectedLedgerEntryCount: expectedInventory.migrations.filter(item => item.sourceStatus === 'TRACKED').length,
    trackedCount: tracked.size,
    intentionalGapVersions: Object.freeze(expectedInventory.migrations.filter(item => item.sourceStatus === 'INTENTIONAL_UNAPPROVED_GAP').map(item => item.version)),
    failures: Object.freeze(failures)
  });
}

function executableSqlStatements(sql) {
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
  const withoutMeta = withoutComments.replace(/^\s*\\.*$/gm, '');
  return withoutMeta.split(';').map(item => item.trim()).filter(Boolean);
}

export function validateReadOnlyCatalogSql(sql) {
  const statements = executableSqlStatements(sql);
  const failures = [];
  if (!statements.length) failures.push('NO_QUERIES');
  for (const statement of statements) {
    if (!/^(?:SELECT|WITH)\b/i.test(statement)) failures.push('NON_SELECT_STATEMENT');
    if (FORBIDDEN_SQL.test(statement)) failures.push('MUTATION_KEYWORD');
    if (FORBIDDEN_FUNCTION_DETAIL.test(statement)) failures.push('FUNCTION_BODY_ACCESS');
    const publicReferences = statement.match(/\bpublic\.([a-z_][a-z0-9_]*)/gi) || [];
    if (publicReferences.some(reference => reference.toLowerCase() !== 'public.schema_migrations')) {
      failures.push('BUSINESS_RELATION_REFERENCE');
    }
    const relations = [...statement.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_.]*)/gi)].map(match => match[1]);
    if (relations.some(relation => !ALLOWED_RELATION.test(relation))) failures.push('NON_CATALOG_RELATION_REFERENCE');
  }
  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    statementCount: statements.length,
    failures: Object.freeze([...new Set(failures)])
  });
}

export function validateEvidenceShape(evidence) {
  const failures = [];
  for (const field of EVIDENCE_FIELDS) {
    if (!Object.hasOwn(evidence, field)) failures.push(`MISSING_FIELD:${field}`);
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_EVIDENCE_KEY.test(key)) failures.push(`FORBIDDEN_FIELD:${key}`);
      visit(child);
    }
  };
  visit(evidence);
  if (!['PASS', 'PARTIAL', 'BLOCKED'].includes(evidence.finalStatus)) failures.push('INVALID_FINAL_STATUS');
  return Object.freeze({ status: failures.length ? 'BLOCKED' : 'PASS', failures: Object.freeze(failures) });
}

export async function repositoryDryRun() {
  const inventory = await validateExpectedInventory();
  const sql = validateReadOnlyCatalogSql(await readFile(queryUrl, 'utf8'));
  const stopReasons = [
    ...(inventory.status === 'PASS' ? [] : ['MIGRATION_MISSING', 'EVIDENCE_INCOMPLETE']),
    ...(sql.status === 'PASS' ? [] : ['QUERY_NOT_PROVEN_READ_ONLY']),
    'EXPECTED_SCHEMA_BASELINE_INCOMPLETE'
  ];
  return Object.freeze({
    mode: 'REPOSITORY_ONLY_DRY_RUN',
    productionConnectionAttempted: false,
    productionSqlExecuted: false,
    expectedMigrationRange: inventory.expectedRange,
    inventory,
    catalogQueryPlan: sql,
    expectedCatalogBaseline: Object.freeze({
      status: 'BLOCKED',
      reason: 'NOT_MATERIALIZED_FROM_REVIEWED_MIGRATIONS'
    }),
    finalStatus: stopReasons.length ? 'BLOCKED' : 'PASS',
    stopReasons: Object.freeze(stopReasons)
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repositoryDryRun().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.catalogQueryPlan.status !== 'PASS') process.exitCode = 1;
  }).catch(error => {
    process.stderr.write(`Production schema parity repository validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
