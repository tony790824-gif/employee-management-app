import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDefaultAclClassification, validateDefaultAclEvidence } from './default-acl-principal-classification.mjs';
import { validateOpaqueGranteeEvidence } from './default-acl-opaque-grantee-classification.mjs';
import { validateSemanticLiveEvidence } from './compare-production-starting-baseline-semantic.mjs';
import { canonicalJson, sha256 } from './materialize-expected-catalog.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PHASE_2K_MODEL_VERSION = 'bankeban-opaque-grantee-semantic-recomposition-v1';
export const SOURCE_HASHES = Object.freeze({
  phase2G: 'bea7076ab4972fb3874a99be9fa3652a873bfdbe53fb74e4dc0e9606e3d37a02',
  phase2I: 'bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c',
  opaque: 'b7cd457f82ae00ccfaf9fbbe1f35b3e0b2c2c19b0fffd08f52ebdf2169645e4c'
});
export const SOURCE_COMMITS = Object.freeze({
  phase2G: '6f2e27c71912734b19ca7d2dff162ecb55f9a159',
  phase2I: '25dca558f4c76f217f3114950896bac0354d224f',
  opaque: '4f5b1bd4c933d14735fd0823c577bfc513dc653c'
});

export const SOURCE_FILES = Object.freeze({
  phase2G: 'PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json',
  phase2I: 'PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json',
  opaque: 'PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.json'
});

const REVIEWED = new Set([
  'EXPECTED_OWNER', 'EXPECTED_READONLY_ROLE', 'EXPECTED_RUNTIME_ROLE', 'SYSTEM_PLATFORM_MANAGED',
  'READONLY_MEMBERSHIP_CARRIER', 'EXTENSION_OWNER', 'PUBLIC'
]);
const EXPECTED_FACTS = Object.freeze([
  ...['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
    .map(privilege => `PUBLIC_SCHEMA|RELATION|${privilege}|true`),
  ...['SELECT', 'UPDATE', 'USAGE'].map(privilege => `PUBLIC_SCHEMA|SEQUENCE|${privilege}|true`)
].sort());
const FORBIDDEN_KEY = /^(?:.*(?:_oid|Oid)|rawPrincipal.*|raw_principal.*|principalName|principal_name|roleName|role_name|username|password|credential|connectionString|connection_string|databaseUrl|database_url|hostname|endpoint|token|cookie|authorizationHeader|authorization_header|rawAcl|raw_acl)$/i;
const FORBIDDEN_VALUE = /(?:postgres(?:ql)?:\/\/|-----BEGIN|\bBearer\s+)/i;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function sensitivePath(value, pathParts = []) {
  if (typeof value === 'string' && FORBIDDEN_VALUE.test(value)) return pathParts.join('.') || '$';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'rawOidPersisted' || key === 'rawPrincipalNamePersisted' || key === 'rawPrincipalNamesPersisted') && child === false) continue;
    if (FORBIDDEN_KEY.test(key)) return [...pathParts, key].join('.');
    const nested = sensitivePath(child, [...pathParts, key]);
    if (nested) return nested;
  }
  return null;
}

function factKey(value) {
  return `${value.defaultAclKey}|${value.privilege}|${Boolean(value.grantOption)}`;
}

function companionHash(text, filename) {
  const match = String(text || '').trim().match(/^([a-f0-9]{64})\s{2}([^\s]+)$/);
  return match && match[2] === filename ? match[1] : null;
}

