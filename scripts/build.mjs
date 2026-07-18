import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { deployFiles } from './project-files.mjs';
import { getEnvironmentProfile } from '../config/environments.mjs';

const requestedEnvironment = process.argv.find(value => value.startsWith('--environment='))?.split('=')[1]
  || process.env.BANKE_BUILD_ENV
  || 'production';
const profile = getEnvironmentProfile(requestedEnvironment);
const outputDirectory = profile.name === 'production' ? 'dist' : `dist-${profile.name}`;
const auth0SdkUrl = 'https://cdn.auth0.com/js/auth0-spa-js/2.11/auth0-spa-js.production.js';
const auth0SdkIntegrity = 'sha384-6cnw/e3NUTHp0Du1Qjh1PjnZ6N0XOX/NW2oX3rXiTDHPJ9hjENz/8G2qT1RzUDWd';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of deployFiles) {
  await cp(file, `${outputDirectory}/${file}`);
}

const runtimeConfig = `(() => {
  const config = Object.freeze(${JSON.stringify({
    name: profile.name,
    label: profile.label,
    backendUrl: profile.backendUrl,
    storagePrefix: profile.storagePrefix,
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
manifest.id = profile.manifest.id;
manifest.name = profile.manifest.name;
manifest.short_name = profile.manifest.shortName;
manifest.start_url = profile.manifest.startUrl;
await writeFile(`${outputDirectory}/manifest.webmanifest`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const serviceWorker = (await readFile('service-worker.js', 'utf8'))
  .replace("const CACHE_PREFIX='banke-production-';", `const CACHE_PREFIX='${profile.cachePrefix}';`)
  .replace("const CACHE='banke-production-v1';", `const CACHE='${profile.cacheName}';`);
await writeFile(`${outputDirectory}/service-worker.js`, serviceWorker, 'utf8');

if (profile.name === 'staging') {
  await cp('staging-auth.js', `${outputDirectory}/staging-auth.js`);
  const indexPath = `${outputDirectory}/index.html`;
  const indexHtml = await readFile(indexPath, 'utf8');
  const stagingAuthScripts = [
    `    <script src="${auth0SdkUrl}" integrity="${auth0SdkIntegrity}" crossorigin="anonymous"></script>`,
    '    <script src="staging-auth.js"></script>'
  ].join('\n');
  const stagingIndexHtml = indexHtml.replace(
    '    <script src="pwa.js"></script>',
    `${stagingAuthScripts}\n    <script src="pwa.js"></script>`
  );
  if (stagingIndexHtml === indexHtml) throw new Error('Unable to inject the Staging Auth0 entry point.');
  await writeFile(indexPath, stagingIndexHtml, 'utf8');
}

console.log(`Built ${profile.name} frontend (${deployFiles.length} assets) in ${outputDirectory}/.`);
