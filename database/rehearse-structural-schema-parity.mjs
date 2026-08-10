import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CATALOG_QUERIES, canonicalJson, sha256 } from './materialize-expected-catalog.mjs';
import {
  loadExactMigrationSet,
  resolvePostgresBin,
  runOneFreshInstall,
  runOneRehearsal,
  validateRehearsalEnvironment,
  validateSanitizedEvidence
} from './rehearse-production-migration-upgrade.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED_BASELINE_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.json');
const EXPECTED_BASELINE_HASH_PATH = path.join(PROJECT_ROOT, 'database', 'production-expected-catalog-baseline.sha256');
const EVIDENCE_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json');
const EVIDENCE_HASH_PATH = path.join(PROJECT_ROOT, 'docs', 'PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.sha256');
const CONFIRMATION = 'REHEARSE_BANKE_DISPOSABLE_STRUCTURAL_PARITY';
const DISPOSABLE_PREFIX = 'banke-disposable-upgrade-';
const STRUCTURAL_SECTIONS = Object.freeze([
  'schemas', 'relations', 'columns', 'constraints', 'indexes', 'functions',
  'triggers', 'sequences', 'policies', 'extensions'
]);

export const STRUCTURAL_CATALOG_QUERIES = Object.freeze({
  ...CATALOG_QUERIES,
  relations: `
    SELECT n.nspname AS schema_name,
           c.relname AS relation_name,
           c.relkind AS relation_kind,
           pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           COALESCE(c.relacl::text, '') AS acl,
           CASE WHEN c.relkind IN ('v', 'm')
                THEN encode(public.digest(convert_to(pg_catalog.pg_get_viewdef(c.oid, true), 'UTF8'), 'sha256'), 'hex')
                ELSE '' END AS view_definition_sha256
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'app_private')
       AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
     ORDER BY n.nspname, c.relname`,
  functions: `
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_catalog.pg_get_function_result(p.oid) AS result_type,
           l.lanname AS language_name,
           pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
           p.prokind AS function_kind,
           p.prosecdef AS security_definer,
           p.provolatile AS volatility,
           p.proparallel AS parallel_safety,
           p.proisstrict AS strict_inputs,
           p.proleakproof AS leakproof,
           COALESCE(p.proconfig::text, '') AS runtime_config,
           COALESCE(p.proacl::text, '') AS acl,
           COALESCE(e.extname, '') AS extension_name,
           encode(public.digest(convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8'), 'sha256'), 'hex') AS definition_sha256
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      LEFT JOIN pg_catalog.pg_depend d
        ON d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
       AND d.objid = p.oid
       AND d.deptype = 'e'
      LEFT JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
     WHERE n.nspname IN ('public', 'app_private')
     ORDER BY n.nspname, p.proname,
              pg_catalog.pg_get_function_identity_arguments(p.oid)`
});

