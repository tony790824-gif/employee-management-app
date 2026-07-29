import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [ui, css, cloud, access, login, projectFiles, serviceWorker] = await Promise.all([
  readFile('time-off-ui.js', 'utf8'),
  readFile('time-off-ui.css', 'utf8'),
  readFile('postgres-cloud.js', 'utf8'),
  readFile('access.js', 'utf8'),
  readFile('login.js', 'utf8'),
  readFile('scripts/project-files.mjs', 'utf8'),
  readFile('service-worker.js', 'utf8')
]);

for (const method of [
  'submitScheduleLeaveRequest',
  'cancelScheduleLeaveRequest',
  'submitLeaveRequest',
  'cancelLeaveRequest',
  'approveTimeOffRequest',
  'rejectTimeOffRequest'
]) {
  assert.match(ui, new RegExp(`cloud\\.${method}\\(`), `Time-Off UI 必須沿用 ${method}`);
  assert.match(cloud, new RegExp(`const ${method}\\s*=`), `PostgreSQL cloud 必須提供 ${method}`);
}

assert.match(cloud, /const listTimeOffRequests = \(\) =>[\s\S]*client\.listTimeOffRequests\(\)/,
  '唯讀申請清單必須沿用既有 PostgreSQL API Client');
assert.match(ui, /pending:\s*'待審核'/);
assert.match(ui, /approved:\s*'已核准'/);
assert.match(ui, /rejected:\s*'已拒絕'/);
assert.match(ui, /cancelled:\s*'已取消'/);
assert.match(ui, /const role = currentRole\(\);[\s\S]*role === 'employee'/,
  '員工 UI 必須依 server-side currentUser role 顯示');
assert.match(ui, /const role = currentRole\(\);[\s\S]*role === 'boss'/,
  '管理者 UI 必須依 server-side currentUser role 顯示');
assert.match(ui, /const currentUser = \(\) => cloud\.getCurrentUser\?\.\(\) \|\| null;/,
  'Time-Off UI 必須使用 server-side currentUser 作為隱私判斷來源');
assert.match(ui, /const canViewReason = request => \{[\s\S]*user\?\.role === 'boss'[\s\S]*user\?\.role === 'employee'[\s\S]*request\?\.employeeId === user\.employeeId;/,
  '請假原因只允許管理者或申請員工本人查看');
assert.match(ui, /request\.reason && canViewReason\(request\)/,
  '請假原因渲染必須通過前端防禦性權限檢查');
assert.doesNotMatch(ui, /\.\.\.\(request\.reason \? \[\['原因'/,
  '請假原因不得只因 API 回傳非空值就直接渲染');
assert.match(ui, /window\.confirm\(`確定取消/, '取消申請必須先確認');
assert.match(ui, /window\.confirm\(`確定\$\{verb\}/, '核准或拒絕必須先確認');
assert.match(ui, /if \(actionBusy\) return;/, '重複快速點擊不得送出第二次 Command');
assert.match(ui, /postgres-bootstrap-refreshed[\s\S]*if \(actionBusy\) return;/,
  'Command 完成時的 bootstrap 更新不得額外重複讀取申請清單');
assert.doesNotMatch(ui, /location\.reload|innerHTML|insertAdjacentHTML/,
  'Time-Off UI 不得整頁 reload 或將資料交給 HTML parser');
assert.match(access, /usesReviewedTimeOff\(\)\) return;/,
  'PostgreSQL 員工月曆不得繼續使用舊的直接正式休假寫入流程');
assert.match(access, /employeeLeaveButton\.textContent = '排休／請假'/,
  '既有員工捷徑必須導向新的審核式 Time-Off UI');

assert.match(css, /\.time-off-card-actions button\{min-height:44px\}/,
  '手機審核按鈕觸控高度至少 44px');
assert.match(css, /@media\(max-width:760px\)/, '必須提供手機響應式版面');
assert.match(css, /overflow-wrap:anywhere/, '長原因不得撐破手機版面');

for (const source of [login, projectFiles, serviceWorker]) {
  assert.match(source, /time-off-ui\.js/, '建置與已登入載入清單必須包含 Time-Off UI');
}
for (const source of [projectFiles, serviceWorker]) {
  assert.match(source, /time-off-ui\.css/, '建置與 PWA cache 必須包含 Time-Off CSS');
}

assert.match(ui, /publishApprovedLeaveCoverage\(payload\?\.approvedLeaveCoverage\)/,
  'Time-Off API 的已核准臨時請假覆蓋資料必須發布給排班日曆');
assert.match(ui, /postgres-bootstrap-refreshed[\s\S]*if \(!tab\.hidden\) void loadRequests\(\);/,
  'bootstrap 更新後必須重新取得臨時請假覆蓋資料，不能只在 Time-Off 分頁開啟時更新');
assert.match(ui, /postgres-session-cleared[\s\S]*publishApprovedLeaveCoverage\(\[\]\)/,
  'Session 清除後不得保留上一位登入者的請假覆蓋資料');
assert.match(css, /\.calendar-day\.has-approved-leave::before\{content:'請假 ' attr\(data-approved-leave-count\) ' 人'/,
  '日曆必須以不含姓名與原因的核准臨時請假人數呈現');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.nodeType = 1;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.value = '';
    this.id = '';
    this.className = '';
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value)),
      toggle: (value, enabled) => {
        if (enabled) classes.add(value);
        else classes.delete(value);
      }
    };
  }

  append(...children) {
    this.children.push(...children.filter(Boolean));
  }

  replaceChildren(...children) {
    this.children = children.filter(Boolean);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
  }

  async emit(type) {
    for (const listener of this.listeners[type] || []) {
      await listener({ preventDefault() {} });
    }
  }
}

