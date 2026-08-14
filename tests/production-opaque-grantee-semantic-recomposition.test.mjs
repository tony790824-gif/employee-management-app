import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  PHASE_2K_MODEL_VERSION,
  SOURCE_COMMITS,
  SOURCE_FILES,
  SOURCE_HASHES,
  buildPhase2KEvidence,
  recomposeOpaqueGranteeSemantics,
  validatePhase2KEvidence,
  validateSourceBundle
} from '../database/analyze-production-opaque-grantee-semantics.mjs';

const docsUrl = new URL('../docs/', import.meta.url);

async function load(name) {
  const filename = SOURCE_FILES[name];
  const text = await readFile(new URL(filename, docsUrl), 'utf8');
  const hashText = await readFile(new URL(filename.replace(/\.json$/, '.sha256'), docsUrl), 'utf8');
  return { evidence: JSON.parse(text), text, hashText };
}

const loaded = Object.fromEntries(await Promise.all(Object.keys(SOURCE_FILES).map(async name => [name, await load(name)])));
const phase2KSchema = JSON.parse(await readFile(new URL('PRODUCTION_CLOSURE_PHASE_2K_OPAQUE_GRANTEE_SEMANTIC_RECOMPOSITION.schema.json', docsUrl), 'utf8'));
const sourceInput = {
  phase2G: loaded.phase2G.evidence,
  phase2I: loaded.phase2I.evidence,
  opaque: loaded.opaque.evidence,
  texts: Object.fromEntries(Object.entries(loaded).map(([name, value]) => [name, value.text])),
  hashTexts: Object.fromEntries(Object.entries(loaded).map(([name, value]) => [name, value.hashText]))
};
const sourceValidation = validateSourceBundle(sourceInput);

assert.equal(PHASE_2K_MODEL_VERSION, 'bankeban-opaque-grantee-semantic-recomposition-v1');
assert.equal(sourceInput.opaque.repositoryCommitSha, SOURCE_COMMITS.opaque);
assert.equal(phase2KSchema.additionalProperties, false);
assert.equal(phase2KSchema.properties.phase2KProductionConnections.const, 0);
assert.equal(phase2KSchema.properties.phase2KProductionMutation.const, false);
assert.equal(phase2KSchema.properties.semanticResult.const, 'BLOCKED');
assert.equal(sourceValidation.status, 'PASS');
for (const [name, value] of Object.entries(loaded)) {
  assert.equal(createHash('sha256').update(value.text).digest('hex'), SOURCE_HASHES[name]);
}

const actual = recomposeOpaqueGranteeSemantics({ ...sourceInput, sourceValidation });
assert.equal(actual.semanticResult, 'BLOCKED');
assert.equal(actual.structuralNonAcl, 'PASS');
assert.equal(actual.aclSemantic, 'BLOCKED');
assert.equal(actual.structuralStartingBaseline, 'BLOCKED');
assert.equal(actual.freshLedgerAndChecksum, 'BLOCKED');
assert.deepEqual(actual.facts, { grantOptionTrue: 11, relation: 8, sequence: 3, total: 11 });
assert.deepEqual(actual.classification.categories, ['OTHER_NAMED_PRINCIPAL']);
assert.deepEqual(actual.classification.proofs, ['NAMED_ROLE_WITHOUT_REVIEWED_RELATION']);
assert.deepEqual(actual.classification.membershipClassifications, ['NONE']);
assert.equal(actual.classification.publicFactCount, 0);
assert.equal(actual.classification.ambiguity, 'NONE');
assert.equal(actual.confirmedPrivilegeExpansion, false);
assert.equal(actual.confirmedAclDrift, false);

const actualEvidence = buildPhase2KEvidence({ ...sourceInput, sourceValidation });
assert.equal(validatePhase2KEvidence(actualEvidence).status, 'PASS');
assert.deepEqual(actualEvidence.gateSummary, { after: { nonPass: 13, pass: 9 }, before: { nonPass: 13, pass: 9 } });
assert.equal(actualEvidence.phase2KProductionConnections, 0);
assert.equal(actualEvidence.phase2KProductionMutation, false);

function withClassification(overrides) {
  return {
    ...sourceInput.opaque,
    classifications: sourceInput.opaque.classifications.map(entry => ({ ...entry, ...overrides }))
  };
}