const KEY_FIELDS = Object.freeze({
  migrationLedger: ['version'],
  schemas: ['schema_name'],
  relations: ['schema_name', 'relation_name'],
  columns: ['schema_name', 'table_name', 'column_name'],
  constraints: ['schema_name', 'table_name', 'constraint_name'],
  indexes: ['schema_name', 'table_name', 'index_name'],
  functions: ['schema_name', 'function_name', 'identity_arguments'],
  triggers: ['schema_name', 'table_name', 'trigger_name'],
  sequences: ['schema_name', 'sequence_name'],
  policies: ['schema_name', 'table_name', 'policy_name'],
  extensions: ['extension_name']
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function rowKey(section, row) {
  const fields = KEY_FIELDS[section];
  if (!fields) throw new Error(`UNSUPPORTED_CATALOG_SECTION:${section}`);
  return fields.map(field => String(row?.[field] ?? '')).join('|');
}

function changedFields(left, right) {
  const fields = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...fields].filter(field => canonicalJson(left?.[field]) !== canonicalJson(right?.[field])).sort();
}

function compareSection(section, upgradeRows = [], freshRows = []) {
  const upgrade = new Map(upgradeRows.map(row => [rowKey(section, row), row]));
  const fresh = new Map(freshRows.map(row => [rowKey(section, row), row]));
  const missing = [...fresh.keys()].filter(key => !upgrade.has(key)).sort();
  const unexpected = [...upgrade.keys()].filter(key => !fresh.has(key)).sort();
  const mismatched = [...fresh.keys()]
    .filter(key => upgrade.has(key) && canonicalJson(upgrade.get(key)) !== canonicalJson(fresh.get(key)))
    .sort()
    .map(key => ({ key, changedFields: changedFields(upgrade.get(key), fresh.get(key)) }));
  return canonicalValue({
    status: missing.length || unexpected.length || mismatched.length ? 'FAIL' : 'PASS',
    upgradeCount: upgradeRows.length,
    freshCount: freshRows.length,
    missing,
    unexpected,
    mismatched
  });
}

function hasPublicAcl(value) {
  return typeof value === 'string' && /(?:^\{|,)=/.test(value);
}

function publicAclFacts(catalog) {
  const facts = [];
  for (const section of ['schemas', 'relations', 'functions']) {
    for (const row of catalog[section] || []) {
      if (hasPublicAcl(row.acl)) facts.push(`${section}:${rowKey(section, row)}`);
    }
  }
  return facts.sort();
}

function structuralCatalog(catalog) {
  return Object.fromEntries(STRUCTURAL_SECTIONS.map(section => [section, catalog[section] || []]));
}

function parityGroup(sectionResults, sections) {
  return sections.every(section => sectionResults[section]?.status === 'PASS') ? 'PASS' : 'FAIL';
}

export function compareStructuralCatalogs(upgradeCatalog, freshCatalog) {
  const sectionResults = Object.fromEntries(
    ['migrationLedger', ...STRUCTURAL_SECTIONS].map(section => [
      section,
      compareSection(section, upgradeCatalog?.[section], freshCatalog?.[section])
    ])
  );
  const upgradePublic = publicAclFacts(upgradeCatalog || {});
  const freshPublic = publicAclFacts(freshCatalog || {});
  const publicPrivilegeDrift = {
    missing: freshPublic.filter(item => !upgradePublic.includes(item)),
    unexpected: upgradePublic.filter(item => !freshPublic.includes(item))
  };
  const missingObjects = [];
  const unexpectedObjects = [];
  const mismatchedObjects = [];
  for (const section of STRUCTURAL_SECTIONS) {
    missingObjects.push(...sectionResults[section].missing.map(key => `${section}:${key}`));
    unexpectedObjects.push(...sectionResults[section].unexpected.map(key => `${section}:${key}`));
    mismatchedObjects.push(...sectionResults[section].mismatched.map(item => ({ section, ...item })));
  }
  const ownerAclMismatch = mismatchedObjects.filter(item => item.changedFields.includes('owner_name') || item.changedFields.includes('acl'));
  const upgradeStructural = structuralCatalog(upgradeCatalog || {});
  const freshStructural = structuralCatalog(freshCatalog || {});
  const upgradeFingerprint = sha256(canonicalJson(upgradeStructural));
  const freshFingerprint = sha256(canonicalJson(freshStructural));
  const overallPass = Object.values(sectionResults).every(result => result.status === 'PASS')
    && publicPrivilegeDrift.missing.length === 0
    && publicPrivilegeDrift.unexpected.length === 0
    && upgradeFingerprint === freshFingerprint;
  return canonicalValue({
    status: overallPass ? 'PASS' : 'FAIL',
    upgradeFingerprint,
    freshFingerprint,
    fingerprintMatch: upgradeFingerprint === freshFingerprint ? 'MATCH' : 'MISMATCH',
    sectionResults,
    parityGroups: {
      tablesColumnsConstraintsIndexes: parityGroup(sectionResults, ['relations', 'columns', 'constraints', 'indexes', 'sequences']),
      functionsTriggersRls: parityGroup(sectionResults, ['functions', 'triggers', 'policies', 'relations']),
      ownershipAcl: ownerAclMismatch.length === 0 && publicPrivilegeDrift.missing.length === 0 && publicPrivilegeDrift.unexpected.length === 0 ? 'PASS' : 'FAIL'
    },
    missingObjects,
    unexpectedObjects,
    mismatchedObjects,
    ownerAclMismatch,
    publicPrivilegeDrift
  });
}

function objectCounts(catalog) {
  const counts = Object.fromEntries(['migrationLedger', ...STRUCTURAL_SECTIONS].map(section => [section, (catalog[section] || []).length]));
  counts.tables = (catalog.relations || []).filter(row => ['r', 'p'].includes(row.relation_kind)).length;
  counts.views = (catalog.relations || []).filter(row => ['v', 'm'].includes(row.relation_kind)).length;
  return canonicalValue(counts);
}

async function residualDisposableResources() {
  return (await readdir(os.tmpdir(), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(DISPOSABLE_PREFIX))
    .map(entry => entry.name);
}

export async function rehearseStructuralSchemaParity({ env = process.env } = {}) {
  if (env.BANK_DISPOSABLE_STRUCTURAL_PARITY_CONFIRMATION !== CONFIRMATION) {
    throw new Error('DISPOSABLE_STRUCTURAL_PARITY_CONFIRMATION_REQUIRED');
  }
  validateRehearsalEnvironment(env);
  const initialResiduals = await residualDisposableResources();
  if (initialResiduals.length) throw new Error('PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED');
  const migrationSet = await loadExactMigrationSet();
  const [expectedText, expectedHashText] = await Promise.all([
    readFile(EXPECTED_BASELINE_PATH, 'utf8'),
    readFile(EXPECTED_BASELINE_HASH_PATH, 'utf8')
  ]);
  const expectedHash = sha256(expectedText);
  if (!expectedHashText.startsWith(`${expectedHash}  `)) throw new Error('EXPECTED_BASELINE_HASH_MISMATCH');
  const expected = JSON.parse(expectedText);
  const postgresBin = resolvePostgresBin(env);
  const upgrade = await runOneRehearsal({
    postgresBin,
    migrationSet,
    expectedCatalog: expected.catalog,
    runLabel: 'UPGRADE_PATH',
    includeCatalog: true,
    structuralQueries: STRUCTURAL_CATALOG_QUERIES
  });
  const fresh = await runOneFreshInstall({
    postgresBin,
    migrationSet,
    expectedCatalog: expected.catalog,
    runLabel: 'FRESH_INSTALL_PATH',
    structuralQueries: STRUCTURAL_CATALOG_QUERIES
  });
  const comparison = compareStructuralCatalogs(upgrade.finalCatalog, fresh.finalCatalog);
  if (comparison.status !== 'PASS') throw new Error('STRUCTURAL_SCHEMA_PARITY_MISMATCH');
  const residuals = await residualDisposableResources();
  if (residuals.length) throw new Error('DISPOSABLE_RESOURCE_CLEANUP_FAILED');
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const evidence = canonicalValue({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commitSha,
    scope: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    productionReadiness: '70_PERCENT_NOT_READY',
    productionStatus: 'NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionConnectionAttempted: false,
    productionMutation: false,
    postgresMajorVersion: 18,
    baselineVersions: migrationSet.baseline.map(item => item.version),
    upgradeAllowlist: migrationSet.upgrade.map(item => item.version),
    intentionalExcludedVersions: ['0010'],
    expectedCatalogBaselineSha256: expectedHash,
    baseline: {
      status: 'PASS',
      fingerprint: sha256(canonicalJson(structuralCatalog(upgrade.baselineCatalog))),
      objectCounts: objectCounts(upgrade.baselineCatalog),
      ledger: upgrade.baselineLedger
    },
    upgrade: {
      status: 'PASS',
      executionOrder: upgrade.upgrades.map(item => item.version),
      migrationResults: upgrade.upgrades.map(item => ({
        version: item.version,
        checksum: item.checksum,
        result: item.transaction,
        precondition: item.precondition,
        postcondition: item.postcondition,
        blockingDetected: item.locks.blockingDetected
      })),
      finalLedger: upgrade.finalLedger,
      finalCatalogHash: upgrade.finalCatalogHash,
      objectCounts: objectCounts(upgrade.finalCatalog)
    },
    freshInstall: {
      status: 'PASS',
      executionOrder: fresh.migrationOrder,
      migrationResults: fresh.migrationResults.map(item => ({ version: item.version, result: item.transaction })),
      finalLedger: fresh.finalLedger,
      finalCatalogHash: fresh.finalCatalogHash,
      objectCounts: objectCounts(fresh.finalCatalog)
    },
    comparison,
    cleanup: {
      postgresProcessesTerminated: true,
      temporaryDataRemoved: true,
      temporaryCredentialRemoved: true,
      temporaryConfigRemoved: true,
      residualDisposableResourceCount: residuals.length
    }
  });
  const sanitized = validateSanitizedEvidence(evidence);
  if (sanitized.status !== 'PASS') throw new Error(`EVIDENCE_SANITIZATION_BLOCKED:${sanitized.failures.join(',')}`);
  const serialized = canonicalJson(evidence);
  const evidenceHash = sha256(serialized);
  await writeFile(EVIDENCE_PATH, serialized, 'utf8');
  await writeFile(EVIDENCE_HASH_PATH, `${evidenceHash}  PRODUCTION_STRUCTURAL_PARITY_REHEARSAL_EVIDENCE.json\n`, 'utf8');
  return Object.freeze({
    status: 'PASS',
    environment: 'DISPOSABLE_LOCAL_NON_PRODUCTION',
    postgresMajorVersion: 18,
    baseline: 'PASS',
    upgrade: 'PASS',
    migrationLedger: comparison.sectionResults.migrationLedger.status,
    structuralParity: comparison.status,
    fingerprintMatch: comparison.fingerprintMatch,
    fingerprint: comparison.upgradeFingerprint,
    missingObjectCount: comparison.missingObjects.length,
    unexpectedObjectCount: comparison.unexpectedObjects.length,
    evidenceSha256: evidenceHash,
    residualDisposableResourceCount: residuals.length,
    productionConnectionAttempted: false,
    productionMutation: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseStructuralSchemaParity().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Disposable structural parity rehearsal failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
