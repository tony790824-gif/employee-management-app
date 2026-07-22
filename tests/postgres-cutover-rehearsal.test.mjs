import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const workspaceId = `ws_${'a'.repeat(32)}`;
const written = [];
const removed = [];
const calls = [];
const cloudStatus = { textContent: 'Google Sheets' };
const bootstrap = {
  ok: true,
  workspaceId,
  role: 'employee',
  employeeId: 'employee-1',
  data: {
    workspace: { id: workspaceId, name: 'Synthetic workspace' },
    sync: { revision: 0, schemaVersion: 1 },
    employees: [{ id: 'employee-1', name: 'Synthetic employee', phone: '0912345678', role: 'Staff', rate: 200, leaveQuota: 8 }],
    shifts: [], attendance: [], leaves: {}, payrollAdjustments: {}, leaveRequests: {},
    leaveHistory: [], removedEmployees: [], access: {}
  }
};
const fakeClient = {
  readiness: async () => { calls.push('readiness'); return { ok: true }; },
  establishSession: async () => { calls.push('session'); return { ok: true }; },
  bootstrap: async () => { calls.push('bootstrap'); return bootstrap; },
  executeCommand: async (name, input) => { calls.push(['command', name, input]); return { ok: true }; },
  logout: async () => { calls.push('logout'); return { ok: true }; }
};
const context = vm.createContext({
  console,
  window: {
    shiftEnvironment: {
      dataBackend: 'postgres', postgresApiUrl: 'https://api.staging.example/v1', postgresWorkspaceId: workspaceId,
      storageKey: key => `banke:staging-postgres:${key}`
    },
    shiftStateStore: {
      normalize: value => value,
      write: value => written.push(value),
      clearSensitive: () => calls.push('clear')
    },
    BankePostgresApi: { createClient: config => { assert.equal(typeof config.getAccessToken, 'function'); return fakeClient; } }
  },
  sessionStorage: {
    setItem: (key, value) => calls.push(['stored', key, JSON.parse(value)]),
    removeItem: key => removed.push(key)
  },
  document: {
    dispatchEvent: event => calls.push(['event', event.type]),
    querySelector: selector => selector === '#cloudStatus' ? cloudStatus : null
  },
  CustomEvent: class CustomEvent { constructor(type) { this.type = type; } }
});
context.window.window = context.window;
vm.runInContext(await readFile('postgres-cloud.js', 'utf8'), context, { filename: 'postgres-cloud.js' });

assert.equal(context.window.shiftPostgresCloud.isConnected(), false);

const result = await context.window.shiftPostgresCloud.connect({ getAccessToken: async () => 'synthetic-token-not-logged' });
assert.equal(result.role, 'employee');
assert.deepEqual(calls.slice(0, 3), ['readiness', 'session', 'bootstrap']);
assert.equal(written.length, 1);
assert.equal(written[0].employees.length, 1);
assert.equal(context.window.shiftPostgresCloud.isConnected(), true);
assert.equal(context.window.shiftPostgresCloud.hasEmployeeSession(), true);
assert.equal(cloudStatus.textContent, 'PostgreSQL Staging');

await context.window.shiftPostgresCloud.saveEmployeeLeave('2026-07', ['2026-07-23']);
await context.window.shiftPostgresCloud.clockInEmployee();
await context.window.shiftPostgresCloud.clockOutEmployee();
await context.window.shiftPostgresCloud.createEmployee({
  name: 'Synthetic second employee', phone: '0911222333', role: 'Tester', rate: 220, leaveQuota: 7
});
await context.window.shiftPostgresCloud.createShift({
  employeeId: 'employee-1', date: '2026-07-25', start: '09:00', end: '18:00', note: 'Synthetic shift'
});
await context.window.shiftPostgresCloud.approveAttendanceHours('attendance-1', 8, 4);

const commandCalls = calls.filter(entry => Array.isArray(entry) && entry[0] === 'command');
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(commandCalls.map(entry => entry[1]), [
  'leaves.replace-month',
  'attendance.clock-in',
  'attendance.clock-out',
  'employees.create',
  'shifts.create',
  'attendance.approve-hours'
]);
assert.deepEqual(plain(commandCalls[0][2]), { month: '2026-07', dates: ['2026-07-23'] });
assert.deepEqual(plain(commandCalls[3][2]), {
  name: 'Synthetic second employee', phone: '0911222333', jobTitle: 'Tester', hourlyRate: 220, leaveQuota: 7
});
assert.deepEqual(plain(commandCalls[4][2]), {
  employeeId: 'employee-1', date: '2026-07-25', startTime: '09:00', endTime: '18:00', note: 'Synthetic shift'
});
assert.deepEqual(plain(commandCalls[5][2]), { attendanceId: 'attendance-1', hours: 8, baseRevision: 4 });
assert.equal(written.length, 7, 'Each successful command must refresh the authoritative bootstrap snapshot');
await context.window.shiftPostgresCloud.logout();
assert.equal(context.window.shiftPostgresCloud.isConnected(), false);
assert.equal(removed[0], 'banke:staging-postgres:shift-postgres-auth');
assert.ok(calls.includes('clear'));

console.log('PostgreSQL boss/employee cutover rehearsal adapter tests passed.');
