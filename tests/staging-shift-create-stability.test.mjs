import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const workspaceId = `ws_${'a'.repeat(32)}`;
const initialData = {
  workspace: { id: workspaceId },
  employees: [{ id: 'employee-1', name: 'Synthetic Employee', leaveQuota: 8, rate: 200 }],
  shifts: [],
  attendance: [],
  leaves: {},
  removedEmployees: [],
  sync: { revision: 1 }
};

const postgresCloudSource = await readFile('postgres-cloud.js', 'utf8');
const bootstrapEvents = [];
let storedBootstrap = structuredClone(initialData);
let serverData = structuredClone(initialData);
let commandCalls = 0;
let employeeCommandCalls = 0;
let sensitiveStateClearCalls = 0;
const sessionValues = new Map();
const postgresWindow = {
  shiftEnvironment: {
    dataBackend: 'postgres',
    postgresApiUrl: 'https://api.staging.example/v1',
    postgresWorkspaceId: workspaceId,
    storageKey: key => `staging:${key}`
  },
  shiftStateStore: {
    normalize: value => structuredClone(value),
    write: value => { storedBootstrap = structuredClone(value); },
    clearSensitive() { sensitiveStateClearCalls += 1; }
  },
  BankePostgresApi: {
    createClient() {
      return {
        readiness: async () => ({ ok: true }),
        establishSession: async () => ({ ok: true }),
        bootstrap: async () => ({
          ok: true,
          workspaceId,
          role: 'boss',
          employeeId: '',
          currentUser: {
            displayName: 'Synthetic Manager',
            role: 'boss',
            employeeId: null,
            workspaceId
          },
          data: structuredClone(serverData)
        }),
        async executeCommand(commandName, input) {
          commandCalls += 1;
          if (commandName === 'shifts.create') {
            serverData.shifts.push({
              id: 'shift-server-1',
              employeeId: input.employeeId,
              date: input.date,
              start: input.startTime,
              end: input.endTime,
              note: input.note
            });
            return { ok: true, data: structuredClone(serverData.shifts[0]) };
          }
          assert.equal(commandName, 'employees.create');
          employeeCommandCalls += 1;
          serverData.employees.push({
            id: 'employee-server-2',
            name: input.name,
            phone: input.phone,
            role: input.jobTitle,
            rate: input.hourlyRate,
            leaveQuota: input.leaveQuota
          });
          return { ok: true, data: structuredClone(serverData.employees.at(-1)) };
        },
        logout: async () => {
          throw Object.assign(new Error('Synthetic remote logout failure'), { code: 'UPSTREAM_UNAVAILABLE' });
        }
      };
    }
  }
};
const postgresContext = vm.createContext({
  window: postgresWindow,
  document: {
    dispatchEvent: event => bootstrapEvents.push(event),
    querySelector: () => null
  },
  sessionStorage: {
    setItem: (key, value) => sessionValues.set(key, value),
    removeItem: key => sessionValues.delete(key)
  },
  CustomEvent: TestCustomEvent,
  structuredClone,
  console
});
vm.runInContext(postgresCloudSource, postgresContext, { filename: 'postgres-cloud.js' });
await postgresWindow.shiftPostgresCloud.connect({ getAccessToken: async () => 'synthetic-token' });
bootstrapEvents.length = 0;

await postgresWindow.shiftPostgresCloud.createShift({
  employeeId: 'employee-1',
  date: '2026-07-23',
  start: '09:00',
  end: '17:00',
  note: 'Synthetic shift'
});
assert.equal(commandCalls, 1);
assert.equal(storedBootstrap.shifts.length, 1, 'successful command must refresh the canonical bootstrap');
assert.equal(storedBootstrap.shifts[0].id, 'shift-server-1');
assert.deepEqual(
  bootstrapEvents.map(event => event.type),
  ['postgres-bootstrap-refreshed'],
  'successful command must notify the existing UI rerender path'
);

await postgresWindow.shiftPostgresCloud.refreshBootstrap();
assert.equal(storedBootstrap.shifts.length, 1, 'the created shift must still exist after a later bootstrap refresh');

bootstrapEvents.length = 0;
await postgresWindow.shiftPostgresCloud.createEmployee({
  name: 'Synthetic second employee',
  phone: '0911222333',
  role: 'Tester',
  rate: 220,
  leaveQuota: 7
});
assert.equal(employeeCommandCalls, 1);
assert.equal(storedBootstrap.employees.length, 2, 'successful employee creation must refresh the canonical bootstrap');
assert.equal(storedBootstrap.employees[1].id, 'employee-server-2');
assert.deepEqual(
  bootstrapEvents.map(event => event.type),
  ['postgres-bootstrap-refreshed'],
  'successful employee creation must notify the existing UI rerender path'
);

bootstrapEvents.length = 0;
await assert.rejects(
  postgresWindow.shiftPostgresCloud.logout(),
  error => error?.code === 'UPSTREAM_UNAVAILABLE'
);
assert.equal(postgresWindow.shiftPostgresCloud.getSession(), null, 'local Session must clear even when remote logout fails');
assert.equal(postgresWindow.shiftPostgresCloud.getCurrentUser(), null, 'currentUser must clear even when remote logout fails');
assert.equal(sessionValues.has('staging:shift-postgres-auth'), false, 'cached PostgreSQL Session must be removed on logout');
assert.equal(sensitiveStateClearCalls, 1, 'logout must clear the canonical UI cache');
assert.deepEqual(
  bootstrapEvents.map(event => event.type),
  ['postgres-session-cleared'],
  'logout must notify current-user UI to hide stale identity'
);

