import assert from 'node:assert/strict';
import vm from 'node:vm';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { environmentProfiles, getEnvironmentProfile } from '../config/environments.mjs';
import { deployFiles } from '../scripts/project-files.mjs';

const build = (environment, env = process.env) => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs', `--environment=${environment}`], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr || `Failed to build ${environment}`);
};
const productionApi = 'https://api.production.example/v1';
const productionInputs = {
  BANKE_PRODUCTION_POSTGRES_API_URL: productionApi,
  BANKE_PRODUCTION_WORKSPACE_ID: `ws_${'b'.repeat(32)}`
};
const savedInputs = { ...process.env };
try {
  Object.assign(process.env, productionInputs);
  assert.equal(getEnvironmentProfile('production').postgresApiUrl, productionApi);
  for (const invalid of ['', 'postgresql://user:secret@database.example/neondb',
    'https://user:secret@api.example/v1', 'http://api.example/v1', 'https://localhost/v1',
    'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://api.staging.example/v1',
    'https://steady-salmiakki-4aaa19.netlify.app/v1', 'https://api.example/.netlify/functions/api',
    'https://api.example/v1?secret=value', 'https://api.example/v1#fragment']) {
    process.env.BANKE_PRODUCTION_POSTGRES_API_URL = invalid;
    assert.throws(() => getEnvironmentProfile('production'), /^Error: PRODUCTION_API_URL_[A-Z_]+$/);
  }
  process.env.BANKE_PRODUCTION_POSTGRES_API_URL = productionApi;
  process.env.BANKE_PRODUCTION_WORKSPACE_ID = '';
  assert.throws(() => getEnvironmentProfile('production'), /PRODUCTION_WORKSPACE_ID_REQUIRED_OR_INVALID/);
} finally {
  for (const key of Object.keys(productionInputs)) {
    if (Object.hasOwn(savedInputs, key)) process.env[key] = savedInputs[key];
    else delete process.env[key];
  }
}

const rehearsalBuild = spawnSync(process.execPath, ['scripts/build.mjs', '--environment=staging', '--postgres-rehearsal'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    BANKE_STAGING_POSTGRES_API_URL: 'https://api.staging.example/v1',
    BANKE_STAGING_WORKSPACE_ID: `ws_${'a'.repeat(32)}`,
    BANK_WEB_PUSH_PUBLIC_KEY: 'B'.repeat(87)
  }
});
assert.equal(rehearsalBuild.status, 0, rehearsalBuild.stderr || 'Failed to build isolated PostgreSQL rehearsal');

build('local');
build('staging');
build('production', {
  ...process.env,
  ...productionInputs,
  DATABASE_API_URL: 'postgresql://test:secret@database.invalid/neondb',
  BANK_TENANT_CONTEXT_KEY: 'SYNTHETIC_SERVER_ONLY_MARKER',
  BANKE_PRODUCTION_AUTH0_DOMAIN: 'production-tenant.us.auth0.com',
  BANKE_PRODUCTION_AUTH0_CLIENT_ID: 'production-client-id',
  BANKE_PRODUCTION_AUTH0_AUDIENCE: 'https://bankeban-production-api'
});

assert.equal(environmentProfiles.production.storagePrefix, '', 'Production 必須維持既有 storage key 相容性');
assert.equal(environmentProfiles.staging.storagePrefix, 'banke:staging:');
assert.equal(environmentProfiles.local.storagePrefix, 'banke:local:');
assert.notEqual(environmentProfiles.staging.backendUrl, environmentProfiles.production.backendUrl);
assert.equal(environmentProfiles.local.dataBackend, 'local_preview');
assert.equal(environmentProfiles.staging.dataBackend, 'google_sheets');
assert.equal(environmentProfiles.production.dataBackend, 'postgres');
assert.equal(environmentProfiles.local.postgresApiUrl, '');
assert.equal(environmentProfiles.staging.postgresApiUrl, '');
assert.equal(environmentProfiles.production.postgresApiUrl, '', 'No implicit Production endpoint');