// A reviewed, non-ambiguous category permits semantic recomposition. The
// observed grant options then prove a dangerous semantic mismatch rather than
// being guessed from privilege shape.
const reviewed = withClassification({
  principalCategory: 'SYSTEM_PLATFORM_MANAGED',
  classificationProof: 'SYSTEM_PLATFORM_OID_RELATION',
  membershipClassification: 'NONE',
  categoryMatchCount: 1,
  semanticResult: 'CLASSIFICATION_PROVEN'
});
const reviewedResult = recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: reviewed, sourceValidation });
assert.equal(reviewedResult.semanticResult, 'SEMANTIC_MISMATCH');
assert.equal(reviewedResult.confirmedPrivilegeExpansion, true);
assert.equal(reviewedResult.confirmedAclDrift, true);

// PUBLIC is accepted only when PostgreSQL proved OID zero.
const publicReviewed = withClassification({
  principalCategory: 'PUBLIC', classificationProof: 'PUBLIC_OID_ZERO', membershipClassification: 'NONE',
  categoryMatchCount: 1, semanticResult: 'CLASSIFICATION_PROVEN'
});
assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: publicReviewed, sourceValidation }).semanticResult, 'SEMANTIC_MISMATCH');
const publicWithoutOidZero = withClassification({
  principalCategory: 'PUBLIC', classificationProof: 'SYSTEM_PLATFORM_OID_RELATION', membershipClassification: 'NONE',
  categoryMatchCount: 1, semanticResult: 'CLASSIFICATION_PROVEN'
});
assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: publicWithoutOidZero, sourceValidation }).semanticResult, 'BLOCKED');

for (const classification of [
  { principalCategory: 'OTHER_NAMED_PRINCIPAL', classificationProof: 'NAMED_ROLE_WITHOUT_REVIEWED_RELATION', categoryMatchCount: 0, semanticResult: 'BLOCKED' },
  { principalCategory: 'UNCLASSIFIED', classificationProof: 'NO_ROLE_RELATION', categoryMatchCount: 0, semanticResult: 'BLOCKED' },
  { principalCategory: 'UNCLASSIFIED', classificationProof: 'AMBIGUOUS_OID_RELATION', membershipClassification: 'AMBIGUOUS', categoryMatchCount: 2, semanticResult: 'BLOCKED' }
]) {
  assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: withClassification(classification), sourceValidation }).semanticResult, 'BLOCKED');
}

const missing = { ...reviewed, classifications: reviewed.classifications.slice(1) };
assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: missing, sourceValidation }).semanticResult, 'BLOCKED');
const duplicate = { ...reviewed, classifications: [...reviewed.classifications, reviewed.classifications[0]] };
assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: duplicate, sourceValidation }).semanticResult, 'BLOCKED');
const extra = { ...reviewed, classifications: [...reviewed.classifications, { ...reviewed.classifications[0], privilege: 'CONNECT' }] };
assert.equal(recomposeOpaqueGranteeSemantics({ ...sourceInput, opaque: extra, sourceValidation }).semanticResult, 'BLOCKED');

const tamperedInput = { ...sourceInput, texts: { ...sourceInput.texts, opaque: `${sourceInput.texts.opaque} ` } };
assert.equal(validateSourceBundle(tamperedInput).status, 'BLOCKED');
assert.equal(validateSourceBundle({ ...sourceInput, opaque: { ...sourceInput.opaque, repositoryCommitSha: '0'.repeat(40) } }).status, 'BLOCKED');
assert.equal(validateSourceBundle({ ...sourceInput, opaque: { ...sourceInput.opaque, generatedAt: 'invalid' } }).status, 'BLOCKED');
assert.equal(validatePhase2KEvidence({ ...actualEvidence, rawOid: 123 }).status, 'BLOCKED');
assert.equal(validatePhase2KEvidence({ ...actualEvidence, principalName: 'not-safe' }).status, 'BLOCKED');
assert.equal(validatePhase2KEvidence({ ...actualEvidence, confirmedAclDrift: true }).status, 'BLOCKED');

console.log('Production Closure Phase 2K opaque grantee semantic recomposition tests passed');
