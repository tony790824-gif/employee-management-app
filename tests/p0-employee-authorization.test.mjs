import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const cloudSource = fs.readFileSync(new URL('../google-sheets-cloud.js', import.meta.url), 'utf8');
const accessSource = fs.readFileSync(new URL('../access.js', import.meta.url), 'utf8');
const workSource = fs.readFileSync(new URL('../employee-work.js', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const bossPinHash = prehash('boss-pin');
const employeePinHash = prehash('employee-pin');
const otherPinHash = prehash('other-pin');
let uuid = 0;
const scriptProperties = new Map();
const propertyStore = {
  getProperty: key => scriptProperties.get(key) || '',
  setProperty: (key, value) => { scriptProperties.set(key, String(value)); return propertyStore; },
  deleteProperty: key => { scriptProperties.delete(key); return propertyStore; },
  getProperties: () => Object.fromEntries(scriptProperties)
};
const formatTaipei = (date, pattern) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return pattern === 'yyyy-MM' ? `${parts.year}-${parts.month}` : `${parts.year}-${parts.month}-${parts.day}`;
};

const context = vm.createContext({
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
  PropertiesService: { getScriptProperties: () => propertyStore },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    computeHmacSha256Signature: (value, key) => [...createHmac('sha256', String(key)).update(String(value)).digest()],
    formatDate: (date, _zone, pattern) => formatTaipei(date, pattern),
    getUuid: () => `server-uuid-${++uuid}`
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(source, context, { filename: 'google-sheets-backend.gs' });

const initial = () => ({
  access: { bossPhone: '0911111111', bossPinHash },
  employees: [
    { id: 'employee-1', name: '本人', phone: '0922222222', pinHash: employeePinHash, rate: 200, leaveQuota: 2 },
    { id: 'employee-2', name: '其他員工', phone: '0933333333', pinHash: otherPinHash, rate: 999, leaveQuota: 8 }
  ],
  shifts: [
    { id: 'shift-1', employeeId: 'employee-1', date: '2026-07-20', start: '09:00', end: '17:00' },
    { id: 'shift-2', employeeId: 'employee-2', date: '2026-07-20', start: '09:00', end: '17:00' }
  ],
  attendance: [
    { id: 'attendance-1', employeeId: 'employee-1', date: '2026-07-01', type: '出勤', hours: 8 },
    { id: 'attendance-2', employeeId: 'employee-2', date: '2026-07-01', type: '出勤', hours: 8 }
  ],
  leaves: { 'employee-1-2026-07': ['2026-07-02'], 'employee-2-2026-07': ['2026-07-03'] },
  leaveRequests: { 'employee-1-2026-07': [], 'employee-2-2026-07': [] },
  leaveHistory: [
    { employeeId: 'employee-1', date: '2026-06-01' },
    { employeeId: 'employee-2', date: '2026-06-02' }
  ],
  removedEmployees: [{ employee: { id: 'removed-1', phone: '0944444444' }, removeAfter: '2099-01-01T00:00:00.000Z' }],
  payrollAdjustments: { 'employee-1-2026-07': [{ amount: 1000 }], 'employee-2-2026-07': [{ amount: 999999 }] }
});

let stored;
const reset = () => {
  stored = structuredClone(initial());
  const workspaceId = scriptProperties.get('SHIFT_APP_WORKSPACE_ID');
  if (workspaceId) stored.workspace = { id: workspaceId };
};
context.readData_ = () => structuredClone(stored);
context.writeData_ = data => { stored = structuredClone(data); };
let employeeToken = '';
let bossToken = '';
const employeeRequest = request => context.api({ sessionToken: employeeToken, ...request });
const bossRequest = request => context.api({ sessionToken: bossToken, ...request });

reset();
const employeeLogin = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: employeePinHash });
assert.equal(employeeLogin.ok, true);
employeeToken = employeeLogin.sessionToken;
const bossLogin = context.api({ action: 'bossLogin', phone: '0911111111', pinHash: bossPinHash });
assert.equal(bossLogin.ok, true);
bossToken = bossLogin.sessionToken;
assert.equal(employeeLogin.role, 'employee');
assert.equal(employeeLogin.employeeId, 'employee-1');
assert.equal(employeeLogin.data.employees.length, 1, '員工只能取得自己的員工紀錄');
assert.equal(employeeLogin.data.employees[0].id, 'employee-1');
assert.equal('pinHash' in employeeLogin.data.employees[0], false, '員工回應不得包含 PIN hash');
assert.deepEqual(Object.keys(employeeLogin.data.access), [], '員工回應不得包含老闆憑證');
assert.equal(employeeLogin.data.shifts.every(item => item.employeeId === 'employee-1'), true);
assert.equal(employeeLogin.data.attendance.every(item => item.employeeId === 'employee-1'), true);
assert.deepEqual(Object.keys(employeeLogin.data.leaves), ['employee-1-2026-07']);
assert.deepEqual(Object.keys(employeeLogin.data.payrollAdjustments), [], '員工回應不得包含公司薪資調整資料');
assert.equal(employeeLogin.data.removedEmployees.length, 0, '員工回應不得包含已移除員工');

reset();
const beforeAttack = structuredClone(stored);
const massAssignment = employeeRequest({ action: 'save', data: { employees: [], attendance: [], access: {} } });
assert.equal(massAssignment.ok, false, '員工全量 save 必須被拒絕');
assert.deepEqual(stored, beforeAttack, '被拒絕的員工 save 不得改動任何伺服器資料');

reset();
const currentMonth = context.taipeiMonth_(new Date());
const currentDate = `${currentMonth}-01`;
const leaveSaved = employeeRequest({ action: 'employeeSaveLeave', month: currentMonth, dates: [currentDate, currentDate] });
assert.equal(leaveSaved.ok, true, '員工應可儲存本人的有效休假日期');
assert.deepEqual(stored.leaves[`employee-1-${currentMonth}`], [currentDate], '重複日期必須去重');
assert.deepEqual(stored.leaves['employee-2-2026-07'], ['2026-07-03'], '不得改動其他員工休假');

const overQuota = employeeRequest({
  action: 'employeeSaveLeave',
  month: currentMonth,
  dates: [`${currentMonth}-01`, `${currentMonth}-02`, `${currentMonth}-03`]
});
assert.equal(overQuota.ok, false, '超過月休額度必須拒絕');

const invalidMonth = employeeRequest({ action: 'employeeSaveLeave', month: '2020-01', dates: ['2020-01-01'] });
assert.equal(invalidMonth.ok, false, '員工不得寫入非本月或下月的休假');

reset();
const clockIn = employeeRequest({ action: 'employeeClockIn', employeeId: 'employee-2' });
assert.equal(clockIn.ok, true);
const active = stored.attendance.find(item => item.clockIn && !item.clockOut);
assert.equal(active.employeeId, 'employee-1', '打卡員工 ID 必須由伺服器身份決定');
assert.match(active.id, /^server-uuid-/);
assert.equal(employeeRequest({ action: 'employeeClockIn' }).ok, false, '重複上班打卡必須拒絕');
assert.equal(employeeRequest({ action: 'employeeClockOut' }).ok, true, '本人應可完成下班打卡');
assert.equal(Boolean(stored.attendance.find(item => item.id === active.id).clockOut), true);
assert.equal(stored.attendance.find(item => item.id === active.id).hours >= 0.5, true);

reset();
const wrongPin = context.api({ action: 'employeeLogin', phone: '0922222222', pinHash: prehash('wrong') });
assert.equal(wrongPin.ok, false, '錯誤 PIN 不得讀取資料');
const legacyCredentialReplay = context.api({ action: 'pull', phone: '0922222222', pinHash: employeePinHash });
assert.equal(legacyCredentialReplay.code, 'SESSION_INVALID', '登入後不可繼續用 PIN hash 當 API 憑證');
assert.equal(bossRequest({ action: 'employeeClockIn' }).ok, false, '老闆身份不得偽裝成員工命令');
const bossSave = bossRequest({ action: 'save', baseRevision: 0, data: initial() });
assert.equal(bossSave.ok, true, '本 Sprint 不應破壞老闆既有儲存流程');

assert.match(cloudSource, /auth\.role\s*!==\s*'boss'/, '員工 localStorage 變更不得觸發全量 push');
assert.match(cloudSource, /employeeSaveLeave/);
assert.match(cloudSource, /employeeClockIn/);
assert.match(cloudSource, /employeeClockOut/);
assert.match(accessSource, /sheetsCloud\.saveEmployeeLeave/);
assert.match(accessSource, /員工登入狀態已失效/);
assert.match(workSource, /sheetsCloud\.clockInEmployee/);
assert.match(workSource, /sheetsCloud\.clockOutEmployee/);
assert.match(workSource, /員工登入狀態已失效/);

console.log('P0 employee authorization tests passed');
