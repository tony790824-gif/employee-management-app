import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expectedTrackedMigrations } from '../database/inspect-migration-status.mjs';

async function existsAndContains(file, values, failures) {
  const content = await readFile(file, 'utf8').catch(() => '');
  if (!content) {
    failures.push(`Missing ${file}.`);
    return '';
  }
  for (const value of values) if (!content.includes(value)) failures.push(`${file} is missing ${value}.`);
  return content;
}

export async function runProductionRepositoryGate() {
  const failures = [];
  const migrations = await expectedTrackedMigrations();
  const versions = migrations.map(item => item.version);
  if (versions.includes('0010')) failures.push('Unapproved Migration 0010 must not enter the Production manifest.');
  if (versions.at(-1) !== '0022' || versions.length !== 21) {
    failures.push('Tracked Production migration manifest must contain the reviewed 0001-0022 set excluding 0010.');
  }
  if (new Set(migrations.map(item => item.checksum)).size !== migrations.length) {
    failures.push('Tracked migration checksums must be unique.');
  }

  const headers = await existsAndContains('dist/_headers', [
    'Content-Security-Policy:', 'Strict-Transport-Security:', 'X-Frame-Options: DENY',
    'Permissions-Policy:', "frame-ancestors 'none'"
  ], failures);
  if (/bankeban-staging-node-api|dev-[a-z0-9]+\.auth0\.com/i.test(headers)) {
    failures.push('Production headers contain a Staging origin.');
  }

  const workflow = await existsAndContains('.github/workflows/production-quality-gate.yml', [
    'permissions:', 'contents: read', 'pnpm run release:check', 'pnpm audit --prod'
  ], failures);
  if (/\bdeploy\b|netlify[^\n]*--prod|DATABASE_(?:API|MIGRATOR|PUSH)_URL/.test(workflow)) {
    failures.push('Quality Gate workflow must not deploy or receive database credentials.');
  }

  const render = await readFile('render.yaml', 'utf8');
  if (!/name: bankeban-staging-node-api/.test(render) || /BANK_ENV:\s*production|value:\s*production/i.test(render)) {
    failures.push('Committed Render Blueprint must remain Staging-only.');
  }
  await existsAndContains('docs/PRODUCTION_OPERATIONS_RUNBOOK.md', [
    'RPO', 'RTO', 'Rollback', 'Auth0', 'read-only', 'PENDING EXTERNAL APPROVAL'
  ], failures);
  await existsAndContains('docs/adr/0020-production-security-operations-gate.md', [
    'Accepted', 'Staging', 'Production'
  ], failures);
  await existsAndContains('scripts/production-platform-validator.mjs', [
    '--production', '--read-only', 'BLOCKED', 'NOT_CONFIGURED', 'DATABASE_READONLY_URL'
  ], failures);
  await existsAndContains('docs/PRODUCTION_PLATFORM_VALIDATION_REPORT.md', [
    'Repository scope: **COMPLETE**', 'Production readiness: **70%', 'NOT_CONFIGURED', 'BLOCKED'
  ], failures);
  await existsAndContains('docs/PRODUCTION_RELEASE_CHECKLIST.md', [
    'Netlify', 'Render', 'Neon', 'Auth0', 'RPO 15 minutes', 'RTO 60 minutes'
  ], failures);
  await existsAndContains('docs/PRODUCTION_OPERATIONS.md', [
    'read-only', 'BLOCKED', 'NOT_CONFIGURED', 'Stop conditions'
  ], failures);
  await existsAndContains('docs/PRODUCTION_READONLY_ACCESS.md', [
    'REPOSITORY READY / EXTERNAL PROVISIONING BLOCKED',
    'DATABASE_READONLY_URL', 'CONFIRMED_READ_ONLY',
    'read:attack_protection', 'Evidence re-run: **NOT PERFORMED**'
  ], failures);
  await existsAndContains('database/operator/production-readonly-role.provision.sql', [
    'PROVISION_BANKE_PRODUCTION_READONLY', 'NOINHERIT', 'default_transaction_read_only',
    'REVOKE ALL PRIVILEGES', 'GRANT SELECT ON TABLE public.schema_migrations',
    'application_functions_match_reviewed_owner', 'extension_functions_match_reviewed_platform_set',
    'extension_acl_unchanged'
  ], failures);
  await existsAndContains('database/operator/production-readonly-role.verify.sql', [
    'default_transaction_read_only', 'schema_migrations', 'has_table_privilege',
    'has_function_privilege', 'application_function_acl_pass',
    'application_readonly_execute_count', 'extension_readonly_execute_count',
    'ACCEPTED_PLATFORM_INFORMATION'
  ], failures);
  await existsAndContains('database/operator/production-readonly-role.disable.sql', [
    'DISABLE_BANKE_PRODUCTION_READONLY', 'NOLOGIN', 'REVOKE CONNECT'
  ], failures);
  await existsAndContains('docs/adr/0021-production-platform-validation.md', [
    'Accepted', 'fail-closed', 'GET', 'SELECT-only'
  ], failures);
  await existsAndContains('scripts/production-evidence-collector.mjs', [
    '--production', '--read-only', 'NOT AUTHORIZED', 'SHA-256', 'method: \'GET\''
  ], failures);
  await existsAndContains('docs/PRODUCTION_EVIDENCE_REPORT.md', [
    'Sprint 33D', 'Sprint 34 provisioning preflight', 'BLOCKED', 'NOT AUTHORIZED',
    'Evidence re-run: **NOT PERFORMED**', 'Manifest SHA-256', 'Production mutation: **none**'
  ], failures);
  await existsAndContains('docs/PRODUCTION_EVIDENCE_HASHES.json', [
    'SHA-256', 'public.repository.gate', 'netlify.production', 'render.production', 'auth0.production.management'
  ], failures);

  const trackedEnv = execFileSync('git', ['ls-files', '--', '.env', '.env.production', '.env.staging'], {
    encoding: 'utf8'
  }).trim();
  if (trackedEnv) failures.push('Real environment files must remain untracked.');

  if (failures.length) throw new Error(failures.join('\n'));
  return Object.freeze({
    ok: true,
    trackedMigrations: migrations.length,
    latestMigration: versions.at(-1),
    productionMutation: false
  });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/production-readiness-gate.mjs')) {
  runProductionRepositoryGate().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
