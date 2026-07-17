import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const cloudSource = fs.readFileSync(new URL('../google-sheets-cloud.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../login.js', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const bossPinHash = prehash('boss-pin');
const employeePinHash = prehash('employee-pin');
const secondEmployeePinHash = prehash('employee-2-pin');
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

const initial = () => ({
  access: { bossPhone: '0911111111', bossPinHash },
  employees: [{ id: 'employee-1', name: '員工', phone: '0922222222', pinHash: employeePinHash, leaveQuota: 8 }],
  shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], payrollAdjustments: {}
});
let stored = initial();
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); };

for (let attempt = 1; attempt <= 4; attempt += 1) {
  const failed = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: prehash(`wrong-${attempt}`) });
  assert.equal(failed.ok, false);
  assert.notEqual(failed.code, 'AUTH_RATE_LIMITED');
}
const locked = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: prehash('wrong-5') });
assert.equal(locked.code, 'AUTH_RATE_LIMITED', '第五次失敗必須鎖定帳號');
assert.equal(locked.retryAfterSeconds > 0, true);
assert.equal(context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: employeePinHash }).code, 'AUTH_RATE_LIMITED');

const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
assert.equal(bossLogin.ok, true);
assert.equal('bossPinHash' in bossLogin.data.access, false, '老闆 PIN hash 不得回傳瀏覽器');
assert.equal('pinHash' in bossLogin.data.employees[0], false, '員工 PIN hash 不得回傳老闆瀏覽器');
assert.equal(bossLogin.data.employees[0].credentialState, 'active');
assert.equal(bossLogin.sessionToken.length >= 64, true);
assert.equal(bossLogin.sessionExpiresAt > Date.now(), true);
const bossToken = bossLogin.sessionToken;
const tokenHash = createHash('sha256').update(bossToken).digest('hex');
const tokenProperty = `SHIFT_APP_SESSION_${tokenHash}`;
assert.equal(scriptProperties.has(tokenProperty), true, '伺服器只應以雜湊索引保存工作階段');
assert.equal([...scriptProperties.values()].some(value => String(value).includes(bossToken)), false, '不得保存原始 bearer token');

assert.equal(context.api({ action: 'pull', sessionToken: bossToken }).role, 'boss');
assert.equal(context.api({ action: 'pull', phone: '0911111111', pinHash: bossPinHash }).code, 'SESSION_INVALID');
assert.equal(context.api({ action: 'pull', sessionToken: 'forged-token' }).code, 'SESSION_INVALID');
assert.equal(context.api({ action: 'employeeClockIn', sessionToken: bossToken }).ok, false, '老闆工作階段不得執行員工命令');

const employeePhone = '0933333333';
stored.employees.push({ id: 'employee-2', name: '第二位員工', phone: employeePhone, pinHash: secondEmployeePinHash, leaveQuota: 8 });
const employeeLogin = context.api({ action: 'employeeLogin', phone: employeePhone, pinHash: secondEmployeePinHash });
assert.equal(employeeLogin.ok, true);
const employeeToken = employeeLogin.sessionToken;
assert.equal(context.api({ action: 'save', sessionToken: employeeToken, data: initial() }).ok, false, '員工工作階段不得覆寫公司資料');

const removedData = structuredClone(stored);
removedData.employees = removedData.employees.filter(employee => employee.id !== 'employee-2');
assert.equal(context.api({ action: 'save', sessionToken: bossToken, baseRevision: removedData.sync.revision, data: removedData }).ok, true);
assert.equal(context.api({ action: 'pull', sessionToken: employeeToken }).code, 'SESSION_INVALID', '移除員工必須立刻撤銷登入工作階段');
assert.equal(stored.access.bossPinCredential.scheme, 'hmac-sha256-v2', '一般儲存不得覆寫伺服器端老闆憑證');
assert.equal(stored.employees[0].pinHash, employeePinHash, '一般編輯不得清除尚未登入遷移的員工憑證');

const expiringLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
const expiringHash = createHash('sha256').update(expiringLogin.sessionToken).digest('hex');
const expiringKey = `SHIFT_APP_SESSION_${expiringHash}`;
const expiredRecord = JSON.parse(scriptProperties.get(expiringKey));
expiredRecord.expiresAt = Date.now() - 1;
scriptProperties.set(expiringKey, JSON.stringify(expiredRecord));
assert.equal(context.api({ action: 'pull', sessionToken: expiringLogin.sessionToken }).code, 'SESSION_INVALID', '過期工作階段必須失效');
assert.equal(scriptProperties.has(expiringKey), false, '過期記錄必須清除');

assert.equal(context.api({ action: 'logout', sessionToken: bossToken }).ok, true);
assert.equal(context.api({ action: 'pull', sessionToken: bossToken }).code, 'SESSION_INVALID', '登出必須撤銷工作階段');
assert.equal(context.api({ action: 'logout', sessionToken: bossToken }).ok, true, '重複登出需保持冪等');

assert.doesNotMatch(cloudSource, /JSON\.stringify\(\{\s*phone,\s*pinHash/, '瀏覽器不得持久保存電話與 PIN hash');
assert.doesNotMatch(cloudSource, /auth\.(phone|pinHash)/, '登入後 API 不得重送電話或 PIN hash');
assert.match(cloudSource, /sessionToken:\s*auth\.sessionToken/);
assert.match(cloudSource, /async function resumeSession\(\)/);
assert.match(cloudSource, /action:\s*'logout'/);
assert.match(loginSource, /sheetsCloud\.resumeSession\(\)\.then/);
assert.match(loginSource, /window\.sheetsCloud\.logout\(\)/);

console.log('P0 session security tests passed');
