import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  analyzeSanitizedDrift,
  validatePhase2BSource
} from '../database/analyze-production-starting-baseline-drift.mjs';
import { STRUCTURAL_CATALOG_QUERIES } from '../database/rehearse-structural-schema-parity.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const evidenceText = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.json', import.meta.url), 'utf8');
const evidenceHashText = await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.sha256', import.meta.url), 'utf8');
const evidenceSchema = JSON.parse(await readFile(new URL('../docs/PRODUCTION_0001_0008_LIVE_STRUCTURAL_COMPARISON_EVIDENCE.schema.json', import.meta.url), 'utf8'));
const artifactText = await readFile(new URL('../database/production-0001-0008-structural-baseline.json', import.meta.url), 'utf8');
const artifactHashText = await readFile(new URL('../database/production-0001-0008-structural-baseline.sha256', import.meta.url), 'utf8');
const analysisText = await readFile(new URL('../docs/PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.json', import.meta.url), 'utf8');
const analysisHashText = (await readFile(new URL('../docs/PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.sha256', import.meta.url), 'utf8')).trim();
const source = await readFile(new URL('../database/analyze-production-starting-baseline-drift.mjs', import.meta.url), 'utf8');

const validation = validatePhase2BSource({
  evidenceText,
  hashText: evidenceHashText,
  schema: evidenceSchema,
  artifactText,
  artifactHashText,
  commitExists: true
});
assert.equal(validation.status, 'PASS');
assert.equal(validation.evidenceSha256, '373de2d509da8a2b1b419430ba89573371f9632ff253c72e07ed99193bf479a7');
assert.equal(validation.evidence.ledgerResult.status, 'PASS');
assert.equal(validation.evidence.fingerprintComparison, 'MISMATCH');
assert.equal(validation.evidence.productionMutation, false);

const drift = analyzeSanitizedDrift(validation.evidence, validation.artifact);
assert.equal(drift.conclusion, 'MIXED_COMPARATOR_DEFECT_AND_ACL_EVIDENCE_INSUFFICIENT');
assert.equal(drift.selectedPath, 'D');
assert.equal(drift.missingClassifications.length, 136);
assert.equal(drift.missingClassifications.every(item => item.classification === 'COMPARATOR_IMPLEMENTATION_DEFECT'), true);
assert.equal(drift.mismatchClassifications.length, 57);
assert.equal(drift.mismatchClassifications.filter(item => item.classifications.includes('EXTENSION_ENVIRONMENT_DIFFERENCE')).length, 37);
assert.equal(drift.mismatchClassifications.filter(item => item.classifications.includes('OWNER_OR_ACL_PLACEHOLDER_MISMATCH')).length, 20);
assert.deepEqual(drift.mismatchByField, { acl: 57 });
assert.deepEqual(drift.missingBySection, { columns: 136 });
assert.deepEqual(validation.evidence.unexpectedObjectKeys, []);

assert.doesNotMatch(STRUCTURAL_CATALOG_QUERIES.columns, /information_schema\.columns/i);
for (const relation of ['pg_catalog.pg_attribute', 'pg_catalog.pg_class', 'pg_catalog.pg_namespace', 'pg_catalog.pg_type', 'pg_catalog.pg_attrdef']) {
  assert.match(STRUCTURAL_CATALOG_QUERIES.columns, new RegExp(relation.replace('.', '\\.')));
}

const analysis = JSON.parse(analysisText);
assert.equal(analysisHashText, `${sha256(analysisText)}  PRODUCTION_CLOSURE_PHASE_2C_STRUCTURAL_DRIFT_EVIDENCE.json`);
assert.equal(analysis.phase2BSourceEvidenceSha256, validation.evidenceSha256);
assert.equal(analysis.localEquivalence.phaseAFingerprint, '885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e');
assert.equal(analysis.localEquivalence.phaseBFingerprint, analysis.localEquivalence.phaseAFingerprint);
assert.equal(analysis.localEquivalence.phaseAAndBByteEquivalent, true);
assert.equal(analysis.localEquivalence.legacyPermissionFilteredColumnCount, 4);
assert.equal(analysis.localEquivalence.pgCatalogColumnCount, 140);
assert.equal(analysis.localEquivalence.readerCoreWithoutAclMatch, true);
assert.deepEqual(analysis.localEquivalence.readerMismatchFields, ['acl']);
assert.equal(analysis.genuineProductionStructuralDrift, 'NOT_PROVEN');
assert.equal(analysis.selectedNextPath, 'D');
assert.equal(analysis.structuralStartingBaselineGate, 'BLOCKED');
assert.deepEqual(analysis.gateState, { nonPass: 13, pass: 9 });
assert.equal(analysis.productionConnectionAttemptedDuringPhase2C, false);
assert.equal(analysis.productionMutation, false);
assert.equal(analysis.cleanup.residualDisposableResourceCount, 0);

assert.match(source, /validateRehearsalEnvironment/);
assert.match(source, /banke-disposable-upgrade-/);
assert.doesNotMatch(source, /compareProductionStartingBaseline\s*\(/);
assert.doesNotMatch(source, /db:parity:production/);

console.log('Production Closure Phase 2C sanitized drift analysis tests passed');
