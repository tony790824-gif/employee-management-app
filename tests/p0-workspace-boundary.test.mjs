import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const cloudSource = fs.readFileSync(new URL('../google-sheets-cloud.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../login.js', import.meta.url), 'utf8');
const stateSource = fs.readFileSync(new URL('../state-store.js', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const bossPinHash = prehash('boss-pin');
const employeePinHash = prehash('employee-pin');
const scriptProperties = new Map([['SHIFT_APP_OWNER_PHONE', '0911111111']]);
const propertyStore = {
  getProperty: key => scriptProperties.get(key) || '',
  setProperty: (key, value) => { scriptProperties.set(key, String(value)); return propertyStore; },
  deleteProperty: key => { scriptProperties.delete(key); return propertyStore; },
  getProperties: () => Object.fromEntries(scriptProperties)
};
let uuid = 0;
const context = vm.createContext({
  console, Date, JSON, Math, Number, Object, Array, Set, String, RegExp,
  PropertiesService: { getScriptProperties: () => propertyStore },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    computeHmacSha256Signature: (value, key) => [...createHmac('sha256', String(key)).update(String(value)).digest()],
    formatDate: () => '2026-07-15',
    getUuid: () => String(++uuid).padStart(32, '0')
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(backendSource, context, { filename: 'google-sheets-backend.gs' });

let stored = {
  access: { bossPhone: '0911111111', bossPinHash },
  employees: [{ id: 'employee-1', name: '員工', phone: '0922222222', pinHash: employeePinHash, leaveQuota: 8 }],
  shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], payrollAdjustments: {}
};
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); };

const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
assert.equal(bossLogin.ok, true, '舊資料第一次成功登入必須自動建立工作區');
assert.match(bossLogin.workspaceId, /^ws_[a-f0-9]{32}$/);
assert.equal(stored.workspace.id, bossLogin.workspaceId);
assert.equal(scriptProperties.get('SHIFT_APP_WORKSPACE_ID'), bossLogin.workspaceId);
assert.equal(bossLogin.data.workspace.id, bossLogin.workspaceId);

const bossTokenHash = createHash('sha256').update(bossLogin.sessionToken).digest('hex');
const bossSessionKey = `SHIFT_APP_SESSION_${bossTokenHash}`;
const bossSession = JSON.parse(scriptProperties.get(bossSessionKey));
assert.equal(bossSession.workspaceId, bossLogin.workspaceId, '工作階段必須綁定工作區');

const forgedSave = structuredClone(bossLogin.data);
forgedSave.workspace = { id: 'ws_ffffffffffffffffffffffffffffffff' };
assert.equal(context.api({ action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: bossLogin.data.sync.revision, data: forgedSave }).ok, true);
assert.equal(stored.workspace.id, bossLogin.workspaceId, '前端不得修改工作區 ID');

const employeeLogin = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: employeePinHash });
assert.equal(employeeLogin.ok, true);
assert.equal(employeeLogin.workspaceId, bossLogin.workspaceId);
assert.equal(employeeLogin.data.workspace.id, bossLogin.workspaceId, '員工投影必須帶相同工作區');

const employeeTokenHash = createHash('sha256').update(employeeLogin.sessionToken).digest('hex');
const employeeSessionKey = `SHIFT_APP_SESSION_${employeeTokenHash}`;
const wrongWorkspaceSession = JSON.parse(scriptProperties.get(employeeSessionKey));
wrongWorkspaceSession.workspaceId = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
scriptProperties.set(employeeSessionKey, JSON.stringify(wrongWorkspaceSession));
assert.equal(context.api({ action: 'pull', sessionToken: employeeLogin.sessionToken }).code, 'SESSION_INVALID', '不同工作區的 session 必須失效');
assert.equal(scriptProperties.has(employeeSessionKey), false, '不合法的跨工作區 session 必須撤銷');

stored.workspace.id = 'ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const mismatch = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
assert.equal(mismatch.ok, false);
assert.equal(mismatch.code, 'WORKSPACE_MISMATCH', '權威設定與資料不一致時必須 fail closed');

scriptProperties.delete('SHIFT_APP_WORKSPACE_ID');
stored = {
  access: {}, employees: [], shifts: [], attendance: [], leaves: {}, leaveRequests: {},
  leaveHistory: [], removedEmployees: [], payrollAdjustments: {}
};
const injectedWorkspace = 'ws_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const firstBossLogin = context.api({
  action: 'bossLogin', phone: '0911111111', pinHash: prehash('new-boss-pin'),
  initialData: { ...stored, workspace: { id: injectedWorkspace } }
});
assert.equal(firstBossLogin.ok, true);
assert.notEqual(firstBossLogin.workspaceId, injectedWorkspace, '第一次初始化不得信任 client supplied workspace');
assert.equal(stored.workspace.id, firstBossLogin.workspaceId);

assert.match(cloudSource, /validWorkspaceId/);
assert.match(cloudSource, /auth\.workspaceId !== responseWorkspaceId/);
assert.match(cloudSource, /workspaceId,\s*\n\s*role:/);
assert.match(loginSource, /session\.workspaceId/);
assert.match(stateSource, /'workspace',\s*'sync',\s*'leaves'/);

console.log('P0 workspace boundary tests passed');
