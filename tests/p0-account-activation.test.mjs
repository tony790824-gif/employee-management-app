import assert from 'node:assert/strict';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const securitySource = fs.readFileSync(new URL('../account-security.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../login.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cloudSource = fs.readFileSync(new URL('../google-sheets-cloud.js', import.meta.url), 'utf8');
const managementSource = fs.readFileSync(new URL('../management-actions.js', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const bossPinHash = prehash('boss-pin');
const attackerPinHash = prehash('attacker-pin');
const activationHash = prehash('activation-code');
const newPinHash = prehash('new-pin');

const scriptProperties = new Map();
const propertyStore = {
  getProperty: key => scriptProperties.get(key) || '',
  setProperty: (key, value) => { scriptProperties.set(key, String(value)); return propertyStore; },
  deleteProperty: key => { scriptProperties.delete(key); return propertyStore; },
  getProperties: () => Object.fromEntries(scriptProperties)
};
const backendContext = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  Number,
  Object,
  Array,
  Set,
  String,
  RegExp,
  PropertiesService: {
    getScriptProperties: () => propertyStore
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    computeHmacSha256Signature: (value, key) => [...createHmac('sha256', String(key)).update(String(value)).digest()],
    formatDate: () => '2026-07-15',
    getUuid: (() => { let uuid = 0; return () => `server-uuid-${++uuid}`; })()
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(backendSource, backendContext, { filename: 'google-sheets-backend.gs' });

const emptyState = () => ({
  employees: [], shifts: [], attendance: [], leaves: {}, leaveRequests: {},
  leaveHistory: [], removedEmployees: [], access: {}, payrollAdjustments: {}
});
let stored = emptyState();
let writes = 0;
backendContext.readData_ = () => structuredClone(stored);
backendContext.writeData_ = data => { stored = structuredClone(data); writes += 1; };

scriptProperties.delete('SHIFT_APP_OWNER_PHONE');
let result = backendContext.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash, initialData: emptyState() });
assert.equal(result.ok, false, '未設定伺服器擁有者電話時不得建立老闆帳號');
assert.equal(result.code, 'OWNER_NOT_CONFIGURED');
assert.equal(writes, 0, '拒絕的初始化不得寫入資料');

scriptProperties.set('SHIFT_APP_OWNER_PHONE', '0911111111');
result = backendContext.api({ action: 'bossLogin', phone: '0999999999', pinHash: attackerPinHash, initialData: emptyState() });
assert.equal(result.ok, false, '非預先登記電話不得搶先建立老闆帳號');
assert.equal(result.code, 'BOSS_NOT_AUTHORIZED');
assert.equal(writes, 0);

result = backendContext.api({ action: 'bossLogin', phone: '0911-111-111', pinHash: bossPinHash, initialData: emptyState() });
assert.equal(result.ok, true, '預先登記的電話可以完成第一次老闆初始化');
assert.equal(stored.access.bossPhone, '0911111111');
assert.equal(stored.access.bossPinCredential.scheme, 'iterated-hmac-sha256-v1');
assert.notEqual(stored.access.bossPinCredential.hash, bossPinHash, '伺服器不得直接保存瀏覽器的快速 PIN hash');
assert.equal('bossPinHash' in stored.access, false, '新老闆憑證不得再使用舊欄位');
assert.equal('bossPinHash' in result.data.access, false, '老闆 PIN hash 不得回傳瀏覽器');

scriptProperties.delete('SHIFT_APP_OWNER_PHONE');
result = backendContext.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
assert.equal(result.ok, true, '既有老闆登入不依賴初始化屬性，避免破壞既有帳號');

stored.employees = [
  { id: 'employee-new', name: '新員工', phone: '0922222222', activationCodeHash: activationHash, rate: 200 },
  { id: 'employee-legacy', name: '舊員工', phone: '0933333333', rate: 200 }
];
const beforeActivation = structuredClone(stored);
result = backendContext.api({ action: 'employeeLogin', phone: '0922222222', pinHash: newPinHash });
assert.equal(result.ok, false);
assert.equal(result.code, 'ACTIVATION_REQUIRED', '未啟用員工第一次登入必須要求一次性啟用碼');
assert.deepEqual(stored, beforeActivation, '缺少啟用碼不得偷偷設定 PIN');

result = backendContext.api({ action: 'employeeLogin', phone: '0922222222', pinHash: newPinHash, activationHash: prehash('wrong') });
assert.equal(result.ok, false);
assert.equal(result.code, 'ACTIVATION_INVALID');
assert.deepEqual(stored, beforeActivation, '錯誤啟用碼不得改動帳號');

result = backendContext.api({ action: 'employeeLogin', phone: '0922222222', pinHash: newPinHash, activationHash });
assert.equal(result.ok, true, '正確的一次性啟用碼可讓員工自行設定 PIN');
assert.equal(stored.employees[0].pinCredential.scheme, 'iterated-hmac-sha256-v1');
assert.notEqual(stored.employees[0].pinCredential.hash, newPinHash);
assert.equal('pinHash' in stored.employees[0], false);
assert.equal('activationCodeHash' in stored.employees[0], false, '啟用後必須立即銷毀一次性啟用碼');
assert.equal('pinHash' in result.data.employees[0], false, '員工回應不得洩漏 PIN hash');
assert.equal('activationCodeHash' in result.data.employees[0], false, '員工回應不得洩漏啟用碼 hash');

result = backendContext.api({ action: 'employeeLogin', phone: '0922222222', pinHash: prehash('other-pin'), activationHash });
assert.equal(result.ok, false, '一次性啟用碼不得重播來改掉 PIN');
result = backendContext.api({ action: 'employeeLogin', phone: '0922222222', pinHash: newPinHash });
assert.equal(result.ok, true, '啟用完成後應使用既有 PIN 正常登入');

result = backendContext.api({ action: 'employeeLogin', phone: '0933333333', pinHash: prehash('claimed-pin') });
assert.equal(result.ok, false, '沒有啟用碼的舊員工不得被第一位訪客搶先設定 PIN');
assert.equal(result.code, 'ACTIVATION_NOT_CONFIGURED');
assert.equal('pinHash' in stored.employees[1], false);

const browserContext = vm.createContext({
  window: {},
  crypto: webcrypto,
  TextEncoder,
  Uint8Array,
  String,
  Math,
  Object
});
vm.runInContext(securitySource, browserContext, { filename: 'account-security.js' });
const security = browserContext.window.shiftAccountSecurity;
const codes = new Set(Array.from({ length: 100 }, () => security.generateActivationCode()));
assert.equal(codes.size, 100, '安全亂數啟用碼不應在小樣本內重複');
for (const code of codes) assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
assert.equal(security.normalizeActivationCode('ab-cd 2345'), 'ABCD2345');
assert.equal((await security.hashSecret('secret')).length, 64);

assert.match(htmlSource, /id="loginActivation"[^>]+maxlength="8"/, '登入頁需提供首次啟用碼欄位');
assert.match(loginSource, /startsWith\('ACTIVATION_'\)/, '收到啟用錯誤時需顯示啟用碼欄位');
assert.doesNotMatch(loginSource, /employee\.pinHash\s*=\s*await hash/, '前端不得再以電話號碼直接搶先設定員工 PIN');
assert.match(cloudSource, /while \(pendingSave\)/, '老闆連續儲存必須排入佇列，不得靜默丟棄');
assert.match(cloudSource, /saveBossData:\s*push/, '安全敏感操作必須能等待老闆雲端儲存完成');
assert.match(managementSource, /await window\.sheetsCloud\.saveBossData\(next\)/, '顯示員工啟用碼前必須等待雲端寫入成功');
assert.match(managementSource, /write\(before\)/, '新增員工雲端失敗時必須回復本機資料');

console.log('P0 account activation tests passed');
