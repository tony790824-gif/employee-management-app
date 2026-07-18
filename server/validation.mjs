import { assert } from './errors.mjs';

const PHONE_PATTERN = /^[0-9]{8,15}$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, required = []) {
  assert(plainObject(value), 400, 'COMMAND_INVALID', 'Command body 必須是 JSON object。');
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  assert(unknown.length === 0, 400, 'COMMAND_INVALID', 'Command body 含未知欄位。', { fields: unknown });
  const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  assert(missing.length === 0, 400, 'COMMAND_INVALID', 'Command body 缺少必要欄位。', { fields: missing });
}

function text(value, field, { min = 0, max = 1000 } = {}) {
  assert(typeof value === 'string', 400, 'COMMAND_INVALID', `${field} 必須是字串。`);
  const normalized = value.trim();
  assert(normalized.length >= min && normalized.length <= max, 400, 'COMMAND_INVALID', `${field} 長度不正確。`);
  return normalized;
}

function validDate(value, field = 'date') {
  assert(typeof value === 'string' && DATE_PATTERN.test(value), 400, 'COMMAND_INVALID', `${field} 格式必須是 YYYY-MM-DD。`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  assert(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, 400, 'COMMAND_INVALID', `${field} 不是有效日期。`);
  return value;
}

export function validateIdempotencyKey(value) {
  assert(typeof value === 'string' && IDEMPOTENCY_PATTERN.test(value), 400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key 格式不正確。');
  return value;
}

export function validateCommand(name, input) {
  if (name === 'employees.create') {
    exactKeys(input, ['name', 'phone', 'jobTitle', 'hourlyRate', 'leaveQuota'], ['name', 'phone', 'hourlyRate']);
    assert(PHONE_PATTERN.test(String(input.phone || '')), 400, 'COMMAND_INVALID', 'phone 必須是 8–15 位數字。');
    assert(Number.isSafeInteger(input.hourlyRate) && input.hourlyRate >= 0, 400, 'COMMAND_INVALID', 'hourlyRate 必須是非負整數。');
    const leaveQuota = input.leaveQuota ?? 8;
    assert(Number.isSafeInteger(leaveQuota) && leaveQuota >= 0 && leaveQuota <= 31, 400, 'COMMAND_INVALID', 'leaveQuota 必須是 0–31 整數。');
    return {
      name: text(input.name, 'name', { min: 1, max: 120 }),
      phone: input.phone,
      jobTitle: text(input.jobTitle ?? '', 'jobTitle', { max: 120 }),
      hourlyRate: input.hourlyRate,
      leaveQuota
    };
  }
  if (name === 'shifts.create') {
    exactKeys(input, ['employeeId', 'date', 'startTime', 'endTime', 'note'], ['employeeId', 'date', 'startTime', 'endTime']);
    assert(ID_PATTERN.test(String(input.employeeId || '')), 400, 'COMMAND_INVALID', 'employeeId 格式不正確。');
    assert(TIME_PATTERN.test(String(input.startTime || '')) && TIME_PATTERN.test(String(input.endTime || '')) && input.startTime < input.endTime, 400, 'COMMAND_INVALID', '班次時間格式或順序不正確。');
    return {
      employeeId: input.employeeId,
      date: validDate(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      note: text(input.note ?? '', 'note', { max: 1000 })
    };
  }
  if (name === 'leaves.replace-month') {
    exactKeys(input, ['employeeId', 'month', 'dates'], ['month', 'dates']);
    assert(input.employeeId === undefined || ID_PATTERN.test(String(input.employeeId)), 400, 'COMMAND_INVALID', 'employeeId 格式不正確。');
    assert(typeof input.month === 'string' && MONTH_PATTERN.test(input.month), 400, 'COMMAND_INVALID', 'month 格式必須是 YYYY-MM。');
    assert(Array.isArray(input.dates), 400, 'COMMAND_INVALID', 'dates 必須是日期陣列。');
    const dates = [...new Set(input.dates.map(value => validDate(value)))].sort();
    assert(dates.every(value => value.startsWith(`${input.month}-`)), 400, 'COMMAND_INVALID', '所有休假日必須屬於指定月份。');
    return { employeeId: input.employeeId, month: input.month, dates };
  }
  if (name === 'attendance.clock-in' || name === 'attendance.clock-out') {
    exactKeys(input, []);
    return {};
  }
  if (name === 'attendance.approve-hours') {
    exactKeys(input, ['attendanceId', 'hours', 'baseRevision'], ['attendanceId', 'hours', 'baseRevision']);
    assert(ID_PATTERN.test(String(input.attendanceId || '')), 400, 'COMMAND_INVALID', 'attendanceId 格式不正確。');
    assert(typeof input.hours === 'number' && Number.isFinite(input.hours) && input.hours >= 0 && Number.isInteger(input.hours * 2), 400, 'COMMAND_INVALID', 'hours 必須是非負 0.5 小時倍數。');
    assert(Number.isSafeInteger(input.baseRevision) && input.baseRevision >= 0, 400, 'COMMAND_INVALID', 'baseRevision 格式不正確。');
    return input;
  }
  throw new Error(`未註冊的 Command：${name}`);
}

export const commandNames = Object.freeze([
  'employees.create',
  'shifts.create',
  'leaves.replace-month',
  'attendance.clock-in',
  'attendance.clock-out',
  'attendance.approve-hours'
]);
