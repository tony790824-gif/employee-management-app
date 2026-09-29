import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const cloudSource = await readFile('postgres-cloud.js', 'utf8');
const managementSource = await readFile('management-actions.js', 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function fixture() {
  const workspaceId = `ws_${'a'.repeat(32)}`;
  let stored = { workspace: { id: workspaceId }, sync: { revision: 1 }, employees: [] };
  const server = structuredClone(stored);
  let readError, commandError, reads = 0, writes = 0, queued = 0, nextTimer = 0;
  const alerts = [], timers = new Map(), events = new Map();
  const client = {
    readiness: async () => ({ ok: true }), establishSession: async () => ({ ok: true }),
    bootstrap: async () => { reads++; if (readError) throw readError; return { ok: true, workspaceId, role: 'boss',
      currentUser: { workspaceId, role: 'boss', employeeId: null, displayName: 'Fixture' }, data: structuredClone(server) }; },
    bootstrapRevision: async () => ({ ok: true, workspaceId, revision: 1 }),
    executeCommand: async (name, input) => { writes++; if (commandError) throw commandError;
      server.employees = [{ id: input.employeeId, role: input.jobTitle }]; return { ok: true, data: { revision: 2 } }; },
    logout: async () => ({ ok: true })
  };
  const storage = new Map();
  const offline = { bindOwner() {}, cacheResource() {}, queueSnapshot: () => [], isDraining: () => false,
    drain: async () => null, clearAll() {}, isQueueable: () => true,
    isNetworkError: error => error?.code === 'POSTGRES_API_TIMEOUT',
    enqueue() { queued++; return {}; } };
  const window = { navigator: { onLine: true }, crypto: webcrypto, alert: message => alerts.push(message),
    addEventListener: (name, fn) => events.set(name, fn),
    shiftEnvironment: { name: 'production', dataBackend: 'postgres', postgresWorkspaceId: workspaceId,
      postgresApiUrl: 'https://fixture.example/v1', storageKey: key => key },
    shiftStateStore: { normalize: x => x, read: () => structuredClone(stored),
      write: value => { stored = structuredClone(value); }, clearSensitive() { stored = {}; } },
    shiftAccountSecurity: {}, BankePostgresApi: { createClient: () => client },
    BankePostgresOffline: { create: () => offline } };
  const document = { visibilityState: 'visible', querySelector: () => null,
    addEventListener() {}, dispatchEvent() {} };
  const context = vm.createContext({ window, document, console, structuredClone, crypto: webcrypto,
    alert: window.alert, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(cloudSource, context);
  await window.shiftPostgresCloud.connect({ getAccessToken: async () => 'fixture', offlineIdentityBinding: 'a'.repeat(64) });
  document.querySelector = () => ({ addEventListener() {} });
  vm.runInContext(managementSource, context);
  const employee = { id: 'fixture-employee', revision: 1, name: 'Fixture', phone: '0900000000', role: 'Updated', rate: 200, leaveQuota: 8 };
  return { window, alerts, employee, getStored: () => stored, getServer: () => server,
    stats: () => ({ reads, writes, queued }),
    failRead(error) { readError = error; }, failCommand(error) { commandError = error; },
    async foreground() {
      window.shiftPostgresCloud.activateForegroundSync();
      events.get('focus')();
      const debounce = [...timers.entries()].find(([, timer]) => timer.ms <= 1000);
      assert.ok(debounce); timers.delete(debounce[0]); debounce[1].fn(); await flush();
    } };
}

for (const code of ['AUTH_RENEWAL_DEFERRED', 'AUTH_RENEWAL_TEMPORARILY_UNAVAILABLE', 'POSTGRES_API_TIMEOUT']) {
  const f = await fixture();
  f.failRead(Object.assign(new Error('Read failed after committed write'), { code }));
  const before = structuredClone(f.getStored());
  const next = { ...before, employees: [{ ...f.employee }] };
  const saved = await f.window.shiftBossData.persist(before, next, '員工資料未成功寫入雲端',
    () => f.window.shiftPostgresCloud.updateEmployee(f.employee));
  assert.equal(saved, true, 'successful command stays successful even if the following read fails');
  assert.equal(f.getServer().employees[0].role, 'Updated');
  assert.equal(f.getStored().employees[0].role, 'Updated', 'manager UI does not roll back an acknowledged save');
  assert.equal(f.alerts.length, 1); assert.match(f.alerts[0], /資料已成功儲存.*請勿重複儲存/);
  assert.doesNotMatch(f.alerts[0], /原操作未送出|未成功寫入/);
  assert.equal(f.stats().queued, 0, 'post-save read timeout must never queue the committed write');
  assert.equal(f.stats().writes, 1);
  f.failRead(undefined);
  const beforeRecovery = f.stats().reads;
  await f.foreground();
  assert.equal(f.stats().reads, beforeRecovery + 1, 'pending sync recovers by read even if revision did not change');
  assert.equal(f.stats().writes, 1, 'foreground recovery must not replay a write');
  await f.foreground();
  assert.equal(f.stats().reads, beforeRecovery + 1, 'successful synchronization clears the pending flag');
}

const denied = await fixture();
denied.failCommand(Object.assign(new Error('Denied before commit'), { code: 'REVISION_CONFLICT' }));
await assert.rejects(denied.window.shiftPostgresCloud.updateEmployee(denied.employee), { code: 'REVISION_CONFLICT' });
assert.equal(denied.alerts.length, 0, 'a rejected write must never report success');
assert.equal(denied.getServer().employees.length, 0);

const success = await fixture();
const result = await success.window.shiftPostgresCloud.updateEmployee(success.employee);
assert.equal(result.ok, true); assert.equal(result.syncPending, undefined); assert.equal(success.alerts.length, 0);
console.log('Committed-write/read-refresh separation passed: truthful save result, no rollback/replay/queue, read-only recovery, true rejection preserved.');
