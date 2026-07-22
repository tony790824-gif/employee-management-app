import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const workspaceId = `ws_${'a'.repeat(32)}`;
const written = [];
const removed = [];
const calls = [];
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
  }
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
await context.window.shiftPostgresCloud.logout();
assert.equal(context.window.shiftPostgresCloud.isConnected(), false);
assert.equal(removed[0], 'banke:staging-postgres:shift-postgres-auth');
assert.ok(calls.includes('clear'));

console.log('PostgreSQL boss/employee cutover rehearsal adapter tests passed.');
