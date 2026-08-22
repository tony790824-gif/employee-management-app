import { readFile, readdir, stat } from 'node:fs/promises';
import { deployFiles } from './project-files.mjs';

const failures = [];
const fail = message => failures.push(message);
const expectedFiles = [...deployFiles, 'staging-auth.js'].sort();
const auth0VendorFile = 'vendor/auth0-spa-js.production.js';
const generatedBuildFiles = new Set([
  'environment-config.js',
  '_headers',
  'index.html',
  'manifest.webmanifest',
  'service-worker.js'
]);
let actualFiles = [];
let vendorFiles = [];
const MAX_FRONTEND_BYTES = 2_000_000;
const MAX_SINGLE_ASSET_BYTES = 500_000;

try {
  actualFiles = (await readdir('dist', { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
} catch (error) {
  fail(`找不到正式建置輸出 dist/：${error.message}`);
}

try {
  vendorFiles = (await readdir('dist/vendor', { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
} catch (error) {
  fail(`找不到正式建置的 Auth0 vendor 資產：${error.message}`);
}

if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  fail(`dist/ 檔案與發布白名單不一致；預期 ${expectedFiles.length} 個，實際 ${actualFiles.length} 個。`);
}
if (JSON.stringify(vendorFiles) !== JSON.stringify(['auth0-spa-js.production.js'])) {
  fail('dist/vendor/ 必須只包含鎖定的 Auth0 SPA SDK browser bundle。');
}

let totalFrontendBytes = 0;
const releaseFiles = [...actualFiles, auth0VendorFile];
for (const file of releaseFiles) {
  const size = (await stat(`dist/${file}`)).size;
  totalFrontendBytes += size;
  if (size > MAX_SINGLE_ASSET_BYTES) fail(`發布資產超過 500 KB 預算：${file}`);
}

try {
  const [installedSdk, builtSdk] = await Promise.all([
    readFile('node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js'),
    readFile(`dist/${auth0VendorFile}`)
  ]);
  if (!installedSdk.equals(builtSdk)) fail('建置的 Auth0 SPA SDK 與鎖定套件內容不一致。');
} catch (error) {
  fail(`無法驗證 Auth0 SPA SDK vendor 資產：${error.message}`);
}
if (totalFrontendBytes > MAX_FRONTEND_BYTES) fail('Production frontend 超過 2 MB 總資產預算。');

for (const file of expectedFiles) {
  try {
    const [source, built] = await Promise.all([readFile(file), readFile(`dist/${file}`)]);
    if (!generatedBuildFiles.has(file) && !source.equals(built)) fail(`建置檔案與來源不一致：${file}`);
  } catch (error) {
    fail(`無法驗證發布檔案 ${file}：${error.message}`);
  }
}

const productionEnvironment = await readFile('dist/environment-config.js', 'utf8');
if (!productionEnvironment.includes('"name": "production"')) fail('Production build 缺少 production 環境識別。');
if (productionEnvironment.includes('banke:staging:') || productionEnvironment.includes('STAGING')) fail('Production build 混入 Staging 設定。');
const productionManifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
if (productionManifest.id !== './?app=banke-production') fail('Production PWA manifest id 不正確。');
const productionHeaders = await readFile('dist/_headers', 'utf8');
const productionIndex = await readFile('dist/index.html', 'utf8');
for (const requiredHeader of [
  'Content-Security-Policy:',
  "frame-ancestors 'none'",
  "object-src 'none'",
  'Strict-Transport-Security:',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: no-referrer',
  'Permissions-Policy:'
]) {
  if (!productionHeaders.includes(requiredHeader)) fail(`Production build 缺少安全標頭：${requiredHeader}`);
}
if (productionHeaders.includes('bankeban-staging-node-api')) {
  fail('Production security headers 不得允許 Staging API。');
}
if (productionHeaders.includes('cdn.auth0.com') || productionIndex.includes('cdn.auth0.com') ||
    !productionIndex.includes('src="/vendor/auth0-spa-js.production.js"')) {
  fail('Production 必須只從 same-origin vendor 資產載入 Auth0 SPA SDK。');
}
if (productionEnvironment.includes('https://bankeban-staging-api') ||
    productionEnvironment.includes('nOBwjFDzFaEVnsWCfeoofsCyeDMqkrMu')) {
  fail('Production build 不得重用 Staging Auth0 Application 或 API audience。');
}

const sensitivePatterns = [
  'SHIFT_APP_CREDENTIAL_PEPPER',
  'SHIFT_APP_RESTORE_CONFIRMATION',
  'SHIFT_APP_LAST_BACKUP_FILE_ID',
  'banke-recovery-v1'
];
for (const file of releaseFiles) {
  const content = await readFile(`dist/${file}`, 'utf8');
  for (const pattern of sensitivePatterns) {
    if (content.includes(pattern)) fail(`後端維運密鑰或復原實作不可進入前端發布檔：${file} (${pattern})`);
  }
}

const backend = await readFile('google-sheets-backend.gs', 'utf8');
for (const requiredFunction of [
  'function createOperationalBackup()',
  'function verifyLatestOperationalBackup()',
  'function restoreLatestOperationalBackup()',
  'function runReleaseReadinessCheck()'
]) {
  if (!backend.includes(requiredFunction)) fail(`Apps Script 缺少發布必要維運函式：${requiredFunction}`);
}

for (const requiredDocument of [
  'docs/RUNBOOK.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/adr/0010-operational-recovery.md',
  'docs/reviews/P0_BACKUP_RECOVERY_REVIEW.md'
]) {
  try { await readFile(requiredDocument); } catch { fail(`缺少發布／復原文件：${requiredDocument}`); }
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`本機發布閘門通過：${releaseFiles.length} 個白名單資產、${totalFrontendBytes} bytes 與後端維運文件均已驗證。`);
console.log('Production PostgreSQL runtime configuration and external service smoke checks remain deployment-time validations.');