const managementSource = await readFile('management-actions.js', 'utf8');
const listeners = new Map();
const dialogCloseCount = new Map();
let reloadCount = 0;
let createShiftCalls = 0;
let createEmployeeCalls = 0;
let releaseCreateShift;
let currentData = structuredClone(initialData);
const primaryButton = { disabled: false };

function element(selector) {
  return {
    value: '',
    disabled: false,
    addEventListener(type, handler) {
      listeners.set(`${selector}:${type}`, handler);
    },
    querySelectorAll() {
      return [primaryButton];
    },
    close() {
      dialogCloseCount.set(selector, (dialogCloseCount.get(selector) || 0) + 1);
    },
    showModal() {}
  };
}

const elements = new Map();
const getElement = selector => {
  if (!elements.has(selector)) elements.set(selector, element(selector));
  return elements.get(selector);
};
getElement('#shiftEmployee').value = 'employee-1';
getElement('#shiftDate').value = '2026-07-24';
getElement('#shiftStart').value = '09:00';
getElement('#shiftEnd').value = '17:00';
getElement('#shiftNote').value = 'Synthetic shift';
getElement('#employeeId').value = '';
getElement('#employeeName').value = 'Synthetic new employee';
getElement('#employeePhone').value = '0911555777';
getElement('#employeeRole').value = 'Tester';
getElement('#employeeRate').value = '230';
getElement('#employeeLeaveQuota').value = '8';

const managementWindow = {
  shiftStateStore: {
    read: () => currentData,
    write: value => { currentData = value; }
  },
  shiftAccountSecurity: {
    cleanPhone: value => value,
    generateActivationCode: () => '00000000',
    hashSecret: async value => value
  },
  shiftEnvironment: { dataBackend: 'postgres' },
  shiftPostgresCloud: {
    createEmployee: async () => {
      createEmployeeCalls += 1;
      return { ok: true };
    },
    createShift: async () => {
      createShiftCalls += 1;
      await new Promise(resolve => { releaseCreateShift = resolve; });
      return { ok: true };
    }
  },
  fillEmployeeSelect() {},
  openEmployeeDialog() {}
};
const managementContext = vm.createContext({
  window: managementWindow,
  document: {
    querySelector: getElement,
    addEventListener() {}
  },
  alert() {},
  confirm: () => true,
  location: { reload: () => { reloadCount += 1; } },
  structuredClone,
  crypto: { randomUUID: () => 'shift-local-1' },
  console
});
vm.runInContext(managementSource, managementContext, { filename: 'management-actions.js' });

const employeeSubmit = listeners.get('#employeeForm:submit');
assert.equal(typeof employeeSubmit, 'function');
await employeeSubmit({
  currentTarget: getElement('#employeeForm'),
  submitter: null,
  preventDefault() {}
});
assert.equal(createEmployeeCalls, 1);
assert.equal(dialogCloseCount.get('#employeeDialog'), 1);
assert.equal(reloadCount, 0, 'successful employee creation must not reload the whole page');
assert.equal(currentData.employees.some(employee => employee.phone === '0911555777'), true);

const shiftSubmit = listeners.get('#shiftForm:submit');
assert.equal(typeof shiftSubmit, 'function');
const shiftForm = getElement('#shiftForm');
const event = {
  currentTarget: shiftForm,
  submitter: null,
  preventDefault() {}
};
const firstSubmit = shiftSubmit(event);
const secondSubmit = shiftSubmit(event);
await secondSubmit;
assert.equal(createShiftCalls, 1, 'rapid repeated submit must issue only one shifts.create command');
releaseCreateShift();
await firstSubmit;
assert.equal(dialogCloseCount.get('#shiftDialog'), 1);
assert.equal(reloadCount, 0, 'successful shift creation must not reload the whole page');
assert.equal(currentData.shifts.length, 1);
assert.equal(primaryButton.disabled, false);

const appSource = await readFile('app.js', 'utf8');
const indexSource = await readFile('index.html', 'utf8');
const loginSource = await readFile('login.js', 'utf8');
const apiClientSource = await readFile('postgres-api-client.js', 'utf8');
const shiftSubmitSource = managementSource.slice(
  managementSource.indexOf("$('#shiftForm').addEventListener"),
  managementSource.indexOf("$('#addAttendance').addEventListener")
);
const employeeSubmitSource = managementSource.slice(
  managementSource.indexOf("$('#employeeForm').addEventListener"),
  managementSource.indexOf("$('#addShift').addEventListener")
);
const employeeLeaveEntrySource = managementSource.slice(
  managementSource.indexOf("$('#employeeLeaveBtn').addEventListener"),
  managementSource.indexOf("$('#attendanceForm').addEventListener")
);

assert.doesNotMatch(shiftSubmitSource, /location\.reload\(\)/);
assert.doesNotMatch(employeeSubmitSource, /location\.reload\(\)/);
assert.match(employeeLeaveEntrySource, /dataBackend === 'postgres'[\s\S]*\[data-tab="schedule"\][\s\S]*calendar-box/);
assert.match(appSource, /postgres-bootstrap-refreshed[\s\S]*stateStore\.read\(\)[\s\S]*render\(\)/);
assert.match(indexSource, /目前可新增班次，修改與刪除功能尚未開放。/);
assert.match(loginSource, /addEventListener\('shift-session-invalid'/);
assert.match(loginSource, /clearSession\(\);\s*clearCloudSensitiveCache\(\);\s*window\.SHIFT_AUTHORIZED = false;\s*try \{/);
assert.match(apiClientSource, /new CustomEvent\('shift-session-invalid'/);
assert.doesNotMatch(apiClientSource, /shift-postgres-session-invalid/);

console.log('Staging PostgreSQL shift creation stability tests passed.');
