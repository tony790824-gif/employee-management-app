(() => {
  'use strict';

  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;

  const dom = window.shiftDomSafety;
  const cloud = window.shiftPostgresCloud;
  const stateStore = window.shiftStateStore;
  const tabs = document.querySelector('.tabs');
  const main = document.querySelector('main');
  if (!dom || !cloud || !stateStore || !tabs || !main) return;

  const STATUS_LABELS = Object.freeze({
    pending: '待審核',
    approved: '已核准',
    rejected: '已拒絕',
    cancelled: '已取消',
    superseded: '已取消'
  });
  const KIND_LABELS = Object.freeze({
    schedule_leave: '排休',
    ad_hoc_leave: '請假'
  });

  let payload = null;
  let loadingPromise = null;
  let actionBusy = false;
  let scheduleDates = new Set();

  const normalizeApprovedLeaveCoverage = value => (Array.isArray(value) ? value : [])
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || ''))
      && Number.isInteger(Number(item?.approvedCount))
      && Number(item.approvedCount) > 0)
    .map(item => ({
      date: String(item.date),
      approvedCount: Number(item.approvedCount)
    }));
  const publishApprovedLeaveCoverage = value => {
    document.dispatchEvent(new CustomEvent('time-off-coverage-refreshed', {
      detail: { approvedLeaveCoverage: normalizeApprovedLeaveCoverage(value) }
    }));
  };

  const currentUser = () => cloud.getCurrentUser?.() || null;
  const currentRole = () => currentUser()?.role || '';
  const scheduleRequestForMonth = month => (payload?.ownRequests || []).find(item =>
    item.requestKind === 'schedule_leave'
      && item.status === 'pending'
      && item.scheduleMonth === month
  );
  const approvedScheduleDatesForMonth = month => {
    const employeeId = currentUser()?.employeeId;
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month || '')) return new Set();
    return new Set((payload?.approvedSchedule || [])
      .filter(item => item?.employeeId === employeeId
        && typeof item?.date === 'string'
        && item.date.startsWith(`${month}-`)
      )
      .map(item => item.date)
    );
  };
  const scheduleDraftForMonth = month => {
    const pending = scheduleRequestForMonth(month);
    const source = pending ? pending.dates : [...approvedScheduleDatesForMonth(month)];
    return new Set((Array.isArray(source) ? source : [])
      .filter(value => typeof value === 'string' && value.startsWith(`${month}-`))
    );
  };
  const canViewReason = request => {
    const user = currentUser();
    if (user?.role === 'boss') return true;
    return user?.role === 'employee'
      && typeof user.employeeId === 'string'
      && Boolean(user.employeeId)
      && request?.employeeId === user.employeeId;
  };
  const currentMonth = () => {
    const value = document.querySelector('#monthPicker')?.value;
    if (/^\d{4}-\d{2}$/.test(value || '')) return value;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })
      .format(new Date())
      .slice(0, 7);
  };
  const dateLabel = value => String(value || '').replaceAll('-', '/');
  const dateRangeLabel = dates => {
    const values = Array.isArray(dates) ? dates : [];
    if (!values.length) return '未提供日期';
    if (values.length === 1) return dateLabel(values[0]);
    return `${dateLabel(values[0])}－${dateLabel(values.at(-1))}（${values.length} 天）`;
  };
  const statusLabel = status => STATUS_LABELS[status] || '狀態未知';
  const kindLabel = kind => KIND_LABELS[kind] || '申請';

  const tab = dom.element('button', {
    text: '排休／請假',
    attributes: { type: 'button', 'aria-controls': 'time-off' }
  });
  tab.id = 'timeOffTab';
  tab.dataset.tab = 'time-off';

  const panel = dom.element('section', {
    className: 'panel tab-panel time-off-panel',
    attributes: { id: 'time-off', 'aria-labelledby': 'timeOffTab' }
  });
  panel.id = 'time-off';
  const title = dom.element('div', { className: 'section-title' }, [
    dom.element('div', {}, [
      dom.element('h2', { text: '排休／請假' }),
      dom.element('p', { text: '申請送出後由管理者審核；未核准前不會成為正式休假。' })
    ])
  ]);
  const status = dom.element('p', {
    className: 'time-off-message',
    attributes: { role: 'status', 'aria-live': 'polite' }
  });
  status.hidden = true;
  const content = dom.element('div', { className: 'time-off-content' });
  panel.append(title, status, content);
  tabs.append(tab);
  main.append(panel);

  function setMessage(message = '', tone = '') {
    status.hidden = !message;
    status.textContent = message;
    status.classList.toggle('is-success', tone === 'success');
    status.classList.toggle('is-error', tone === 'error');
  }

  function activate() {
    document.querySelectorAll('[data-tab],.tab-panel').forEach(node => node.classList.remove('active'));
    tab.classList.add('active');
    panel.classList.add('active');
    void loadRequests();
  }

  tab.addEventListener('click', event => {
    event.preventDefault();
    activate();
  });
  document.querySelector('#employeeLeaveBtn')?.addEventListener('click', event => {
    event.preventDefault();
    activate();
  });

  function actionButton(label, className, handler) {
    const button = dom.element('button', {
      className,
      text: label,
      attributes: { type: 'button' }
    });
    button.addEventListener('click', handler);
    return button;
  }

  function requestCard(request, { review = false } = {}) {
    const card = dom.element('article', { className: 'time-off-request-card' });
    const heading = dom.element('div', { className: 'time-off-card-heading' }, [
      dom.element('div', {}, [
        dom.element('strong', { text: review ? request.employeeName || '未命名員工' : kindLabel(request.requestKind) }),
        dom.element('span', { className: `time-off-kind kind-${request.requestKind}`, text: kindLabel(request.requestKind) })
      ]),
      dom.element('span', { className: `time-off-status status-${request.status}`, text: statusLabel(request.status) })
    ]);
    const details = dom.element('dl', { className: 'time-off-details' });
    const pairs = [
      ['日期', dateRangeLabel(request.dates)],
      ...(request.scheduleMonth ? [['月份', request.scheduleMonth]] : []),
      ...(request.leaveType ? [['類型', request.leaveType]] : []),
      ...(request.reason && canViewReason(request) ? [['原因', request.reason]] : []),
      ...(request.reviewNote ? [['審核備註', request.reviewNote]] : [])
    ];
    for (const [term, description] of pairs) {
      details.append(dom.element('dt', { text: term }), dom.element('dd', { text: description }));
    }
    card.append(heading, details);

    if (request.status === 'pending') {
      const actions = dom.element('div', { className: 'time-off-card-actions' });
      if (review) {
        const note = dom.element('textarea', {
          attributes: { rows: '2', maxlength: '1000', placeholder: '審核備註（選填）', 'aria-label': '審核備註' }
        });
        actions.append(
          note,
          actionButton('拒絕', 'danger', () => reviewRequest(request, false, note.value)),
          actionButton('核准', 'primary', () => reviewRequest(request, true, note.value))
        );
      } else {
        actions.append(actionButton('取消申請', 'ghost', () => cancelRequest(request)));
      }
      card.append(actions);
    }
    return card;
  }

  function empty(message) {
    return dom.element('p', { className: 'time-off-empty', text: message });
  }

  function renderScheduleForm(container) {
    const month = dom.element('input', {
      value: currentMonth(),
      attributes: { type: 'month', id: 'timeOffScheduleMonth', 'aria-label': '排休月份' }
    });
    const date = dom.element('input', {
      attributes: { type: 'date', id: 'timeOffScheduleDate', 'aria-label': '排休日期' }
    });
    const selected = dom.element('div', { className: 'time-off-date-chips' });
    const hint = dom.element('p', { className: 'form-hint', text: '排休占用每月固定額度，核准後才成為正式排休。' });

    const renderDates = () => {
      const approvedDates = approvedScheduleDatesForMonth(month.value);
      selected.replaceChildren();
      for (const value of [...scheduleDates].sort()) {
        const sourceLabel = approvedDates.has(value) ? '（已核准）' : '（新增）';
        const chip = actionButton(`${dateLabel(value)} ${sourceLabel} ×`, 'date-chip', () => {
          scheduleDates.delete(value);
          renderDates();
        });
        chip.setAttribute('aria-label', `移除 ${dateLabel(value)}`);
        selected.append(chip);
      }
      if (!scheduleDates.size) selected.append(empty('尚未選擇日期'));
    };
    month.addEventListener('change', () => {
      scheduleDates = scheduleDraftForMonth(month.value);
      date.value = '';
      renderDates();
    });
    const addDate = actionButton('加入日期', 'ghost', () => {
      if (!date.value || !date.value.startsWith(`${month.value}-`)) {
        setMessage('請選擇同一月份內的有效日期。', 'error');
        return;
      }
      scheduleDates.add(date.value);
      setMessage('');
      renderDates();
    });
    const submit = actionButton('送出排休申請', 'primary', async () => {
      if (!scheduleDates.size) {
        setMessage('請至少選擇一個排休日期。', 'error');
        return;
      }
      const existing = scheduleRequestForMonth(month.value);
      await performAction(async () => {
        const input = { month: month.value, dates: [...scheduleDates].sort() };
        if (existing) Object.assign(input, { requestId: existing.id, baseRevision: existing.revision });
        await cloud.submitScheduleLeaveRequest(input);
      }, '排休申請已送出，請等待管理者審核。');
    });
    const form = dom.element('section', { className: 'time-off-form-card' }, [
      dom.element('h3', { text: '我的排休' }),
      hint,
      dom.element('div', { className: 'time-off-form-grid' }, [
        dom.element('label', {}, [dom.element('span', { text: '月份' }), month]),
        dom.element('label', {}, [dom.element('span', { text: '日期' }), date]),
        addDate
      ]),
      selected,
      submit
    ]);
    container.append(form);
    scheduleDates = scheduleDraftForMonth(month.value);
    renderDates();
  }

  function renderLeaveForm(container) {
    const start = dom.element('input', { attributes: { type: 'date', 'aria-label': '請假開始日期' } });
    const end = dom.element('input', { attributes: { type: 'date', 'aria-label': '請假結束日期' } });
    const type = dom.element('select', { attributes: { 'aria-label': '請假類型' } }, [
      dom.option('事假', '事假'),
      dom.option('病假', '病假'),
      dom.option('家庭照顧假', '家庭照顧假'),
      dom.option('其他', '其他')
    ]);
    const reason = dom.element('textarea', {
      attributes: { rows: '3', maxlength: '2000', placeholder: '請填寫原因', 'aria-label': '請假原因' }
    });
    const submit = actionButton('送出請假申請', 'secondary', async () => {
      if (!start.value || !end.value || end.value < start.value || !reason.value.trim()) {
        setMessage('請填寫有效的日期區間與請假原因。', 'error');
        return;
      }
      await performAction(() => cloud.submitLeaveRequest({
        startDate: start.value,
        endDate: end.value,
        leaveType: type.value,
        reason: reason.value.trim()
      }), '請假申請已送出，請等待管理者審核。');
    });
    container.append(dom.element('section', { className: 'time-off-form-card' }, [
      dom.element('h3', { text: '我要請假' }),
      dom.element('p', { className: 'form-hint', text: '臨時請假不占每月固定排休額度，原因僅本人與管理者可見。' }),
      dom.element('div', { className: 'time-off-form-grid' }, [
        dom.element('label', {}, [dom.element('span', { text: '開始日期' }), start]),
        dom.element('label', {}, [dom.element('span', { text: '結束日期' }), end]),
        dom.element('label', {}, [dom.element('span', { text: '請假類型' }), type])
      ]),
      dom.element('label', { className: 'time-off-reason' }, [
        dom.element('span', { text: '原因' }),
        reason
      ]),
      submit
    ]));
  }

  function renderEmployee() {
    const forms = dom.element('div', { className: 'time-off-forms' });
    renderScheduleForm(forms);
    renderLeaveForm(forms);
    const history = dom.element('section', { className: 'time-off-list-section' }, [
      dom.element('h3', { text: '我的申請紀錄' })
    ]);
    const requests = Array.isArray(payload?.ownRequests) ? payload.ownRequests : [];
    history.append(...(requests.length ? requests.map(item => requestCard(item)) : [empty('目前沒有申請紀錄')]));
    content.replaceChildren(forms, history);
  }

  function renderBoss() {
    const pending = dom.element('section', { className: 'time-off-list-section' }, [
      dom.element('h3', { text: '待審核清單' })
    ]);
    const pendingItems = Array.isArray(payload?.pendingReview) ? payload.pendingReview : [];
    pending.append(...(pendingItems.length
      ? pendingItems.map(item => requestCard(item, { review: true }))
      : [empty('目前沒有待審核申請')]));

    const processed = dom.element('section', { className: 'time-off-list-section' }, [
      dom.element('h3', { text: '已完成紀錄' })
    ]);
    const processedItems = Array.isArray(payload?.processed) ? payload.processed : [];
    processed.append(...(processedItems.length
      ? processedItems.map(item => requestCard(item, { review: true }))
      : [empty('目前沒有已完成紀錄')]));
    content.replaceChildren(pending, processed);
  }

  function render() {
    const role = currentRole();
    tab.hidden = !['boss', 'employee'].includes(role);
    if (role === 'employee') renderEmployee();
    else if (role === 'boss') renderBoss();
    else content.replaceChildren(empty('目前角色無法使用排休／請假功能'));
  }

  async function loadRequests() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      setMessage('正在載入申請資料…');
      try {
        payload = await cloud.listTimeOffRequests();
        publishApprovedLeaveCoverage(payload?.approvedLeaveCoverage);
        setMessage('');
        render();
      } catch (error) {
        console.warn('Time-off list failed', {
          code: error?.code || 'TIME_OFF_LIST_FAILED',
          status: Number(error?.status || 0),
          requestId: error?.requestId || ''
        });
        setMessage('排休／請假資料載入失敗，請稍後重試。', 'error');
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  async function performAction(action, successMessage) {
    if (actionBusy) return;
    actionBusy = true;
    panel.classList.add('is-busy');
    setMessage('處理中…');
    try {
      await action();
      payload = await cloud.listTimeOffRequests();
      publishApprovedLeaveCoverage(payload?.approvedLeaveCoverage);
      scheduleDates = new Set();
      render();
      setMessage(successMessage, 'success');
    } catch (error) {
      console.warn('Time-off action failed', {
        code: error?.code || 'TIME_OFF_ACTION_FAILED',
        status: Number(error?.status || 0),
        requestId: error?.requestId || ''
      });
      setMessage('操作失敗，原申請內容未變更，請確認後再試。', 'error');
    } finally {
      actionBusy = false;
      panel.classList.remove('is-busy');
    }
  }

  async function cancelRequest(request) {
    if (!window.confirm(`確定取消這筆${kindLabel(request.requestKind)}申請？`)) return;
    const action = request.requestKind === 'schedule_leave'
      ? () => cloud.cancelScheduleLeaveRequest(request.id, request.revision)
      : () => cloud.cancelLeaveRequest(request.id, request.revision);
    await performAction(action, '申請已取消。');
  }

  async function reviewRequest(request, approve, reviewNote) {
    const verb = approve ? '核准' : '拒絕';
    if (!window.confirm(`確定${verb}${request.employeeName || '此員工'}的${kindLabel(request.requestKind)}申請？`)) return;
    const action = approve
      ? () => cloud.approveTimeOffRequest(request.id, request.revision, reviewNote.trim())
      : () => cloud.rejectTimeOffRequest(request.id, request.revision, reviewNote.trim());
    await performAction(action, `申請已${verb}。`);
  }

  document.addEventListener('postgres-bootstrap-refreshed', () => {
    if (actionBusy) return;
    payload = null;
    tab.hidden = !['boss', 'employee'].includes(currentRole());
    if (!tab.hidden) void loadRequests();
  });
  document.addEventListener('postgres-session-cleared', () => {
    payload = null;
    publishApprovedLeaveCoverage([]);
    scheduleDates = new Set();
    tab.hidden = true;
    content.replaceChildren();
    setMessage('');
  });

  tab.hidden = !['boss', 'employee'].includes(currentRole());
  if (!tab.hidden) void loadRequests();
  window.shiftTimeOffUi = Object.freeze({ activate, refresh: loadRequests });
})();
