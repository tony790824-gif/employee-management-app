import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { deployFiles } from './project-files.mjs';
import { getEnvironmentProfile } from '../config/environments.mjs';

const requestedEnvironment = process.argv.find(value => value.startsWith('--environment='))?.split('=')[1]
  || process.env.BANKE_BUILD_ENV
  || 'production';
const profile = getEnvironmentProfile(requestedEnvironment);
const postgresRehearsal = requestedEnvironment === 'staging' && process.argv.includes('--postgres-rehearsal');
const rehearsalApiUrl = String(process.env.BANKE_STAGING_POSTGRES_API_URL || '').trim();
const rehearsalWorkspaceId = String(process.env.BANKE_STAGING_WORKSPACE_ID || '').trim();
if (postgresRehearsal) {
  const url = new URL(rehearsalApiUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('BANKE_STAGING_POSTGRES_API_URL must be a credential-free HTTPS URL.');
  }
  if (!/^ws_[a-f0-9]{32}$/.test(rehearsalWorkspaceId)) {
    throw new Error('BANKE_STAGING_WORKSPACE_ID format is invalid.');
  }
}
const effectiveProfile = postgresRehearsal ? Object.freeze({
  ...profile,
  label: 'STAGING POSTGRES',
  dataBackend: 'postgres',
  postgresApiUrl: rehearsalApiUrl.replace(/\/$/, ''),
  postgresWorkspaceId: rehearsalWorkspaceId,
  storagePrefix: 'banke:staging-postgres:',
  cachePrefix: 'banke-staging-postgres-',
  cacheName: 'banke-staging-postgres-v4',
  manifest: Object.freeze({
    id: './?app=banke-staging-postgres', name: '班表管理 STAGING POSTGRES',
    shortName: '班表 STG PG', startUrl: './?app=banke-staging-postgres'
  })
}) : profile;
const outputDirectory = postgresRehearsal ? 'dist-staging-postgres'
  : profile.name === 'production' ? 'dist' : `dist-${profile.name}`;
const cacheRevision = encodeURIComponent(effectiveProfile.cacheName);
const cacheCleanupPrefix = profile.name === 'staging' ? profile.cachePrefix : effectiveProfile.cachePrefix;
const auth0SdkUrl = 'https://cdn.auth0.com/js/auth0-spa-js/2.11/auth0-spa-js.production.js';
const auth0SdkIntegrity = 'sha384-6cnw/e3NUTHp0Du1Qjh1PjnZ6N0XOX/NW2oX3rXiTDHPJ9hjENz/8G2qT1RzUDWd';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of deployFiles) {
  await cp(file, `${outputDirectory}/${file}`);
}

const runtimeConfig = `(() => {
  const config = Object.freeze(${JSON.stringify({
    name: effectiveProfile.name,
    label: effectiveProfile.label,
    dataBackend: effectiveProfile.dataBackend,
    backendUrl: effectiveProfile.backendUrl,
    postgresApiUrl: effectiveProfile.postgresApiUrl,
    ...(effectiveProfile.postgresWorkspaceId ? { postgresWorkspaceId: effectiveProfile.postgresWorkspaceId } : {}),
    storagePrefix: effectiveProfile.storagePrefix,
    serviceWorkerUrl: './service-worker.js',
    ...(profile.auth ? { auth: profile.auth } : {})
  }, null, 2)});
  const storageKey = key => \`${'${config.storagePrefix}'}${'${key}'}\`;
  window.shiftEnvironment = Object.freeze({ ...config, storageKey });
  document.documentElement.dataset.appEnvironment = config.name;
  if (!config.label) return;
  document.title = \`[${'${config.label}'}] ${'${document.title}'}\`;
  window.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div');
    badge.id = 'environmentBadge';
    badge.className = 'environment-badge';
    badge.setAttribute('role', 'status');
    badge.textContent = config.label;
    document.body.prepend(badge);
  }, { once: true });
})();
`;
await writeFile(`${outputDirectory}/environment-config.js`, runtimeConfig, 'utf8');

const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
manifest.id = effectiveProfile.manifest.id;
manifest.name = effectiveProfile.manifest.name;
manifest.short_name = effectiveProfile.manifest.shortName;
manifest.start_url = effectiveProfile.manifest.startUrl;
await writeFile(`${outputDirectory}/manifest.webmanifest`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const serviceWorker = (await readFile('service-worker.js', 'utf8'))
  .replace("const CACHE_PREFIX='banke-production-';", `const CACHE_PREFIX='${cacheCleanupPrefix}';`)
  .replace("const CACHE='banke-production-v1';", `const CACHE='${effectiveProfile.cacheName}';`)
  .replace("'./environment-config.js'", `'./environment-config.js?v=${cacheRevision}'`)
  .replace("'./manifest.webmanifest'", `'./manifest.webmanifest?v=${cacheRevision}'`);
await writeFile(`${outputDirectory}/service-worker.js`, serviceWorker, 'utf8');

const indexPath = `${outputDirectory}/index.html`;
const originalIndexHtml = await readFile(indexPath, 'utf8');
let builtIndexHtml = originalIndexHtml
  .replace('src="environment-config.js"', `src="environment-config.js?v=${cacheRevision}"`)
  .replace('href="manifest.webmanifest"', `href="manifest.webmanifest?v=${cacheRevision}"`);
if (builtIndexHtml === originalIndexHtml) {
  throw new Error('Unable to add the environment cache revision to the frontend entry point.');
}

if (profile.name === 'staging') {
  await cp('staging-auth.js', `${outputDirectory}/staging-auth.js`);
  const stagingAuthScripts = [
    `    <script src="${auth0SdkUrl}" integrity="${auth0SdkIntegrity}" crossorigin="anonymous"></script>`,
    '    <script src="staging-auth.js"></script>'
  ].join('\n');
  const stagingIndexHtml = builtIndexHtml.replace(
    '    <script src="pwa.js"></script>',
    `${stagingAuthScripts}\n    <script src="pwa.js"></script>`
  );
  if (stagingIndexHtml === builtIndexHtml) throw new Error('Unable to inject the Staging Auth0 entry point.');
  builtIndexHtml = stagingIndexHtml;
}
await writeFile(indexPath, builtIndexHtml, 'utf8');

console.log(`Built ${profile.name} frontend (${deployFiles.length} assets) in ${outputDirectory}/.`);
