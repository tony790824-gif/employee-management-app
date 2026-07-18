import { createHash } from 'node:crypto';

const PHONE = /^[0-9]{8,15}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_TIMESTAMP = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const WORKSPACE = /^ws_[a-f0-9]{32}$/;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(path, message) {
  const error = new Error(`${path}: ${message}`);
  error.code = 'SNAPSHOT_INVALID';
  throw error;
}

function validDate(value, path) {
  if (typeof value !== 'string' || !DATE.test(value)) fail(path, '必須是 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(path, '日期不存在');
  return value;
}

function dateFromLegacy(value, path) {
  if (typeof value === 'string' && DATE.test(value.slice(0, 10))) return validDate(value.slice(0, 10), path);
  fail(path, '缺少有效日期');
}

function text(value, path, max, required = false) {
  if (value === undefined || value === null) {
    if (required) fail(path, '不可省略');
    return '';
  }
  if (typeof value !== 'string') fail(path, '必須是字串');
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) fail(path, '長度不正確');
  return normalized;
}

function integer(value, path, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, '必須是有效整數');
  return value;
}

function timestamp(value, path, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(path, '不得為空');
    return null;
  }
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) fail(path, '必須為 UTC ISO timestamp');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail(path, '不是有效 timestamp');
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function employeeRow(record, path, status = 'active', archive = null) {
  if (!object(record)) fail(path, '必須是 object');
  const id = text(record.id, `${path}.id`, 128, true);
  const phone = String(record.phone || '');
  if (!PHONE.test(phone)) fail(`${path}.phone`, '必須是 8–15 位數字');
  return {
    id,
    name: text(record.name, `${path}.name`, 120, true),
    jobTitle: text(record.role ?? record.jobTitle, `${path}.role`, 120),
    phone,
    hourlyRate: integer(record.rate ?? record.hourlyRate, `${path}.rate`, { min: 0, fallback: 0 }),
    leaveQuota: integer(record.leaveQuota, `${path}.leaveQuota`, { min: 0, max: 31, fallback: 8 }),
    status,
    deletedAt: timestamp(archive?.removedAt, `${path}.removedAt`),
    purgeAfter: timestamp(archive?.removeAfter, `${path}.removeAfter`)
  };
}

function shiftRow(record, path, employeeIds) {
  if (!object(record)) fail(path, '必須是 object');
  const employeeId = text(record.employeeId, `${path}.employeeId`, 128, true);
  if (!employeeIds.has(employeeId)) fail(`${path}.employeeId`, '找不到對應員工');
  const start = String(record.start || record.startTime || '');
  const end = String(record.end || record.endTime || '');
  if (!TIME.test(start) || !TIME.test(end) || start >= end) fail(path, '班次時間不正確');
  return {
    id: text(record.id, `${path}.id`, 128, true),
    employeeId,
    date: validDate(record.date, `${path}.date`),
    start,
    end,
    note: text(record.note, `${path}.note`, 1000)
  };
}

function attendanceRow(record, path, employeeIds) {
  if (!object(record)) fail(path, '必須是 object');
  const employeeId = text(record.employeeId, `${path}.employeeId`, 128, true);
  if (!employeeIds.has(employeeId)) fail(`${path}.employeeId`, '找不到對應員工');
  const hours = Number(record.hours ?? 0);
  if (!Number.isFinite(hours) || hours < 0 || !Number.isInteger(hours * 10)) fail(`${path}.hours`, '必須是非負一位小數');
  const clockInValue = timestamp(record.clockIn, `${path}.clockIn`);
  const clockOutValue = timestamp(record.clockOut, `${path}.clockOut`);
  const clockIn = clockInValue ? new Date(clockInValue) : null;
  const clockOut = clockOutValue ? new Date(clockOutValue) : null;
  if (record.clockIn && Number.isNaN(clockIn.getTime())) fail(`${path}.clockIn`, 'timestamp 不正確');
  if (record.clockOut && Number.isNaN(clockOut.getTime())) fail(`${path}.clockOut`, 'timestamp 不正確');
  if (clockOut && !clockIn) fail(path, 'clockOut 不可缺少 clockIn');
  if (clockIn && clockOut && clockOut < clockIn) fail(path, 'clockOut 不可早於 clockIn');
  return {
    id: text(record.id, `${path}.id`, 128, true),
    employeeId,
    date: validDate(record.date, `${path}.date`),
    type: text(record.type || '出勤', `${path}.type`, 60, true),
    hours,
    clockIn: clockInValue,
    clockOut: clockOutValue,
    note: text(record.note, `${path}.note`, 1000)
  };
}

