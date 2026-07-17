import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const webAppUrl = String(process.argv[2] || '').trim();
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(webAppUrl)) {
  throw new Error('Usage: node scripts/staging-acceptance.mjs <staging-web-app-url>');
}

function requiredEnvironmentValue(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging environment variable: ${name}`);
  return value;
}

const credentials = {
  bossPhone: requiredEnvironmentValue('STAGING_BOSS_PHONE'),
  bossPin: requiredEnvironmentValue('STAGING_BOSS_PIN'),
  employeePhone: requiredEnvironmentValue('STAGING_EMPLOYEE_PHONE'),
  employeePin: requiredEnvironmentValue('STAGING_EMPLOYEE_PIN'),
  activationCode: requiredEnvironmentValue('STAGING_ACTIVATION_CODE')
};
const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

function decodeAppsScriptResponse(content) {
  const decoded = String(content).replace(/\\x([0-9a-f]{2})/gi, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
  const userHtmlMatch = decoded.match(/userHtml":"(?<value>.*?)","ncc":/s);
  if (!userHtmlMatch?.groups?.value) throw new Error('Apps Script response is missing userHtml.');
  const normalized = userHtmlMatch.groups.value.replace(/\\\\/g, '\\');
  const userHtml = JSON.parse(`"${normalized}"`);
  const messageMatch = userHtml.match(/postMessage\((?<message>\{.*\}),"https/s);
  if (!messageMatch?.groups?.message) throw new Error('Apps Script response is missing the staff-sheets message.');
  return JSON.parse(messageMatch.groups.message).response;
}

async function request(body) {
  const requestId = `staging-${randomUUID().replaceAll('-', '')}`;
  const payload = JSON.stringify({ requestId, request: body });
  const response = await fetch(webAppUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ payload, requestId }),
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000)
  });
  assert.equal(response.status, 200, `Apps Script returned HTTP ${response.status}.`);
  return decodeAppsScriptResponse(await response.text());
}

function assertOk(response, step) {
  assert.equal(response?.ok, true, `${step} failed: ${response?.code || ''} ${response?.error || ''}`);
}

const initialData = {
  employees: [], shifts: [], attendance: [], leaves: {}, leaveRequests: {},
  leaveHistory: [], removedEmployees: [], payrollAdjustments: {}
};
const bossLogin = await request({
  action: 'bossLogin',
  phone: credentials.bossPhone,
  pinHash: sha256(credentials.bossPin),
  initialData
});
assertOk(bossLogin, 'Boss login');
assert.equal(bossLogin.role, 'boss');
assert.ok(String(bossLogin.sessionToken).length >= 32, 'Boss session token is invalid.');

const employeeId = 'staging-employee-001';
const taipeiParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
const month = `${taipeiParts.year}-${taipeiParts.month}`;
const shiftDate = `${month}-${taipeiParts.day}`;
const leaveDay = Number(taipeiParts.day) === 1 ? '02' : '01';
const leaveDate = `${month}-${leaveDay}`;
const saveData = {
  employees: [{
    id: employeeId,
    name: 'Staging Employee',
    phone: credentials.employeePhone,
    role: 'Staging Store',
    rate: 200,
    leaveQuota: 8,
    activationCodeHash: sha256(credentials.activationCode)
  }],
  shifts: [{
    id: 'staging-shift-001', employeeId, date: shiftDate, start: '09:00', end: '17:00'
  }],
  attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], payrollAdjustments: {}
};
const baseRevision = bossLogin.data.sync.revision;
const bossSave = await request({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision, data: saveData
});
assertOk(bossSave, 'Employee management and schedule save');
assert.equal(bossSave.data.employees.length, 1, 'Employee was not created.');
assert.equal(bossSave.data.shifts.length, 1, 'Shift was not created.');

const conflict = await request({
  action: 'save', sessionToken: bossLogin.sessionToken, baseRevision, data: saveData
});
assert.equal(conflict.ok, false);
assert.equal(conflict.code, 'REVISION_CONFLICT');

const employeeLogin = await request({
  action: 'employeeLogin',
  phone: credentials.employeePhone,
  pinHash: sha256(credentials.employeePin),
  activationHash: sha256(credentials.activationCode)
});
assertOk(employeeLogin, 'First employee login');
assert.equal(employeeLogin.role, 'employee');
assert.equal(employeeLogin.employeeId, employeeId);

const leaveSave = await request({
  action: 'employeeSaveLeave', sessionToken: employeeLogin.sessionToken,
  month, dates: [leaveDate]
});
assertOk(leaveSave, 'Employee leave save');

const clockIn = await request({ action: 'employeeClockIn', sessionToken: employeeLogin.sessionToken });
assertOk(clockIn, 'Employee clock in');
const clockOut = await request({ action: 'employeeClockOut', sessionToken: employeeLogin.sessionToken });
assertOk(clockOut, 'Employee clock out');
assert.equal(clockOut.data.attendance.length, 1, 'Attendance record was not created.');
assert.ok(clockOut.data.attendance[0].hours >= 0.5, 'Worked hours were not calculated.');

const bossPull = await request({ action: 'pull', sessionToken: bossLogin.sessionToken });
assertOk(bossPull, 'Boss sync verification');
const leaveKey = `${employeeId}-${month}`;
assert.equal(bossPull.data.leaves[leaveKey]?.length, 1, 'Boss did not receive employee leave data.');
assert.equal(bossPull.data.attendance.length, 1, 'Boss did not receive employee attendance data.');

const logout = await request({ action: 'logout', sessionToken: employeeLogin.sessionToken });
assertOk(logout, 'Employee logout');
const revokedSession = await request({ action: 'pull', sessionToken: employeeLogin.sessionToken });
assert.equal(revokedSession.ok, false);
assert.equal(revokedSession.code, 'SESSION_INVALID');

process.stdout.write(`${JSON.stringify({
  ok: true,
  workspaceId: bossPull.workspaceId,
  revision: bossPull.data.sync.revision,
  checks: [
    'boss-login', 'employee-management', 'schedule', 'revision-conflict',
    'employee-login', 'leave', 'clock-in-out', 'boss-sync', 'session-revocation'
  ]
}, null, 2)}\n`);
