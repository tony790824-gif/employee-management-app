import assert from 'node:assert/strict';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const securitySource = fs.readFileSync(new URL('../account-security.js', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
const scriptProperties = new Map([
  ['SHIFT_APP_OWNER_PHONE', '0911111111'],
  ['SHIFT_APP_WORKSPACE_ID', workspaceId],
  ['SHIFT_APP_CREDENTIAL_PEPPER', prehash('schema-boundary-pepper')]
]);
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
    formatDate: (_date, _zone, pattern) => pattern === 'yyyy-MM' ? '2026-07' : '2026-07-16',
    getUuid: () => String(++uuid).padStart(32, '0')
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: content => ({ content: String(content), setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(backendSource, context, { filename: 'google-sheets-backend.gs' });
const requestPayloadMaxBytes = vm.runInContext('REQUEST_PAYLOAD_MAX_BYTES', context);

const iso = '2026-07-16T04:05:06.007Z';
const payrollKey = 'employee-1-2026-07';
const snapshot = () => ({
  workspace: { id: workspaceId },
  sync: { revision: 3, schemaVersion: 1 },
  employees: [{
    id: 'employee-1', name: '員工', phone: '0922222222', role: '門市', rate: 200, leaveQuota: 8,
    pinHash: prehash('123456')
  }],
  shifts: [{ id: 'shift-1', employeeId: 'employee-1', date: '2026-07-16', start: '09:00', end: '17:30' }],
  attendance: [{ id: 'attendance-1', employeeId: 'employee-1', date: '2026-07-16', hours: 8.5, clockIn: iso, clockOut: iso }],
  leaves: { [payrollKey]: ['2026-07-20'] },
  leaveRequests: { [payrollKey]: [{ date: '2026-07-21', createdAt: iso }] },
  leaveHistory: [{ employeeId: 'employee-1', date: '2026-06-01', approvedAt: iso }],
  removedEmployees: [{
    employee: { id: 'employee-old', phone: '0933333333', rate: 190 },
    shifts: [{ date: '2026-06-01', start: '08:00', end: '16:00' }],
    attendance: [{ date: '2026-06-01', hours: 8 }],
    leaves: { 'employee-old-2026-06': ['2026-06-02'] },
    removedAt: iso,
    removeAfter: '2026-07-19T04:05:06.007Z'
  }],
  access: { bossPhone: '0911111111', bossPinHash: prehash('654321') },
  payrollAdjustments: { [payrollKey]: [{ amount: 1000, note: '獎金', date: iso }] }
});
const expectCode = (operation, code) => assert.throws(
  operation,
  error => error && error.code === code,
  `預期錯誤代碼 ${code}`
);

// Schema Migration tests
const legacyData = snapshot();
delete legacyData.sync.schemaVersion;
const migrated = context.migrate_(legacyData);
assert.equal(migrated.sync.schemaVersion, 1, 'v0 資料必須能遷移至 v1');

const invalidVersion = snapshot();
invalidVersion.sync.schemaVersion = -1;
expectCode(() => context.validateSnapshotShape_(invalidVersion, 'DATA_SOURCE_INVALID'), 'DATA_SOURCE_INVALID');

// Raw request limit: UTF-8 bytes, not JavaScript character count.
assert.equal(context.utf8ByteLength_('abc'), 3);
assert.equal(context.utf8ByteLength_('中'), 3);
assert.equal(context.utf8ByteLength_('😀'), 4);
assert.equal(context.requestPayloadByteLength_({ parameter: { payload: '中文' } }), 6, '缺少 raw body 時必須以 payload UTF-8 bytes 作保守 fallback');
assert.equal(context.requestPayloadByteLength_({ postData: { contents: '' }, parameter: { payload: '中文' } }), 6, '空 raw body 不得繞過 payload fallback');

let apiCalls = 0;
const originalApi = context.api;
context.api = request => { apiCalls += 1; return { ok: true, action: request.action || '' }; };
const validPayload = JSON.stringify({ requestId: 'request-size-test', request: { action: 'pull' } });
const post = rawBody => context.doPost({
  postData: { contents: rawBody },
  parameter: { requestId: 'request-size-test', payload: validPayload }
});
assert.match(post('a'.repeat(requestPayloadMaxBytes - 1)).content, /\"ok\":true/);
assert.equal(apiCalls, 1, '小於上限必須進入 API');
assert.match(post('a'.repeat(requestPayloadMaxBytes)).content, /\"ok\":true/);
assert.equal(apiCalls, 2, '剛好 1 MiB 仍允許');
const oversized = context.doPost({
  postData: { contents: '中'.repeat(Math.floor(requestPayloadMaxBytes / 3) + 1) },
  parameter: { requestId: 'request-too-large', payload: '{not-json' }
});
assert.equal(apiCalls, 2, '超過上限必須在 JSON parse 與 API 前立即停止');
assert.match(oversized.content, /REQUEST_PAYLOAD_TOO_LARGE/);
assert.match(oversized.content, /request-too-large/, '超限錯誤必須保留 requestId 讓前端完成既有 Promise');
context.api = originalApi;

// Raw PIN and activation input rules. Activation stays on the existing 8-character production alphabet.
const securityContext = vm.createContext({ crypto: webcrypto });
securityContext.window = securityContext;
vm.runInContext(securitySource, securityContext, { filename: 'account-security.js' });
const security = securityContext.shiftAccountSecurity;
assert.equal(security.isValidPhone('0912345678'), true);
assert.equal(security.isValidPhone('0912-345-678'), false);
assert.equal(security.isValidPin('123456'), true);
['12345', '1234567', '12 3456', 'abcdef'].forEach(value => assert.equal(security.isValidPin(value), false));
assert.equal(security.isValidActivationCode('ABCDEFGH'), true);
['ABCDEFG', 'ABCDEFGI', 'abcdEFGH', '1234 678'].forEach(value => assert.equal(security.isValidActivationCode(value), false));

// Full current A1 value schema.
assert.equal(context.validateSnapshotShape_(snapshot(), 'DATA_SOURCE_INVALID').employees[0].phone, '0922222222');
[
  data => { data.employees[0].phone = '0922-222-222'; },
  data => { data.employees[0].phone = '123'; },
  data => { data.access.bossPhone = 911111111; }
].forEach(mutate => {
  const data = snapshot(); mutate(data); expectCode(() => context.validateSnapshotShape_(data, 'DATA_SOURCE_INVALID'), 'DATA_SOURCE_INVALID');
});

[
  data => { data.employees[0].pinHash = '123456'; },
  data => { data.employees[0].activationCodeHash = 'g'.repeat(64); },
  data => { data.access.bossPinCredential = { scheme: 'wrong', salt: '0'.repeat(32), iterations: 4096, hash: '0'.repeat(64) }; }
].forEach(mutate => {
  const data = snapshot(); mutate(data); expectCode(() => context.validateSnapshotShape_(data, 'DATA_SOURCE_INVALID'), 'DATA_SOURCE_INVALID');
});

[
  data => { data.employees[0].rate = -1; },
  data => { data.employees[0].rate = 200.5; },
  data => { data.employees[0].rate = ''; },
  data => { data.employees[0].rate = Number.NaN; },
  data => { data.employees[0].rate = Number.POSITIVE_INFINITY; },
  data => { data.payrollAdjustments[payrollKey][0].amount = 0.5; },
  data => { data.payrollAdjustments[payrollKey][0].amount = '1000'; }
].forEach(mutate => {
  const data = snapshot(); mutate(data); expectCode(() => context.validateSnapshotShape_(data, 'DATA_SOURCE_INVALID'), 'DATA_SOURCE_INVALID');
});
const zeroAmount = snapshot();
zeroAmount.payrollAdjustments[payrollKey][0].amount = 0;
assert.equal(context.validateSnapshotShape_(zeroAmount, 'DATA_SOURCE_INVALID').payrollAdjustments[payrollKey][0].amount, 0);

[
  data => { data.shifts[0].date = '2026-02-30'; },
  data => { data.shifts[0].date = '2026-7-1'; },
  data => { data.shifts[0].start = '24:00'; },
  data => { data.shifts[0].end = '9:00'; },
  data => { data.attendance[0].clockIn = '2026-07-16 04:05:06'; },
  data => { data.leaveRequests[payrollKey][0].date = '2026-08-01'; },
  data => { data.payrollAdjustments[payrollKey][0].date = '2026-07-16T04:05:06Z'; }
].forEach(mutate => {
  const data = snapshot(); mutate(data); expectCode(() => context.validateSnapshotShape_(data, 'DATA_SOURCE_INVALID'), 'DATA_SOURCE_INVALID');
});

// Missing legacy fields and empty payroll adjustments stay compatible.
const missingFields = snapshot();
delete missingFields.leaveRequests;
delete missingFields.payrollAdjustments;
assert.equal(Object.keys(context.validateSnapshotShape_(missingFields, 'DATA_SOURCE_INVALID').payrollAdjustments).length, 0);
const emptyLegacyPayroll = snapshot();
emptyLegacyPayroll.payrollAdjustments = [];
assert.equal(Object.keys(context.validateSnapshotShape_(emptyLegacyPayroll, 'DATA_SOURCE_INVALID').payrollAdjustments).length, 0);

// Existing signed deductions remain readable, but new/duplicated negative values are rejected.
const storedWithLegacyDeduction = snapshot();
storedWithLegacyDeduction.payrollAdjustments[payrollKey] = [{ amount: -100, note: '既有扣款', date: iso }];
assert.equal(context.validateSnapshotShape_(structuredClone(storedWithLegacyDeduction), 'DATA_SOURCE_INVALID').payrollAdjustments[payrollKey][0].amount, -100);
assert.doesNotThrow(() => context.validateBossSaveRequest_({
  payrollAdjustments: structuredClone(storedWithLegacyDeduction.payrollAdjustments)
}, storedWithLegacyDeduction));
const duplicatedLegacyDeduction = structuredClone(storedWithLegacyDeduction.payrollAdjustments);
duplicatedLegacyDeduction[payrollKey].push(structuredClone(duplicatedLegacyDeduction[payrollKey][0]));
expectCode(() => context.validateBossSaveRequest_({ payrollAdjustments: duplicatedLegacyDeduction }, storedWithLegacyDeduction), 'REQUEST_DATA_INVALID');
const newNegative = snapshot();
newNegative.payrollAdjustments[payrollKey][0].amount = -1;
expectCode(() => context.validateBossSaveRequest_({ payrollAdjustments: newNegative.payrollAdjustments }, snapshot()), 'REQUEST_DATA_INVALID');

// An invalid save must not write, partially merge or advance revision.
let stored = snapshot();
let writes = 0;
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); writes += 1; };
const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: prehash('654321') });
assert.equal(bossLogin.ok, true);
const writesAfterLogin = writes;
const beforeInvalidSave = structuredClone(stored);
const invalidSave = context.api({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision: bossLogin.data.sync.revision,
  data: { employees: [{ id: 'employee-1', phone: 'invalid', rate: -1 }] }
});
assert.equal(invalidSave.code, 'REQUEST_DATA_INVALID');
assert.equal(writes, writesAfterLogin, 'schema 錯誤不得呼叫 writeData_');
assert.deepEqual(stored, beforeInvalidSave, 'schema 錯誤不得局部修改或推進 revision');

console.log('P0 request size and A1 value schema tests passed');
