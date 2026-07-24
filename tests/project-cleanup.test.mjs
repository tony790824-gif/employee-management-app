import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [app, management, cloud, config, environmentConfig, serviceWorker, enhancements, projectFiles, packageJson, runbook] = await Promise.all([
  readFile('app.js', 'utf8'),
  readFile('management-actions.js', 'utf8'),
  readFile('google-sheets-cloud.js', 'utf8'),
  readFile('google-sheets-config.js', 'utf8'),
  readFile('environment-config.js', 'utf8'),
  readFile('service-worker.js', 'utf8'),
  readFile('enhancements.js', 'utf8'),
  readFile('scripts/project-files.mjs', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('docs/RUNBOOK.md', 'utf8')
]);

for (const formId of ['employeeForm', 'shiftForm', 'attendanceForm']) {
  assert.doesNotMatch(app, new RegExp(`\\$\\('#${formId}'\\)\\.addEventListener`), `${formId} 不得在 app.js 重複綁定`);
  assert.match(management, new RegExp(`\\$\\('#${formId}'\\)\\.addEventListener`), `${formId} 必須由單一管理模組處理`);
}
assert.doesNotMatch(management, /stopImmediatePropagation/, '單一管理模組不應再依賴事件攔截順序');
assert.match(management, /persistBossChange/, '老闆修改必須共用一致的雲端提交流程');
assert.match(management, /window\.shiftBossData = Object\.freeze/, '老闆資料提交必須提供單一共用 API');
assert.doesNotMatch(app, /const sample\s*=/, '正式程式不得內建範例員工');

assert.match(environmentConfig, /https:\/\/script\.google\.com\/macros\/s\//, 'Google Sheets API URL 必須保留在唯一設定檔');
assert.match(config, /shiftEnvironment\?\.backendUrl/, 'Google Sheets API URL 必須由環境設定提供');
assert.doesNotMatch(cloud, /https:\/\/script\.google\.com\/macros\/s\//, '雲端模組不得重複硬編碼 API URL');
assert.match(cloud, /缺少 Google Sheets Web App URL 設定/, '缺少 API 設定時必須明確失敗');

assert.match(serviceWorker, /request\.mode==='navigate'/, '只有導覽請求可以回退至 app shell');
assert.equal((serviceWorker.match(/matchCurrentCache\('\.\/index\.html'\)/g) || []).length, 1, '非導覽資產失敗時不得回傳 HTML');
assert.match(serviceWorker, /caches\.open\(CACHE\)\.then\(cache=>cache\.match\(request\)\)/, '資產只能從目前環境的 cache 讀取');
assert.doesNotMatch(serviceWorker, /caches\.match\(/, '不得跨 cache namespace 搜尋同名資產');
assert.match(serviceWorker, /management-actions\.js/, '離線快取必須包含單一管理模組');
assert.doesNotMatch(serviceWorker, /fallback-actions\.js/, '離線快取不得保留已移除模組');

assert.match(enhancements, /businessSnapshot/, '使用者備份必須經過統一資料結構');
assert.match(enhancements, /access:\s*current\.access/, '還原班表不得覆蓋登入憑證');
assert.match(enhancements, /window\.shiftBossData\.persist\(current, restored/, '還原成功前必須透過共用 API 等待雲端確認');
assert.match(enhancements, /window\.shiftBossData\.persist\(before, next/, '薪資調整必須透過共用 API 等待雲端確認');

assert.match(projectFiles, /'management-actions\.js'/);
assert.doesNotMatch(projectFiles, /'fallback-actions\.js'/);
assert.match(packageJson, /node tests\/staging-auth-initiation\.test\.mjs/, 'Auth0 Staging 啟動測試必須納入完整測試鏈');
assert.match(runbook, /scripts\/staging-acceptance\.mjs/, '人工 Staging 驗收腳本必須由 Runbook 明確引用');

for (const removed of [
  'fallback-actions.js',
  'firebase-cloud.js',
  'firebase-config.js',
  'firestore.rules',
  'supabase-config.js',
  'supabase-schema.sql'
]) {
  await assert.rejects(access(removed), `${removed} 應已從現行專案移除`);
}

console.log('Project cleanup regression tests passed.');