const descendants = root => [root, ...root.children.flatMap(child =>
  child?.nodeType === 1 ? descendants(child) : []
)];

async function createTimeOffScenario(initialPayload, refreshedPayload = initialPayload) {
  const tabs = new FakeElement('nav');
  const main = new FakeElement('main');
  const monthPicker = new FakeElement('input');
  monthPicker.value = '2026-07';
  const submitted = [];
  let listCalls = 0;
  const documentListeners = {};
  const document = {
    createElement: tagName => new FakeElement(tagName),
    createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
    querySelector: selector => {
      const fixed = ({
        '.tabs': tabs,
        main,
        '#monthPicker': monthPicker
      })[selector];
      if (fixed) return fixed;
      return selector.startsWith('#')
        ? descendants(main).find(element => element.id === selector.slice(1)) || null
        : null;
    },
    querySelectorAll: () => [],
    addEventListener(type, listener) {
      (documentListeners[type] ||= []).push(listener);
    },
    dispatchEvent() {}
  };
  const cloud = {
    getCurrentUser: () => ({
      role: 'employee',
      employeeId: 'employee-a',
      workspaceId: 'workspace-a'
    }),
    listTimeOffRequests: async () => (listCalls++ ? refreshedPayload : initialPayload),
    submitScheduleLeaveRequest: async input => submitted.push(structuredClone(input)),
    cancelScheduleLeaveRequest: async () => {},
    submitLeaveRequest: async () => {},
    cancelLeaveRequest: async () => {},
    approveTimeOffRequest: async () => {},
    rejectTimeOffRequest: async () => {}
  };
  const window = {
    shiftEnvironment: { dataBackend: 'postgres' },
    shiftPostgresCloud: cloud,
    shiftStateStore: {},
    confirm: () => true
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    console,
    Intl,
    Date,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    }
  });
  vm.runInContext(await readFile('dom-safety.js', 'utf8'), context);
  vm.runInContext(ui, context);
  window.shiftTimeOffUi.activate();
  await window.shiftTimeOffUi.refresh();
  return {
    submitted,
    get listCalls() {
      return listCalls;
    },
    findById: id => descendants(main).find(element => element.id === id),
    findButton: label => descendants(main).find(element =>
      element.tagName === 'button' && element.textContent.includes(label)
    ),
    textValues: () => descendants(main).map(element => element.textContent).filter(Boolean),
    contentChildren: () => [...(descendants(main)
      .find(element => element.className === 'time-off-content')?.children || [])],
    async emitDocument(type, detail = {}) {
      for (const listener of documentListeners[type] || []) listener({ detail });
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    }
  };
}

const julyApproved = {
  ownRequests: [],
  approvedSchedule: [
    { employeeId: 'employee-a', employeeName: 'A', date: '2026-07-12' },
    { employeeId: 'employee-b', employeeName: 'B', date: '2026-07-09' },
    { employeeId: 'employee-a', employeeName: 'A', date: '2026-08-03' }
  ],
  approvedLeaveCoverage: []
};
const pendingFullMonth = {
  ...julyApproved,
  ownRequests: [{
    id: 'request-july',
    requestKind: 'schedule_leave',
    status: 'pending',
    scheduleMonth: '2026-07',
    revision: 1,
    dates: ['2026-07-02', '2026-07-12']
  }]
};

const appendScenario = await createTimeOffScenario(julyApproved, pendingFullMonth);
assert.match(appendScenario.findButton('2026/07/12')?.textContent || '', /已核准/,
  '開啟月份時應預載並標示員工既有的已核准排休');
assert.equal(appendScenario.findButton('2026/07/09'), undefined,
  '不得預載同 Workspace 其他員工的已核准排休');
appendScenario.findById('timeOffScheduleDate').value = '2026-07-02';
await appendScenario.findButton('加入日期').emit('click');
await appendScenario.findButton('送出排休申請').emit('click');
assert.deepEqual(appendScenario.submitted[0]?.dates, ['2026-07-02', '2026-07-12'],
  '新增 7/2 時必須送出包含既有 7/12 的整月完整集合');
