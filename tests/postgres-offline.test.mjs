import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('postgres-offline.js', 'utf8');
let uuidSequence = 0;
const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const context = vm.createContext({
  window: {},
  localStorage: storage,
  crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}` },
  TextEncoder,
  console
});
context.globalThis = context;
vm.runInContext(source, context, { filename: 'postgres-offline.js' });

let now = 1_000;
const ownerA = 'a'.repeat(64);
const ownerB = 'b'.repeat(64);
const createRuntime = () => context.window.BankePostgresOffline.create({
  storage,
  storageKey: 'staging:postgres-offline-v1',
  cryptoImpl: context.crypto,
  now: () => now
});

const runtime = createRuntime();
runtime.bindOwner(ownerA);

const bootstrap = {
  ok: true,
  workspaceId: `ws_${'1'.repeat(32)}`,
  data: {
    employees: [{ id: 'employee-1', name: 'Synthetic Employee' }],
    shifts: [{ id: 'shift-1', employeeId: 'employee-1' }],
    sync: { revision: 7 }
  }
};
runtime.cacheResource('bootstrap', bootstrap);
runtime.cacheResource('timeOff', { ok: true, ownRequests: [{ id: 'request-1', reason: 'synthetic' }] });
runtime.cacheResource('notifications', { ok: true, items: [{ id: 'notification-1' }], unreadCount: 1 });
assert.equal(JSON.stringify(runtime.readResource('bootstrap')), JSON.stringify(bootstrap),
  'bootstrap, employees and shifts must remain readable offline');
assert.equal(runtime.readResource('timeOff').ownRequests.length, 1, 'time-off data must remain readable offline');
assert.equal(runtime.readResource('notifications').unreadCount, 1, 'notification data must remain readable offline');

const queuedClock = runtime.enqueue({
  commandName: 'attendance.clock-in', input: {}, baseRevision: 7, idempotencyKey: 'offline-clock-0001'
});
const duplicateClock = runtime.enqueue({
  commandName: 'attendance.clock-in', input: {}, baseRevision: 7, idempotencyKey: 'offline-clock-0002'
});
assert.equal(duplicateClock.id, queuedClock.id, 'identical rapid operations must deduplicate');
assert.equal(duplicateClock.duplicate, true);
assert.equal(runtime.queueSnapshot().length, 1);
assert.equal(runtime.queueSnapshot()[0].idempotencyKey, 'offline-clock-0001',
  'the original idempotency key must survive every replay');
assert.throws(() => runtime.enqueue({
  commandName: 'employees.create', input: {}, baseRevision: 7, idempotencyKey: 'not-allowed-0001'
}), error => error?.code === 'OFFLINE_COMMAND_NOT_ALLOWED', 'unreviewed commands must fail closed offline');

runtime.enqueue({
  commandName: 'leave-requests.submit',
  input: { startDate: '2026-08-04', endDate: '2026-08-04', leaveType: '事假', reason: 'synthetic' },
  baseRevision: 7,
  idempotencyKey: 'offline-leave-0001'
});
runtime.enqueue({
  commandName: 'shifts.create',
  input: { employeeId: 'employee-1', date: '2026-08-05', startTime: '09:00', endTime: '18:00', note: '' },
  baseRevision: 7,
  idempotencyKey: 'offline-shift-0001'
});

let serverRevision = 7;
const executed = [];
const drained = await runtime.drain({
  getRevision: async () => serverRevision,
  execute: async record => {
    executed.push({ commandName: record.commandName, idempotencyKey: record.idempotencyKey });
    serverRevision += 1;
    return { revision: serverRevision };
  }
});
assert.equal(drained.completed, 3);
assert.deepEqual(executed.map(item => item.commandName), [
  'attendance.clock-in', 'leave-requests.submit', 'shifts.create'
]);
assert.equal(runtime.queueSnapshot().length, 0);
assert.deepEqual(executed.map(item => item.idempotencyKey), [
  'offline-clock-0001', 'offline-leave-0001', 'offline-shift-0001'
]);

const retryRecord = runtime.enqueue({
  commandName: 'attendance.clock-out', input: {}, baseRevision: serverRevision, idempotencyKey: 'offline-clock-out-1'
});
let revisionAttempts = 0;
const networkError = Object.assign(new Error('offline'), { code: 'POSTGRES_API_UNAVAILABLE' });
const firstRetry = await runtime.drain({
  getRevision: async () => { revisionAttempts += 1; throw networkError; },
  execute: async () => { throw new Error('must not execute'); }
});
assert.equal(firstRetry.retryAt, now + 1_000, 'the first retry must use a one-second exponential delay');
assert.equal(runtime.queueSnapshot()[0].id, retryRecord.id);
assert.equal(runtime.queueSnapshot()[0].attempts, 1);
const earlyRetry = await runtime.drain({
  getRevision: async () => serverRevision,
  execute: async () => ({ revision: serverRevision + 1 })
});
assert.equal(earlyRetry.completed, 0, 'backoff must prevent early duplicate delivery');
assert.equal(revisionAttempts, 1);
now += 1_000;
const secondRetry = await runtime.drain({
  getRevision: async () => { throw networkError; },
  execute: async () => { throw new Error('must not execute'); }
});
assert.equal(secondRetry.retryAt, now + 2_000, 'the second retry must double the bounded delay');
assert.equal(runtime.queueSnapshot()[0].attempts, 2);
now += 2_000;
const recovered = await runtime.drain({
  getRevision: async () => serverRevision,
  execute: async record => {
    assert.equal(record.idempotencyKey, 'offline-clock-out-1');
    serverRevision += 1;
    return { revision: serverRevision };
  }
});
assert.equal(recovered.completed, 1, 'network recovery must make the queued command eligible');

runtime.enqueue({
  commandName: 'schedule-leave-requests.submit',
  input: { month: '2026-08', dates: ['2026-08-08'] },
  baseRevision: serverRevision,
  idempotencyKey: 'offline-conflict-1'
});
const conflict = await runtime.drain({
  getRevision: async () => serverRevision + 1,
  execute: async () => { throw new Error('conflicted commands must never execute'); }
});
assert.equal(conflict.conflict, true);
assert.equal(runtime.queueSnapshot()[0].status, 'conflict',
  'revision conflicts must remain visible and never overwrite newer data');

runtime.clearQueue();
runtime.enqueue({
  commandName: 'attendance.clock-in', input: {}, baseRevision: serverRevision, idempotencyKey: 'offline-overlap-1'
});
let releaseExecution;
let executionCalls = 0;
const executionGate = new Promise(resolve => { releaseExecution = resolve; });
const firstDrain = runtime.drain({
  getRevision: async () => serverRevision,
  execute: async () => {
    executionCalls += 1;
    await executionGate;
    serverRevision += 1;
    return { revision: serverRevision };
  }
});
const secondDrain = runtime.drain({
  getRevision: async () => serverRevision,
  execute: async () => ({ revision: serverRevision + 1 })
});
assert.equal(runtime.isDraining(), true);
releaseExecution();
await Promise.all([firstDrain, secondDrain]);
assert.equal(executionCalls, 1, 'concurrent drains must share one in-flight replay');

runtime.cacheResource('notifications', { ok: true, items: [{ id: 'owner-a-only' }] });
runtime.bindOwner(ownerB);
assert.equal(runtime.readResource('notifications'), null, 'account switching must remove the previous user cache');
assert.equal(runtime.queueSnapshot().length, 0, 'account switching must remove the previous user queue');
runtime.clearAll();
assert.equal(values.has('staging:postgres-offline-v1'), false, 'logout must clear all offline business data');

class TestCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}
const workspaceId = `ws_${'c'.repeat(32)}`;
const browserValues = new Map();
const browserStorage = {
  getItem: key => browserValues.get(key) ?? null,
  setItem: (key, value) => browserValues.set(key, String(value)),
  removeItem: key => browserValues.delete(key)
};
const windowListeners = new Map();
const documentListeners = new Map();
const browserEvents = [];
let browserRevision = 10;
let browserData = {
  workspace: { id: workspaceId }, employees: [], shifts: [], attendance: [], leaves: {},
  removedEmployees: [], sync: { revision: browserRevision }
};
let storedData = structuredClone(browserData);
let commandCalls = 0;
let commandKey = '';
let commandFailure = null;
let bootstrapCalls = 0;
let onCommandRevision;
const offlinePanelElement = { hidden: true };
const offlineMessageElement = { textContent: '' };
const offlineDiscardElement = { hidden: true, addEventListener() {} };
const offlineElements = new Map([
  ['#offlineSyncStatus', offlinePanelElement],
  ['#offlineSyncMessage', offlineMessageElement],
  ['#offlineSyncDiscard', offlineDiscardElement]
]);
const browserWindow = {
  crypto: { randomUUID: () => `10000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}` },
  navigator: { onLine: true },
  addEventListener: (type, listener) => windowListeners.set(type, listener),
  shiftEnvironment: {
    dataBackend: 'postgres', postgresApiUrl: 'https://staging.example/v1',
    postgresWorkspaceId: workspaceId, storagePrefix: 'test:', storageKey: key => `test:${key}`
  },
  shiftStateStore: {
    normalize: value => structuredClone(value),
    read: () => structuredClone(storedData),
    write: value => { storedData = structuredClone(value); return storedData; },
    clearSensitive: () => { storedData = {}; }
  },
  BankePostgresApi: {
    createClient: options => {
      onCommandRevision = options.onCommandRevision;
      return {
        readiness: async () => ({ ok: true }),
        establishSession: async () => ({ ok: true }),
        bootstrap: async () => {
          bootstrapCalls += 1;
          return {
            ok: true, workspaceId, role: 'employee', employeeId: 'employee-1',
            currentUser: { displayName: 'Synthetic', role: 'employee', employeeId: 'employee-1', workspaceId },
            data: structuredClone(browserData)
          };
        },
        bootstrapRevision: async () => ({ ok: true, workspaceId, revision: browserRevision }),
        listTimeOffRequests: async () => ({ ok: true, ownRequests: [{ id: 'request-browser' }] }),
        listNotifications: async () => ({ ok: true, items: [{ id: 'notification-browser' }], unreadCount: 1 }),
        executeCommand: async (commandName, input, options) => {
          commandCalls += 1;
          commandKey = options.idempotencyKey;
          assert.equal(commandName, 'attendance.clock-in');
          assert.deepEqual({ ...input }, {});
          if (commandFailure) throw commandFailure;
          browserRevision += 1;
          browserData.sync.revision = browserRevision;
          browserData.attendance.push({ id: 'attendance-online', employeeId: 'employee-1' });
          onCommandRevision(browserRevision);
          return { ok: true };
        },
        logout: async () => ({ ok: true })
      };
    }
  }
};
const browserDocument = {
  visibilityState: 'visible',
  querySelector: selector => offlineElements.get(selector) || null,
  addEventListener: (type, listener) => documentListeners.set(type, listener),
  dispatchEvent: event => browserEvents.push(event)
};
const browserContext = vm.createContext({
  window: browserWindow,
  document: browserDocument,
  localStorage: browserStorage,
  sessionStorage: browserStorage,
  crypto: browserWindow.crypto,
  TextEncoder,
  CustomEvent: TestCustomEvent,
  structuredClone,
  setTimeout,
  clearTimeout,
  console
});
browserContext.globalThis = browserContext;
vm.runInContext(source, browserContext, { filename: 'postgres-offline-browser.js' });
browserWindow.BankePostgresOffline = browserContext.window.BankePostgresOffline;
vm.runInContext(await readFile('postgres-cloud.js', 'utf8'), browserContext, { filename: 'postgres-cloud-offline.js' });
await browserWindow.shiftPostgresCloud.connect({
  getAccessToken: async () => 'synthetic-token',
  offlineIdentityBinding: 'd'.repeat(64)
});
await browserWindow.shiftPostgresCloud.listTimeOffRequests();
await browserWindow.shiftPostgresCloud.listNotifications();
browserWindow.navigator.onLine = false;
assert.equal((await browserWindow.shiftPostgresCloud.listTimeOffRequests()).ownRequests[0].id, 'request-browser');
assert.equal((await browserWindow.shiftPostgresCloud.listNotifications()).unreadCount, 1);
const queuedResult = await browserWindow.shiftPostgresCloud.clockInEmployee();
assert.equal(queuedResult.queued, true, 'network-unavailable commands must enter the reviewed queue');
assert.equal(commandCalls, 0);
const queuedKey = browserWindow.shiftPostgresCloud.getOfflineQueue()[0].idempotencyKey;
browserWindow.navigator.onLine = true;
windowListeners.get('online')();
for (let index = 0; index < 12; index += 1) await Promise.resolve();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(commandCalls, 1, 'online recovery must replay the queued command once');
assert.equal(commandKey, queuedKey, 'online recovery must preserve the enqueue-time idempotency key');
assert.equal(browserWindow.shiftPostgresCloud.getOfflineQueue().length, 0);
assert.equal(storedData.attendance[0].id, 'attendance-online', 'successful recovery must refresh the canonical bootstrap');

browserWindow.navigator.onLine = false;
const conflictQueuedResult = await browserWindow.shiftPostgresCloud.clockInEmployee();
assert.equal(conflictQueuedResult.queued, true, 'offline clock-in must remain queueable when no open record is cached');
commandFailure = Object.assign(new Error('Synthetic open attendance conflict'), {
  code: 'RESOURCE_CONFLICT', status: 409, requestId: 'safe-request-id'
});
const bootstrapCallsBeforeConflict = bootstrapCalls;
browserWindow.navigator.onLine = true;
windowListeners.get('online')();
for (let index = 0; index < 12; index += 1) await Promise.resolve();
await new Promise(resolve => setTimeout(resolve, 0));
const [failedClockIn] = browserWindow.shiftPostgresCloud.getOfflineQueue();
assert.equal(failedClockIn.status, 'failed');
assert.equal(failedClockIn.errorCode, 'RESOURCE_CONFLICT');
assert.equal(
  offlineMessageElement.textContent,
  '你仍有一筆尚未打卡下班的紀錄，請先完成下班打卡。',
  'offline replay conflict must show an actionable attendance message'
);
assert.equal(
  bootstrapCalls,
  bootstrapCallsBeforeConflict + 1,
  'offline replay conflict must refresh the canonical bootstrap once'
);
await browserWindow.shiftPostgresCloud.logout();
assert.equal(browserValues.has('test:postgres-offline-v1'), false, 'logout must clear the integrated offline cache and queue');

const projectFiles = await readFile('scripts/project-files.mjs', 'utf8');
const index = await readFile('index.html', 'utf8');
const worker = await readFile('service-worker.js', 'utf8');
assert.match(projectFiles, /'postgres-offline\.js'/);
assert.ok(index.indexOf('state-store.js') < index.indexOf('postgres-offline.js'));
assert.ok(index.indexOf('postgres-offline.js') < index.indexOf('postgres-cloud.js'));
assert.match(worker, /'\.\/postgres-offline\.js'/,
  'offline runtime must be available from the isolated app-shell cache');

console.log('PostgreSQL offline cache, queue, backoff, conflict and account-isolation tests passed.');
