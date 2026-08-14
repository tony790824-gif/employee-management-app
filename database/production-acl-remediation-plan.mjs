import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PLAN_URL = new URL('./production-acl-remediation-plan.expected.json', import.meta.url);
const PLAN_HASH_URL = new URL('./production-acl-remediation-plan.expected.sha256', import.meta.url);

export const REQUIRED_PRECONDITIONS = Object.freeze([
  'EXACT_AUTHORIZED_COMMIT_AND_PLAN_HASH',
  'TARGET_DATABASE_IDENTITY_PASS',
  'TLS_VERIFY_FULL_PASS',
  'EXACT_0001_0008_LEDGER_AND_CHECKSUM_PASS',
  'ZERO_UNEXPECTED_MIGRATIONS',
  'DEDICATED_READER_ROLE_BOUNDARY_PASS',
  'EXACT_DEFAULT_ACL_OWNER_PROVEN',
  'EXACT_GRANTEE_CATEGORY_PROVEN',
  'GRANTEE_NOT_PUBLIC',
  'GRANTEE_NOT_APPROVED_RUNTIME_READER_OR_OPERATOR',
  'ZERO_EFFECTIVE_MEMBERSHIP_PATH_TO_APPROVED_RUNTIME_ROLES',
  'RUNTIME_CONFIGURATION_PRINCIPAL_INVENTORY_COMPLETE',
  'CURRENT_OBJECT_ACL_IMPACT_ENUMERATED',
  'EXACT_OBJECT_ALLOWLIST_MATCHES_BASELINE_OBJECT_SET',
  'NO_ACTIVE_RUNTIME_DEPENDENCY_ON_TARGET_PRIVILEGES',
  'APPROVED_ACL_OPERATOR_EXACTLY_IDENTIFIED',
  'OPERATOR_CAN_ACT_FOR_DEFAULT_ACL_OWNER_WITHOUT_ROLE_OR_OWNERSHIP_CHANGE',
  'MUTATION_TRANSACTION_AND_TIMEOUT_GUARDS_READY',
  'SANITIZED_PRECHECK_EVIDENCE_HASH_VALID'
]);

export const REQUIRED_STOPS = Object.freeze([
  'AUTHORIZATION_OR_COMMIT_MISMATCH',
  'TARGET_IDENTITY_OR_TLS_FAILURE',
  'LEDGER_OR_CHECKSUM_DRIFT',
  'UNEXPECTED_MIGRATION',
  'OWNER_RELATION_OR_DEFAULT_OWNER_AMBIGUOUS',
  'GRANTEE_UNCLASSIFIED_OR_PUBLIC',
  'GRANTEE_IS_APPROVED_RUNTIME_READER_OR_OPERATOR',
  'MEMBERSHIP_EXPANDS_TARGET_OR_OPERATOR_PRIVILEGES',
  'RUNTIME_PRINCIPAL_INVENTORY_INCOMPLETE',
  'ACTIVE_RUNTIME_DEPENDENCY_FOUND',
  'OBJECT_ALLOWLIST_OR_ACL_DIFF_MISMATCH',
  'OPERATOR_IDENTITY_OR_CAPABILITY_MISMATCH',
  'PRECHECK_EVIDENCE_OR_HASH_INVALID',
  'LOCK_OR_STATEMENT_TIMEOUT',
  'CONCURRENT_ACL_OR_SCHEMA_DRIFT',
  'ANY_NON_ALLOWLISTED_MUTATION',
  'IN_TRANSACTION_POSTCONDITION_FAILURE',
  'POSTCHECK_EVIDENCE_OR_HASH_INVALID'
]);