export function validateSourceBundle({ phase2G, phase2I, opaque, texts = {}, hashTexts = {} }) {
  const failures = [];
  const sources = { phase2G, phase2I, opaque };
  for (const [name, value] of Object.entries(sources)) {
    if (!value || sensitivePath(value)) failures.push(`SOURCE_${name.toUpperCase()}_SANITIZATION_BLOCKED`);
    const text = texts[name];
    if (typeof text !== 'string' || sha256(text) !== SOURCE_HASHES[name]) failures.push(`SOURCE_${name.toUpperCase()}_HASH_MISMATCH`);
    if (companionHash(hashTexts[name], SOURCE_FILES[name]) !== SOURCE_HASHES[name]) failures.push(`SOURCE_${name.toUpperCase()}_COMPANION_HASH_MISMATCH`);
    if (value?.repositoryCommitSha !== SOURCE_COMMITS[name]) failures.push(`SOURCE_${name.toUpperCase()}_COMMIT_PROVENANCE_MISMATCH`);
    if (typeof value?.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) failures.push(`SOURCE_${name.toUpperCase()}_TIMESTAMP_INVALID`);
  }
  if (validateSemanticLiveEvidence(phase2G).status !== 'PASS') failures.push('SOURCE_PHASE2G_SCHEMA_BLOCKED');
  if (validateDefaultAclEvidence(phase2I).status !== 'PASS') failures.push('SOURCE_PHASE2I_SCHEMA_BLOCKED');
  if (validateOpaqueGranteeEvidence(opaque).status !== 'PASS') failures.push('SOURCE_OPAQUE_SCHEMA_BLOCKED');
  if (phase2G?.structuralNonAclResult !== 'PASS') failures.push('STRUCTURAL_NON_ACL_SOURCE_NOT_PASS');
  if (phase2I?.sourceLiveSemanticEvidenceSha256 !== SOURCE_HASHES.phase2G) failures.push('SOURCE_PHASE2I_CHAIN_MISMATCH');
  if (opaque?.sourcePhase2IEvidenceSha256 !== SOURCE_HASHES.phase2I) failures.push('SOURCE_OPAQUE_CHAIN_MISMATCH');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

function classificationBlockers(classifications) {
  const blockers = [];
  const facts = [];
  for (const entry of classifications || []) {
    facts.push(factKey(entry));
    if (!REVIEWED.has(entry.principalCategory)) blockers.push(`OPAQUE_GRANTEE_CATEGORY_UNREVIEWED:${entry.defaultAclKey}`);
    if (entry.categoryMatchCount !== 1 || entry.semanticResult !== 'CLASSIFICATION_PROVEN') blockers.push(`OPAQUE_GRANTEE_PROOF_INSUFFICIENT:${entry.defaultAclKey}`);
    if (entry.classificationProof === 'AMBIGUOUS_OID_RELATION' || entry.membershipClassification === 'AMBIGUOUS') blockers.push(`OPAQUE_GRANTEE_AMBIGUOUS:${entry.defaultAclKey}`);
    if (entry.principalCategory === 'PUBLIC' && entry.classificationProof !== 'PUBLIC_OID_ZERO') blockers.push(`PUBLIC_CLASSIFICATION_NOT_OID_ZERO:${entry.defaultAclKey}`);
    if (entry.principalCategory !== 'PUBLIC' && entry.classificationProof === 'PUBLIC_OID_ZERO') blockers.push(`PUBLIC_PROOF_CATEGORY_MISMATCH:${entry.defaultAclKey}`);
  }
  const unique = new Set(facts);
  if (facts.length !== EXPECTED_FACTS.length) blockers.push('OPAQUE_GRANTEE_FACT_COUNT_MISMATCH');
  if (unique.size !== facts.length) blockers.push('OPAQUE_GRANTEE_DUPLICATE_FACT');
  if (JSON.stringify([...unique].sort()) !== JSON.stringify(EXPECTED_FACTS)) blockers.push('OPAQUE_GRANTEE_FACT_SET_MISMATCH');
  return [...new Set(blockers)].sort();
}

function rowsFromPhase2I(entries, classifications) {
  const byFact = new Map(classifications.map(entry => [factKey(entry), entry]));
  return entries.map(entry => {
    const classification = entry.aclState === 'EXPLICIT_DEFAULT_ACL' ? byFact.get(factKey(entry)) : null;
    return {
      schema_name: entry.schemaKey === 'PUBLIC_SCHEMA' ? 'public' : '',
      default_acl_type: entry.objectType === 'RELATION' ? 'r' : entry.objectType === 'SEQUENCE' ? 'S' : '',
      acl_state: entry.aclState,
      privilege_type: entry.privilege,
      grant_option: entry.grantOption,
      owner_category: entry.ownerCategory,
      grantee_category: classification?.principalCategory ?? entry.granteeCategory,
      grantor_category: entry.grantorCategory
    };
  });
}

export function recomposeOpaqueGranteeSemantics({ phase2G, phase2I, opaque, sourceValidation = { status: 'PASS', failures: [] } }) {
  const blockers = [...(sourceValidation.failures || [])];
  if (sourceValidation.status !== 'PASS') blockers.push('SOURCE_BUNDLE_BLOCKED');
  blockers.push(...classificationBlockers(opaque?.classifications));
  let semantic = null;
  if (blockers.length === 0) {
    semantic = buildDefaultAclClassification(rowsFromPhase2I(phase2I.entries, opaque.classifications));
    blockers.push(...semantic.blockers);
  }
  const semanticResult = blockers.length ? 'BLOCKED' : semantic.status;
  const differences = semanticResult === 'SEMANTIC_MISMATCH' ? semantic.differences : [];
  const grantOptionFactCount = (opaque?.classifications || []).filter(entry => entry.grantOption === true).length;
  const relationFactCount = (opaque?.classifications || []).filter(entry => entry.objectType === 'RELATION').length;
  const sequenceFactCount = (opaque?.classifications || []).filter(entry => entry.objectType === 'SEQUENCE').length;
  const categories = [...new Set((opaque?.classifications || []).map(entry => entry.principalCategory))].sort();
  const proofs = [...new Set((opaque?.classifications || []).map(entry => entry.classificationProof))].sort();
  const memberships = [...new Set((opaque?.classifications || []).map(entry => entry.membershipClassification))].sort();
  const publicFactCount = (opaque?.classifications || []).filter(entry => entry.principalCategory === 'PUBLIC').length;
  const confirmedPrivilegeExpansion = semanticResult === 'SEMANTIC_MISMATCH' && differences.some(item => item.type === 'DEFAULT_PRIVILEGE_ADDED' && item.dangerous);
  return canonicalValue({
    modelVersion: PHASE_2K_MODEL_VERSION,
    semanticResult,
    blockers: [...new Set(blockers)].sort(),
    differences,
    confirmedPrivilegeExpansion,
    confirmedAclDrift: semanticResult === 'SEMANTIC_MISMATCH',
    facts: { relation: relationFactCount, sequence: sequenceFactCount, total: relationFactCount + sequenceFactCount, grantOptionTrue: grantOptionFactCount },
    classification: {
      categories,
      proofs,
      membershipClassifications: memberships,
      publicFactCount,
      ambiguity: proofs.includes('AMBIGUOUS_OID_RELATION') || memberships.includes('AMBIGUOUS') ? 'PRESENT' : 'NONE'
    },
    structuralNonAcl: phase2G?.structuralNonAclResult === 'PASS' ? 'PASS' : 'BLOCKED',
    aclSemantic: semanticResult === 'SEMANTIC_MATCH' ? 'PASS' : 'BLOCKED',
    structuralStartingBaseline: semanticResult === 'SEMANTIC_MATCH' && phase2G?.structuralNonAclResult === 'PASS' ? 'PASS' : 'BLOCKED',
    freshLedgerAndChecksum: 'BLOCKED'
  });
}

export function buildPhase2KEvidence({ phase2G, phase2I, opaque, sourceValidation }) {
  const result = recomposeOpaqueGranteeSemantics({ phase2G, phase2I, opaque, sourceValidation });
  return canonicalValue({
    schemaVersion: 1,
    phase: 'PRODUCTION_CLOSURE_PHASE_2K_OPAQUE_GRANTEE_SEMANTIC_RECOMPOSITION',
    sprintNumberingCappedAt: 65,
    generatedAt: opaque.generatedAt,
    modelVersion: PHASE_2K_MODEL_VERSION,
    sourceEvidenceSha256: SOURCE_HASHES,
    evidenceIntegrity: sourceValidation.status,
    sourceFailures: sourceValidation.failures,
    semanticResult: result.semanticResult,
    blockers: result.blockers,
    differences: result.differences,
    confirmedPrivilegeExpansion: result.confirmedPrivilegeExpansion,
    confirmedAclDrift: result.confirmedAclDrift,
    factCounts: result.facts,
    classificationSummary: result.classification,
    structuralNonAcl: result.structuralNonAcl,
    aclSemantic: result.aclSemantic,
    structuralStartingBaseline: result.structuralStartingBaseline,
    freshLedgerAndChecksum: result.freshLedgerAndChecksum,
    gateSummary: { before: { pass: 9, nonPass: 13 }, after: { pass: 9, nonPass: 13 } },
    productionReadinessPercent: 70,
    productionStatus: 'NOT_READY',
    gateA: 'DEFER',
    productionProvisioning: 'NO_GO',
    productionMigrationAuthorization: 'NOT_GRANTED',
    phase2KProductionConnections: 0,
    phase2KProductionMutation: false,
    phase2JAuthorization: 'CONSUMED_NOT_REUSABLE',
    finalStatus: result.semanticResult === 'SEMANTIC_MATCH' ? 'PASS' : 'BLOCKED'
  });
}

export function validatePhase2KEvidence(value) {
  const failures = [];
  if (sensitivePath(value)) failures.push('PHASE2K_EVIDENCE_SENSITIVE_FIELD');
  if (value?.schemaVersion !== 1 || value?.phase !== 'PRODUCTION_CLOSURE_PHASE_2K_OPAQUE_GRANTEE_SEMANTIC_RECOMPOSITION'
      || value?.sprintNumberingCappedAt !== 65 || value?.modelVersion !== PHASE_2K_MODEL_VERSION) failures.push('PHASE2K_EVIDENCE_CONTRACT_MISMATCH');
  if (!['SEMANTIC_MATCH', 'SEMANTIC_MISMATCH', 'BLOCKED'].includes(value?.semanticResult)) failures.push('PHASE2K_SEMANTIC_RESULT_INVALID');
  if (value?.phase2KProductionConnections !== 0 || value?.phase2KProductionMutation !== false) failures.push('PHASE2K_PRODUCTION_BOUNDARY_INVALID');
  if (value?.gateSummary?.before?.pass !== 9 || value?.gateSummary?.before?.nonPass !== 13
      || value?.gateSummary?.after?.pass !== 9 || value?.gateSummary?.after?.nonPass !== 13) failures.push('PHASE2K_GATE_SUMMARY_INVALID');
  if (value?.semanticResult === 'BLOCKED' && (value?.confirmedPrivilegeExpansion !== false || value?.confirmedAclDrift !== false)) failures.push('PHASE2K_BLOCKED_CANNOT_CONFIRM_DRIFT');
  if (value?.finalStatus !== (value?.semanticResult === 'SEMANTIC_MATCH' ? 'PASS' : 'BLOCKED')) failures.push('PHASE2K_FINAL_STATUS_INVALID');
  return canonicalValue({ status: failures.length ? 'BLOCKED' : 'PASS', failures: [...new Set(failures)].sort() });
}

async function loadSource(name) {
  const filename = SOURCE_FILES[name];
  const text = await readFile(path.join(PROJECT_ROOT, 'docs', filename), 'utf8');
  const hashText = await readFile(path.join(PROJECT_ROOT, 'docs', filename.replace(/\.json$/, '.sha256')), 'utf8');
  return { evidence: JSON.parse(text), text, hashText };
}

export async function runPhase2KAnalysis({ outputDirectory = path.join(PROJECT_ROOT, 'docs') } = {}) {
  const loaded = Object.fromEntries(await Promise.all(Object.keys(SOURCE_FILES).map(async name => [name, await loadSource(name)])));
  const input = {
    phase2G: loaded.phase2G.evidence,
    phase2I: loaded.phase2I.evidence,
    opaque: loaded.opaque.evidence,
    texts: Object.fromEntries(Object.entries(loaded).map(([name, value]) => [name, value.text])),
    hashTexts: Object.fromEntries(Object.entries(loaded).map(([name, value]) => [name, value.hashText]))
  };
  const sourceValidation = validateSourceBundle(input);
  const evidence = buildPhase2KEvidence({ ...input, sourceValidation });
  if (validatePhase2KEvidence(evidence).status !== 'PASS') throw new Error('PHASE2K_EVIDENCE_VALIDATION_BLOCKED');
  const filename = 'PRODUCTION_CLOSURE_PHASE_2K_OPAQUE_GRANTEE_SEMANTIC_RECOMPOSITION.json';
  const text = canonicalJson(evidence);
  await writeFile(path.join(outputDirectory, filename), text, 'utf8');
  await writeFile(path.join(outputDirectory, filename.replace(/\.json$/, '.sha256')), `${sha256(text)}  ${filename}\n`, 'utf8');
  return { evidence, evidenceSha256: sha256(text) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPhase2KAnalysis();
  console.log(`PHASE2K_OPAQUE_GRANTEE_RECOMPOSITION=${result.evidence.semanticResult}`);
  console.log(`PHASE2K_EVIDENCE_SHA256=${result.evidenceSha256}`);
  process.exitCode = result.evidence.finalStatus === 'PASS' ? 0 : 2;
}
