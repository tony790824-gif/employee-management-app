import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('current-user-ui.js', 'utf8');
const cloudSource = await readFile('postgres-cloud.js', 'utf8');
const html = await readFile('index.html', 'utf8');
const css = await readFile('style.css', 'utf8');
const login = await readFile('login.js', 'utf8');

assert.match(html, /id="currentUserIdentity"[\s\S]*id="currentUserDisplayName"[\s\S]*id="currentUserRole"/);
assert.match(login, /'current-user-ui\.js'[\s\S]*'app\.js'/);
assert.match(cloudSource, /currentUser = bootstrap\.currentUser/);
assert.match(cloudSource, /getCurrentUser: \(\) => currentUser/);
assert.doesNotMatch(source, /roleSelect|employeeModeSelect|nickname|email|employees/);
assert.match(css, /\.current-user-name\{[^}]*text-overflow:ellipsis/);
assert.match(css, /@media\(max-width:720px\)[\s\S]*\.current-user-identity/);

const elements = new Map([
  ['#currentUserIdentity', { hidden: true }],
  ['#currentUserDisplayName', { textContent: '' }],
  ['#currentUserRole', { textContent: '' }]
]);
const listeners = new Map();
let activeUser = null;
const sandbox = {
  document: {
    querySelector: selector => elements.get(selector) || null,
    addEventListener: (eventName, listener) => listeners.set(eventName, listener)
  },
  window: {
    shiftPostgresCloud: { getCurrentUser: () => activeUser }
  }
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(source, sandbox, { filename: 'current-user-ui.js' });

const container = elements.get('#currentUserIdentity');
const name = elements.get('#currentUserDisplayName');
const role = elements.get('#currentUserRole');
const render = listeners.get('postgres-bootstrap-refreshed');
assert.equal(typeof render, 'function');
assert.equal(container.hidden, true, '尚無可信任 currentUser 時不得推論登入者');

activeUser = { displayName: 'Staging Manager', role: 'boss', employeeId: null, workspaceId: 'ws_test' };
render();
assert.equal(container.hidden, false);
assert.equal(name.textContent, 'Staging Manager');
assert.equal(role.textContent, '管理者');

activeUser = { displayName: '測試員工', role: 'employee', employeeId: 'emp_test', workspaceId: 'ws_test' };
render();
assert.equal(name.textContent, '測試員工');
assert.equal(role.textContent, '員工');

activeUser = { displayName: null, role: 'employee', employeeId: 'emp_test', workspaceId: 'ws_test' };
render();
assert.equal(name.textContent, '尚未設定姓名');
assert.equal(role.textContent, '員工');

activeUser = { displayName: '不可信任角色', role: 'owner', employeeId: null, workspaceId: 'ws_test' };
render();
assert.equal(container.hidden, true, '未知角色必須安全隱藏，不得顯示為管理者');
assert.equal(name.textContent, '');
assert.equal(role.textContent, '');

console.log('Staging current-user UI authority tests passed.');
