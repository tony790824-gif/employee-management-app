import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../employee-work.js', import.meta.url), 'utf8');
const conflictMessage = '你仍有一筆尚未打卡下班的紀錄，請先完成下班打卡。';

class ClassList {
  constructor(values = []) { this.values = new Set(values); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function createHarness(initialAttendance, { clockInImpl, refreshImpl } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const alerts = [];
  let state = {
    employees: [{ id: 'employee-1', name: 'Synthetic Employee', rate: 200 }],
    attendance: structuredClone(initialAttendance)
  };
  let clockInCalls = 0;
  let clockOutCalls = 0;
  let refreshCalls = 0;

  class TestElement {
    constructor(tagName = 'div') {
      this.tagName = tagName;
      this.children = [];
      this.classList = new ClassList();
      this.dataset = {};
      this.hidden = false;
      this.disabled = false;
      this.textContent = '';
      this.value = '';
      this.onclick = null;
      this._id = '';
    }
    set id(value) { this._id = value; elements.set(`#${value}`, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    insertAdjacentElement(_position, element) { this.children.push(element); }
  }

  const calendarBox = new TestElement();
  elements.set('#schedule .calendar-box', calendarBox);
  const monthPicker = new TestElement('input');
  monthPicker.value = '2026-08';
  elements.set('#monthPicker', monthPicker);

  const document = {
    body: { dataset: { employeeId: 'employee-1' }, classList: new ClassList(['employee-mode']) },
    createElement: tagName => new TestElement(tagName),
    querySelector: selector => elements.get(selector) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const dom = {
    element(tagName, options = {}, children = []) {
      const element = new TestElement(tagName);
      if (options.className) options.className.split(/\s+/).filter(Boolean).forEach(value => element.classList.add(value));
      if (options.text !== undefined) element.textContent = String(options.text);
      for (const [name, value] of Object.entries(options.attributes || {})) element[name] = value;
      element.append(...children);
      return element;
    }
  };
  const cloud = {
    hasEmployeeSession: () => true,
    async clockInEmployee() {
      clockInCalls += 1;
      return clockInImpl ? clockInImpl() : { ok: true };
    },
    async clockOutEmployee() {
      clockOutCalls += 1;
      const active = state.attendance.find(item => item.clockIn && !item.clockOut);
      if (active) active.clockOut = '2026-08-02T02:00:00.000Z';
      return { ok: true };
    },
    async refreshBootstrap() {
      refreshCalls += 1;
      if (refreshImpl) state = await refreshImpl(state);
      return { ok: true };
    }
  };
  const window = {
    LOCAL_PREVIEW: false,
    navigator: { onLine: true },
    shiftEnvironment: { dataBackend: 'postgres' },
    shiftStateStore: {
      read: () => state,
      write: value => { state = value; return state; }
    },
    shiftDomSafety: dom,
    shiftPostgresCloud: cloud,
    sheetsCloud: null
  };
  const context = vm.createContext({
    window, document, console, Intl, Date, Number, Object, Array,
    crypto: { randomUUID: () => 'synthetic-id' },
    alert: message => alerts.push(String(message)),
    setInterval: () => 0
  });
  vm.runInContext(source, context, { filename: 'employee-work.js' });
  return {
    window,
    alerts,
    element: id => elements.get(`#${id}`),
    state: () => state,
    counts: () => ({ clockInCalls, clockOutCalls, refreshCalls })
  };
}

const crossDay = createHarness([{
  id: 'attendance-cross-day', employeeId: 'employee-1', date: '2026-07-30',
  type: '出勤', hours: 0, clockIn: '2026-07-30T01:15:00.000Z', clockOut: null
}]);
assert.equal(crossDay.element('clockInBtn').hidden, true, '跨日未下班時不可顯示上班按鈕');
assert.equal(crossDay.element('clockOutBtn').hidden, false, '跨日未下班時必須顯示下班按鈕');
assert.match(crossDay.element('clockStatus').textContent, /2026-07-30/);
assert.match(crossDay.element('clockStatus').textContent, /09:15/);

await crossDay.element('clockInBtn').onclick();
assert.equal(crossDay.counts().clockInCalls, 0, '線上不得送出第二筆上班 Command');
assert.equal(crossDay.alerts.at(-1), conflictMessage);
crossDay.window.navigator.onLine = false;
await crossDay.element('clockInBtn').onclick();
assert.equal(crossDay.counts().clockInCalls, 0, '離線不得把第二筆上班 Command 加入 Queue');

await crossDay.element('clockOutBtn').onclick();
assert.equal(crossDay.counts().clockOutCalls, 1);
assert.equal(crossDay.element('clockInBtn').hidden, false, '正常下班後必須恢復上班按鈕');
assert.equal(crossDay.element('clockOutBtn').hidden, true);
crossDay.window.navigator.onLine = true;
await crossDay.element('clockInBtn').onclick();
assert.equal(crossDay.counts().clockInCalls, 1, '正常下班後可再次送出上班 Command');

const resourceConflict = Object.assign(new Error('The requested resource already exists.'), {
  code: 'RESOURCE_CONFLICT', status: 409
});
const conflictHarness = createHarness([], {
  clockInImpl: async () => { throw resourceConflict; },
  refreshImpl: async state => ({
    ...state,
    attendance: [{
      id: 'attendance-server', employeeId: 'employee-1', date: '2026-07-30',
      type: '出勤', hours: 0, clockIn: '2026-07-30T01:15:00.000Z', clockOut: null
    }]
  })
});
await conflictHarness.element('clockInBtn').onclick();
assert.equal(conflictHarness.alerts.at(-1), conflictMessage, 'RESOURCE_CONFLICT 必須顯示明確中文提示');
assert.equal(conflictHarness.counts().refreshCalls, 1, 'RESOURCE_CONFLICT 後必須重新同步 Bootstrap');
assert.equal(conflictHarness.element('clockInBtn').hidden, true);
assert.match(conflictHarness.element('clockStatus').textContent, /2026-07-30/);

console.log('Employee cross-day attendance and RESOURCE_CONFLICT UI tests passed.');
