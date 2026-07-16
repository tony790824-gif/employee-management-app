// 班表 APP：Google Sheets / Apps Script 免費雲端後端
const APP_ORIGIN = 'https://inspiring-sunshine-9eab99.netlify.app';
const DATA_SHEET = '_班表APP資料';
const WORKSPACE_PROPERTY_KEY = 'SHIFT_APP_WORKSPACE_ID';
const SESSION_PROPERTY_PREFIX = 'SHIFT_APP_SESSION_';
const AUTH_THROTTLE_PROPERTY_PREFIX = 'SHIFT_APP_AUTH_THROTTLE_';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LOCK_MS = 15 * 60 * 1000;
const AUTH_FAILURE_LIMIT = 5;
const MAX_ACTIVE_SESSIONS = 100;
const MAX_AUTH_THROTTLE_RECORDS = 200;
const CREDENTIAL_PEPPER_PROPERTY_KEY = 'SHIFT_APP_CREDENTIAL_PEPPER';
const CREDENTIAL_SCHEME = 'iterated-hmac-sha256-v1';
const CREDENTIAL_ITERATIONS = 4096;
const CREDENTIAL_SALT_HEX_LENGTH = 32;
const RECOVERY_FORMAT = 'banke-recovery-v1';
const RECOVERY_FOLDER_NAME = '班客邦系統復原備份';
const RECOVERY_FILE_PREFIX = 'banke-recovery-';
const RECOVERY_FOLDER_PROPERTY_KEY = 'SHIFT_APP_RECOVERY_FOLDER_ID';
const LAST_BACKUP_FILE_PROPERTY_KEY = 'SHIFT_APP_LAST_BACKUP_FILE_ID';
const RESTORE_CONFIRMATION_PROPERTY_KEY = 'SHIFT_APP_RESTORE_CONFIRMATION';
const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_ARRAY_FIELDS = ['employees', 'shifts', 'attendance', 'leaveHistory', 'removedEmployees'];
const SNAPSHOT_OBJECT_FIELDS = ['workspace', 'sync', 'leaves', 'leaveRequests', 'access', 'payrollAdjustments'];
const SNAPSHOT_ARRAY_MAP_FIELDS = ['leaves', 'leaveRequests', 'payrollAdjustments'];
const SNAPSHOT_OBJECT_ARRAY_MAP_FIELDS = ['leaveRequests', 'payrollAdjustments'];
const BOSS_SAVE_ALLOWED_FIELDS = SNAPSHOT_ARRAY_FIELDS.concat(SNAPSHOT_OBJECT_FIELDS);
const BOSS_SAVE_MUTABLE_FIELDS = ['employees', 'shifts', 'attendance', 'leaves', 'leaveRequests', 'leaveHistory', 'removedEmployees', 'payrollAdjustments'];
const REQUEST_PAYLOAD_MAX_BYTES = 1024 * 1024;
const PHONE_DIGIT_MIN_LENGTH = 8;
const PHONE_DIGIT_MAX_LENGTH = 15;

function doGet() {
  return messagePage_({ channel: 'staff-sheets', type: 'ready' });
}

// APP 使用隱藏表單 POST，避開 Apps Script 外層 iframe 限制。
function doPost(e) {
  const requestId = String(e && e.parameter && e.parameter.requestId || '');
  try {
    if (requestPayloadByteLength_(e) > REQUEST_PAYLOAD_MAX_BYTES) {
      return messagePage_({
        channel: 'staff-sheets',
        requestId: requestId,
        response: fail_('請求資料超過 1 MiB 上限。', 'REQUEST_PAYLOAD_TOO_LARGE')
      });
    }
    const payload = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
    return messagePage_({ channel: 'staff-sheets', requestId: payload.requestId || requestId, response: api(payload.request || {}) });
  } catch (error) {
    return messagePage_({ channel: 'staff-sheets', requestId: requestId, response: fail_(error.message || '雲端處理失敗。', error.code || 'REQUEST_FAILED') });
  }
}

function requestPayloadByteLength_(event) {
  const postedBody = event && event.postData && typeof event.postData.contents === 'string'
    ? event.postData.contents
    : '';
  const rawBody = postedBody || String(event && event.parameter && event.parameter.payload || '');
  return utf8ByteLength_(rawBody, REQUEST_PAYLOAD_MAX_BYTES + 1);
}

function utf8ByteLength_(value, stopAfter) {
  const text = String(value || '');
  const limit = Number.isSafeInteger(stopAfter) && stopAfter >= 0 ? stopAfter : Number.MAX_SAFE_INTEGER;
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length
      && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes >= limit) return bytes;
  }
  return bytes;
}

function messagePage_(message) {
  const safe = JSON.stringify(message).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><script>window.top.postMessage(' + safe + ',' + JSON.stringify(APP_ORIGIN) + ');</script>')
    .setTitle('班表 APP 雲端同步')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function api(request) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let data = readData_();
    const cleanupChanged = cleanupRemoved_(data);
    ensureSync_(data);
    if (cleanupChanged) bumpRevision_(data);
    const action = String(request.action || '');
    if (action === 'bossLogin') {
      const phone = cleanPhone_(request.phone);
      const pinHash = normalizePrehash_(request.pinHash);
      if (!phone || !pinHash) return fail_('請輸入電話號碼與 PIN。');
      const limited = rateLimitResponse_(phone);
      if (limited) return limited;
      data.access = data.access || {};
      let initialized = false;
      let credentialMigrated = false;
      if (!hasCredential_(data.access, 'bossPinCredential', 'bossPinHash')) {
        const ownerPhone = configuredOwnerPhone_();
        if (!ownerPhone) return fail_('雲端尚未設定老闆電話，請先完成 Apps Script 安全設定。', 'OWNER_NOT_CONFIGURED');
        if (ownerPhone !== phone) {
          burnCredentialCheck_(pinHash);
          return loginFailure_(phone, '電話號碼或 PIN 不正確。', 'BOSS_NOT_AUTHORIZED');
        }
        const initial = request.initialData && typeof request.initialData === 'object' ? request.initialData : {};
        data = mergeInitial_(data, initial);
        data.access = { bossPhone: phone, bossPinCredential: createCredential_(pinHash) };
        validateSnapshotShape_(data, 'REQUEST_DATA_INVALID', { rejectNewNegativePayrollAdjustments: true });
        initialized = true;
      } else {
        if (data.access.bossPhone !== phone) {
          burnCredentialCheck_(pinHash);
          return loginFailure_(phone, '電話號碼或 PIN 不正確。');
        }
        const verification = verifyCredential_(data.access, 'bossPinCredential', 'bossPinHash', pinHash);
        if (!verification.ok) return loginFailure_(phone, '電話號碼或 PIN 不正確。');
        credentialMigrated = verification.migrated;
      }
      const workspaceId = ensureWorkspace_(data);
      clearLoginFailures_(phone);
      ensureSync_(data);
      if (initialized || credentialMigrated) bumpRevision_(data);
      writeData_(data);
      return attachSession_(bossResponse_(data), { role: 'boss', workspaceId: workspaceId });
    }
    if (action === 'employeeLogin') return loginEmployee_(data, request);
    if (action === 'logout') {
      revokeSession_(request.sessionToken);
      return { ok: true };
    }
    const identity = authenticateSession_(request.sessionToken, data);
    if (!identity) return fail_('登入狀態已失效，請重新登入。', 'SESSION_INVALID');
    if (action === 'pull') {
      writeData_(data);
      return identity.role === 'employee'
        ? employeeResponse_(data, identity.employeeId)
        : bossResponse_(data);
    }
    if (action === 'save') {
      if (identity.role !== 'boss') return fail_('員工帳號不可覆寫公司資料。');
      const incoming = request.data;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return fail_('沒有可儲存的資料。', 'REQUEST_DATA_INVALID');
      const baseRevision = requestRevision_(request.baseRevision);
      if (baseRevision === null) return fail_('缺少資料版本，請重新整理後再試。', 'REVISION_REQUIRED');
      if (baseRevision !== revisionOf_(data)) return revisionConflict_(data);
      const validatedIncoming = validateBossSaveRequest_(incoming, data);
      const merged = mergeBossSave_(data, validatedIncoming);
      cleanupRemoved_(merged);
      revokeMissingEmployeeSessions_(merged.employees);
      bumpRevision_(merged);
      writeData_(merged);
      return bossResponse_(merged);
    }
    if (action === 'employeeSaveLeave') {
      if (identity.role !== 'employee') return fail_('只有員工可以儲存自己的休假。');
      const leaveResult = saveEmployeeLeave_(data, identity.employeeId, request.month, request.dates);
      if (!leaveResult.ok) return leaveResult;
      bumpRevision_(data);
      writeData_(data);
      return employeeResponse_(data, identity.employeeId);
    }
    if (action === 'employeeClockIn') {
      if (identity.role !== 'employee') return fail_('只有員工可以打卡。');
      const clockInResult = clockInEmployee_(data, identity.employeeId);
      if (!clockInResult.ok) return clockInResult;
      bumpRevision_(data);
      writeData_(data);
      return employeeResponse_(data, identity.employeeId);
    }
    if (action === 'employeeClockOut') {
      if (identity.role !== 'employee') return fail_('只有員工可以打卡。');
      const clockOutResult = clockOutEmployee_(data, identity.employeeId);
      if (!clockOutResult.ok) return clockOutResult;
      bumpRevision_(data);
      writeData_(data);
      return employeeResponse_(data, identity.employeeId);
    }
    return fail_('未知操作。');
  } catch (error) {
    return fail_(error.message || '雲端處理失敗。', error.code || 'REQUEST_FAILED');
  } finally { lock.releaseLock(); }
}