export function mapSnapshot(snapshot, { workspaceId }) {
  if (!object(snapshot)) fail('$', '根節點必須是 object');
  if (!WORKSPACE.test(workspaceId)) fail('workspaceId', '格式不正確');
  if (snapshot.workspace?.id && snapshot.workspace.id !== workspaceId) fail('workspace.id', '與指定 workspaceId 不一致');
  const revision = integer(snapshot.sync?.revision, 'sync.revision', { min: 0, fallback: 0 });
  const employees = (Array.isArray(snapshot.employees) ? snapshot.employees : []).map((record, index) => employeeRow(record, `employees[${index}]`));
  const employeeIds = new Set(employees.map(item => item.id));
  const phones = new Set();
  for (const employee of employees) {
    if (phones.has(employee.phone)) fail('employees', `電話重複：${employee.phone}`);
    phones.add(employee.phone);
  }
  const archivedEmployees = [];
  for (const [index, archive] of (Array.isArray(snapshot.removedEmployees) ? snapshot.removedEmployees : []).entries()) {
    if (!object(archive) || !object(archive.employee)) fail(`removedEmployees[${index}]`, '格式不正確');
    if (employeeIds.has(String(archive.employee.id || ''))) continue;
    const row = employeeRow(archive.employee, `removedEmployees[${index}].employee`, 'archived', archive);
    if (phones.has(row.phone)) fail(`removedEmployees[${index}].employee.phone`, '電話與現有員工重複');
    employeeIds.add(row.id);
    phones.add(row.phone);
    archivedEmployees.push(row);
  }
  const shifts = (Array.isArray(snapshot.shifts) ? snapshot.shifts : []).map((record, index) => shiftRow(record, `shifts[${index}]`, employeeIds));
  const attendance = (Array.isArray(snapshot.attendance) ? snapshot.attendance : []).map((record, index) => attendanceRow(record, `attendance[${index}]`, employeeIds));
  const leaves = [];
  if (snapshot.leaves !== undefined && !object(snapshot.leaves)) fail('leaves', '必須是 object map');
  for (const [key, dates] of Object.entries(snapshot.leaves || {})) {
    if (!Array.isArray(dates)) fail(`leaves.${key}`, '必須是日期陣列');
    const employeeId = [...employeeIds].find(id => key.startsWith(`${id}-`));
    if (!employeeId) fail(`leaves.${key}`, '找不到對應員工');
    const month = key.slice(employeeId.length + 1);
    for (const [index, value] of dates.entries()) {
      const date = validDate(value, `leaves.${key}[${index}]`);
      if (!date.startsWith(`${month}-`)) fail(`leaves.${key}[${index}]`, '日期與 map 月份不一致');
      leaves.push({ employeeId, date });
    }
  }
  const payrollAdjustments = [];
  const adjustments = snapshot.payrollAdjustments === undefined || snapshot.payrollAdjustments === null || (Array.isArray(snapshot.payrollAdjustments) && snapshot.payrollAdjustments.length === 0)
    ? {} : snapshot.payrollAdjustments;
  if (!object(adjustments)) fail('payrollAdjustments', '必須是 object map');
  for (const [key, records] of Object.entries(adjustments)) {
    if (!Array.isArray(records)) fail(`payrollAdjustments.${key}`, '必須是陣列');
    const employeeId = [...employeeIds].find(id => key.startsWith(`${id}-`));
    if (!employeeId) fail(`payrollAdjustments.${key}`, '找不到對應員工');
    const month = key.slice(employeeId.length + 1);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(`payrollAdjustments.${key}`, '月份格式不正確');
    records.forEach((record, index) => {
      if (!object(record)) fail(`payrollAdjustments.${key}[${index}]`, '必須是 object');
      payrollAdjustments.push({
        employeeId,
        month,
        amount: integer(record.amount, `payrollAdjustments.${key}[${index}].amount`),
        date: dateFromLegacy(record.date || `${month}-01`, `payrollAdjustments.${key}[${index}].date`),
        note: text(record.note, `payrollAdjustments.${key}[${index}].note`, 1000)
      });
    });
  }
  const bossPhone = String(snapshot.access?.bossPhone || '');
  if (bossPhone && !PHONE.test(bossPhone)) fail('access.bossPhone', '格式不正確');
  const canonical = stableJson(snapshot);
  return {
    checksum: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    revision,
    workspaceId,
    workspaceName: text(snapshot.workspace?.name || '我的班表', 'workspace.name', 120, true),
    bossPhone: bossPhone || null,
    employees,
    archivedEmployees,
    shifts,
    attendance,
    leaves,
    payrollAdjustments,
    warnings: ['既有 PIN credential 不會匯入 PostgreSQL；所有帳號必須透過正式 Identity Provider 重新啟用。']
  };
}