assert.ok(appendScenario.findButton('2026/07/02') && appendScenario.findButton('2026/07/12'),
  '送出後重新載入的待審核完整版本必須保留兩個日期');

const approvedBothScenario = await createTimeOffScenario({
  ...julyApproved,
  approvedSchedule: [
    ...julyApproved.approvedSchedule,
    { employeeId: 'employee-a', employeeName: 'A', date: '2026-07-02' }
  ]
});
assert.ok(approvedBothScenario.findButton('2026/07/02')
  && approvedBothScenario.findButton('2026/07/12'),
  '核准完整版本後 7/2 與原有 7/12 必須同時保留');

const removeScenario = await createTimeOffScenario(julyApproved, {
  ...julyApproved,
  ownRequests: [{
    id: 'request-remove-july',
    requestKind: 'schedule_leave',
    status: 'pending',
    scheduleMonth: '2026-07',
    revision: 1,
    dates: ['2026-07-02']
  }]
});
await removeScenario.findButton('2026/07/12').emit('click');
removeScenario.findById('timeOffScheduleDate').value = '2026-07-02';
await removeScenario.findButton('加入日期').emit('click');
await removeScenario.findButton('送出排休申請').emit('click');
assert.deepEqual(removeScenario.submitted[0]?.dates, ['2026-07-02'],
  '只有員工主動移除既有日期時，完整集合才可排除該日期');

const monthScenario = await createTimeOffScenario(julyApproved);
const scheduleMonth = monthScenario.findById('timeOffScheduleMonth');
scheduleMonth.value = '2026-08';
await scheduleMonth.emit('change');
assert.ok(monthScenario.findButton('2026/08/03'),
  '切換月份時應預載該月份既有已核准排休');
assert.equal(monthScenario.findButton('2026/07/12'), undefined,
  '跨月份資料不得殘留在新的月份草稿');

const unchangedForegroundScenario = await createTimeOffScenario(julyApproved, structuredClone(julyApproved));
const unchangedChildren = unchangedForegroundScenario.contentChildren();
await unchangedForegroundScenario.emitDocument('postgres-foreground-synced');
assert.strictEqual(unchangedForegroundScenario.contentChildren()[0], unchangedChildren[0],
  'unchanged foreground data must not rebuild the Time-Off UI');

const changedForegroundScenario = await createTimeOffScenario(julyApproved, pendingFullMonth);
await changedForegroundScenario.findButton('2026/07/12').emit('click');
changedForegroundScenario.findById('timeOffLeaveStart').value = '2026-07-20';
changedForegroundScenario.findById('timeOffLeaveEnd').value = '2026-07-21';
changedForegroundScenario.findById('timeOffLeaveType').value = '病假';
changedForegroundScenario.findById('timeOffLeaveReason').value = '尚未送出的測試草稿';
const changedChildren = changedForegroundScenario.contentChildren();
await changedForegroundScenario.emitDocument('postgres-bootstrap-refreshed', { source: 'foreground', revision: 2 });
assert.notStrictEqual(changedForegroundScenario.contentChildren()[0], changedChildren[0],
  'changed foreground data must refresh the Time-Off UI');
assert.equal(changedForegroundScenario.findButton('2026/07/12'), undefined,
  'foreground refresh must preserve the employee schedule draft');
assert.equal(changedForegroundScenario.findById('timeOffLeaveStart').value, '2026-07-20');
assert.equal(changedForegroundScenario.findById('timeOffLeaveEnd').value, '2026-07-21');
assert.equal(changedForegroundScenario.findById('timeOffLeaveType').value, '病假');
assert.equal(changedForegroundScenario.findById('timeOffLeaveReason').value, '尚未送出的測試草稿',
  'foreground refresh must preserve unsent leave form content');

const historyDateScenario = await createTimeOffScenario({
  ownRequests: [
    {
      id: 'schedule-history',
      requestKind: 'schedule_leave',
      status: 'approved',
      scheduleMonth: '2026-07',
      revision: 1,
      dates: ['2026-07-02', '2026-07-28']
    },
    {
      id: 'leave-history',
      requestKind: 'ad_hoc_leave',
      status: 'approved',
      revision: 1,
      dates: ['2026-07-03', '2026-07-04', '2026-07-05']
    }
  ],
  approvedSchedule: [],
  approvedLeaveCoverage: []
});
assert.ok(historyDateScenario.textValues().includes('2026/07/02、2026/07/28'),
  '排休紀錄必須逐筆顯示實際排休日期，不得把首末日顯示成連續區間');
assert.ok(historyDateScenario.textValues().includes('2026/07/03－2026/07/05（3 天）'),
  '臨時請假仍應沿用開始日到結束日的日期區間顯示');

console.log('Time-Off frontend UI tests passed.');
