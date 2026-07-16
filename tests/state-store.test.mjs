import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('state-store.js', 'utf8');

function createStore(initial = {}, failingKeys = []) {
  const values = new Map(Object.entries(initial));
  const failures = new Set(failingKeys);
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failures.has(key)) throw new Error(`Storage blocked for ${key}`);
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  const sandbox = { window: {}, localStorage };
  vm.runInNewContext(source, sandbox, { filename: 'state-store.js' });
  return { store: sandbox.window.shiftStateStore, values };
}

{
  const { store, values } = createStore({
    'shift-app-data-v3': JSON.stringify({ employees: [{ id: 'current' }] }),
    'shift-app-data-v2': JSON.stringify({ employees: [{ id: 'legacy' }] }),
    'shift-app-data-corrupt-backup': JSON.stringify({ raw: 'sensitive' }),
    'unrelated-setting': 'keep'
  });
  store.clearSensitive();
  assert.equal(values.has('shift-app-data-v3'), false);
  assert.equal(values.has('shift-app-data-v2'), false);
  assert.equal(values.has('shift-app-data-corrupt-backup'), false);
  assert.equal(values.get('unrelated-setting'), 'keep', '登出清除不可刪除無關設定');
}

const fallback = { employees: [{ id: 'sample' }], custom: 'preserved' };

{
  const { store, values } = createStore();
  const state = store.read(fallback);
  assert.equal(state.employees[0].id, 'sample');
  assert.deepEqual([...state.shifts], []);
  assert.deepEqual({ ...state.access }, {});
  assert.equal(state.custom, 'preserved');
  assert.ok(values.has(store.key), '正規化後必須建立目前版本資料');
}

{
  const prior = JSON.stringify({ employees: [{ id: 'legacy' }], shifts: [] });
  const { store, values } = createStore({
    'shift-app-data-v3': '{broken-json',
    'shift-app-data-v2': prior,
    'shift-app-data-v1': '{older-broken-json'
  });
  const state = store.read(fallback);
  assert.equal(state.employees[0].id, 'legacy', '目前版本損壞時應採用可讀的最近舊版');
  const backup = JSON.parse(values.get(store.corruptBackupKey));
  assert.equal(backup.sourceKey, 'shift-app-data-v3', '只能隔離最優先的損壞版本');
  assert.equal(backup.raw, '{broken-json');
  assert.equal(
    JSON.stringify(store.consumeRecovery()),
    JSON.stringify({ sourceKey: 'shift-app-data-v3', backupSaved: true })
  );
  assert.equal(store.consumeRecovery(), null, '復原通知只能消費一次');
}

for (const invalid of ['', '{broken-json', '"primitive"', '[]', 'null']) {
  const { store } = createStore({ 'shift-app-data-v3': invalid });
  const state = store.read(fallback);
  assert.deepEqual([...state.employees], [], '損壞資料不得回填 production sample');
  assert.ok(store.consumeRecovery(), '損壞資料必須產生復原紀錄');
}

{
  const { store } = createStore(
    { 'shift-app-data-v3': '{broken-json' },
    ['shift-app-data-corrupt-backup']
  );
  const state = store.read();
  assert.deepEqual([...state.employees], []);
  assert.equal(
    JSON.stringify(store.consumeRecovery()),
    JSON.stringify({ sourceKey: 'shift-app-data-v3', backupSaved: false })
  );
}

{
  const employees = Array.from({ length: 10000 }, (_, index) => ({ id: `employee-${index}` }));
  const { store } = createStore({
    'shift-app-data-v3': JSON.stringify({ employees, shifts: [], attendance: [], leaves: {} })
  });
  const state = store.read();
  assert.equal(state.employees.length, 10000, '大量員工資料正規化時不得遺失紀錄');
  for (let index = 0; index < 100; index += 1) store.write(store.read());
  assert.equal(store.read().employees.length, 10000, '重複讀寫不得遺失資料');
}

console.log('State store 安全解析、遷移、隔離與復原測試通過。');
