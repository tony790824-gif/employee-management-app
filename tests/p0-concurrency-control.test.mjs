import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const cloudSource = fs.readFileSync(new URL('../google-sheets-cloud.js', import.meta.url), 'utf8');
const stateSource = fs.readFileSync(new URL('../state-store.js', import.meta.url), 'utf8');
const managementSource = fs.readFileSync(new URL('../management-actions.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
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
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    computeHmacSha256Signature: (value, key) => [...createHmac('sha256', String(key)).update(String(value)).digest()],
    formatDate: (date, _zone, pattern) => pattern === 'yyyy-MM' ? '2026-07' : '2026-07-15',
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
  employees: [{ id: 'employee-1', name: '員工', phone: '0922222222', pinHash: employeePinHash, role: '門市', rate: 200, leaveQuota: 8 }],
  shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], payrollAdjustments: {}
};
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); };

const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
const employeeLogin = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: employeePinHash });
assert.equal(bossLogin.ok, true);
assert.equal(employeeLogin.ok, true);
assert.equal(bossLogin.data.sync.revision, 1, '老闆舊憑證遷移必須推進 revision');

const staleBossSnapshot = structuredClone(bossLogin.data);
staleBossSnapshot.employees[0].role = '過期裝置修改';
const employeeLeave = context.api({
  action: 'employeeSaveLeave', sessionToken: employeeLogin.sessionToken,
  month: '2026-07', dates: ['2026-07-20']
});
assert.equal(employeeLeave.ok, true);
assert.equal(employeeLeave.data.sync.revision, 3);
assert.deepEqual(stored.leaves['employee-1-2026-07'], ['2026-07-20']);

const conflict = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken,
  baseRevision: bossLogin.data.sync.revision, data: staleBossSnapshot
});
assert.equal(conflict.ok, false, '過期 snapshot 必須拒絕');
assert.equal(conflict.code, 'REVISION_CONFLICT');
assert.equal(conflict.currentRevision, 3);
assert.equal(conflict.data.sync.revision, 3, '衝突回應必須帶最新版本');
assert.deepEqual(stored.leaves['employee-1-2026-07'], ['2026-07-20'], '過期老闆儲存不得覆蓋員工休假');
assert.equal(stored.employees[0].role, '門市', '過期老闆修改不得局部滲入');

const latest = structuredClone(conflict.data);
latest.employees[0].role = '店長';
latest.shifts = [{ id: 'shift-1', employeeId: 'employee-1', date: '2026-07-21' }];
const accepted = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken,
  baseRevision: conflict.currentRevision, data: latest
});
assert.equal(accepted.ok, true, '最新版本應可儲存');
assert.equal(accepted.data.sync.revision, 4);
assert.equal(stored.employees[0].role, '店長');
assert.deepEqual(stored.leaves['employee-1-2026-07'], ['2026-07-20']);
assert.equal(stored.shifts.length, 1);
assert.equal(stored.employees[0].pinCredential.scheme, 'hmac-sha256-v2', '版本控制不得破壞伺服器 credential');

const replay = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken,
  baseRevision: conflict.currentRevision, data: latest
});
assert.equal(replay.code, 'REVISION_CONFLICT', '已使用過的版本不得重播覆寫');
assert.equal(context.api({ action: 'save', sessionToken: bossLogin.sessionToken, data: latest }).code, 'REVISION_REQUIRED');

const beforeInvalidSave = structuredClone(stored);
const unknownField = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4,
  data: { ...structuredClone(accepted.data), unexpectedCollection: [] }
});
assert.equal(unknownField.code, 'REQUEST_DATA_INVALID', '未知欄位必須由白名單拒絕');
assert.deepEqual(stored, beforeInvalidSave, '未知欄位不得寫入或推進版本');

const malformedCollection = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4,
  data: { employees: {} }
});
assert.equal(malformedCollection.code, 'REQUEST_DATA_INVALID', '已知集合形狀錯誤必須拒絕');
assert.deepEqual(stored, beforeInvalidSave, '形狀錯誤不得清理或覆寫既有資料');