const EXPECTED_STAGE_IDS = Object.freeze(['PRECHECK', 'CONDITIONAL_MUTATION', 'INDEPENDENT_POSTCHECK']);
const SENSITIVE_FIELD = /(?:password|secret|token|credentialValue|connectionString|databaseUrl|hostname|endpoint|rawPrincipal|rawOid|rawAcl|businessRows)/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function canonicalPlanJson(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function loadAclRemediationPlan() {
  return JSON.parse(await readFile(PLAN_URL, 'utf8'));
}

export function validateAclRemediationPlan(plan) {
  const failures = [];
  if (plan?.schemaVersion !== 1 || plan?.mode !== 'REPOSITORY_LOCAL_ONLY_PLAN') failures.push('PLAN_FORMAT_MISMATCH');
  if (plan?.decision !== 'READY_FOR_ONE_BOUNDED_CONDITIONAL_AUTHORIZATION') failures.push('DECISION_MISMATCH');
  if (plan?.authorizationStatus !== 'NOT_GRANTED') failures.push('AUTHORIZATION_GATE_WEAKENED');
  if (plan?.productionConnectionAttempted || plan?.productionComparatorExecuted || plan?.productionMutation) failures.push('REPOSITORY_ONLY_BOUNDARY_VIOLATED');

  const facts = plan?.knownFacts || {};
  if (facts.explicitDefaultAclDrift !== 'PROVEN' || facts.relationFactCount !== 8 || facts.sequenceFactCount !== 3
      || facts.grantOptionTrueCount !== 11 || facts.expectedDefaultPrivilegeCount !== 0) failures.push('PROVEN_FACT_SET_DRIFT');
  if (facts.ownerRelationProof !== 'BLOCKED' || facts.runtimeImpact !== 'NOT_PROVEN') failures.push('OWNER_OR_RUNTIME_GATE_WEAKENED');
  if ([facts.aclSemanticGate, facts.structuralStartingBaselineGate, facts.freshLedgerAndChecksumGate].some(value => value !== 'BLOCKED')) failures.push('LIVE_GATE_WEAKENED');

  if (JSON.stringify(plan?.remediationTargets?.defaultPrivileges?.relationPrivileges) !== JSON.stringify(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])) failures.push('RELATION_PRIVILEGE_SCOPE_MISMATCH');
  if (JSON.stringify(plan?.remediationTargets?.defaultPrivileges?.sequencePrivileges) !== JSON.stringify(['USAGE','SELECT','UPDATE'])) failures.push('SEQUENCE_PRIVILEGE_SCOPE_MISMATCH');
  if (plan?.remediationTargets?.materializedObjectPrivileges?.broadAllObjectsRevokeAllowed !== false) failures.push('BROAD_OBJECT_REVOKE_ALLOWED');

  for (const requirement of REQUIRED_PRECONDITIONS) if (!plan?.preconditions?.includes(requirement)) failures.push(`PRECONDITION_MISSING:${requirement}`);
  for (const stop of REQUIRED_STOPS) if (!plan?.stopConditions?.includes(stop)) failures.push(`STOP_CONDITION_MISSING:${stop}`);

  const envelope = plan?.authorizationEnvelope || {};
  const stages = envelope.stages || [];
  if (envelope.kind !== 'ONE_OWNER_AUTHORIZATION_THREE_BOUNDED_CONNECTIONS' || envelope.maxConnectionAttempts !== 3 || envelope.retryCount !== 0) failures.push('AUTHORIZATION_ENVELOPE_MISMATCH');
  if (JSON.stringify(stages.map(stage => stage.id)) !== JSON.stringify(EXPECTED_STAGE_IDS)) failures.push('STAGE_ORDER_MISMATCH');
  if (stages.some(stage => stage.maxConnectionAttempts !== 1)) failures.push('STAGE_ATTEMPT_LIMIT_WEAKENED');
  if (stages[0]?.credentialClass !== 'DEDICATED_PRODUCTION_READONLY' || stages[0]?.transactionMode !== 'READ_ONLY' || stages[0]?.mutationAllowed !== false) failures.push('PRECHECK_BOUNDARY_WEAKENED');
  if (stages[1]?.credentialClass !== 'EXACT_APPROVED_ACL_OPERATOR' || stages[1]?.requiresPrecheckDecision !== 'PASS' || stages[1]?.mutationAllowed !== true) failures.push('MUTATION_BOUNDARY_WEAKENED');
  if (stages[2]?.credentialClass !== 'DEDICATED_PRODUCTION_READONLY' || stages[2]?.transactionMode !== 'READ_ONLY' || stages[2]?.mutationAllowed !== false) failures.push('POSTCHECK_BOUNDARY_WEAKENED');
  if (stages.some(stage => stage.businessRowReads !== false)) failures.push('BUSINESS_ROW_READ_ALLOWED');

  const guards = plan?.mutationGuards || {};
  for (const key of ['singleTransaction','advisoryLockRequired','lockTimeoutRequired','statementTimeoutRequired','identifiersResolvedFromVerifiedCatalogOidsAndSafelyQuoted']) {
    if (guards[key] !== true) failures.push(`MUTATION_GUARD_MISSING:${key}`);
  }
  for (const key of ['freeFormSqlAllowed','grantAllowed','roleOrMembershipChangeAllowed','ownershipChangeAllowed','schemaOrBusinessDataChangeAllowed','migrationAllowed']) {
    if (guards[key] !== false) failures.push(`MUTATION_GUARD_WEAKENED:${key}`);
  }
  if (plan?.recoveryStrategy?.beforeCommit !== 'ROLLBACK_TRANSACTION' || plan?.recoveryStrategy?.automaticRegrantAllowed !== false) failures.push('RECOVERY_BOUNDARY_WEAKENED');

  const runner = plan?.precheckRunner || {};
  if (runner.status !== 'READY' || runner.command !== 'pnpm run db:acl:production-precheck'
      || runner.confirmation !== 'PRECHECK_BANKE_PRODUCTION_ACL_REMEDIATION'
      || runner.maxConnectionAttempts !== 1 || runner.retryCount !== 0 || runner.transactionMode !== 'READ_ONLY'
      || runner.businessRowReads !== false || runner.productionMutation !== false) failures.push('PRECHECK_RUNNER_BOUNDARY_MISMATCH');
  const requiredEvidence = ['IDENTITY_AND_TLS_VERIFY_FULL','EXACT_0001_0008_LEDGER_AND_CHECKSUM',
    'DEFAULT_ACL_OWNER_GRANTEE_CLASSIFICATION','ROLE_MEMBERSHIP','RUNTIME_PRINCIPAL_INVENTORY',
    'CURRENT_OBJECT_ACL_BASELINE_DIFFERENCE','OPERATOR_DISCOVERY_OR_APPROVED_OPERATOR_VALIDATION','EXACT_SAFE_REMEDIATION_TARGET'];
  if (JSON.stringify(runner.requiredEvidence) !== JSON.stringify(requiredEvidence)) failures.push('PRECHECK_RUNNER_EVIDENCE_SCOPE_MISMATCH');
  const requiredInputs = ['DATABASE_READONLY_URL','BANK_PRODUCTION_CA_BUNDLE','BANK_PRODUCTION_DATABASE_NAME',
    'BANK_PRODUCTION_READONLY_ROLE','BANK_ENV','BANK_PRODUCTION_PARITY_CONFIRMATION','BANK_PRODUCTION_EVIDENCE_COMMIT_SHA',
    'BANK_PRODUCTION_OBJECT_OWNER_ROLE','BANK_PRODUCTION_PLATFORM_ROLE','BANK_PRODUCTION_RUNTIME_ROLES',
    'BANK_PRODUCTION_ACL_PLAN_SHA256'];
  if (JSON.stringify(runner.processOnlyInputs) !== JSON.stringify(requiredInputs)) failures.push('PRECHECK_RUNNER_INPUT_SCOPE_MISMATCH');
  if (JSON.stringify(runner.optionalProcessOnlyInputs) !== JSON.stringify(['BANK_PRODUCTION_ACL_OPERATOR_ROLE'])) failures.push('PRECHECK_RUNNER_OPTIONAL_INPUT_SCOPE_MISMATCH');
  if (runner?.operatorDiscovery?.whenOperatorInputMissing !== true
      || JSON.stringify(runner?.operatorDiscovery?.resultAllowlist) !== JSON.stringify(['ELIGIBLE_OPERATOR_CANDIDATE','NO_ELIGIBLE_OPERATOR','INSUFFICIENT_EVIDENCE'])
      || runner?.operatorDiscovery?.ownerApprovalRequired !== true || runner?.operatorDiscovery?.productionMutation !== false) {
    failures.push('PRECHECK_RUNNER_OPERATOR_DISCOVERY_BOUNDARY_MISMATCH');
  }
  if (runner.successEvidence !== 'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_EVIDENCE.json'
      || runner.successEvidenceHash !== 'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_EVIDENCE.sha256'
      || runner.failureEvidence !== 'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_FAILURE.json'
      || runner.failureEvidenceHash !== 'docs/PRODUCTION_ACL_REMEDIATION_PRECHECK_FAILURE.sha256') failures.push('PRECHECK_RUNNER_EVIDENCE_PATH_MISMATCH');

  const passContract = plan?.postRemediationPassContract || {};
  for (const requirement of ['ZERO_ACL_SEMANTIC_DIFFERENCES','OBSERVED_ACL_FINGERPRINT_EQUALS_COMMITTED_0001_0008_BASELINE','ZERO_UNCLASSIFIED_PRINCIPALS','ZERO_UNEXPECTED_DEFAULT_ACL_FACTS']) {
    if (!passContract.aclSemantic?.includes(requirement)) failures.push(`ACL_PASS_REQUIREMENT_MISSING:${requirement}`);
  }
  if (!passContract.structuralStartingBaseline?.includes('STRUCTURAL_NON_ACL_PASS') || !passContract.structuralStartingBaseline?.includes('ACL_SEMANTIC_PASS')) failures.push('STRUCTURAL_PASS_CONTRACT_WEAKENED');
  if (passContract.freshLedgerAndChecksum !== 'REMAINS_INDEPENDENTLY_BLOCKED_UNTIL_0009_AND_0011_TO_0022_ARE_AUTHORIZED_APPLIED_AND_VERIFIED') failures.push('FINAL_LEDGER_GATE_WEAKENED');

  const gate = plan?.currentGateState || {};
  if (gate.aclSemantic !== 'BLOCKED' || gate.structuralStartingBaseline !== 'BLOCKED' || gate.freshLedgerAndChecksum !== 'BLOCKED'
      || gate.passCount !== 9 || gate.nonPassCount !== 13 || gate.productionReadinessPercent !== 70
      || gate.productionStatus !== 'NOT_READY' || gate.gateA !== 'DEFER' || gate.productionProvisioning !== 'NO_GO'
      || gate.productionMigrationAuthorization !== 'NOT_GRANTED') failures.push('CURRENT_GATE_STATE_MISMATCH');

  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_FIELD.test(key)) failures.push(`SENSITIVE_FIELD:${key}`);
      inspect(child);
    }
  };
  inspect(plan);

  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    decision: failures.length ? 'BLOCKED' : plan.decision,
    productionConnectionAttempted: false,
    productionMutation: false,
    failures: Object.freeze([...new Set(failures)].sort())
  });
}