function employeeResponse_(data, employeeId) {
  return { ok: true, role: 'employee', employeeId: employeeId, workspaceId: workspaceIdFromData_(data), data: employeeView_(data, employeeId) };
}

function bossResponse_(data) {
  return { ok: true, role: 'boss', workspaceId: workspaceIdFromData_(data), data: bossView_(data) };
}

function bossView_(data) {
  const safe = JSON.parse(JSON.stringify(data || emptyData_()));
  safe.workspace = { id: workspaceIdFromData_(data) };
  safe.sync = { revision: revisionOf_(data) };
  safe.access = { bossConfigured: hasCredential_(data && data.access, 'bossPinCredential', 'bossPinHash') };
  safe.employees = (data.employees || []).map(safeEmployee_);
  safe.removedEmployees = (data.removedEmployees || []).map(record => {
    const copy = JSON.parse(JSON.stringify(record || {}));
    if (copy.employee) copy.employee = safeEmployee_(copy.employee);
    return copy;
  });
  return safe;
}

function safeEmployee_(employee) {
  const copy = {};
  Object.keys(employee || {}).forEach(key => {
    if (key !== 'pinHash' && key !== 'pinCredential' && key !== 'activationCodeHash' && key !== 'activationCredential' && key !== 'credentialAction') copy[key] = employee[key];
  });
  copy.credentialState = hasCredential_(employee, 'pinCredential', 'pinHash')
    ? 'active'
    : hasCredential_(employee, 'activationCredential', 'activationCodeHash') ? 'pending' : 'missing';
  return copy;
}

function mergeBossSave_(stored, incoming) {
  const merged = JSON.parse(JSON.stringify(stored || emptyData_()));
  BOSS_SAVE_MUTABLE_FIELDS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      merged[key] = JSON.parse(JSON.stringify(incoming[key]));
    }
  });
  merged.workspace = JSON.parse(JSON.stringify((stored && stored.workspace) || {}));
  merged.sync = { revision: revisionOf_(stored) };
  merged.access = JSON.parse(JSON.stringify((stored && stored.access) || {}));
  const existingById = new Map(((stored && stored.employees) || []).map(employee => [employee.id, employee]));
  merged.employees = (Array.isArray(merged.employees) ? merged.employees : []).map(employee => {
    const current = existingById.get(employee.id);
    const requestedActivation = normalizePrehash_(employee.activationCodeHash);
    delete employee.credentialState;
    delete employee.credentialAction;
    delete employee.pinHash;
    delete employee.pinCredential;
    delete employee.activationCredential;
    if (requestedActivation) {
      employee.activationCredential = createCredential_(requestedActivation);
      delete employee.activationCodeHash;
    } else if (current) {
      if (current.pinCredential) employee.pinCredential = JSON.parse(JSON.stringify(current.pinCredential));
      if (current.pinHash) employee.pinHash = current.pinHash;
      if (current.activationCredential) employee.activationCredential = JSON.parse(JSON.stringify(current.activationCredential));
      if (current.activationCodeHash) employee.activationCodeHash = current.activationCodeHash;
    } else {
      delete employee.activationCodeHash;
    }
    return employee;
  });
  merged.removedEmployees = (Array.isArray(merged.removedEmployees) ? merged.removedEmployees : []).map(record => {
    if (record && record.employee) {
      delete record.employee.pinHash;
      delete record.employee.pinCredential;
      delete record.employee.activationCodeHash;
      delete record.employee.activationCredential;
      delete record.employee.credentialState;
      delete record.employee.credentialAction;
    }
    return record;
  });
  return merged;
}

function loginEmployee_(data, request) {
  const phone = cleanPhone_(request.phone);
  const pinHash = normalizePrehash_(request.pinHash);
  if (!phone || !pinHash) return fail_('請輸入電話號碼與 PIN。');
  const limited = rateLimitResponse_(phone);
  if (limited) return limited;
  const employee = (data.employees || []).find(item => cleanPhone_(item.phone) === phone);
  if (!employee) {
    burnCredentialCheck_(pinHash);
    return loginFailure_(phone, '電話號碼或 PIN 不正確。');
  }
  if (hasCredential_(employee, 'pinCredential', 'pinHash')) {
    const verification = verifyCredential_(employee, 'pinCredential', 'pinHash', pinHash);
    if (!verification.ok) return loginFailure_(phone, '電話號碼或 PIN 不正確。');
    const workspaceId = ensureWorkspace_(data);
    clearLoginFailures_(phone);
    if (verification.migrated) bumpRevision_(data);
    writeData_(data);
    return attachSession_(employeeResponse_(data, employee.id), { role: 'employee', employeeId: employee.id, workspaceId: workspaceId });
  }
  if (!hasCredential_(employee, 'activationCredential', 'activationCodeHash')) {
    return fail_('帳號尚未取得啟用碼，請老闆重新產生員工啟用碼。', 'ACTIVATION_NOT_CONFIGURED');
  }
  const activationHash = normalizePrehash_(request.activationHash);
  if (!activationHash) return fail_('第一次登入需要輸入老闆提供的一次性啟用碼。', 'ACTIVATION_REQUIRED');
  const activationVerification = verifyCredential_(employee, 'activationCredential', 'activationCodeHash', activationHash);
  if (!activationVerification.ok) return loginFailure_(phone, '一次性啟用碼不正確。', 'ACTIVATION_INVALID');
  employee.pinCredential = createCredential_(pinHash);
  delete employee.pinHash;
  delete employee.activationCodeHash;
  delete employee.activationCredential;
  const workspaceId = ensureWorkspace_(data);
  clearLoginFailures_(phone);
  bumpRevision_(data);
  writeData_(data);
  return attachSession_(employeeResponse_(data, employee.id), { role: 'employee', employeeId: employee.id, workspaceId: workspaceId });
}

