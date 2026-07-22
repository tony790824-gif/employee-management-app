import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const blueprint = await readFile('render.yaml', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const runbook = await readFile('docs/STAGING_NODE_API_HOSTING.md', 'utf8');

const requiredBlueprintLines = [
  'name: bankeban-staging-node-api',
  'type: web',
  'runtime: node',
  'plan: free',
  'region: singapore',
  'branch: main',
  'autoDeployTrigger: off',
  'buildCommand: corepack enable && pnpm install --frozen-lockfile --prod',
  'startCommand: node server/index.mjs',
  'healthCheckPath: /v1/readiness',
  'key: BANK_ENV',
  'value: staging',
  'key: BANK_API_BIND_HOST',
  'value: 0.0.0.0',
  'key: DATABASE_SSL',
  'value: require',
  'key: BANK_OIDC_AUDIENCE',
  'value: https://bankeban-staging-api',
  'key: BANK_OIDC_SESSION_CLAIM',
  'value: https://banke.tw/session_id'
];

for (const line of requiredBlueprintLines) {
  assert.ok(blueprint.includes(line), `render.yaml is missing the required Staging setting: ${line}`);
}

for (const key of [
  'DATABASE_API_URL',
  'BANK_STAGING_DATABASE_HOST',
  'BANK_OIDC_ISSUER',
  'BANK_OIDC_JWKS_URL',
  'BANK_TENANT_CONTEXT_KEY',
  'BANK_TENANT_CONTEXT_KEY_ID',
  'BANK_ALLOWED_ORIGINS'
]) {
  assert.match(
    blueprint,
    new RegExp(`- key: ${key}\\r?\\n\\s+sync: false`),
    `${key} must be entered in the Render secret/configuration UI and must not be committed.`
  );
}

assert.doesNotMatch(blueprint, /BANK_ENV:\s*production|value:\s*production/i);
assert.doesNotMatch(blueprint, /postgres(?:ql)?:\/\//i, 'Database credentials must never be committed to render.yaml.');
assert.doesNotMatch(blueprint, /preDeployCommand|db:migrate|0011_ui_bootstrap/i, 'Hosting must not apply migrations.');
assert.doesNotMatch(blueprint, /autoDeployTrigger:\s*(?:commit|checksPass)/i, 'Automatic deployment must remain disabled.');
assert.match(packageJson.scripts.test, /tests\/staging-node-hosting\.test\.mjs/);
assert.match(runbook, /0011_ui_bootstrap.*not applied/i);
assert.match(runbook, /Production.*not modified/i);

console.log('Isolated Staging Node hosting configuration tests passed.');