const malformedPayroll = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4,
  data: { payrollAdjustments: [] }
});
assert.equal(malformedPayroll.code, 'REQUEST_DATA_INVALID', 'request 不接受舊版 payroll array 形狀');
assert.deepEqual(stored, beforeInvalidSave);
assert.equal(context.api({ action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4, data: [] }).code, 'REQUEST_DATA_INVALID');
assert.equal(
  context.api({ action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4, data: { sync: { revision: 4 } } }).code,
  'REQUEST_DATA_INVALID',
  '只有 server-managed 欄位的空操作不得推進版本'
);
assert.deepEqual(stored, beforeInvalidSave);

const serverWorkspaceId = stored.workspace.id;
const serverBossPhone = stored.access.bossPhone;
const partialSave = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 4,
  data: {
    workspace: { id: 'ws_ffffffffffffffffffffffffffffffff' },
    sync: { revision: 999 },
    access: { bossConfigured: false },
    employees: structuredClone(accepted.data.employees)
  }
});
assert.equal(partialSave.ok, true, '省略未修改欄位的 save 應可成功');
assert.equal(partialSave.data.sync.revision, 5);
assert.equal(stored.workspace.id, serverWorkspaceId, 'client 不得覆寫 server workspace');
assert.equal(stored.access.bossPhone, serverBossPhone, 'client 不得覆寫 server access');
assert.equal(stored.shifts.length, 1, '省略 shifts 不得清空既有班次');
assert.deepEqual(stored.leaves['employee-1-2026-07'], ['2026-07-20'], '省略 leaves 不得清空既有休假');

const explicitClear = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: 5,
  data: { shifts: [] }
});
assert.equal(explicitClear.ok, true, '明確傳送空集合仍應允許刪除內容');
assert.equal(explicitClear.data.sync.revision, 6);
assert.deepEqual(stored.shifts, []);
assert.equal(stored.employees[0].role, '店長', '清空 shifts 不得影響 employees');
assert.deepEqual(stored.leaves['employee-1-2026-07'], ['2026-07-20']);

const clockIn = context.api({ action: 'employeeClockIn', sessionToken: employeeLogin.sessionToken });
assert.equal(clockIn.ok, true);
assert.equal(clockIn.data.sync.revision, 7, '員工 action 也必須推進全域版本');

assert.match(cloudSource, /baseRevision/);
assert.match(cloudSource, /REVISION_CONFLICT/);
assert.match(cloudSource, /shift-sync-conflict-backup/);
assert.match(cloudSource, /syncConflict/);
assert.match(stateSource, /'workspace',\s*'sync'/);
assert.match(stateSource, /SYNC_CONFLICT_BACKUP_KEY/);
assert.match(managementSource, /error\?\.code !== 'REVISION_CONFLICT'/, '管理操作衝突時不得回滾並抹掉待匯出的本機修改');
assert.match(appSource, /error\?\.code==='REVISION_CONFLICT'/, '重設 PIN 衝突時不得回滾並抹掉待匯出的本機修改');