function employeeView_(data, employeeId) {
  const employee = (data.employees || []).find(item => item.id === employeeId);
  if (!employee) return emptyData_();
  const safeEmployee = safeEmployee_(employee);
  const ownMap = source => Object.keys(source || {}).reduce((result, key) => {
    if (key.indexOf(employeeId + '-') === 0) result[key] = source[key];
    return result;
  }, {});
  return {
    workspace: { id: workspaceIdFromData_(data) },
    sync: { revision: revisionOf_(data) },
    employees: [safeEmployee],
    shifts: (data.shifts || []).filter(item => item.employeeId === employeeId),
    attendance: (data.attendance || []).filter(item => item.employeeId === employeeId),
    leaves: ownMap(data.leaves),
    leaveRequests: ownMap(data.leaveRequests),
    leaveHistory: (data.leaveHistory || []).filter(item => item.employeeId === employeeId),
    removedEmployees: [],
    access: {},
    payrollAdjustments: {}
  };
}

function saveEmployeeLeave_(data, employeeId, monthValue, dateValues) {
  const month = String(monthValue || '');
  if (!allowedEmployeeMonth_(month)) return fail_('只能儲存本月或下個月的休假。');
  if (!Array.isArray(dateValues)) return fail_('休假日期格式不正確。');
  const employee = (data.employees || []).find(item => item.id === employeeId);
  if (!employee) return fail_('找不到員工資料。');
  const quotaValue = Number(employee.leaveQuota);
  const quota = Number.isFinite(quotaValue) ? Math.max(0, Math.min(31, Math.floor(quotaValue))) : 8;
  const dates = Array.from(new Set(dateValues.map(value => String(value || ''))));
  if (dates.length > quota) return fail_('選擇的休假天數超過本月額度。');
  if (dates.some(date => !validDateInMonth_(date, month))) return fail_('休假日期不正確。');
  const key = employeeId + '-' + month;
  data.leaves = data.leaves || {};
  data.leaveRequests = data.leaveRequests || {};
  data.leaves[key] = dates.sort();
  delete data.leaveRequests[key];
  return { ok: true };
}

function clockInEmployee_(data, employeeId) {
  const now = new Date();
  const date = taipeiDate_(now);
  data.attendance = data.attendance || [];
  const active = data.attendance.find(item => item.employeeId === employeeId && item.type === '出勤' && item.clockIn && !item.clockOut);
  if (active) return fail_('目前已有尚未下班的打卡紀錄。');
  data.attendance.push({
    id: Utilities.getUuid(),
    employeeId: employeeId,
    date: date,
    type: '出勤',
    hours: 0,
    clockIn: now.toISOString(),
    note: '員工已打卡上班'
  });
  return { ok: true };
}

function clockOutEmployee_(data, employeeId) {
  const active = (data.attendance || []).find(item => item.employeeId === employeeId && item.type === '出勤' && item.clockIn && !item.clockOut);
  if (!active) return fail_('找不到尚未下班的打卡紀錄。');
  const now = new Date();
  const startedAt = new Date(active.clockIn).getTime();
  if (!Number.isFinite(startedAt) || startedAt > now.getTime()) return fail_('上班打卡時間不正確。');
  active.clockOut = now.toISOString();
  active.hours = Math.max(0.5, Math.round(((now.getTime() - startedAt) / 3600000) * 2) / 2);
  active.note = '員工已完成打卡；老闆可在出勤／請假調整時數。';
  return { ok: true };
}

function allowedEmployeeMonth_(month) {
  const current = taipeiMonth_(new Date());
  const parts = current.split('-').map(Number);
  const next = new Date(Date.UTC(parts[0], parts[1], 1));
  const nextMonth = next.getUTCFullYear() + '-' + String(next.getUTCMonth() + 1).padStart(2, '0');
  return month === current || month === nextMonth;
}

function validDateInMonth_(date, month) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) return false;
  const parts = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() === parts[1] - 1 && parsed.getUTCDate() === parts[2];
}

