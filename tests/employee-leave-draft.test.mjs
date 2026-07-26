import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

class ClassList {
  constructor(value = '') {
    this.values = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

class Element {
  constructor(document, tagName = 'div', id = '') {
    this.document = document;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.value = '';
    this.text = '';
    this.textContent = '';
    this.options = [];
    this.rows = [];
    this.cells = [];
    this.listeners = new Map();
    this.parentElement = { hidden: false };
    this.classList = new ClassList();
    if (id) this.id = id;
  }
  set id(value) {
    this._id = value;
    if (value) this.document.elements.set(value, this);
  }
  get id() { return this._id || ''; }
  set className(value) {
    this._className = value;
    this.classList = new ClassList(value);
  }
  get className() { return this._className || ''; }
  get selectedOptions() {
    return this.options.filter(option => option.value === this.value).slice(0, 1);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
    this.textContent = nodes.map(node => node?.textContent || '').join('');
    if (this.tagName === 'SELECT') this.options = nodes;
  }
  insertAdjacentElement(_position, element) {
    this.children.push(element);
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    if (typeof this[`on${event.type}`] === 'function') this[`on${event.type}`](event);
    return true;
  }
  closest(selector) {
    if (selector === '.calendar-day' && this.classList.contains('calendar-day')) return this;
    return null;
  }
  remove() {}
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.days = [];
    this.body = new Element(this, 'body', 'body');
    this.body.dataset = {};
  }
  createElement(tagName) { return new Element(this, tagName); }
  createTextNode(text) { return { textContent: String(text) }; }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.elements.get(selector.slice(1)) || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '.calendar-day') return this.days;
    return [];
  }
  getElementById(id) { return this.elements.get(id) || null; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }
}

class FakeEvent {
  constructor(type) { this.type = type; }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() { this.immediatePropagationStopped = true; }
}

const appSource = await readFile('app.js', 'utf8');
const accessSource = await readFile('access.js', 'utf8');

assert.match(
  appSource,
  /button\.onclick=document\.body\.classList\.contains\('employee-mode'\)\s*\?\s*null/,
  '員工模式不可保留舊的月曆 onclick 處理'
);
assert.match(
  appSource,
  /function toggleLeave\(date\)\{\s*if\(document\.body\.classList\.contains\('employee-mode'\)\|\|!calendarEmployeeId\) return;/,
  '舊休假切換函式必須拒絕員工模式呼叫'
);
assert.match(
  accessSource,
  /document\.addEventListener\('postgres-bootstrap-refreshed',[\s\S]*resetLeaveDraftFromServer\(\);[\s\S]*updateLeaveDraftView\(\);/,
  'PostgreSQL bootstrap 更新後必須以伺服器資料重建員工草稿'
);

const document = new FakeDocument();
const createElement = (tag, id) => new Element(document, tag, id);
const role = createElement('select', 'roleSelect');
role.value = 'boss';
const person = createElement('select', 'employeeModeSelect');
const wrap = createElement('div', 'employeeModeWrap');
createElement('button', 'employeeLeaveBtn');
const monthPicker = createElement('input', 'monthPicker');
const taipeiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const month = taipeiDate.slice(0, 7);
monthPicker.value = month;
const calendarEmployee = createElement('select', 'calendarEmployee');
const employeeOption = createElement('option');
employeeOption.value = 'employee-1';
employeeOption.text = '測試員工';
employeeOption.textContent = '測試員工';
calendarEmployee.options = [employeeOption];
calendarEmployee.value = employeeOption.value;
createElement('tbody', 'scheduleBody').rows = [];
createElement('div', 'schedule').querySelector = () => null;
const calendarBox = createElement('div', 'calendarBox');
document.querySelector = selector => {
  if (selector === '#schedule .calendar-box') return calendarBox;
  if (selector.startsWith('#')) return document.elements.get(selector.slice(1)) || null;
  return null;
};
createElement('span', 'leaveRemaining');

for (let day = 1; day <= 9; day += 1) {
  const element = createElement('button');
  element.className = 'calendar-day';
  element.dataset.date = `${month}-${String(day).padStart(2, '0')}`;
  element.onclick = () => { throw new Error('員工點擊不應觸發舊 onclick'); };
  document.days.push(element);
}

let state = {
  employees: [{ id: 'employee-1', name: '測試員工', leaveQuota: 8 }],
  leaves: {
    [`employee-1-${month}`]: Array.from(
      { length: 7 },
      (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
    )
  }
};
const alerts = [];
const localValues = new Map();
const localStorage = {
  getItem: key => localValues.get(key) || null,
  setItem: (key, value) => localValues.set(key, String(value))
};
const domSafety = {
  option(value, text) {
    const option = createElement('option');
    option.value = value;
    option.text = text;
    option.textContent = text;
    return option;
  },
  element(tagName, options = {}) {
    const element = createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) {
      element.text = String(options.text);
      element.textContent = String(options.text);
    }
    if (options.dataset) element.dataset = { ...options.dataset };
    return element;
  },
  replace(target, ...nodes) { target.replaceChildren(...nodes); }
};
const context = {
  console,
  Date,
  Intl,
  document,
  localStorage,
  Event: FakeEvent,
  CustomEvent: FakeEvent,
  alert: message => alerts.push(message),
  location: { reload() {} }
};
context.window = context;
context.window.shiftEnvironment = {
  dataBackend: 'postgres',
  storageKey: key => `test:${key}`
};
context.window.shiftStateStore = {
  read: () => state,
  write: next => { state = next; }
};
context.window.shiftDomSafety = domSafety;

vm.runInNewContext(accessSource, context, { filename: 'access.js' });
role.value = 'employee';
role.onchange();

assert.equal(document.getElementById('leaveRemaining').textContent, 1, '已休 7 天時應剩餘 1 天');
assert.equal(document.days[7].onclick, null, '員工月曆只能保留草稿點擊處理');

const click = day => {
  const event = new FakeEvent('click');
  event.target = document.days[day - 1];
  document.dispatchEvent(event);
};

click(8);
assert.equal(alerts.length, 0, '第 8 天仍應可選');
assert.equal(document.getElementById('leaveRemaining').textContent, 0, '選第 8 天後剩餘天數應為 0');
assert.equal(document.days[7].classList.contains('is-leave'), true, '第 8 天應進入待儲存休假狀態');

click(9);
assert.equal(alerts.length, 1, '第 9 天才應顯示額度已滿');
assert.equal(document.days[8].classList.contains('is-leave'), false, '被拒絕的第 9 天不可進入休假狀態');

state = {
  ...state,
  leaves: {
    [`employee-1-${month}`]: Array.from(
      { length: 6 },
      (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
    )
  }
};
document.dispatchEvent(new FakeEvent('postgres-bootstrap-refreshed'));

assert.equal(document.getElementById('leaveRemaining').textContent, 2, 'bootstrap 更新後應依最新 6 天正式資料重建草稿');
assert.equal(document.days[7].classList.contains('is-leave'), false, 'bootstrap 更新後舊草稿第 8 天不得殘留');

console.log('員工休假草稿同步與單一點擊處理回歸測試通過。');