const productionEnvironment = await readFile('dist/environment-config.js', 'utf8');
const productionHeaders = await readFile('dist/_headers', 'utf8');
const productionIndex = await readFile('dist/index.html', 'utf8');
const productionAuth0Sdk = await readFile('dist/vendor/auth0-spa-js.production.js', 'utf8');
assert.match(productionEnvironment, /"dataBackend": "postgres"/);
assert.ok(productionEnvironment.includes(productionApi));
assert.ok(productionEnvironment.includes(productionInputs.BANKE_PRODUCTION_WORKSPACE_ID));
assert.doesNotMatch(productionIndex, /<script src="(?:google-sheets-config|cloud-sync|google-sheets-cloud)\.js"/);
assert.doesNotMatch(productionEnvironment, /DATABASE_API_URL|DATABASE_PUSH_URL|BANK_TENANT_CONTEXT_KEY/);
assert.doesNotMatch(productionEnvironment, /database\.invalid|SYNTHETIC_SERVER_ONLY_MARKER/);
assert.match(productionEnvironment, /"clientId": "production-client-id"/);
assert.match(productionEnvironment, /"audience": "https:\/\/bankeban-production-api"/);
assert.doesNotMatch(productionEnvironment, /script\.google\.com|bankeban-staging-api|nOBwjFDzFaEVnsWCfeoofsCyeDMqkrMu/);
assert.match(productionHeaders, /https:\/\/production-tenant\.us\.auth0\.com/);
assert.doesNotMatch(productionHeaders, /https:\/\/cdn\.auth0\.com/);
assert.doesNotMatch(productionHeaders, /script\.google\.com|bankeban-staging-node-api/);
assert.match(productionIndex, /<script src="\/vendor\/auth0-spa-js\.production\.js"><\/script>/);
assert.doesNotMatch(productionIndex, /cdn\.auth0\.com|integrity=|crossorigin=/);
assert.match(productionAuth0Sdk, /createAuth0Client/);
assert.match(productionIndex, /<script src="staging-auth\.js"><\/script>/);

const stagingFiles = await readdir('dist-staging');
const stagingText = (await Promise.all(stagingFiles
  .filter(file => /\.(?:js|html|webmanifest)$/.test(file))
  .map(file => readFile(`dist-staging/${file}`, 'utf8')))).join('\n');
assert.ok(stagingText.includes(environmentProfiles.staging.backendUrl), 'Staging build 必須包含 Staging backend');
assert.ok(!stagingText.includes(productionApi), 'Staging build 不得包含 Production API');

const stagingEnvironment = await readFile('dist-staging/environment-config.js', 'utf8');
const stagingHeaders = await readFile('dist-staging/_headers', 'utf8');
assert.match(stagingEnvironment, /"label": "STAGING"/);
assert.match(stagingEnvironment, /"storagePrefix": "banke:staging:"/);
assert.match(stagingHeaders, /Content-Security-Policy:/);
assert.match(stagingHeaders, /https:\/\/script\.google\.com/);
assert.match(stagingHeaders, /https:\/\/dev-nkduawjn5itjlhx4\.us\.auth0\.com/);
assert.doesNotMatch(stagingHeaders, /bankeban-staging-node-api/);

const entryHtml = await readFile('index.html', 'utf8');
assert.match(entryHtml, /LOCAL_PREVIEW = window\.shiftEnvironment\?\.name === 'local'/);
assert.ok(
  entryHtml.indexOf('state-store.js') < entryHtml.indexOf('postgres-cloud.js'),
  'PostgreSQL adapter must load after the state store it depends on'
);
assert.ok(
  entryHtml.indexOf('state-store.js') < entryHtml.indexOf('postgres-offline.js')
    && entryHtml.indexOf('postgres-offline.js') < entryHtml.indexOf('postgres-cloud.js'),
  'PostgreSQL offline runtime must load between canonical state and the cloud adapter'
);

const loginSource = await readFile('login.js', 'utf8');
assert.match(loginSource, /dataBackend === 'postgres'[\s\S]*Auth0 owns restoration/,
  'PostgreSQL rehearsal reload must not resume a Google Sheets session');
assert.doesNotMatch(entryHtml, /has\('preview'\)/, 'URL 參數不得在 Staging 或 Production 繞過登入');

