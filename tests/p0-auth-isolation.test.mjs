import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, login, app, loginScreen, stateStore] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('login.js', 'utf8'),
  readFile('app.js', 'utf8'),
  readFile('login-screen.css', 'utf8'),
  readFile('state-store.js', 'utf8')
]);

const staticScripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
const authenticatedScripts = [
  'app.js',
  'access.js',
  'employee-work.js',
  'boss-hours.js',
  'management-actions.js',
  'enhancements.js',
  'employee-layout.js'
];

for (const source of authenticatedScripts) {
  assert.equal(staticScripts.includes(source), false, `${source} 不可在登入前由 index.html 載入`);
  assert.match(login, new RegExp(`['"]${source.replace('.', '\\.')}['"]`), `${source} 必須由登入後載入器管理`);
}

assert.deepEqual(
  staticScripts,
  ['google-sheets-config.js', 'state-store.js', 'account-security.js', 'cloud-sync.js', 'google-sheets-cloud.js', 'login.js', 'pwa.js'],
  '登入前只能載入設定、資料容錯、驗證連線、登入與 PWA 安裝程式'
);
assert.match(app, /^if \(window\.SHIFT_AUTHORIZED !== true\) throw new Error/m, '管理程式必須拒絕未授權啟動');
assert.match(login, /await loadAuthenticatedApp\(\)/, '驗證成功流程必須等待管理程式載入');
assert.match(login, /document\.body\.classList\.add\('app-authenticated'\)/, '載入完成後才可顯示管理畫面');
assert.match(loginScreen, /body:not\(\.app-authenticated\)>\.topbar[^}]+display:none!important/, '登入前管理畫面必須完全隱藏');
assert.match(login, /stateStore\.clearSensitive\(\)/, '雲端登出必須清除本機敏感快取');
assert.match(login, /purgeRenderedData\(\)/, '載入失敗與登出必須清空已渲染敏感內容');
assert.match(login, /invalidCloudSession/, '恢復登入前必須驗證雲端 session 與角色一致');
assert.match(stateStore, /function clearSensitive\(\)/, '共用資料層必須提供受控敏感快取清除');

console.log('P0 登入前資料隔離防回歸檢查通過。');