function taipeiMonth_(date) { return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM'); }
function taipeiDate_(date) { return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd'); }

function configuredOwnerPhone_() {
  if (typeof PropertiesService === 'undefined') return '';
  const properties = PropertiesService.getScriptProperties();
  return cleanPhone_(properties.getProperty('SHIFT_APP_OWNER_PHONE'));
}

function ensureWorkspace_(data) {
  const properties = scriptProperties_();
  const propertyId = String(properties.getProperty(WORKSPACE_PROPERTY_KEY) || '');
  const dataId = workspaceIdFromData_(data);
  if (propertyId && !validWorkspaceId_(propertyId)) throw workspaceError_('工作區設定格式無效，已停止雲端存取。');
  if (dataId && !validWorkspaceId_(dataId)) throw workspaceError_('資料中的工作區格式無效，已停止雲端存取。');
  if (propertyId && dataId && propertyId !== dataId) throw workspaceError_('工作區設定與資料不一致，已停止雲端存取以避免公司資料混用。');
  const workspaceId = propertyId || dataId || newWorkspaceId_();
  if (!propertyId) properties.setProperty(WORKSPACE_PROPERTY_KEY, workspaceId);
  data.workspace = { id: workspaceId };
  return workspaceId;
}

function requireWorkspace_(data) {
  const propertyId = String(scriptProperties_().getProperty(WORKSPACE_PROPERTY_KEY) || '');
  const dataId = workspaceIdFromData_(data);
  if (!validWorkspaceId_(propertyId) || !validWorkspaceId_(dataId) || propertyId !== dataId) return '';
  return propertyId;
}

function workspaceIdFromData_(data) {
  return String(data && data.workspace && data.workspace.id || '');
}

function validWorkspaceId_(value) { return /^ws_[a-f0-9]{32}$/i.test(String(value || '')); }
function newWorkspaceId_() { return 'ws_' + sha256_(Utilities.getUuid()).slice(0, 32); }
function workspaceError_(message) { const error = new Error(message); error.code = 'WORKSPACE_MISMATCH'; return error; }

function attachSession_(response, identity) {
  const session = issueSession_(identity);
  response.sessionToken = session.token;
  response.sessionExpiresAt = session.expiresAt;
  return response;
}

function issueSession_(identity) {
  cleanupSessionProperties_();
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const tokenHash = sha256_(token);
  const now = Date.now();
  const record = {
    role: identity.role,
    employeeId: identity.employeeId || '',
    workspaceId: identity.workspaceId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };
  scriptProperties_().setProperty(SESSION_PROPERTY_PREFIX + tokenHash, JSON.stringify(record));
  return { token: token, expiresAt: record.expiresAt };
}

function authenticateSession_(tokenValue, data) {
  const token = String(tokenValue || '');
  if (!token) return null;
  const key = SESSION_PROPERTY_PREFIX + sha256_(token);
  const properties = scriptProperties_();
  const record = parseJson_(properties.getProperty(key));
  const workspaceId = requireWorkspace_(data);
  if (!record || record.expiresAt <= Date.now() || (record.role !== 'boss' && record.role !== 'employee')) {
    properties.deleteProperty(key);
    return null;
  }
  if (!workspaceId || record.workspaceId !== workspaceId) {
    properties.deleteProperty(key);
    return null;
  }
  if (record.role === 'employee' && !(data.employees || []).some(item => item.id === record.employeeId)) {
    properties.deleteProperty(key);
    return null;
  }
  return { role: record.role, employeeId: record.employeeId || '', workspaceId: workspaceId };
}

function revokeSession_(tokenValue) {
  const token = String(tokenValue || '');
  if (!token) return;
  scriptProperties_().deleteProperty(SESSION_PROPERTY_PREFIX + sha256_(token));
}

function revokeMissingEmployeeSessions_(employees) {
  const activeIds = new Set((employees || []).map(item => item.id));
  const properties = scriptProperties_();
  const values = properties.getProperties();
  Object.keys(values).forEach(key => {
    if (key.indexOf(SESSION_PROPERTY_PREFIX) !== 0) return;
    const record = parseJson_(values[key]);
    if (record && record.role === 'employee' && !activeIds.has(record.employeeId)) properties.deleteProperty(key);
  });
}

function cleanupSessionProperties_() {
  const properties = scriptProperties_();
  const values = properties.getProperties();
  const now = Date.now();
  const active = [];
  Object.keys(values).forEach(key => {
    if (key.indexOf(SESSION_PROPERTY_PREFIX) !== 0) return;
    const record = parseJson_(values[key]);
    if (!record || record.expiresAt <= now) properties.deleteProperty(key);
    else active.push({ key: key, createdAt: Number(record.createdAt) || 0 });
  });
  active.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_ACTIVE_SESSIONS - 1)
    .forEach(item => properties.deleteProperty(item.key));
}

function rateLimitResponse_(phone) {
  const key = authThrottleKey_(phone);
  const properties = scriptProperties_();
  const record = parseJson_(properties.getProperty(key));
  const now = Date.now();
  if (!record) return null;
  if (record.lockedUntil > now) return rateLimitFailure_(record.lockedUntil - now);
  if (record.firstAttemptAt + AUTH_WINDOW_MS <= now) properties.deleteProperty(key);
  return null;
}

function loginFailure_(phone, message, code) {
  const limited = recordLoginFailure_(phone);
  return limited || fail_(message, code);
}

function recordLoginFailure_(phone) {
  const properties = scriptProperties_();
  const key = authThrottleKey_(phone);
  const now = Date.now();
  let record = parseJson_(properties.getProperty(key));
  if (!record || record.firstAttemptAt + AUTH_WINDOW_MS <= now) record = { count: 0, firstAttemptAt: now, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= AUTH_FAILURE_LIMIT) record.lockedUntil = now + AUTH_LOCK_MS;
  properties.setProperty(key, JSON.stringify(record));
  cleanupThrottleProperties_();
  return record.lockedUntil > now ? rateLimitFailure_(record.lockedUntil - now) : null;
}

function clearLoginFailures_(phone) {
  scriptProperties_().deleteProperty(authThrottleKey_(phone));
}

function rateLimitFailure_(remainingMs) {
  const response = fail_('登入嘗試次數過多，請稍後再試。', 'AUTH_RATE_LIMITED');
  response.retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return response;
}

function cleanupThrottleProperties_() {
  const properties = scriptProperties_();
  const values = properties.getProperties();
  const now = Date.now();
  const active = [];
  Object.keys(values).forEach(key => {
    if (key.indexOf(AUTH_THROTTLE_PROPERTY_PREFIX) !== 0) return;
    const record = parseJson_(values[key]);
    if (!record || (record.lockedUntil <= now && record.firstAttemptAt + AUTH_WINDOW_MS <= now)) properties.deleteProperty(key);
    else active.push({ key: key, firstAttemptAt: Number(record.firstAttemptAt) || 0 });
  });
  active.sort((a, b) => b.firstAttemptAt - a.firstAttemptAt).slice(MAX_AUTH_THROTTLE_RECORDS)
    .forEach(item => properties.deleteProperty(item.key));
}

function authThrottleKey_(phone) { return AUTH_THROTTLE_PROPERTY_PREFIX + sha256_(cleanPhone_(phone)); }
function scriptProperties_() { return PropertiesService.getScriptProperties(); }
function parseJson_(value) { try { return JSON.parse(String(value || '')); } catch (_) { return null; } }
function hasCredential_(record, credentialKey, legacyKey) {
  return Boolean(record && (record[credentialKey] || record[legacyKey]));
}
function normalizePrehash_(value) {
  const normalized = String(value || '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : '';
}
function createCredential_(prehash) {
  const normalized = normalizePrehash_(prehash);
  if (!normalized) throw new Error('憑證格式不正確。');
  const salt = sha256_(Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now()).slice(0, CREDENTIAL_SALT_HEX_LENGTH);
  return {
    scheme: CREDENTIAL_SCHEME,
    salt: salt,
    iterations: CREDENTIAL_ITERATIONS,
    hash: deriveCredential_(normalized, salt, CREDENTIAL_ITERATIONS)
  };
}
function verifyCredential_(record, credentialKey, legacyKey, prehash) {
  const normalized = normalizePrehash_(prehash);
  if (!record || !normalized) return { ok: false, migrated: false };
  if (record[credentialKey]) {
    const credential = record[credentialKey];
    if (!validCredential_(credential)) return { ok: false, migrated: false };
    const candidate = deriveCredential_(normalized, credential.salt, credential.iterations);
    return { ok: constantTimeEqual_(credential.hash, candidate), migrated: false };
  }
  const legacy = normalizePrehash_(record[legacyKey]);
  if (!legacy || !constantTimeEqual_(legacy, normalized)) return { ok: false, migrated: false };
  record[credentialKey] = createCredential_(normalized);
  delete record[legacyKey];
  return { ok: true, migrated: true };
}
function validCredential_(credential) {
  return Boolean(
    credential && typeof credential === 'object' && !Array.isArray(credential)
    && credential.scheme === CREDENTIAL_SCHEME
    && /^[a-f0-9]{32}$/.test(String(credential.salt || ''))
    && Number.isInteger(credential.iterations)
    && credential.iterations >= 1024
    && credential.iterations <= 10000
    && /^[a-f0-9]{64}$/.test(String(credential.hash || ''))
  );
}
function deriveCredential_(prehash, salt, iterations) {
  const pepper = credentialPepper_();
  let result = hmacSha256_(String(prehash) + ':' + String(salt), pepper);
  for (let index = 1; index < iterations; index += 1) {
    result = hmacSha256_(result + ':' + String(salt) + ':' + index, pepper);
  }
  return result;
}
function credentialPepper_() {
  const properties = scriptProperties_();
  let pepper = String(properties.getProperty(CREDENTIAL_PEPPER_PROPERTY_KEY) || '');
  if (pepper) {
    if (/^[a-f0-9]{64}$/.test(pepper)) return pepper;
    const error = new Error('伺服器憑證金鑰設定損壞，請停止登入並聯絡系統管理員。');
    error.code = 'CREDENTIAL_CONFIG_INVALID';
    throw error;
  }
  pepper = sha256_(Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now());
  properties.setProperty(CREDENTIAL_PEPPER_PROPERTY_KEY, pepper);
  return pepper;
}
function burnCredentialCheck_(prehash) {
  if (!normalizePrehash_(prehash)) return;
  deriveCredential_(prehash, '00000000000000000000000000000000', CREDENTIAL_ITERATIONS);
}
function constantTimeEqual_(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
function hmacSha256_(value, key) {
  const bytes = Utilities.computeHmacSha256Signature(String(value || ''), String(key || ''), Utilities.Charset.UTF_8);
  return bytes.map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

// 以下維運函式只能由專案管理員在 Apps Script 編輯器執行，不接到 Web App API。
function createOperationalBackup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = readDataStrict_();
    const previousWorkspaceId = workspaceIdFromData_(data);
    ensureSync_(data);
    const workspaceId = ensureWorkspace_(data);
    if (previousWorkspaceId !== workspaceId) writeData_(data);
    if (hasProtectedCredentials_(data) && !scriptProperties_().getProperty(CREDENTIAL_PEPPER_PROPERTY_KEY)) credentialPepper_();
    const result = createRecoveryFile_(data, 'manual', true);
    logOperationalResult_('createOperationalBackup', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function verifyLatestOperationalBackup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fileId = String(scriptProperties_().getProperty(LAST_BACKUP_FILE_PROPERTY_KEY) || '');
    if (!fileId) throw operationalError_('尚未建立可驗證的系統備份。', 'BACKUP_NOT_FOUND');
    const verified = loadAndVerifyRecoveryFile_(fileId);
    const result = recoveryVerificationSummary_(verified.package, fileId);
    logOperationalResult_('verifyLatestOperationalBackup', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function restoreLatestOperationalBackup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const properties = scriptProperties_();
    const fileId = String(properties.getProperty(LAST_BACKUP_FILE_PROPERTY_KEY) || '');
    if (!fileId) throw operationalError_('找不到要復原的備份檔案。', 'BACKUP_NOT_FOUND');
    const verified = loadAndVerifyRecoveryFile_(fileId);
    const recoveryPackage = verified.package;
    const expectedConfirmation = restoreConfirmation_(recoveryPackage);
    const actualConfirmation = String(properties.getProperty(RESTORE_CONFIRMATION_PROPERTY_KEY) || '');
    properties.deleteProperty(RESTORE_CONFIRMATION_PROPERTY_KEY);
    if (!constantTimeEqual_(actualConfirmation, expectedConfirmation)) {
      throw operationalError_('復原確認值不正確；請先驗證備份並重新設定一次性確認值。', 'RESTORE_CONFIRMATION_REQUIRED');
    }

    const currentData = readDataStrict_();
    const currentWorkspaceId = workspaceIdFromData_(currentData);
    if (validWorkspaceId_(currentWorkspaceId) && currentWorkspaceId !== recoveryPackage.workspaceId) {
      throw operationalError_('目前資料與備份屬於不同工作區，已拒絕復原。', 'BACKUP_WORKSPACE_MISMATCH');
    }

    const currentProperties = recoveryPropertySnapshot_();
    let safetyBackup = { fileId: '' };
    if (workspaceIdFromData_(currentData)) {
      let safetyProperties = currentProperties;
      try { validateRecoveryProperties_(safetyProperties, currentWorkspaceId, currentData); } catch (_) {
        safetyProperties = recoveryPackage.operationalProperties;
      }
      safetyBackup = createRecoveryFile_(currentData, 'pre-restore', false, safetyProperties);
    }
    try {
      writeData_(JSON.parse(JSON.stringify(recoveryPackage.snapshot)));
      restoreRecoveryProperties_(recoveryPackage.operationalProperties);
      revokeAllOperationalSessions_();
      properties.setProperty(LAST_BACKUP_FILE_PROPERTY_KEY, fileId);
      assertRestoredState_(recoveryPackage);
    } catch (error) {
      try {
        writeData_(currentData);
        restoreRecoveryProperties_(currentProperties);
      } catch (rollbackError) {
        const failure = operationalError_(
          '復原與自動回滾皆失敗；請立即停止使用並依 Runbook 使用 safety backup：' + String(rollbackError && rollbackError.message || rollbackError),
          'RESTORE_ROLLBACK_FAILED'
        );
        failure.safetyBackupFileId = safetyBackup.fileId;
        throw failure;
      }
      throw operationalError_('復原失敗，已回復到操作前資料：' + String(error && error.message || error), 'RESTORE_ROLLED_BACK');
    }
    const result = {
      ok: true,
      restoredBackupFileId: fileId,
      safetyBackupFileId: safetyBackup.fileId,
      workspaceId: recoveryPackage.workspaceId,
      revision: recoveryPackage.revision
    };
    logOperationalResult_('restoreLatestOperationalBackup', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runReleaseReadinessCheck() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = readDataStrict_();
    const workspaceId = requireWorkspace_(data);
    if (!workspaceId) throw operationalError_('工作區設定與資料不一致。', 'RELEASE_WORKSPACE_INVALID');
    const ownerPhone = configuredOwnerPhone_();
    if (!/^\d{8,15}$/.test(ownerPhone)) throw operationalError_('尚未設定有效的老闆電話。', 'RELEASE_OWNER_INVALID');
    if (hasProtectedCredentials_(data)) {
      const pepper = String(scriptProperties_().getProperty(CREDENTIAL_PEPPER_PROPERTY_KEY) || '');
      if (!/^[a-f0-9]{64}$/.test(pepper)) throw operationalError_('credential pepper 尚未建立或格式損壞。', 'RELEASE_PEPPER_INVALID');
    }
    const fileId = String(scriptProperties_().getProperty(LAST_BACKUP_FILE_PROPERTY_KEY) || '');
    if (!fileId) throw operationalError_('發布前必須先建立系統備份。', 'RELEASE_BACKUP_REQUIRED');
    const verified = loadAndVerifyRecoveryFile_(fileId);
    const recoveryPackage = verified.package;
    if (Date.now() - Date.parse(recoveryPackage.createdAt) > RECOVERY_MAX_AGE_MS) {
      throw operationalError_('最新備份已超過 24 小時，請重新建立備份。', 'RELEASE_BACKUP_STALE');
    }
    const activeBook = SpreadsheetApp.getActiveSpreadsheet();
    if (!activeBook || recoveryPackage.sourceSpreadsheetId !== activeBook.getId()) {
      throw operationalError_('最新備份不是由目前資料表建立。', 'RELEASE_BACKUP_SOURCE_MISMATCH');
    }
    if (recoveryPackage.workspaceId !== workspaceId || recoveryPackage.revision !== revisionOf_(data)) {
      throw operationalError_('最新備份已落後於目前資料版本。', 'RELEASE_BACKUP_OUTDATED');
    }
    if (!constantTimeEqual_(sha256_(JSON.stringify(recoveryPackage.snapshot)), sha256_(JSON.stringify(data)))) {
      throw operationalError_('最新備份內容與目前資料不一致。', 'RELEASE_BACKUP_OUTDATED');
    }
    const result = { ok: true, workspaceId: workspaceId, revision: revisionOf_(data), backupFileId: fileId, backupCreatedAt: recoveryPackage.createdAt };
    logOperationalResult_('runReleaseReadinessCheck', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function createRecoveryFile_(data, reason, updateLatestPointer, operationalPropertiesOverride) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || typeof book.getId !== 'function') throw operationalError_('找不到目前綁定的 Google Sheet。', 'BACKUP_SOURCE_NOT_FOUND');
  const workspaceId = requireWorkspace_(data);
  if (!workspaceId) throw operationalError_('工作區設定與資料不一致，無法建立安全備份。', 'BACKUP_WORKSPACE_INVALID');
  const body = {
    format: RECOVERY_FORMAT,
    createdAt: new Date().toISOString(),
    reason: reason === 'pre-restore' ? 'pre-restore' : 'manual',
    sourceSpreadsheetId: String(book.getId()),
    workspaceId: workspaceId,
    revision: revisionOf_(data),
    snapshot: JSON.parse(JSON.stringify(data)),
    operationalProperties: operationalPropertiesOverride
      ? JSON.parse(JSON.stringify(operationalPropertiesOverride))
      : recoveryPropertySnapshot_()
  };
  body.checksum = sha256_(JSON.stringify(body));
  validateRecoveryPackage_(body);
  const folder = recoveryFolder_();
  const timestamp = body.createdAt.replace(/[^0-9]/g, '').slice(0, 14);
  const fileName = RECOVERY_FILE_PREFIX + timestamp + '-' + body.reason + '-' + workspaceId + '.json';
  let file;
  try {
    file = folder.createFile(fileName, JSON.stringify(body), MimeType.PLAIN_TEXT);
    assertPrivateDriveItem_(file, '備份檔案');
    if (typeof file.setDescription === 'function') file.setDescription('班客邦系統復原備份；請勿分享或手動編輯。');
    loadAndVerifyRecoveryFile_(String(file.getId()));
  } catch (error) {
    if (file && typeof file.setTrashed === 'function') file.setTrashed(true);
    throw error;
  }
  const fileId = String(file.getId());
  if (updateLatestPointer) scriptProperties_().setProperty(LAST_BACKUP_FILE_PROPERTY_KEY, fileId);
  return recoveryVerificationSummary_(body, fileId);
}

function recoveryFolder_() {
  const properties = scriptProperties_();
  const existingId = String(properties.getProperty(RECOVERY_FOLDER_PROPERTY_KEY) || '');
  let folder;
  let created = false;
  if (existingId) {
    try { folder = DriveApp.getFolderById(existingId); } catch (_) {
      throw operationalError_('既有備份資料夾無法存取，已停止建立新備份。', 'BACKUP_FOLDER_UNAVAILABLE');
    }
  } else {
    folder = DriveApp.createFolder(RECOVERY_FOLDER_NAME);
    created = true;
    properties.setProperty(RECOVERY_FOLDER_PROPERTY_KEY, String(folder.getId()));
  }
  try { assertPrivateDriveItem_(folder, '備份資料夾'); } catch (error) {
    if (created) {
      properties.deleteProperty(RECOVERY_FOLDER_PROPERTY_KEY);
      if (typeof folder.setTrashed === 'function') folder.setTrashed(true);
    }
    throw error;
  }
  return folder;
}

function loadAndVerifyRecoveryFile_(fileId) {
  let file;
  try { file = DriveApp.getFileById(String(fileId || '')); } catch (_) {
    throw operationalError_('備份檔案不存在或目前帳號無權存取。', 'BACKUP_NOT_FOUND');
  }
  assertPrivateDriveItem_(file, '備份檔案');
  const content = String(file.getBlob().getDataAsString('UTF-8') || '');
  if (!content || content.length > 5000000) throw operationalError_('備份檔案為空或超過安全大小限制。', 'BACKUP_FILE_INVALID');
  const parsed = parseJson_(content);
  validateRecoveryPackage_(parsed);
  return { file: file, package: parsed };
}

function validateRecoveryPackage_(recoveryPackage) {
  if (!recoveryPackage || typeof recoveryPackage !== 'object' || Array.isArray(recoveryPackage)) {
    throw operationalError_('備份格式不正確。', 'BACKUP_FORMAT_INVALID');
  }
  const checksum = String(recoveryPackage.checksum || '');
  const unsigned = JSON.parse(JSON.stringify(recoveryPackage));
  delete unsigned.checksum;
  if (!/^[a-f0-9]{64}$/.test(checksum) || !constantTimeEqual_(checksum, sha256_(JSON.stringify(unsigned)))) {
    throw operationalError_('備份 checksum 驗證失敗，檔案可能損壞或被修改。', 'BACKUP_CHECKSUM_INVALID');
  }
  if (recoveryPackage.format !== RECOVERY_FORMAT) throw operationalError_('不支援的備份版本。', 'BACKUP_FORMAT_INVALID');
  if (recoveryPackage.reason !== 'manual' && recoveryPackage.reason !== 'pre-restore') throw operationalError_('備份原因格式不正確。', 'BACKUP_FORMAT_INVALID');
  const createdAt = Date.parse(String(recoveryPackage.createdAt || ''));
  if (!Number.isFinite(createdAt) || createdAt > Date.now() + 5 * 60 * 1000) throw operationalError_('備份建立時間不正確。', 'BACKUP_FORMAT_INVALID');
  if (!String(recoveryPackage.sourceSpreadsheetId || '')) throw operationalError_('備份缺少來源資料表。', 'BACKUP_FORMAT_INVALID');
  if (!validWorkspaceId_(recoveryPackage.workspaceId)) throw operationalError_('備份工作區格式不正確。', 'BACKUP_WORKSPACE_INVALID');
  if (!Number.isSafeInteger(recoveryPackage.revision) || recoveryPackage.revision < 0) throw operationalError_('備份資料版本不正確。', 'BACKUP_FORMAT_INVALID');
  validateRecoverySnapshot_(recoveryPackage.snapshot, recoveryPackage.workspaceId, recoveryPackage.revision);
  validateRecoveryProperties_(recoveryPackage.operationalProperties, recoveryPackage.workspaceId, recoveryPackage.snapshot);
  return true;
}

function validateRecoverySnapshot_(snapshot, workspaceId, revision) {
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(snapshot) || workspaceIdFromData_(snapshot) !== workspaceId || revisionOf_(snapshot) !== revision) {
    throw operationalError_('備份資料與工作區或版本不一致。', 'BACKUP_WORKSPACE_INVALID');
  }
  validateSnapshotShape_(snapshot, 'BACKUP_FORMAT_INVALID');
}

function validateRecoveryProperties_(values, workspaceId, snapshot) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw operationalError_('備份缺少必要的安全設定。', 'BACKUP_FORMAT_INVALID');
  const allowedKeys = [WORKSPACE_PROPERTY_KEY, 'SHIFT_APP_OWNER_PHONE', CREDENTIAL_PEPPER_PROPERTY_KEY];
  Object.keys(values).forEach(key => {
    if (allowedKeys.indexOf(key) === -1) throw operationalError_('備份包含未允許的 Script Property。', 'BACKUP_FORMAT_INVALID');
  });
  if (String(values[WORKSPACE_PROPERTY_KEY] || '') !== workspaceId) throw operationalError_('備份的工作區安全設定不一致。', 'BACKUP_WORKSPACE_INVALID');
  const ownerPhone = String(values.SHIFT_APP_OWNER_PHONE || '');
  if (!/^\d{8,15}$/.test(ownerPhone) || cleanPhone_(ownerPhone) !== ownerPhone) throw operationalError_('備份的老闆電話設定不正確。', 'BACKUP_FORMAT_INVALID');
  if (hasProtectedCredentials_(snapshot) && !/^[a-f0-9]{64}$/.test(String(values[CREDENTIAL_PEPPER_PROPERTY_KEY] || ''))) {
    throw operationalError_('備份缺少有效的 credential pepper。', 'BACKUP_FORMAT_INVALID');
  }
}

function recoveryPropertySnapshot_() {
  const properties = scriptProperties_();
  const values = {};
  [WORKSPACE_PROPERTY_KEY, 'SHIFT_APP_OWNER_PHONE', CREDENTIAL_PEPPER_PROPERTY_KEY].forEach(key => {
    const value = String(properties.getProperty(key) || '');
    if (value) values[key] = value;
  });
  return values;
}

function restoreRecoveryProperties_(values) {
  const properties = scriptProperties_();
  [WORKSPACE_PROPERTY_KEY, 'SHIFT_APP_OWNER_PHONE', CREDENTIAL_PEPPER_PROPERTY_KEY].forEach(key => {
    const value = String(values && values[key] || '');
    if (value) properties.setProperty(key, value);
    else properties.deleteProperty(key);
  });
}

function revokeAllOperationalSessions_() {
  const properties = scriptProperties_();
  Object.keys(properties.getProperties()).forEach(key => {
    if (key.indexOf(SESSION_PROPERTY_PREFIX) === 0 || key.indexOf(AUTH_THROTTLE_PROPERTY_PREFIX) === 0) properties.deleteProperty(key);
  });
}

function assertRestoredState_(recoveryPackage) {
  const restored = readDataStrict_();
  if (!constantTimeEqual_(sha256_(JSON.stringify(restored)), sha256_(JSON.stringify(recoveryPackage.snapshot)))) {
    throw operationalError_('復原後資料驗證失敗。', 'RESTORE_VERIFICATION_FAILED');
  }
  validateRecoveryProperties_(recoveryPropertySnapshot_(), recoveryPackage.workspaceId, restored);
}

function recoveryVerificationSummary_(recoveryPackage, fileId) {
  return {
    ok: true,
    fileId: String(fileId || ''),
    createdAt: recoveryPackage.createdAt,
    reason: recoveryPackage.reason,
    workspaceId: recoveryPackage.workspaceId,
    revision: recoveryPackage.revision,
    restoreConfirmation: restoreConfirmation_(recoveryPackage)
  };
}

function restoreConfirmation_(recoveryPackage) {
  return 'RESTORE:' + String(recoveryPackage.checksum || '').slice(0, 16) + ':' + String(recoveryPackage.workspaceId || '');
}

function assertPrivateDriveItem_(item, label) {
  if (!item || typeof item.getSharingAccess !== 'function' || item.getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw operationalError_(String(label || 'Drive 項目') + '不是私人存取，已停止操作。', 'BACKUP_NOT_PRIVATE');
  }
}

function hasProtectedCredentials_(data) {
  if (hasCredential_(data && data.access, 'bossPinCredential', 'bossPinHash')) return true;
  return (data && Array.isArray(data.employees) ? data.employees : []).some(employee =>
    hasCredential_(employee, 'pinCredential', 'pinHash') || hasCredential_(employee, 'activationCredential', 'activationCodeHash')
  );
}

function readDataStrict_() {
  const raw = String(getSheet_().getRange('A1').getValue() || '');
  if (!raw) return emptyData_();
  const parsed = parseJson_(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw operationalError_('雲端資料不是有效 JSON，禁止備份或覆寫。', 'BACKUP_SOURCE_INVALID');
  return validateSnapshotShape_(parsed, 'BACKUP_SOURCE_INVALID');
}

function validateSnapshotShape_(data, errorCode) {
  const options = arguments.length > 2 && arguments[2] ? arguments[2] : {};
  const code = String(errorCode || 'DATA_SOURCE_INVALID');
  const fail = field => {
    throw operationalError_('雲端資料欄位格式不正確，系統已停止操作：' + String(field || 'root'), code);
  };
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const hasOwn = key => Object.prototype.hasOwnProperty.call(data, key);
  if (!isObject(data)) fail('root');

  SNAPSHOT_ARRAY_FIELDS.forEach(key => {
    if (!hasOwn(key)) return;
    if (!Array.isArray(data[key]) || data[key].some(item => !isObject(item))) fail(key);
  });

  const adjustments = data.payrollAdjustments;
  if (adjustments === undefined || adjustments === null || (Array.isArray(adjustments) && adjustments.length === 0)) {
    data.payrollAdjustments = {};
  } else if (!isObject(adjustments)) {
    fail('payrollAdjustments');
  }

  SNAPSHOT_OBJECT_FIELDS.forEach(key => {
    if (hasOwn(key) && !isObject(data[key])) fail(key);
  });
  SNAPSHOT_ARRAY_MAP_FIELDS.forEach(key => {
    if (!hasOwn(key)) return;
    Object.keys(data[key]).forEach(mapKey => {
      if (!Array.isArray(data[key][mapKey])) fail(key);
    });
  });
  SNAPSHOT_OBJECT_ARRAY_MAP_FIELDS.forEach(key => {
    if (!hasOwn(key)) return;
    Object.keys(data[key]).forEach(mapKey => {
      if (data[key][mapKey].some(item => !isObject(item))) fail(key);
    });
  });
  if (hasOwn('sync') && Object.prototype.hasOwnProperty.call(data.sync, 'revision')) {
    const revision = Number(data.sync.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) fail('sync.revision');
  }
  validateSnapshotValues_(data, fail, options);
  return data;
}

function validateSnapshotValues_(data, fail, options) {
  const hasOwn = (record, key) => Object.prototype.hasOwnProperty.call(record || {}, key);
  const validateOptional = (record, key, validator, path) => {
    if (hasOwn(record, key) && !validator(record[key])) fail(path);
  };
  const validateCredentialFields = (record, path) => {
    ['pinHash', 'activationCodeHash'].forEach(key => {
      validateOptional(record, key, value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), path + '.' + key);
    });
    ['pinCredential', 'activationCredential'].forEach(key => {
      validateOptional(record, key, validCredential_, path + '.' + key);
    });
  };
  const validateEmployee = (record, path) => {
    validateOptional(record, 'phone', validPhoneValue_, path + '.phone');
    validateOptional(record, 'rate', nonNegativeInteger_, path + '.rate');
    validateOptional(record, 'leaveQuota', value => nonNegativeInteger_(value) && value <= 31, path + '.leaveQuota');
    validateCredentialFields(record, path);
  };
  const validateShift = (record, path) => {
    validateOptional(record, 'date', validCalendarDate_, path + '.date');
    validateOptional(record, 'start', validClockTime_, path + '.start');
    validateOptional(record, 'end', validClockTime_, path + '.end');
  };
  const validateAttendance = (record, path) => {
    validateOptional(record, 'date', validCalendarDate_, path + '.date');
    validateOptional(record, 'clockIn', validIsoTimestamp_, path + '.clockIn');
    validateOptional(record, 'clockOut', validIsoTimestamp_, path + '.clockOut');
    validateOptional(record, 'hours', value => typeof value === 'number' && Number.isFinite(value) && value >= 0, path + '.hours');
  };
  const validateLeaveRecord = (record, path) => {
    validateOptional(record, 'date', validCalendarDate_, path + '.date');
    validateOptional(record, 'createdAt', validIsoTimestamp_, path + '.createdAt');
    validateOptional(record, 'requestedAt', validIsoTimestamp_, path + '.requestedAt');
    validateOptional(record, 'approvedAt', validIsoTimestamp_, path + '.approvedAt');
  };
  const validateDateMap = (map, path, itemValidator) => {
    Object.keys(map || {}).forEach(mapKey => {
      const month = snapshotMonthFromKey_(mapKey);
      if (!month) fail(path);
      map[mapKey].forEach((item, index) => itemValidator(item, month, path + '[' + index + ']', mapKey));
    });
  };

  (data.employees || []).forEach((employee, index) => validateEmployee(employee, 'employees[' + index + ']'));
  (data.shifts || []).forEach((shift, index) => validateShift(shift, 'shifts[' + index + ']'));
  (data.attendance || []).forEach((record, index) => validateAttendance(record, 'attendance[' + index + ']'));
  if (data.leaves) {
    validateDateMap(data.leaves, 'leaves', (date, month, path) => {
      if (!validCalendarDate_(date) || String(date).slice(0, 7) !== month) fail(path);
    });
  }
  if (data.leaveRequests) {
    validateDateMap(data.leaveRequests, 'leaveRequests', (record, month, path) => {
      validateLeaveRecord(record, path);
      if (hasOwn(record, 'date') && String(record.date).slice(0, 7) !== month) fail(path + '.date');
    });
  }
  (data.leaveHistory || []).forEach((record, index) => validateLeaveRecord(record, 'leaveHistory[' + index + ']'));

  (data.removedEmployees || []).forEach((archive, index) => {
    const path = 'removedEmployees[' + index + ']';
    validateOptional(archive, 'removedAt', validIsoTimestamp_, path + '.removedAt');
    validateOptional(archive, 'removeAfter', validIsoTimestamp_, path + '.removeAfter');
    if (hasOwn(archive, 'employee')) {
      if (!isPlainObject_(archive.employee)) fail(path + '.employee');
      validateEmployee(archive.employee, path + '.employee');
    }
    if (hasOwn(archive, 'shifts')) {
      if (!Array.isArray(archive.shifts) || archive.shifts.some(item => !isPlainObject_(item))) fail(path + '.shifts');
      archive.shifts.forEach((shift, itemIndex) => validateShift(shift, path + '.shifts[' + itemIndex + ']'));
    }
    if (hasOwn(archive, 'attendance')) {
      if (!Array.isArray(archive.attendance) || archive.attendance.some(item => !isPlainObject_(item))) fail(path + '.attendance');
      archive.attendance.forEach((record, itemIndex) => validateAttendance(record, path + '.attendance[' + itemIndex + ']'));
    }
    if (hasOwn(archive, 'leaves')) {
      if (!isPlainObject_(archive.leaves) || Object.keys(archive.leaves).some(key => !Array.isArray(archive.leaves[key]))) fail(path + '.leaves');
      validateDateMap(archive.leaves, path + '.leaves', (date, month, itemPath) => {
        if (!validCalendarDate_(date) || String(date).slice(0, 7) !== month) fail(itemPath);
      });
    }
  });

  if (data.access) {
    validateOptional(data.access, 'bossPhone', validPhoneValue_, 'access.bossPhone');
    validateOptional(data.access, 'bossPinHash', value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'access.bossPinHash');
    validateOptional(data.access, 'bossPinCredential', validCredential_, 'access.bossPinCredential');
  }

  const legacyNegativeBudget = legacyNegativeAdjustmentBudget_(options.legacyPayrollAdjustments);
  if (data.payrollAdjustments) {
    validateDateMap(data.payrollAdjustments, 'payrollAdjustments', (record, _month, path, mapKey) => {
      if (!hasOwn(record, 'amount') || !Number.isSafeInteger(record.amount)) fail(path + '.amount');
      if (record.amount < 0 && options.rejectNewNegativePayrollAdjustments === true
        && !consumeLegacyNegativeAdjustment_(legacyNegativeBudget, mapKey, record)) fail(path + '.amount');
      validateOptional(record, 'date', validIsoTimestamp_, path + '.date');
    });
  }
}

function isPlainObject_(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validPhoneValue_(value) {
  if (typeof value !== 'string') return false;
  const pattern = new RegExp('^\\d{' + PHONE_DIGIT_MIN_LENGTH + ',' + PHONE_DIGIT_MAX_LENGTH + '}$');
  return pattern.test(value) && cleanPhone_(value) === value;
}

function nonNegativeInteger_(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validMonthValue_(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  return Boolean(match && Number(match[1]) >= 1 && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

function validCalendarDate_(value) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match || Number(match[1]) < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toISOString().slice(0, 10) === text;
}

function validClockTime_(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validIsoTimestamp_(value) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(text);
  if (!match || Number(match[1]) < 1) return false;
  const date = new Date(0);
  date.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7]));
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toISOString() === text;
}

function snapshotMonthFromKey_(value) {
  const match = /-(\d{4}-\d{2})$/.exec(String(value || ''));
  return match && validMonthValue_(match[1]) ? match[1] : '';
}

function legacyNegativeAdjustmentBudget_(adjustments) {
  const budget = {};
  if (!isPlainObject_(adjustments)) return budget;
  Object.keys(adjustments).forEach(mapKey => {
    if (!Array.isArray(adjustments[mapKey])) return;
    adjustments[mapKey].forEach(record => {
      if (!isPlainObject_(record) || !Number.isSafeInteger(record.amount) || record.amount >= 0) return;
      const signature = mapKey + ':' + JSON.stringify(record);
      budget[signature] = (budget[signature] || 0) + 1;
    });
  });
  return budget;
}

function consumeLegacyNegativeAdjustment_(budget, mapKey, record) {
  const signature = mapKey + ':' + JSON.stringify(record);
  if (!budget[signature]) return false;
  budget[signature] -= 1;
  return true;
}

function validateBossSaveRequest_(incoming, stored) {
  const code = 'REQUEST_DATA_INVALID';
  const fail = field => {
    throw operationalError_('儲存資料欄位格式不正確：' + String(field || 'root'), code);
  };
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) fail('root');
  const unknownField = Object.keys(incoming).find(key => BOSS_SAVE_ALLOWED_FIELDS.indexOf(key) === -1);
  if (unknownField) fail(unknownField);
  if (!BOSS_SAVE_MUTABLE_FIELDS.some(key => Object.prototype.hasOwnProperty.call(incoming, key))) fail('root');

  const hasPayrollAdjustments = Object.prototype.hasOwnProperty.call(incoming, 'payrollAdjustments');
  if (hasPayrollAdjustments) {
    const adjustments = incoming.payrollAdjustments;
    if (!adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments)) fail('payrollAdjustments');
  }

  const validated = JSON.parse(JSON.stringify(incoming));
  if (!hasPayrollAdjustments) validated.payrollAdjustments = {};
  validateSnapshotShape_(validated, code, {
    rejectNewNegativePayrollAdjustments: true,
    legacyPayrollAdjustments: stored && stored.payrollAdjustments
  });
  if (!hasPayrollAdjustments) delete validated.payrollAdjustments;
  return validated;
}

function operationalError_(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function logOperationalResult_(operation, result) {
  const allowedKeys = [
    'ok', 'fileId', 'createdAt', 'reason', 'workspaceId', 'revision',
    'restoredBackupFileId', 'safetyBackupFileId', 'backupFileId', 'backupCreatedAt'
  ];
  const safeResult = {};
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  allowedKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) safeResult[key] = source[key];
  });
  console.log(String(operation || 'operation') + ': ' + JSON.stringify(safeResult));
}

