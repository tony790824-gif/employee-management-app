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
  addEventListener() {},
  shiftEnvironment: {
    dataBackend: 'postgres',
    postgresApiUrl: 'https://api.staging.example/v1',
    postgresWorkspaceId: workspaceId,
    storageKey: key => `staging:${key}`
  },
  shiftStateStore: {
    normalize: value => structuredClone(value),
    read: () => structuredClone(storedBootstrap),
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
    addEventListener() {},
    querySelector: () => null
  },
  sessionStorage: {
    setItem: (key, value) => sessionValues.set(key, value),
    removeItem: key => sessionValues.delete(key)
  },
  CustomEvent: TestCustomEvent,
  setTimeout,
  clearTimeout,
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

const foregroundListeners = { document: new Map(), window: new Map() };
const foregroundEvents = [];
const foregroundTimers = new Map();
let foregroundTimerId = 0;
let foregroundNow = 2_000;
let foregroundBootstrapCalls = 0;
let foregroundWrites = 0;
let foregroundFailure = null;
let foregroundGate = null;
const foregroundWarnings = [];
let foregroundStoredData = {
  ...structuredClone(initialData),
  sync: { revision: 1, schemaVersion: 1 }
};
let foregroundServerData = structuredClone(foregroundStoredData);

const addForegroundListener = (scope, type, listener) => {
  const bucket = foregroundListeners[scope].get(type) || [];
  bucket.push(listener);
  foregroundListeners[scope].set(type, bucket);
};
const dispatchForegroundEvent = (scope, event) => {
  foregroundEvents.push(event);
  for (const listener of foregroundListeners[scope].get(event.type) || []) listener(event);
};
const foregroundDocument = {
  visibilityState: 'visible',
  addEventListener: (type, listener) => addForegroundListener('document', type, listener),
  dispatchEvent: event => dispatchForegroundEvent('document', event),
  querySelector: () => null
};
const foregroundWindow = {
  addEventListener: (type, listener) => addForegroundListener('window', type, listener),
  dispatchEvent: event => dispatchForegroundEvent('window', event),
  navigator: { onLine: true },
  shiftEnvironment: {
    dataBackend: 'postgres',
    postgresApiUrl: 'https://api.staging.example/v1',
    postgresWorkspaceId: workspaceId,
    storageKey: key => `staging:${key}`
  },
  shiftStateStore: {
    normalize: value => structuredClone(value),
    read: () => structuredClone(foregroundStoredData),
    write(value) {
      foregroundWrites += 1;
      foregroundStoredData = structuredClone(value);
    },
    clearSensitive() {}
  },
  BankePostgresApi: {
    createClient() {
      return {
        readiness: async () => ({ ok: true }),
        establishSession: async () => ({ ok: true }),
        async bootstrap() {
          foregroundBootstrapCalls += 1;
          if (foregroundFailure) {
            const error = foregroundFailure;
            foregroundFailure = null;
            throw error;
          }
          if (foregroundGate) await foregroundGate.promise;
          return {
            ok: true,
            workspaceId,
            role: 'employee',
            employeeId: 'employee-1',
            currentUser: {
              displayName: 'Synthetic Employee',
              role: 'employee',
              employeeId: 'employee-1',
              workspaceId
            },
            data: structuredClone(foregroundServerData)
          };
        },
        logout: async () => ({ ok: true })
      };
    }
  }
};
foregroundWindow.window = foregroundWindow;
class ForegroundDate extends Date {
  static now() {
    return foregroundNow;
  }
}
const foregroundSessionValues = new Map();
const foregroundContext = vm.createContext({
  window: foregroundWindow,
  document: foregroundDocument,
  sessionStorage: {
    setItem: (key, value) => foregroundSessionValues.set(key, value),
    removeItem: key => foregroundSessionValues.delete(key)
  },
  CustomEvent: TestCustomEvent,
  structuredClone,
  Date: ForegroundDate,
  setTimeout(callback, delay) {
    const id = ++foregroundTimerId;
    foregroundTimers.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) {
    foregroundTimers.delete(id);
  },
  console: {
    ...console,
    warn: (...args) => foregroundWarnings.push(args)
  }
});
vm.runInContext(postgresCloudSource, foregroundContext, { filename: 'postgres-cloud-foreground.js' });
await foregroundWindow.shiftPostgresCloud.connect({ getAccessToken: async () => 'synthetic-token' });
foregroundNow += 2_000;