export async function validateAclRemediationPlanIntegrity() {
  const plan = await loadAclRemediationPlan();
  const companion = (await readFile(PLAN_HASH_URL, 'utf8')).trim().split(/\s+/)[0];
  const actual = sha256(await readFile(PLAN_URL, 'utf8'));
  const validation = validateAclRemediationPlan(plan);
  const failures = [...validation.failures];
  if (!/^[a-f0-9]{64}$/.test(companion) || companion !== actual) failures.push('PLAN_HASH_MISMATCH');
  return Object.freeze({
    status: failures.length ? 'BLOCKED' : 'PASS',
    decision: failures.length ? 'BLOCKED' : plan.decision,
    planSha256: actual,
    productionConnectionAttempted: false,
    productionMutation: false,
    failures: Object.freeze([...new Set(failures)].sort())
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateAclRemediationPlanIntegrity().then(result => {
    process.stdout.write(`ACL_REMEDIATION_PLAN=${result.status}\n`);
    process.stdout.write(`AUTHORIZATION_DECISION=${result.decision}\n`);
    process.stdout.write(`PLAN_SHA256=${result.planSha256}\n`);
    process.stdout.write('PRODUCTION_CONNECTIONS=0\n');
    process.stdout.write('PRODUCTION_MUTATIONS=NONE\n');
    if (result.status !== 'PASS') {
      process.stderr.write(`ACL_REMEDIATION_PLAN_FAILURES=${result.failures.join(',')}\n`);
      process.exitCode = 1;
    }
  }).catch(() => {
    process.stderr.write('ACL_REMEDIATION_PLAN=BLOCKED\n');
    process.exitCode = 1;
  });
}
