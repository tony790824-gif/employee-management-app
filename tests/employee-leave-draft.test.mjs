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
const employeeLayoutSource = await readFile('employee-layout.js', 'utf8');
const accessCss = await readFile('access.css', 'utf8');

assert.match(
  appSource,
  /button\.onclick=document\.body\.classList\.contains\('employee-mode'\)\s*\?\s*null/,
  '員工模式不可保留舊的月曆 onclick 處理'
);
assert.match(
  appSource,
  /async function toggleLeave\(date\)\{\s*if\(document\.body\.classList\.contains\('employee-mode'\)\|\|!calendarEmployeeId\|\|bossLeaveSaving\) return;/,
  '舊休假切換函式必須拒絕員工模式呼叫'
);
assert.match(
  appSource,
  /await cloud\.saveBossLeave\(calendarEmployeeId,month,values\);/,
  'PostgreSQL 老闆休假異動必須透過 Command API 儲存'
);
assert.match(
  appSource,
  /catch\(error\)[\s\S]*休假更新失敗，資料未變更。[\s\S]*return;\s*\}\s*data\.leaves\[key\]=values;/,
  'PostgreSQL Command 失敗不得先更新本機畫面'
);
assert.match(
  accessSource,
  /document\.addEventListener\('postgres-bootstrap-refreshed',[\s\S]*resetLeaveDraftFromServer\(\);[\s\S]*updateLeaveDraftView\(\);/,
  'PostgreSQL bootstrap 更新後必須以伺服器資料重建員工草稿'
);
assert.doesNotMatch(
  employeeLayoutSource,
  /employeeLeaveSave/,
  '休假儲存面板不得再搬到「我的出勤／收入」頁面'
);
assert.match(
  employeeLayoutSource,
  /shiftEmployeeLeaveDraft\?\.confirmNavigation\?\.\(\) === false/,
  '切換到「我的出勤／收入」前必須確認未儲存草稿'
);
assert.match(
  accessSource,
  /window\.addEventListener\('beforeunload',[\s\S]*hasUnsavedLeaveDraft\(\)/,
  '重新整理或離開頁面前必須保護未儲存草稿'
);
assert.match(accessCss, /\.leave-save-actions button\{min-height:44px\}/, '操作按鈕高度至少 44px');
assert.doesNotMatch(accessCss, /\.access-controls #employeeLeaveBtn/, '員工請假捷徑不得被全域 CSS 強制隱藏');
assert.match(
  accessCss,
  /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/,
  'iPhone 寬度下的操作區不得造成橫向捲動'
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
const windowListeners = new Map();
context.addEventListener = (type, listener) => {
  const listeners = windowListeners.get(type) || [];
  listeners.push(listener);
  windowListeners.set(type, listeners);
};
context.confirm = () => true;
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
let saveCalls = 0;
let saveShouldFail = false;
context.window.shiftPostgresCloud = {
  hasEmployeeSession: () => true,
  async saveEmployeeLeave(requestMonth, dates) {
    saveCalls += 1;
    if (saveShouldFail) throw Object.assign(new Error('server details must not be shown'), { code: 'COMMAND_INVALID' });
    state = {
      ...state,
      leaves: {
        ...(state.leaves || {}),
        [`employee-1-${requestMonth}`]: [...dates]
      }
    };
    document.dispatchEvent(new FakeEvent('postgres-bootstrap-refreshed'));
  }
};

vm.runInNewContext(accessSource, context, { filename: 'access.js' });
role.value = 'employee';
role.onchange();

assert.equal(document.getElementById('employeeLeaveBtn').hidden, false, '員工 PostgreSQL 介面必須顯示明確請假入口');
assert.equal(document.getElementById('employeeLeaveBtn').textContent, '我要請假', '請假入口文案必須清楚');
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

const savePanel = document.getElementById('employeeLeaveSave');
const saveHint = document.getElementById('leaveSaveHint');
const saveButton = document.getElementById('saveLeaveDraft');
const cancelButton = document.getElementById('cancelLeaveDraft');
const saveStatus = document.getElementById('employeeLeaveStatus');

assert.equal(savePanel.hidden, true, '正式資料與草稿相同時不顯示儲存操作區');

click(7);
assert.equal(savePanel.hidden, false, '選取一天後顯示儲存操作區');
assert.equal(saveHint.textContent, '尚有 1 天變更未儲存', '選取一天應顯示 1 天未儲存');
click(8);
assert.equal(saveHint.textContent, '尚有 2 天變更未儲存', '多選日期後差異數量必須正確');
click(7);
assert.equal(saveHint.textContent, '尚有 1 天變更未儲存', '取消單一日期後差異數量必須立即更新');

cancelButton.onclick();
assert.equal(saveCalls, 0, '取消變更不得呼叫 API');
assert.equal(savePanel.hidden, true, '取消變更後應隱藏儲存操作區');
assert.equal(document.getElementById('leaveRemaining').textContent, 2, '取消變更後應恢復正式剩餘天數');
assert.equal(document.days[7].classList.contains('is-leave'), false, '取消變更後應恢復正式日曆');

click(7);
const firstSave = saveButton.onclick();
const duplicateSave = saveButton.onclick();
await Promise.all([firstSave, duplicateSave]);
assert.equal(saveCalls, 1, '快速連按儲存只能送出一次請求');
assert.equal(state.leaves[`employee-1-${month}`].length, 7, '儲存成功後正式資料必須持久化');
assert.equal(savePanel.hidden, true, '儲存成功後操作區應回到無未儲存狀態');
assert.equal(saveStatus.hidden, false, '儲存成功後應顯示同步成功訊息');
assert.equal(saveStatus.textContent, '休假已儲存，老闆端會同步更新', '成功訊息必須符合產品文案');

document.dispatchEvent(new FakeEvent('postgres-bootstrap-refreshed'));
assert.equal(document.days[6].classList.contains('is-leave'), true, '重新取得 bootstrap 後已儲存休假仍必須存在');

click(8);
saveShouldFail = true;
await saveButton.onclick();
assert.equal(saveCalls, 2, '失敗案例應只送出一次請求');
assert.equal(state.leaves[`employee-1-${month}`].length, 7, 'API 失敗不得修改正式資料');
assert.equal(document.days[7].classList.contains('is-leave'), true, 'API 失敗必須保留目前草稿');
assert.equal(savePanel.hidden, false, 'API 失敗後操作區必須保留以供重試');
assert.equal(saveStatus.classList.contains('is-error'), true, 'API 失敗必須顯示安全錯誤狀態');
assert.doesNotMatch(saveStatus.textContent, /server details/, '錯誤訊息不得洩漏伺服器細節');

const unloadEvent = new FakeEvent('beforeunload');
for (const listener of windowListeners.get('beforeunload') || []) listener(unloadEvent);
assert.equal(unloadEvent.defaultPrevented, true, '未儲存草稿時重新整理必須觸發離頁保護');
assert.equal(unloadEvent.returnValue, '', 'beforeunload 必須要求瀏覽器顯示原生確認');

let confirmCalls = 0;
context.confirm = () => { confirmCalls += 1; return false; };
assert.equal(context.window.shiftEmployeeLeaveDraft.confirmNavigation(), false, '使用者取消提示時不得切換頁籤');
assert.equal(confirmCalls, 1, '切換頁籤提示只應出現一次');

cancelButton.onclick();
assert.equal(savePanel.hidden, true, '取消失敗後保留的草稿應恢復正式資料');
assert.equal(document.days[7].classList.contains('is-leave'), false, '取消變更後不得殘留未儲存日期');

role.value = 'boss';
role.onchange();
assert.equal(document.getElementById('employeeLeaveBtn').hidden, true, '老闆模式不得顯示員工請假捷徑');
assert.equal(savePanel.hidden, true, '老闆模式不得顯示員工草稿儲存區');

console.log('員工休假草稿、儲存、取消、離頁保護與手機操作區回歸測試通過。');