function createCloudHarness(responder) {
  const values = new Map([
    ['shift-cloud-config', JSON.stringify({ mode: 'google_sheets' })],
    ['shift-sync-conflict-backup', JSON.stringify({ old: true })]
  ]);
  const sessions = new Map([['shift-sheets-auth', JSON.stringify({
    sessionToken: 'x'.repeat(64), sessionExpiresAt: Date.now() + 60000,
    workspaceId: 'ws_0123456789abcdef0123456789abcdef', role: 'boss', employeeId: ''
  })]]);
  const listeners = new Map();
  const alerts = [];
  const status = { textContent: '' };
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  const sessionStorage = {
    getItem: key => sessions.has(key) ? sessions.get(key) : null,
    setItem: (key, value) => sessions.set(key, String(value)),
    removeItem: key => sessions.delete(key)
  };
  const emit = (type, event) => (listeners.get(type) || []).forEach(listener => listener(event));
  const backgroundTimeout = (callback, delay) => { const handle = setTimeout(callback, delay); handle.unref(); return handle; };
  class FakeElement {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.style = {}; }
    appendChild(child) { this.children.push(child); return child; }
    remove() {}
    submit() {
      const field = this.children.find(child => child.name === 'payload');
      const payload = JSON.parse(field.value);
      queueMicrotask(() => emit('message', {
        origin: 'https://script.google.com',
        data: { channel: 'staff-sheets', requestId: payload.requestId, response: responder(payload.request) }
      }));
    }
  }
  const cloudContext = vm.createContext({
    console, Date, JSON, Math, Number, Object, Array, Set, String, RegExp, Promise,
    TextEncoder, crypto: { randomUUID: () => `request-${++uuid}`, subtle: globalThis.crypto.subtle },
    localStorage: storage, sessionStorage,
    location: { origin: 'https://inspiring-sunshine-9eab99.netlify.app', reload() {} },
    document: {
      hidden: false, body: { appendChild() {} },
      createElement: tagName => new FakeElement(tagName),
      querySelector: selector => selector === '#cloudStatus' ? status : null
    },
    CustomEvent: class { constructor(type) { this.type = type; } },
    alert: message => alerts.push(String(message)),
    setTimeout: backgroundTimeout, clearTimeout, queueMicrotask,
    setInterval: () => 0
  });
  cloudContext.window = cloudContext;
  cloudContext.window.GOOGLE_SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/test/exec';
  cloudContext.window.shiftStateStore = { write: data => storage.setItem('shift-app-data-v3', JSON.stringify(data)) };
  cloudContext.window.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  cloudContext.window.dispatchEvent = event => emit(event.type, event);
  vm.runInContext(cloudSource, cloudContext, { filename: 'google-sheets-cloud.js' });
  emit('message', { origin: 'https://script.google.com', data: { channel: 'staff-sheets', type: 'ready' } });
  return { context: cloudContext, values, alerts, status };
}

const workspace = { id: 'ws_0123456789abcdef0123456789abcdef' };
const conflictHarness = createCloudHarness(() => ({
  ok: false, code: 'REVISION_CONFLICT', error: 'conflict', workspaceId: workspace.id,
  data: { workspace, sync: { revision: 2 }, employees: [], shifts: [], attendance: [], leaves: {} }
}));
await assert.rejects(
  conflictHarness.context.window.sheetsCloud.saveBossData({ workspace, sync: { revision: 1 }, employees: [], shifts: [], attendance: [], leaves: {} }),
  error => error.code === 'REVISION_CONFLICT'
);
const preserved = JSON.parse(conflictHarness.values.get('shift-sync-conflict-backup'));
assert.equal(preserved.attempted.sync.revision, 1, '衝突時必須保留本機待儲存版本');
assert.equal(preserved.remote.sync.revision, 2, '衝突備份必須包含伺服器最新版本以供診斷');
assert.equal(conflictHarness.alerts.length, 1, '同一頁面衝突只能提示一次');
await assert.rejects(
  conflictHarness.context.window.sheetsCloud.saveBossData({ workspace, sync: { revision: 1 } }),
  /尚未處理的資料版本衝突/
);

const successHarness = createCloudHarness(request => ({
  ok: true, role: 'boss', workspaceId: workspace.id,
  data: { ...request.data, workspace, sync: { revision: request.baseRevision + 1 } }
}));
await successHarness.context.window.sheetsCloud.saveBossData({ workspace, sync: { revision: 4 }, employees: [], shifts: [], attendance: [], leaves: {} });
assert.equal(JSON.parse(successHarness.values.get('shift-app-data-v3')).sync.revision, 5, '成功儲存後本機必須採用伺服器新版本');
assert.equal(successHarness.values.has('shift-sync-conflict-backup'), false, '後續成功儲存應清除過期衝突備份');

console.log('P0 optimistic concurrency tests passed.');