const resetForegroundObservations = () => {
  foregroundEvents.length = 0;
  foregroundBootstrapCalls = 0;
  foregroundWrites = 0;
};
const foregroundTimerCount = delay =>
  [...foregroundTimers.values()].filter(timer => timer.delay === delay).length;
const fireForegroundTimers = async delay => {
  const pending = [...foregroundTimers.entries()].filter(([, timer]) => timer.delay === delay);
  pending.forEach(([id]) => foregroundTimers.delete(id));
  pending.forEach(([, timer]) => timer.callback());
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

assert.equal(foregroundTimerCount(15_000), 1,
  'a visible authenticated PostgreSQL view must start one foreground polling timer');

resetForegroundObservations();
foregroundDocument.visibilityState = 'hidden';
foregroundDocument.dispatchEvent(new TestCustomEvent('visibilitychange'));
assert.equal(foregroundTimers.size, 0, 'hiding the page must stop debounce and polling timers');
foregroundDocument.visibilityState = 'visible';
foregroundDocument.dispatchEvent(new TestCustomEvent('visibilitychange'));
foregroundWindow.dispatchEvent(new TestCustomEvent('pageshow'));
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
assert.equal(foregroundTimerCount(250), 1, 'foreground lifecycle bursts must keep one debounce timer');
assert.equal(foregroundTimerCount(15_000), 1, 'foreground lifecycle bursts must keep one polling timer');
await fireForegroundTimers(250);
assert.equal(foregroundBootstrapCalls, 1, 'foreground event bursts must issue one bootstrap request');
assert.equal(foregroundWrites, 0, 'unchanged revisions must not rewrite canonical state');
assert.equal(foregroundEvents.filter(event => event.type === 'postgres-bootstrap-refreshed').length, 0,
  'unchanged revisions must not trigger the full UI render event');

resetForegroundObservations();
foregroundNow += 15_000;
await fireForegroundTimers(15_000);
assert.equal(foregroundBootstrapCalls, 1, 'foreground polling must refresh an authenticated visible view');
assert.equal(foregroundWrites, 0, 'foreground polling must not rewrite unchanged revisions');
assert.equal(foregroundTimerCount(15_000), 1, 'foreground polling must schedule exactly one next cycle');

resetForegroundObservations();
foregroundNow += 2_000;
foregroundServerData.employees[0].name = 'Updated Synthetic Employee';
foregroundServerData.sync.revision = 2;
await fireForegroundTimers(15_000);
assert.equal(foregroundBootstrapCalls, 1);
assert.equal(foregroundWrites, 1, 'polling must update canonical state once when the revision changes');
assert.equal(foregroundStoredData.employees[0].name, 'Updated Synthetic Employee');
assert.equal(foregroundEvents.filter(event => event.type === 'postgres-bootstrap-refreshed').length, 1,
  'changed revisions must trigger the existing UI render path');

resetForegroundObservations();
foregroundNow += 2_000;
let releaseForegroundBootstrap;
foregroundGate = {};
foregroundGate.promise = new Promise(resolve => { releaseForegroundBootstrap = resolve; });
foregroundServerData.sync.revision = 3;
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
await fireForegroundTimers(250);
assert.equal(foregroundBootstrapCalls, 1);
await fireForegroundTimers(15_000);
assert.equal(foregroundBootstrapCalls, 1, 'polling must share the existing in-flight request');
foregroundWindow.dispatchEvent(new TestCustomEvent('pageshow'));
foregroundDocument.dispatchEvent(new TestCustomEvent('visibilitychange'));
await fireForegroundTimers(250);
assert.equal(foregroundBootstrapCalls, 1, 'in-flight foreground requests must suppress duplicates');
foregroundGate = null;
releaseForegroundBootstrap();
for (let index = 0; index < 8; index += 1) await Promise.resolve();
assert.equal(foregroundStoredData.sync.revision, 3);

resetForegroundObservations();
foregroundNow += 2_000;
foregroundFailure = Object.assign(new Error('Synthetic network failure'), {
  code: 'UPSTREAM_UNAVAILABLE',
  status: 503,
  requestId: 'request-synthetic'
});
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
await fireForegroundTimers(250);
assert.equal(foregroundStoredData.sync.revision, 3, 'failed foreground sync must preserve the current screen state');
assert.equal(foregroundWrites, 0);
assert.equal(foregroundWarnings.length, 1, 'the first network failure may emit one safe diagnostic warning');
foregroundNow += 2_000;
foregroundFailure = Object.assign(new Error('Repeated synthetic network failure'), {
  code: 'UPSTREAM_UNAVAILABLE',
  status: 503,
  requestId: 'request-synthetic-repeat'
});
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
await fireForegroundTimers(250);
assert.equal(foregroundWarnings.length, 1, 'a continuous failure streak must not flood the Console');
foregroundNow += 2_000;
foregroundServerData.sync.revision = 4;
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
await fireForegroundTimers(250);
assert.equal(foregroundStoredData.sync.revision, 4, 'later foreground events must retry after a network failure');

resetForegroundObservations();
foregroundWindow.navigator.onLine = false;
foregroundWindow.dispatchEvent(new TestCustomEvent('offline'));
assert.equal(foregroundTimers.size, 0, 'offline mode must stop scheduled protected requests');
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
assert.equal(foregroundTimers.size, 0, 'offline focus must not schedule a request');
foregroundWindow.navigator.onLine = true;
foregroundWindow.dispatchEvent(new TestCustomEvent('online'));
assert.equal(foregroundTimerCount(15_000), 1, 'online recovery must resume foreground polling');
foregroundWindow.dispatchEvent(new TestCustomEvent('pagehide'));
assert.equal(foregroundTimers.size, 0, 'page unload must stop foreground polling');
foregroundWindow.dispatchEvent(new TestCustomEvent('pageshow'));
assert.equal(foregroundTimerCount(15_000), 1, 'a visible page restored from page cache must resume polling');

resetForegroundObservations();
await foregroundWindow.shiftPostgresCloud.logout();
assert.equal(foregroundTimers.size, 0, 'logout must stop all foreground timers');
foregroundNow += 2_000;
foregroundWindow.dispatchEvent(new TestCustomEvent('focus'));
foregroundDocument.dispatchEvent(new TestCustomEvent('visibilitychange'));
await fireForegroundTimers(250);
await fireForegroundTimers(15_000);
assert.equal(foregroundBootstrapCalls, 0, 'logged-out users must not call protected bootstrap APIs');

for (const environment of [
  { name: 'staging', dataBackend: 'google_sheets' },
  { name: 'production', dataBackend: 'google_sheets' }
]) {
  const inactiveForegroundListeners = [];
  const inactiveForegroundWindow = {
    shiftEnvironment: environment,
    addEventListener: (...args) => inactiveForegroundListeners.push(args)
  };
  inactiveForegroundWindow.window = inactiveForegroundWindow;
  vm.runInContext(postgresCloudSource, vm.createContext({
    window: inactiveForegroundWindow,
    document: { addEventListener: (...args) => inactiveForegroundListeners.push(args) },
    console
  }), { filename: `postgres-cloud-${environment.name}.js` });
  assert.equal(inactiveForegroundWindow.shiftPostgresCloud, undefined);
  assert.equal(inactiveForegroundListeners.length, 0,
    `${environment.name} Google Sheets mode must not install PostgreSQL foreground listeners`);
}

console.log('Staging PostgreSQL shift creation and foreground synchronization tests passed.');