const stagingWorker = await readFile('dist-staging/service-worker.js', 'utf8');
const stagingIndex = await readFile('dist-staging/index.html', 'utf8');
assert.match(stagingWorker, /const CACHE_PREFIX='banke-staging-'/);
const stagingCache = stagingWorker.match(/const CACHE='(banke-staging-v1-[a-f0-9]{16})'/)?.[1];
assert.ok(stagingCache, 'Each build must have a content-derived cache revision');
assert.match(stagingWorker, /key\.startsWith\(CACHE_PREFIX\)/, 'Service Worker 只能清除 Staging cache family');
assert.match(stagingWorker, /environment-config\.js\?v=banke-staging-v1/);
assert.match(stagingWorker, /manifest\.webmanifest\?v=banke-staging-v1/);
assert.ok(stagingIndex.includes(`src="environment-config.js?v=${stagingCache}"`));
assert.ok(stagingIndex.includes(`href="manifest.webmanifest?v=${stagingCache}"`));
assert.doesNotMatch(stagingIndex, /src="environment-config\.js"/);
assert.doesNotMatch(stagingIndex, /href="manifest\.webmanifest"/);
assert.match(stagingWorker, /caches\.open\(CACHE\)\.then\(cache=>cache\.match\(request\)\)/);
assert.doesNotMatch(stagingWorker, /caches\.match\(/);
assert.doesNotMatch(stagingWorker, /banke-production-/);

const rehearsalEnvironment = await readFile('dist-staging-postgres/environment-config.js', 'utf8');
const rehearsalHeaders = await readFile('dist-staging-postgres/_headers', 'utf8');
assert.match(rehearsalEnvironment, /"dataBackend": "postgres"/);
assert.match(rehearsalEnvironment, /https:\/\/api\.staging\.example\/v1/);
assert.match(rehearsalEnvironment, /"storagePrefix": "banke:staging-postgres:"/);
assert.match(rehearsalEnvironment, /"backendUrl": ""/,
  'PostgreSQL rehearsal must not embed a Google Sheets backend URL');
assert.doesNotMatch(rehearsalEnvironment, new RegExp(environmentProfiles.staging.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  'PostgreSQL rehearsal must not load the Google Sheets Staging iframe');
assert.ok(!rehearsalEnvironment.includes(productionApi));
assert.match(rehearsalHeaders, /https:\/\/api\.staging\.example/);
assert.match(rehearsalHeaders, /https:\/\/dev-nkduawjn5itjlhx4\.us\.auth0\.com/);
assert.doesNotMatch(rehearsalHeaders, /script\.google\.com|AKfycbw/);
const rehearsalWorker = await readFile('dist-staging-postgres/service-worker.js', 'utf8');
const rehearsalNavigation = await readFile('dist-staging-postgres/notification-navigation.js', 'utf8');
const rehearsalIndex = await readFile('dist-staging-postgres/index.html', 'utf8');
assert.match(rehearsalWorker, /const CACHE_PREFIX='banke-staging-'/, 'PostgreSQL rehearsal 與正常 Staging 必須共用清除範圍');
assert.match(rehearsalWorker, /banke-staging-postgres-v12/);
assert.match(rehearsalWorker, /environment-config\.js\?v=banke-staging-postgres-v12/);
assert.match(rehearsalWorker, /manifest\.webmanifest\?v=banke-staging-postgres-v12/);
const rehearsalCache = rehearsalWorker.match(/const CACHE='(banke-staging-postgres-v12-[a-f0-9]{16})'/)?.[1];
assert.ok(rehearsalCache);
assert.ok(rehearsalIndex.includes(`src="environment-config.js?v=${rehearsalCache}"`));
assert.ok(rehearsalIndex.includes(`href="manifest.webmanifest?v=${rehearsalCache}"`));
assert.notEqual(
  stagingIndex.match(/environment-config\.js\?v=([^"]+)/)?.[1],
  rehearsalIndex.match(/environment-config\.js\?v=([^"]+)/)?.[1],
  'Google Sheets 與 PostgreSQL Staging 的環境設定 URL 不得相同'
);
assert.doesNotMatch(rehearsalWorker, /banke-production-/);
assert.match(rehearsalWorker, /BANKE_BOOTSTRAP_REVISION/);
assert.match(rehearsalWorker, /BANKE_BOOTSTRAP_REVISION_AVAILABLE/);
assert.match(rehearsalWorker, /__banke_bootstrap_revision__/);
assert.match(rehearsalEnvironment, /"webPushPublicKey": "B{87}"/);
assert.match(rehearsalWorker, /addEventListener\('push'/);
assert.match(rehearsalWorker, /addEventListener\('notificationclick'/);
assert.match(rehearsalWorker, /addEventListener\('pushsubscriptionchange'/);

const workerListeners = new Map();
const revisionWrites = [];
const revisionNotifications = [];
const workerSelf = {
  addEventListener: (type, listener) => workerListeners.set(type, listener),
  skipWaiting: async () => {},
  clients: {
    claim: async () => {},
    matchAll: async () => [
      { postMessage: message => revisionNotifications.push(structuredClone(message)) }
    ]
  }
};
let workerContext;
const workerSandbox = {
  self: workerSelf,
  importScripts: path => {
    assert.equal(path, './notification-navigation.js');
    vm.runInContext(rehearsalNavigation, workerContext, { filename: 'notification-navigation.js' });
  },
  caches: {
    open: async () => ({
      addAll: async () => {},
      match: async () => null,
      put: async (key, response) => revisionWrites.push({ key, body: await response.json() })
    }),
    keys: async () => [],
    delete: async () => true
  },
  fetch: async () => new Response('{}'),
  Response,
  JSON,
  Number,
  Promise
};
workerContext = vm.createContext(workerSandbox);
vm.runInContext(rehearsalWorker, workerContext, { filename: 'staging-postgres-service-worker.js' });
let revisionWork;
workerListeners.get('message')({
  data: { type: 'BANKE_BOOTSTRAP_REVISION', revision: 42 },
  waitUntil: promise => { revisionWork = promise; }
});
await revisionWork;
assert.deepEqual(revisionWrites, [{
  key: './__banke_bootstrap_revision__',
  body: { revision: 42 }
}], 'Service Worker must cache only the non-sensitive revision marker');
assert.deepEqual(revisionNotifications, [{
  type: 'BANKE_BOOTSTRAP_REVISION_AVAILABLE',
  revision: 42
}], 'Service Worker must notify controlled UI clients about the new revision');

const stagingManifest = JSON.parse(await readFile('dist-staging/manifest.webmanifest', 'utf8'));
assert.equal(stagingManifest.id, './?app=banke-staging');
assert.equal(stagingManifest.name, '班表管理 STAGING');
assert.equal(stagingManifest.start_url, './?app=banke-staging');

const pwaSource = await readFile('pwa.js', 'utf8');
assert.match(pwaSource, /updateViaCache:\s*'none'/, 'Service Worker 更新檢查不得使用舊 HTTP cache');

const googleSheetsCloudSource = await readFile('google-sheets-cloud.js', 'utf8');
assert.match(googleSheetsCloudSource, /shiftEnvironment\?\.dataBackend === 'postgres'/,
  'Google Sheets adapter must fail closed when the PostgreSQL backend is active');
vm.runInNewContext(await readFile('cloud-sync.js', 'utf8'), {
  window: { shiftEnvironment: { dataBackend: 'postgres' } },
  document: { querySelector() { throw new Error('Legacy UI must remain inactive'); } },
  localStorage: { setItem() { throw new Error('Legacy configuration must not overwrite PostgreSQL'); } }
});

for (const file of ['state-store.js', 'access.js', 'cloud-sync.js', 'google-sheets-cloud.js', 'login.js']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /shiftEnvironment\?\.storageKey/, `${file} 必須使用環境 storage namespace`);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\('(shift-[^']+)'/, `${file} 不得直接使用未隔離的 shift-* key`);
}

// Exercise an installed Production app shell without contacting an API or Auth0.
const productionWorker = await readFile('dist/service-worker.js', 'utf8');
const productionListeners = new Map();
const cachedAssets = new Map();
const deletedCaches = [];
const productionCache = productionWorker.match(/const CACHE='([^']+)'/)[1];
const toPath = value => new URL(typeof value === 'string' ? value : value.url, 'https://app.example/').pathname;
const cacheKey = value => new URL(typeof value === 'string' ? value : value.url, 'https://app.example/').href;
const offlineContext = vm.createContext({
  self: {
    addEventListener: (type, listener) => productionListeners.set(type, listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  },
  importScripts: () => {},
  caches: {
    open: async name => {
      assert.equal(name, productionCache);
      return {
        addAll: async files => {
          for (const file of files) {
            const asset = toPath(file) === '/' ? 'index.html' : toPath(file).slice(1);
            cachedAssets.set(cacheKey(file), await readFile(`dist/${asset}`));
          }
        },
        match: async request => {
          const body = cachedAssets.get(cacheKey(request));
          return body ? new Response(body) : undefined;
        }
      };
    },
    keys: async () => ['banke-production-v2', productionCache, stagingCache],
    delete: async name => { deletedCaches.push(name); return true; }
  },
  fetch: async () => { throw new Error('OFFLINE'); },
  Response,
  URL
});
vm.runInContext(productionWorker, offlineContext);
let lifecycle;
productionListeners.get('install')({ waitUntil: work => { lifecycle = work; } });
await lifecycle;
productionListeners.get('activate')({ waitUntil: work => { lifecycle = work; } });
await lifecycle;
assert.deepEqual(deletedCaches, ['banke-production-v2'], 'Updates must keep other environments isolated');

for (const match of productionIndex.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const url = new URL(match[1], 'https://app.example/');
  if (url.origin !== 'https://app.example' || !/\.(?:js|css|svg|webmanifest)$/.test(url.pathname)) continue;
  let response;
  productionListeners.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: url.href },
    respondWith: work => { response = work; }
  });
  assert.ok((await response)?.ok, `Installed app must load ${url.pathname} offline`);
}
for (const asset of ['login.js', 'postgres-cloud.js', 'staging-auth.js', 'vendor/auth0-spa-js.production.js']) {
  assert.ok(cachedAssets.has(cacheKey(`./${asset}`)), `${asset} must not be omitted from the offline shell`);
}
let navigation;
productionListeners.get('fetch')({
  request: { method: 'GET', mode: 'navigate', url: 'https://app.example/?app=banke-production' },
  respondWith: work => { navigation = work; }
});
assert.equal(await (await navigation).text(), productionIndex);
let apiResponse;
productionListeners.get('fetch')({
  request: { method: 'GET', mode: 'cors', url: 'https://app.example/v1/bootstrap' },
  respondWith: work => { apiResponse = work; }
});
await assert.rejects(apiResponse, /OFFLINE/, 'Private API responses must not enter the static app cache');

// Build in a disposable folder so update regressions never modify the working source.
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'banke-pwa-build-'));
try {
  for (const file of [...deployFiles, 'staging-auth.js', 'scripts/build.mjs', 'scripts/project-files.mjs',
    'config/environments.mjs', 'config/security-headers.mjs',
    'node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js']) {
    const destination = path.join(fixtureRoot, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(file, destination);
  }
  const fixtureEnv = {
    ...process.env,
    ...productionInputs,
    BANKE_PRODUCTION_AUTH0_DOMAIN: 'production-tenant.us.auth0.com',
    BANKE_PRODUCTION_AUTH0_CLIENT_ID: 'production-client-id',
    BANKE_PRODUCTION_AUTH0_AUDIENCE: 'https://bankeban-production-api'
  };
  const fixtureBuild = async () => {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', '--environment=production'], {
      cwd: fixtureRoot, env: fixtureEnv, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    return readFile(path.join(fixtureRoot, 'dist/service-worker.js'), 'utf8');
  };
  let previous = await fixtureBuild();
  assert.equal(await fixtureBuild(), previous, 'Identical inputs must produce an identical worker');
  for (const file of ['app.js', 'staging-auth.js', 'node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js', 'scripts/build.mjs']) {
    const input = path.join(fixtureRoot, file);
    await writeFile(input, `${await readFile(input, 'utf8')}\n// update regression fixture\n`);
    const updated = await fixtureBuild();
    assert.notEqual(updated, previous, `${file} changes must invalidate installed caches`);
    previous = updated;
  }
  fixtureEnv.BANKE_PRODUCTION_AUTH0_CLIENT_ID = 'updated-production-client-id';
  assert.notEqual(await fixtureBuild(), previous, 'Runtime configuration changes must invalidate caches');
  previous = await fixtureBuild();
  fixtureEnv.BANKE_PRODUCTION_POSTGRES_API_URL = 'https://replacement.production.example/v1';
  assert.notEqual(await fixtureBuild(), previous, 'API route changes must invalidate installed caches');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log('P0 frontend environment isolation, offline app shell and update tests passed.');
