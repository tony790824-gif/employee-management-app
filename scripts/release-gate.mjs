import { readFile, readdir } from 'node:fs/promises';
import { deployFiles } from './project-files.mjs';

const failures = [];
const fail = message => failures.push(message);
const expectedFiles = [...deployFiles].sort();
let actualFiles = [];

try {
  actualFiles = (await readdir('dist', { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
} catch (error) {
  fail(`找不到正式建置輸出 dist/：${error.message}`);
}

if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  fail(`dist/ 檔案與發布白名單不一致；預期 ${expectedFiles.length} 個，實際 ${actualFiles.length} 個。`);
}

for (const file of expectedFiles) {
  try {
    const [source, built] = await Promise.all([readFile(file), readFile(`dist/${file}`)]);
    if (!source.equals(built)) fail(`建置檔案與來源不一致：${file}`);
  } catch (error) {
    fail(`無法驗證發布檔案 ${file}：${error.message}`);
  }
}

const sensitivePatterns = [
  'SHIFT_APP_CREDENTIAL_PEPPER',
  'SHIFT_APP_RESTORE_CONFIRMATION',
  'SHIFT_APP_LAST_BACKUP_FILE_ID',
  'banke-recovery-v1'
];
for (const file of actualFiles) {
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

console.log(`本機發布閘門通過：${actualFiles.length} 個白名單資產與後端維運文件均已驗證。`);
console.log('正式發布前仍必須在 Apps Script 執行 createOperationalBackup() 與 runReleaseReadinessCheck()。');
