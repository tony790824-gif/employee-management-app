import { assert } from './errors.mjs';

const PHONE_PATTERN = /^[0-9]{8,15}$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const PUSH_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const PUSH_PLATFORMS = Object.freeze(['windows', 'macos', 'android', 'ios', 'ipados', 'linux', 'unknown']);
const PUSH_ENDPOINT_HOSTS = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com'
]);
const PUSH_ENDPOINT_HOST_SUFFIXES = Object.freeze([
  'push.apple.com',
  'notify.windows.com'
]);
const ANNOUNCEMENT_AUDIENCES = Object.freeze(['ALL', 'MANAGER', 'EMPLOYEE']);

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

function validRequestId(value, field = 'requestId') {
  assert(typeof value === 'string' && UUID_PATTERN.test(value), 400, 'COMMAND_INVALID', `${field} must be a UUID.`);
  return value;
}

function validRevision(value) {
  assert(Number.isSafeInteger(value) && value >= 0, 400, 'COMMAND_INVALID', 'baseRevision must be a non-negative integer.');
  return value;
}

function requestReference(input) {
  const hasId = Object.prototype.hasOwnProperty.call(input, 'requestId');
  const hasRevision = Object.prototype.hasOwnProperty.call(input, 'baseRevision');
  assert(hasId === hasRevision, 400, 'COMMAND_INVALID', 'requestId and baseRevision must be supplied together.');
  return hasId
    ? { requestId: validRequestId(input.requestId), baseRevision: validRevision(input.baseRevision) }
    : {};
}

function pushEndpoint(value) {
  assert(typeof value === 'string' && value.length >= 32 && value.length <= 2048,
    400, 'COMMAND_INVALID', 'endpoint is invalid.');
  let url;
  try {
    url = new URL(value);
  } catch {
    assert(false, 400, 'COMMAND_INVALID', 'endpoint is invalid.');
  }
  const hostname = url.hostname.toLowerCase();
  const allowedHost = PUSH_ENDPOINT_HOSTS.includes(hostname)
    || PUSH_ENDPOINT_HOST_SUFFIXES.some(suffix =>
      hostname === suffix || hostname.endsWith(`.${suffix}`));
  assert(url.protocol === 'https:' && !url.username && !url.password
    && !url.hash && allowedHost, 400, 'COMMAND_INVALID', 'endpoint is not an approved Web Push service.');
  return url.href;
}

