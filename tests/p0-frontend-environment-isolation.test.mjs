import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { environmentProfiles } from '../config/environments.mjs';

const build = environment => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs', `--environment=${environment}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `Failed to build ${environment}`);
};

const rehearsalBuild = spawnSync(process.execPath, ['scripts/build.mjs', '--environment=staging', '--postgres-rehearsal'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    BANKE_STAGING_POSTGRES_API_URL: 'https://api.staging.example/v1',
    BANKE_STAGING_WORKSPACE_ID: `ws_${'a'.repeat(32)}`
  }
});
assert.equal(rehearsalBuild.status, 0, rehearsalBuild.stderr || 'Failed to build isolated PostgreSQL rehearsal');

build('local');
build('staging');

assert.equal(environmentProfiles.production.storagePrefix, '', 'Production 必須維持既有 storage key 相容性');
assert.equal(environmentProfiles.staging.storagePrefix, 'banke:staging:');
assert.equal(environmentProfiles.local.storagePrefix, 'banke:local:');
assert.notEqual(environmentProfiles.staging.backendUrl, environmentProfiles.production.backendUrl);
assert.equal(environmentProfiles.local.dataBackend, 'local_preview');
assert.equal(environmentProfiles.staging.dataBackend, 'google_sheets');
assert.equal(environmentProfiles.production.dataBackend, 'google_sheets');
for (const profile of Object.values(environmentProfiles)) {
  assert.equal(profile.postgresApiUrl, '', `${profile.name} must not activate PostgreSQL before cutover approval`);
}

const stagingFiles = await readdir('dist-staging');
const stagingText = (await Promise.all(stagingFiles
  .filter(file => /\.(?:js|html|webmanifest)$/.test(file))
  .map(file => readFile(`dist-staging/${file}`, 'utf8')))).join('\n');
assert.ok(stagingText.includes(environmentProfiles.staging.backendUrl), 'Staging build 必須包含 Staging backend');
assert.ok(!stagingText.includes(environmentProfiles.production.backendUrl), 'Staging build 不得包含 Production backend');

const stagingEnvironment = await readFile('dist-staging/environment-config.js', 'utf8');
assert.match(stagingEnvironment, /"label": "STAGING"/);
assert.match(stagingEnvironment, /"storagePrefix": "banke:staging:"/);

const entryHtml = await readFile('index.html', 'utf8');
assert.match(entryHtml, /LOCAL_PREVIEW = window\.shiftEnvironment\?\.name === 'local'/);
assert.ok(
  entryHtml.indexOf('state-store.js') < entryHtml.indexOf('postgres-cloud.js'),
  'PostgreSQL adapter must load after the state store it depends on'
);

const loginSource = await readFile('login.js', 'utf8');
assert.match(loginSource, /dataBackend === 'postgres'[\s\S]*Auth0 owns restoration/,
  'PostgreSQL rehearsal reload must not resume a Google Sheets session');
assert.doesNotMatch(entryHtml, /has\('preview'\)/, 'URL 參數不得在 Staging 或 Production 繞過登入');

const stagingWorker = await readFile('dist-staging/service-worker.js', 'utf8');
assert.match(stagingWorker, /const CACHE_PREFIX='banke-staging-'/);
assert.match(stagingWorker, /const CACHE='banke-staging-v1'/);
assert.match(stagingWorker, /key\.startsWith\(CACHE_PREFIX\)/, 'Service Worker 只能清除同環境 cache');
assert.doesNotMatch(stagingWorker, /banke-production-/);

const rehearsalEnvironment = await readFile('dist-staging-postgres/environment-config.js', 'utf8');
assert.match(rehearsalEnvironment, /"dataBackend": "postgres"/);
assert.match(rehearsalEnvironment, /https:\/\/api\.staging\.example\/v1/);
assert.match(rehearsalEnvironment, /"storagePrefix": "banke:staging-postgres:"/);
assert.doesNotMatch(rehearsalEnvironment, new RegExp(environmentProfiles.production.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const rehearsalWorker = await readFile('dist-staging-postgres/service-worker.js', 'utf8');
assert.match(rehearsalWorker, /banke-staging-postgres-v1/);
assert.doesNotMatch(rehearsalWorker, /banke-production-/);

const stagingManifest = JSON.parse(await readFile('dist-staging/manifest.webmanifest', 'utf8'));
assert.equal(stagingManifest.id, './?app=banke-staging');
assert.equal(stagingManifest.name, '班表管理 STAGING');
assert.equal(stagingManifest.start_url, './?app=banke-staging');

for (const file of ['state-store.js', 'access.js', 'cloud-sync.js', 'google-sheets-cloud.js', 'login.js']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /shiftEnvironment\?\.storageKey/, `${file} 必須使用環境 storage namespace`);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\('(shift-[^']+)'/, `${file} 不得直接使用未隔離的 shift-* key`);
}

console.log('P0 frontend environment isolation tests passed.');
