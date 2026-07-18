import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { deployFiles, sourceScripts } from './project-files.mjs';

const failures = [];
const fail = message => failures.push(message);
const backendSourceFiles = [
  'database/apply-role-grants.mjs',
  'database/import-snapshot.mjs',
  'database/migrate.mjs',
  'database/snapshot-mapper.mjs',
  'database/staging-backup-restore.mjs',
  'server/app.mjs',
  'server/commands.mjs',
  'server/db.mjs',
  'server/errors.mjs',
  'server/index.mjs',
  'server/jwt-verifier.mjs',
  'server/oidc-readiness.mjs',
  'server/tenant-context.mjs',
  'server/validation.mjs',
  'scripts/oidc-readiness.mjs',
  'tests/oidc-readiness.test.mjs',
  'tests/postgres-backup-restore.test.mjs',
  'tests/postgres-staging-integration.test.mjs'
];

for (const file of deployFiles) {
  try {
    await access(file);
  } catch {
    fail(`缺少發布資產：${file}`);
  }
}

for (const file of [...sourceScripts, ...backendSourceFiles]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${file} 語法錯誤：${result.stderr.trim()}`);
}

const appsScript = await readFile('google-sheets-backend.gs', 'utf8');
const appsScriptCheck = spawnSync(process.execPath, ['--check', '-'], {
  input: appsScript,
  encoding: 'utf8'
});
if (appsScriptCheck.status !== 0) {
  fail(`google-sheets-backend.gs 語法錯誤：${appsScriptCheck.stderr.trim()}`);
}

try {
  JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
} catch (error) {
  fail(`manifest.webmanifest 無效：${error.message}`);
}

const html = await readFile('index.html', 'utf8');
const referencedAssets = [
  ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)
].map(match => match[1]).filter(value => !/^(?:https?:|data:|#)/.test(value));

for (const asset of referencedAssets) {
  if (!deployFiles.includes(asset)) fail(`index.html 引用未列入發布白名單的資產：${asset}`);
}

const forbiddenDeployFiles = [
  'firebase-cloud.js',
  'firebase-config.js',
  'firestore.rules',
  'supabase-config.js',
  'supabase-schema.sql'
];
for (const file of forbiddenDeployFiles) {
  if (deployFiles.includes(file)) fail(`未啟用雲端設定不可進入 production build：${file}`);
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`品質檢查通過：${sourceScripts.length} 個前端腳本、1 個 Apps Script、${deployFiles.length} 個發布資產。`);
