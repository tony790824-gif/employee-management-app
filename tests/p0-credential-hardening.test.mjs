import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const sharedPinHash = prehash('123456');
const wrongPinHash = prehash('654321');
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
    formatDate: (_date, _zone, pattern) => pattern === 'yyyy-MM' ? '2026-07' : '2026-07-15',
    getUuid: () => String(++uuid).padStart(32, '0')
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(backendSource, context, { filename: 'google-sheets-backend.gs' });

let stored = {
  access: { bossPhone: '0911111111', bossPinHash: sharedPinHash },
  employees: [{ id: 'employee-1', name: '員工', phone: '0922222222', pinHash: sharedPinHash, leaveQuota: 8 }],
  shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], payrollAdjustments: {}
};
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); };

const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: sharedPinHash });
assert.equal(bossLogin.ok, true, '舊老闆憑證應在正確登入後遷移');
assert.equal('bossPinHash' in stored.access, false);
assert.equal(stored.access.bossPinCredential.scheme, 'iterated-hmac-sha256-v1');
assert.equal(stored.access.bossPinCredential.iterations, 4096);
assert.match(stored.access.bossPinCredential.salt, /^[a-f0-9]{32}$/);
assert.match(stored.access.bossPinCredential.hash, /^[a-f0-9]{64}$/);
assert.notEqual(stored.access.bossPinCredential.hash, sharedPinHash, '不得直接保存瀏覽器預雜湊');

const employeeLogin = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: sharedPinHash });
assert.equal(employeeLogin.ok, true, '舊員工憑證應在正確登入後遷移');
assert.equal('pinHash' in stored.employees[0], false);
assert.equal(stored.employees[0].pinCredential.scheme, 'iterated-hmac-sha256-v1');
assert.notEqual(stored.access.bossPinCredential.salt, stored.employees[0].pinCredential.salt, '相同 PIN 也必須使用不同 salt');
assert.notEqual(stored.access.bossPinCredential.hash, stored.employees[0].pinCredential.hash, '相同 PIN 不得產生相同儲存值');

const pepper = scriptProperties.get('SHIFT_APP_CREDENTIAL_PEPPER');
assert.match(pepper, /^[a-f0-9]{64}$/, 'pepper 必須只存在 Script Properties');
assert.equal(JSON.stringify(stored).includes(pepper), false, 'pepper 不得寫入 Google Sheet snapshot');
assert.deepEqual(Object.keys(bossLogin.data.access), ['bossConfigured']);
assert.equal('pinCredential' in employeeLogin.data.employees[0], false, '員工 projection 不得洩漏衍生憑證');
assert.equal('activationCredential' in employeeLogin.data.employees[0], false);

assert.equal(context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: wrongPinHash }).ok, false);
assert.equal(context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: sharedPinHash }).ok, true);
assert.equal(context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: 'not-a-prehash' }).ok, false, '格式錯誤的預雜湊必須 fail closed');

const bossPull = context.api({ action: 'pull', sessionToken: bossLogin.sessionToken });
const activationHash = prehash('ABCD2345');
bossPull.data.employees.push({
  id: 'employee-2', name: '新員工', phone: '0933333333', leaveQuota: 8,
  activationCodeHash: activationHash
});
const employeeCreated = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken,
  baseRevision: bossPull.data.sync.revision, data: bossPull.data
});
assert.equal(employeeCreated.ok, true);
const pendingEmployee = stored.employees.find(employee => employee.id === 'employee-2');
assert.equal('activationCodeHash' in pendingEmployee, false, '新啟用碼預雜湊不得原樣保存');
assert.equal(pendingEmployee.activationCredential.scheme, 'iterated-hmac-sha256-v1');
assert.notEqual(pendingEmployee.activationCredential.hash, activationHash);

const newPinHash = prehash('112233');
const activated = context.api({
  action: 'employeeLogin', phone: '0933333333', pinHash: newPinHash, activationHash
});
assert.equal(activated.ok, true, '加鹽啟用憑證應可完成首次登入');
assert.equal('activationCredential' in pendingEmployee, true, '測試快照不得與伺服器物件共用參照');
const activatedStored = stored.employees.find(employee => employee.id === 'employee-2');
assert.equal('activationCredential' in activatedStored, false, '成功啟用後必須銷毀啟用憑證');
assert.equal(activatedStored.pinCredential.scheme, 'iterated-hmac-sha256-v1');
assert.equal(context.api({ action: 'employeeLogin', phone: '0933333333', pinHash: newPinHash }).ok, true);

const untamperedCredential = structuredClone(stored.access.bossPinCredential);
stored.access.bossPinCredential.iterations = 1;
assert.equal(context.api({ action: 'bossLogin', phone: '0911111111', pinHash: sharedPinHash }).ok, false, '被竄改成低迭代次數的憑證必須 fail closed');
stored.access.bossPinCredential = untamperedCredential;
assert.equal(context.api({ action: 'bossLogin', phone: '0911111111', pinHash: sharedPinHash }).ok, true);

scriptProperties.set('SHIFT_APP_CREDENTIAL_PEPPER', 'corrupted');
const corruptPepper = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: sharedPinHash });
assert.equal(corruptPepper.code, 'CREDENTIAL_CONFIG_INVALID', '損壞的 pepper 不得被靜默輪替');
assert.equal(scriptProperties.get('SHIFT_APP_CREDENTIAL_PEPPER'), 'corrupted');
scriptProperties.set('SHIFT_APP_CREDENTIAL_PEPPER', pepper);
assert.equal(context.api({ action: 'bossLogin', phone: '0911111111', pinHash: sharedPinHash }).ok, true);

assert.match(backendSource, /constantTimeEqual_/);
assert.match(backendSource, /CREDENTIAL_ITERATIONS = 4096/);
assert.match(backendSource, /SHIFT_APP_CREDENTIAL_PEPPER/);
assert.doesNotMatch(JSON.stringify(bossLogin.data), /pinCredential|activationCredential|bossPinCredential/);

console.log('P0 credential hardening tests passed.');
