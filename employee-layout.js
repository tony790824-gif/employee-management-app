(() => {
  const $ = selector => document.querySelector(selector);
  const dom = window.shiftDomSafety;
  const tabs = $('.tabs');
  const schedule = $('#schedule');
  if (!tabs || !schedule) return;

  const tab = document.createElement('button');
  tab.id = 'employeeWorkTab';
  tab.dataset.tab = 'employee-work';
  tab.textContent = '我的出勤／收入';
  tab.hidden = true;
  tabs.insertBefore(tab, tabs.querySelector('[data-tab="attendance"]'));

  const panel = document.createElement('section');
  panel.id = 'employee-work';
  panel.className = 'panel tab-panel employee-secondary-panel';
  panel.hidden = true;
  const heading = dom.element('div', { className: 'panel-head' }, [dom.element('div', {}, [dom.element('h2', { text: '我的出勤與收入' }), dom.element('p', { text: '打卡與查看本月目前工作收入。' })])]);
  const content = dom.element('div');
  content.id = 'employeeSecondaryContent';
  panel.append(heading, content);
  schedule.insertAdjacentElement('afterend', panel);
  const secondary = $('#employeeSecondaryContent');
  let tableAnchor;
  let workAnchor;
  let leaveAnchor;
  let wasEmployee = false;

  function activate(id) {
    document.querySelectorAll('[data-tab],.tab-panel').forEach(node => node.classList.remove('active'));
    document.querySelector(`[data-tab="${id}"]`)?.classList.add('active');
    document.getElementById(id)?.classList.add('active');
  }

  function moveToSecondary() {
    const table = schedule.querySelector('.table-wrap');
    if (table) {
      tableAnchor ||= document.createComment('schedule-table-anchor');
      if (!tableAnchor.parentNode) table.before(tableAnchor);
      secondary.append(table);
    }
    const work = $('#employeeWorkPanel');
    if (work) {
      workAnchor ||= document.createComment('employee-work-anchor');
      if (!workAnchor.parentNode) work.before(workAnchor);
      secondary.prepend(work);
    }
    const leave = $('#employeeLeaveSave');
    if (leave) {
      leaveAnchor ||= document.createComment('employee-leave-anchor');
      if (!leaveAnchor.parentNode) leave.before(leaveAnchor);
      secondary.append(leave);
    }
  }

  function restoreSchedule() {
    const table = secondary.querySelector('.table-wrap');
    if (table && tableAnchor?.parentNode) tableAnchor.after(table);
    const work = secondary.querySelector('#employeeWorkPanel');
    if (work && workAnchor?.parentNode) workAnchor.after(work);
    const leave = secondary.querySelector('#employeeLeaveSave');
    if (leave && leaveAnchor?.parentNode) leaveAnchor.after(leave);
  }

  function update() {
    const employeeMode = document.body.classList.contains('employee-mode');
    tab.hidden = !employeeMode;
    panel.hidden = !employeeMode;
    if (employeeMode) {
      moveToSecondary();
      if (!wasEmployee) activate('schedule');
    } else {
      restoreSchedule();
      if (panel.classList.contains('active')) activate('schedule');
    }
    wasEmployee = employeeMode;
  }

  tab.addEventListener('click', event => { event.preventDefault(); activate('employee-work'); });
  const observer = new MutationObserver(update);
  // update() 會搬移面板節點；若監聽 childList/subtree，搬移本身會再次觸發
  // observer，造成員工介面永遠無法穩定。身份切換只需要監聽 body class。
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('employee-view-update', update);
  update();
})();