export function validateIdempotencyKey(value) {
  assert(typeof value === 'string' && IDEMPOTENCY_PATTERN.test(value), 400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key 格式不正確。');
  return value;
}

export function validateAnnouncementId(value) {
  return validRequestId(value, 'announcementId');
}

export function validateAnnouncementMutation(name, input, announcementId = '') {
  if (name === 'announcements.create') {
    exactKeys(input, ['title', 'content', 'audience'], ['title', 'content', 'audience']);
    assert(ANNOUNCEMENT_AUDIENCES.includes(input.audience),
      400, 'COMMAND_INVALID', 'audience is invalid.');
    return {
      title: text(input.title, 'title', { min: 1, max: 120 }),
      content: text(input.content, 'content', { min: 1, max: 10000 }),
      audience: input.audience
    };
  }
  const id = validateAnnouncementId(announcementId);
  if (name === 'announcements.update') {
    exactKeys(input, ['title', 'content', 'audience', 'baseRevision'],
      ['title', 'content', 'audience', 'baseRevision']);
    assert(ANNOUNCEMENT_AUDIENCES.includes(input.audience),
      400, 'COMMAND_INVALID', 'audience is invalid.');
    return {
      announcementId: id,
      title: text(input.title, 'title', { min: 1, max: 120 }),
      content: text(input.content, 'content', { min: 1, max: 10000 }),
      audience: input.audience,
      baseRevision: validRevision(input.baseRevision)
    };
  }
  if (name === 'announcements.delete') {
    exactKeys(input, ['baseRevision'], ['baseRevision']);
    return { announcementId: id, baseRevision: validRevision(input.baseRevision) };
  }
  if (name === 'announcements.mark-read') {
    exactKeys(input, []);
    return { announcementId: id };
  }
  throw new Error(`Unsupported announcement operation: ${name}`);
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
  if (name === 'schedule-leave-requests.submit') {
    exactKeys(input, ['requestId', 'baseRevision', 'month', 'dates'], ['month', 'dates']);
    assert(typeof input.month === 'string' && MONTH_PATTERN.test(input.month), 400, 'COMMAND_INVALID', 'month must use YYYY-MM.');
    assert(Array.isArray(input.dates) && input.dates.length <= 31, 400, 'COMMAND_INVALID', 'dates must contain at most 31 dates.');
    const validatedDates = input.dates.map(value => validDate(value));
    assert(new Set(validatedDates).size === validatedDates.length, 400, 'COMMAND_INVALID', 'dates must not contain duplicates.');
    assert(validatedDates.every(value => value.startsWith(`${input.month}-`)), 400, 'COMMAND_INVALID', 'Every date must be inside month.');
    return {
      ...requestReference(input),
      month: input.month,
      dates: [...validatedDates].sort()
    };
  }
  if (name === 'schedule-leave-requests.cancel') {
    exactKeys(input, ['requestId', 'baseRevision'], ['requestId', 'baseRevision']);
    return { requestId: validRequestId(input.requestId), baseRevision: validRevision(input.baseRevision) };
  }
  if (name === 'leave-requests.submit') {
    exactKeys(input, ['requestId', 'baseRevision', 'startDate', 'endDate', 'leaveType', 'reason'],
      ['startDate', 'endDate', 'leaveType', 'reason']);
    const startDate = validDate(input.startDate, 'startDate');
    const endDate = validDate(input.endDate, 'endDate');
    assert(endDate >= startDate, 400, 'COMMAND_INVALID', 'endDate must not be before startDate.');
    const duration = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
    assert(duration >= 1 && duration <= 31, 400, 'COMMAND_INVALID', 'A leave request may cover at most 31 days.');
    return {
      ...requestReference(input),
      startDate,
      endDate,
      leaveType: text(input.leaveType, 'leaveType', { min: 1, max: 60 }),
      reason: text(input.reason, 'reason', { min: 1, max: 2000 })
    };
  }
  if (name === 'leave-requests.cancel') {
    exactKeys(input, ['requestId', 'baseRevision'], ['requestId', 'baseRevision']);
    return { requestId: validRequestId(input.requestId), baseRevision: validRevision(input.baseRevision) };
  }
  if (name === 'time-off-requests.approve' || name === 'time-off-requests.reject') {
    exactKeys(input, ['requestId', 'baseRevision', 'reviewNote'], ['requestId', 'baseRevision']);
    return {
      requestId: validRequestId(input.requestId),
      baseRevision: validRevision(input.baseRevision),
      reviewNote: text(input.reviewNote ?? '', 'reviewNote', { max: 1000 })
    };
  }
  if (name === 'notifications.mark-read') {
    exactKeys(input, ['notificationId', 'baseRevision'], ['notificationId', 'baseRevision']);
    return {
      notificationId: validRequestId(input.notificationId, 'notificationId'),
      baseRevision: validRevision(input.baseRevision)
    };
  }
  if (name === 'notifications.mark-all-read') {
    exactKeys(input, []);
    return {};
  }
  if (name === 'notifications.update-preferences') {
    exactKeys(input, ['clockEvents', 'leaveEvents', 'shiftEvents'],
      ['clockEvents', 'leaveEvents', 'shiftEvents']);
    for (const field of ['clockEvents', 'leaveEvents', 'shiftEvents']) {
      assert(typeof input[field] === 'boolean', 400, 'COMMAND_INVALID', `${field} 必須是 boolean。`);
    }
    return {
      clockEvents: input.clockEvents,
      leaveEvents: input.leaveEvents,
      shiftEvents: input.shiftEvents
    };
  }
  if (name === 'push.register') {
    exactKeys(input, ['endpoint', 'expirationTime', 'p256dh', 'auth', 'userAgent', 'platform',
      'clientMode'],
      ['endpoint', 'expirationTime', 'p256dh', 'auth', 'userAgent', 'platform']);
    assert(input.expirationTime === null
      || (Number.isSafeInteger(input.expirationTime)
        && input.expirationTime >= 0
        && input.expirationTime <= 8_640_000_000_000_000),
    400, 'COMMAND_INVALID', 'expirationTime is invalid.');
    assert(typeof input.p256dh === 'string'
      && input.p256dh.length >= 80 && input.p256dh.length <= 120
      && PUSH_KEY_PATTERN.test(input.p256dh),
    400, 'COMMAND_INVALID', 'p256dh is invalid.');
    assert(typeof input.auth === 'string'
      && input.auth.length >= 16 && input.auth.length <= 64
      && PUSH_KEY_PATTERN.test(input.auth),
    400, 'COMMAND_INVALID', 'auth is invalid.');
    assert(PUSH_PLATFORMS.includes(input.platform), 400, 'COMMAND_INVALID', 'platform is invalid.');
    const clientMode = input.clientMode ?? 'browser';
    assert(['pwa', 'browser'].includes(clientMode), 400, 'COMMAND_INVALID', 'clientMode is invalid.');
    return {
      endpoint: pushEndpoint(input.endpoint),
      expirationTime: input.expirationTime,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: text(input.userAgent, 'userAgent', { max: 256 }),
      platform: input.platform,
      clientMode
    };
  }
  if (name === 'push.unregister' || name === 'push.test') {
    exactKeys(input, ['endpoint'], ['endpoint']);
    return { endpoint: pushEndpoint(input.endpoint) };
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
  'attendance.approve-hours',
  'schedule-leave-requests.submit',
  'schedule-leave-requests.cancel',
  'leave-requests.submit',
  'leave-requests.cancel',
  'time-off-requests.approve',
  'time-off-requests.reject',
  'notifications.mark-read',
  'notifications.mark-all-read',
  'notifications.update-preferences',
  'push.register',
  'push.unregister',
  'push.test'
]);

export const timeOffCommandNames = Object.freeze([
  'schedule-leave-requests.submit',
  'schedule-leave-requests.cancel',
  'leave-requests.submit',
  'leave-requests.cancel',
  'time-off-requests.approve',
  'time-off-requests.reject'
]);

export const notificationCommandNames = Object.freeze([
  'notifications.mark-read',
  'notifications.mark-all-read',
  'notifications.update-preferences'
]);

export const pushCommandNames = Object.freeze([
  'push.register',
  'push.unregister',
  'push.test'
]);
