import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [ui, css, cloud, access, login, projectFiles, serviceWorker] = await Promise.all([
  readFile('time-off-ui.js', 'utf8'),
  readFile('time-off-ui.css', 'utf8'),
  readFile('postgres-cloud.js', 'utf8'),
  readFile('access.js', 'utf8'),
  readFile('login.js', 'utf8'),
  readFile('scripts/project-files.mjs', 'utf8'),
  readFile('service-worker.js', 'utf8')
]);

for (const method of [
  'submitScheduleLeaveRequest',
  'cancelScheduleLeaveRequest',
  'submitLeaveRequest',
  'cancelLeaveRequest',
  'approveTimeOffRequest',
  'rejectTimeOffRequest'
]) {
  assert.match(ui, new RegExp(`cloud\\.${method}\\(`), `Time-Off UI 必須沿用 ${method}`);
  assert.match(cloud, new RegExp(`const ${method}\\s*=`), `PostgreSQL cloud 必須提供 ${method}`);
}

assert.match(cloud, /const listTimeOffRequests = \(\) =>[\s\S]*client\.listTimeOffRequests\(\)/,
  '唯讀申請清單必須沿用既有 PostgreSQL API Client');
assert.match(ui, /pending:\s*'待審核'/);
assert.match(ui, /approved:\s*'已核准'/);
assert.match(ui, /rejected:\s*'已拒絕'/);
assert.match(ui, /cancelled:\s*'已取消'/);
assert.match(ui, /const role = currentRole\(\);[\s\S]*role === 'employee'/,
  '員工 UI 必須依 server-side currentUser role 顯示');
assert.match(ui, /const role = currentRole\(\);[\s\S]*role === 'boss'/,
  '管理者 UI 必須依 server-side currentUser role 顯示');
assert.match(ui, /const currentUser = \(\) => cloud\.getCurrentUser\?\.\(\) \|\| null;/,
  'Time-Off UI 必須使用 server-side currentUser 作為隱私判斷來源');
assert.match(ui, /const canViewReason = request => \{[\s\S]*user\?\.role === 'boss'[\s\S]*user\?\.role === 'employee'[\s\S]*request\?\.employeeId === user\.employeeId;/,
  '請假原因只允許管理者或申請員工本人查看');
assert.match(ui, /request\.reason && canViewReason\(request\)/,
  '請假原因渲染必須通過前端防禦性權限檢查');
assert.doesNotMatch(ui, /\.\.\.\(request\.reason \? \[\['原因'/,
  '請假原因不得只因 API 回傳非空值就直接渲染');
assert.match(ui, /window\.confirm\(`確定取消/, '取消申請必須先確認');
assert.match(ui, /window\.confirm\(`確定\$\{verb\}/, '核准或拒絕必須先確認');
assert.match(ui, /if \(actionBusy\) return;/, '重複快速點擊不得送出第二次 Command');
assert.match(ui, /postgres-bootstrap-refreshed[\s\S]*if \(actionBusy\) return;/,
  'Command 完成時的 bootstrap 更新不得額外重複讀取申請清單');
assert.doesNotMatch(ui, /location\.reload|innerHTML|insertAdjacentHTML/,
  'Time-Off UI 不得整頁 reload 或將資料交給 HTML parser');
assert.match(access, /usesReviewedTimeOff\(\)\) return;/,
  'PostgreSQL 員工月曆不得繼續使用舊的直接正式休假寫入流程');
assert.match(access, /employeeLeaveButton\.textContent = '排休／請假'/,
  '既有員工捷徑必須導向新的審核式 Time-Off UI');

assert.match(css, /\.time-off-card-actions button\{min-height:44px\}/,
  '手機審核按鈕觸控高度至少 44px');
assert.match(css, /@media\(max-width:760px\)/, '必須提供手機響應式版面');
assert.match(css, /overflow-wrap:anywhere/, '長原因不得撐破手機版面');

for (const source of [login, projectFiles, serviceWorker]) {
  assert.match(source, /time-off-ui\.js/, '建置與已登入載入清單必須包含 Time-Off UI');
}
for (const source of [projectFiles, serviceWorker]) {
  assert.match(source, /time-off-ui\.css/, '建置與 PWA cache 必須包含 Time-Off CSS');
}

console.log('Time-Off frontend UI tests passed.');
