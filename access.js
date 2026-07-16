(() => {
  const $ = s => document.querySelector(s);
  const stateStore = window.shiftStateStore;
  const dom = window.shiftDomSafety;
  const role = $('#roleSelect');
  const person = $('#employeeModeSelect');
  const wrap = $('#employeeModeWrap');
  let mode = 'boss';
  let mine = localStorage.getItem('shift-person') || '';
  let draftKey = '';
  let leaveDraft = [];
  let leaveSaving = false;
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);
  const currentMonth = () => $('#monthPicker').value;
  const requestKey = () => `${mine}-${currentMonth()}`;
  const normal = list => (list || []).map(item => typeof item === 'string' ? { date: item, type: '休假', reason: '', portion: '全天' } : item);
  const allowedEmployeeMonth = value => {
    const now = new Date();
    const taipei = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
    const thisMonth = taipei.slice(0, 7);
    const year = Number(taipei.slice(0, 4));
    const month = Number(taipei.slice(5, 7));
    const nextY = month === 12 ? year + 1 : year;
    const nextM = month === 12 ? 1 : month + 1;
    const nextMonth = `${nextY}-${String(nextM).padStart(2, '0')}`;
    return value === thisMonth || value === nextMonth;
  };

  function loadDraft() {
    const key = requestKey();
    if (draftKey !== key) {
      draftKey = key;
      leaveDraft = (read().leaves?.[key] || []).map(date => ({ date, type: '休假', createdAt: new Date().toISOString() }));
    }
    return leaveDraft;
  }

  function ensureSavePanel() {
    let panel = $('#employeeLeaveSave');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'employeeLeaveSave';
      panel.className = 'leave-save-panel';
      const hint = dom.element('span', { text: '選好休假日期後，按儲存即可同步到老闆的日曆。' });
      hint.id = 'leaveSaveHint';
      const saveButton = dom.element('button', { className: 'primary', text: '儲存休假', attributes: { type: 'button' } });
      saveButton.id = 'saveLeaveDraft';
      panel.append(hint, saveButton);
      $('#schedule .calendar-box').insertAdjacentElement('afterend', panel);
      $('#saveLeaveDraft').onclick = saveLeaveDraft;
    }
    panel.hidden = mode !== 'employee';
  }

  function updateLeaveDraftView() {
    if (mode !== 'employee' || !mine) return;
    const data = read();
    const key = requestKey();
    const employee = data.employees.find(item => item.id === mine);
    const quota = employee?.leaveQuota ?? 8;
    const employeeName = employee?.name || '';
    const draft = loadDraft();
    const savedDates = new Set(data.leaves?.[key] || []);
    const offDates = new Set(draft.map(item => item.date));
    $('#leaveRemaining').textContent = Math.max(0, quota - draft.length);
    document.querySelectorAll('.calendar-day').forEach(day => {
      const isOff = offDates.has(day.dataset.date);
      const changed = isOff !== savedDates.has(day.dataset.date);
      day.classList.toggle('is-leave', isOff);
      day.classList.toggle('is-request', changed);
      day.replaceChildren(document.createTextNode(String(Number(day.dataset.date.slice(-2)))));
      if (!isOff && employeeName) {
        const name = document.createElement('span');
        name.className = 'employee-day-name';
        name.textContent = employeeName;
        day.append(name);
      }
      day.onclick = null;
    });
    const hint = $('#leaveSaveHint');
    if (hint) hint.textContent = draft.length ? `已選擇 ${draft.length} 天；按儲存後會直接同步到老闆日曆。` : '選好休假日期後，按儲存即可同步到老闆日曆。';
  }

  async function saveLeaveDraft() {
    if (mode !== 'employee' || !mine || leaveSaving) return;
    const button = $('#saveLeaveDraft');
    const dates = loadDraft().map(item => item.date).sort();
    leaveSaving = true;
    if (button) { button.disabled = true; button.textContent = '儲存中…'; }
    try {
      if (!window.LOCAL_PREVIEW) {
        if (!window.sheetsCloud?.hasEmployeeSession()) throw new Error('員工登入狀態已失效，請重新登入。');
        await window.sheetsCloud.saveEmployeeLeave(currentMonth(), dates);
      } else {
        const data = read();
        data.leaves ||= {};
        data.leaves[requestKey()] = dates;
        if (data.leaveRequests) delete data.leaveRequests[requestKey()];
        write(data);
      }
      draftKey = '';
      loadDraft();
      updateLeaveDraftView();
      const hint = $('#leaveSaveHint');
      if (hint) hint.textContent = '已儲存，老闆的休假日曆會同步更新。';
    } catch (error) {
      alert(error.message || '休假儲存失敗，請稍後再試。');
    } finally {
      leaveSaving = false;
      if (button) { button.disabled = false; button.textContent = '儲存休假'; }
    }
  }

  function renderRequests() {
    document.querySelectorAll('.request-panel').forEach(node => node.remove());
  }

  function showBossCalendarNames() {
    if (mode === 'employee') return;
    const data = read();
    const employeeId = $('#calendarEmployee').value;
    const employee = data.employees.find(item => item.id === employeeId);
    const offDates = new Set(data.leaves?.[`${employeeId}-${currentMonth()}`] || []);
    document.querySelectorAll('.calendar-day').forEach(day => {
      const isOff = offDates.has(day.dataset.date);
      day.classList.toggle('is-leave', isOff);
      day.replaceChildren(document.createTextNode(String(Number(day.dataset.date.slice(-2)))));
      if (!isOff && employee?.name) {
        const name = document.createElement('span');
        name.className = 'employee-day-name';
        name.textContent = employee.name;
        day.append(name);
      }
    });
  }

  function apply() {
    const people = [...$('#calendarEmployee').options];
    if (!people.some(option => option.value === mine)) mine = people[0]?.value || '';
    dom.replace(person, ...people.map(option => dom.option(option.value, option.text)));
    person.value = mine;
    role.value = mode;
    role.parentElement.hidden = mode === 'employee';
    wrap.hidden = true;
    $('#employeeLeaveBtn').hidden = true;
    const locked = !allowedEmployeeMonth(currentMonth());
    document.body.classList.toggle('employee-mode', mode === 'employee');
    document.body.classList.toggle('calendar-locked', locked);
    document.body.dataset.employeeId = mode === 'employee' ? mine : '';
    if (mode === 'employee' && mine) {
      const calendar = $('#calendarEmployee');
      calendar.value = mine;
      calendar.dispatchEvent(new Event('change'));
    }
    [...$('#scheduleBody').rows].forEach(row => {
      row.hidden = mode === 'employee' && row.cells[0]?.textContent.trim() !== person.selectedOptions[0]?.text;
    });
    ensureSavePanel();
    renderRequests();
    updateLeaveDraftView();
    showBossCalendarNames();
    document.dispatchEvent(new CustomEvent('employee-view-update'));
  }

  role.onchange = () => { mode = role.value; apply(); };
  person.onchange = () => { mine = person.value; localStorage.setItem('shift-person', mine); draftKey = ''; apply(); };
  $('#monthPicker').addEventListener('change', () => { draftKey = ''; apply(); });
  $('#calendarEmployee').addEventListener('change', showBossCalendarNames);

  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    document.querySelectorAll('[data-tab],.tab-panel').forEach(node => node.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.tab)?.classList.add('active');
  }, true));

  document.addEventListener('click', event => {
    const day = event.target.closest('.calendar-day');
    const locked = !allowedEmployeeMonth(currentMonth());
    const protectedAction = event.target.closest('#addEmployee,#addShift,#addAttendance,.card button,[onclick*="remove"],[onclick*="edit"]');
    if (mode === 'employee' && protectedAction) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (day && mode === 'employee') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (locked || !mine) return;
      const data = read();
      const key = requestKey();
      const draft = loadDraft();
      const index = draft.findIndex(item => item.date === day.dataset.date);
      if (index >= 0) draft.splice(index, 1);
      else {
        const quota = data.employees.find(item => item.id === mine)?.leaveQuota ?? 8;
        const approved = 0;
        if (approved + draft.length >= quota) return alert(`本月休假額度為 ${quota} 天，不能再選擇日期。`);
        draft.push({ date: day.dataset.date, type: '休假', reason: '', portion: '全天', createdAt: new Date().toISOString() });
      }
      updateLeaveDraftView();
      return;
    }
    if (day && locked) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const button = event.target.closest('[data-approve],[data-reject]');
    if (!button) return;
    const [key, date] = (button.dataset.approve || button.dataset.reject).split('|');
    const data = read();
    const list = normal(data.leaveRequests?.[key]);
    const item = list.find(entry => entry.date === date);
    const employeeId = key.slice(0, -8);
    data.leaveRequests[key] = list.filter(entry => entry.date !== date);
    data.leaveHistory ||= [];
    if (button.dataset.approve) {
      data.leaves ||= {};
      data.leaves[key] = [...(data.leaves[key] || []), date].sort();
      data.leaveHistory.push({ ...item, employeeId, status: '已核准', approvedAt: new Date().toISOString() });
    } else {
      data.leaveHistory.push({ ...item, employeeId, status: '已退回', approvedAt: new Date().toISOString() });
    }
    write(data);
    location.reload();
  }, true);

  apply();
})();