function readData_() {
  const raw = String(getSheet_().getRange('A1').getValue() || '');
  if (!raw) return emptyData_();
  const parsed = parseJson_(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw operationalError_('雲端主資料損壞，為避免覆寫既有資料，系統已停止這次操作。', 'DATA_SOURCE_INVALID');
  }
  return validateSnapshotShape_(parsed, 'DATA_SOURCE_INVALID');
}

function writeData_(data) {
  validateSnapshotShape_(data, 'DATA_WRITE_INVALID');
  const sheet = getSheet_();
  sheet.getRange('A1').setValue(JSON.stringify(data));
  sheet.getRange('A2').setValue('最後同步：' + new Date().toLocaleString('zh-TW'));
}

function getSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('請把 Apps Script 建立在班表 APP 資料表內。');
  let sheet = book.getSheetByName(DATA_SHEET);
  if (!sheet) { sheet = book.insertSheet(DATA_SHEET); sheet.hideSheet(); }
  return sheet;
}

function emptyData_() { return { workspace: {}, sync: { revision: 0 }, employees: [], shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [], removedEmployees: [], access: {}, payrollAdjustments: {} }; }
function mergeInitial_(stored, initial) { const merged = emptyData_(); Object.keys(merged).forEach(key => { if (key !== 'workspace' && key !== 'sync' && initial[key] !== undefined) merged[key] = initial[key]; }); merged.workspace = JSON.parse(JSON.stringify((stored && stored.workspace) || {})); merged.sync = { revision: revisionOf_(stored) }; return merged; }
function cleanupRemoved_(data) { const objectValue = value => value && typeof value === 'object' && !Array.isArray(value); data.workspace = objectValue(data.workspace) ? data.workspace : {}; data.sync = objectValue(data.sync) ? data.sync : {}; data.removedEmployees = Array.isArray(data.removedEmployees) ? data.removedEmployees : []; const before = data.removedEmployees.length; const now = Date.now(); data.removedEmployees = data.removedEmployees.filter(record => record && new Date(record.removeAfter).getTime() > now); data.employees = Array.isArray(data.employees) ? data.employees : []; data.shifts = Array.isArray(data.shifts) ? data.shifts : []; data.attendance = Array.isArray(data.attendance) ? data.attendance : []; data.leaves = objectValue(data.leaves) ? data.leaves : {}; data.leaveRequests = objectValue(data.leaveRequests) ? data.leaveRequests : {}; data.leaveHistory = Array.isArray(data.leaveHistory) ? data.leaveHistory : []; data.access = objectValue(data.access) ? data.access : {}; data.payrollAdjustments = objectValue(data.payrollAdjustments) ? data.payrollAdjustments : {}; return before !== data.removedEmployees.length; }
function revisionOf_(data) { const value = Number(data && data.sync && data.sync.revision); return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function ensureSync_(data) { data.sync = { revision: revisionOf_(data) }; return data.sync; }
function bumpRevision_(data) { const current = revisionOf_(data); if (current >= Number.MAX_SAFE_INTEGER) throw new Error('資料版本已達上限，請聯絡系統管理員。'); data.sync = { revision: current + 1 }; return data.sync.revision; }
function requestRevision_(value) { const revision = Number(value); return Number.isSafeInteger(revision) && revision >= 0 ? revision : null; }
function revisionConflict_(data) { const response = bossResponse_(data); response.ok = false; response.code = 'REVISION_CONFLICT'; response.error = '雲端資料已被其他裝置更新，這次變更尚未儲存。'; response.currentRevision = revisionOf_(data); return response; }
function cleanPhone_(value) { return String(value || '').replace(/[^0-9]/g, ''); }
function fail_(message, code) { return { ok: false, error: message, code: code || 'REQUEST_FAILED' }; }
