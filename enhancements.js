(() => {
  const $ = selector => document.querySelector(selector);
  const stateStore = window.shiftStateStore;
  const dom = window.shiftDomSafety;
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);
  const money = value => new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(value);
  const ARRAY_FIELDS = ['employees', 'shifts', 'attendance', 'leaveHistory', 'removedEmployees'];
  const OBJECT_FIELDS = ['leaves', 'leaveRequests', 'payrollAdjustments'];

  function businessSnapshot(data) {
    const snapshot = {};
    ARRAY_FIELDS.forEach(field => { snapshot[field] = structuredClone(data[field] || []); });
    OBJECT_FIELDS.forEach(field => { snapshot[field] = structuredClone(data[field] || {}); });
    return snapshot;
  }

  function parseBackup(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid backup root');
    if (!Array.isArray(value.employees) || !Array.isArray(value.shifts)) throw new TypeError('Missing core arrays');
    ARRAY_FIELDS.forEach(field => {
      if (value[field] !== undefined && !Array.isArray(value[field])) throw new TypeError(`Invalid ${field}`);
    });
    OBJECT_FIELDS.forEach(field => {
      if (value[field] !== undefined && (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field]))) {
        throw new TypeError(`Invalid ${field}`);
      }
    });
    return businessSnapshot(value);
  }

  $('#backupBtn').onclick = () => {
    const url = URL.createObjectURL(new Blob(
      [JSON.stringify(businessSnapshot(read()), null, 2)],
      { type: 'application/json' }
    ));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `班表備份-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  $('#restoreBtn').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseBackup(JSON.parse(await file.text()));
      if (!confirm('還原會覆蓋目前班表、員工、出勤與薪資調整資料，確定繼續嗎？')) return;
      const current = read();
      const restored = stateStore.normalize({
        ...current,
        ...imported,
        workspace: current.workspace,
        sync: current.sync,
        access: current.access
      });
      if (!await window.shiftBossData.persist(current, restored, '備份未成功寫入雲端')) return;
      location.reload();
    } catch {
      alert('這不是有效的班表備份檔。');
    } finally {
      event.target.value = '';
    }
  };

  function payroll() {
    const data = read();
    const month = $('#monthPicker').value;
    data.payrollAdjustments ||= {};
    [...$('#payrollBody').rows].forEach((row, index) => {
      const employee = data.employees[index];
      if (!employee) return;
      const hours = data.shifts
        .filter(shift => shift.employeeId === employee.id && shift.date.startsWith(month))
        .reduce((sum, shift) => {
          const [start, end] = [shift.start, shift.end].map(value => value.split(':').map(Number));
          return sum + (end[0] * 60 + end[1] - start[0] * 60 - start[1]) / 60;
        }, 0);
      const adjustments = (data.payrollAdjustments[`${employee.id}-${month}`] || [])
        .reduce((sum, item) => sum + item.amount, 0);
      const content = [dom.element('strong', { text: money(hours * employee.rate + adjustments) })];
      if (adjustments) {
        content.push(
          document.createElement('br'),
          dom.element('small', { text: `含調整 ${adjustments > 0 ? '+' : ''}${money(adjustments)}` })
        );
      }
      dom.replace(row.cells[4], ...content);
    });

    const box = dom.element('section', { className: 'request-panel payroll-tools' });
    const select = dom.element('select');
    const amount = dom.element('input', { attributes: { type: 'number', placeholder: '金額：獎金填正數、扣款填負數' } });
    const note = dom.element('input', { attributes: { placeholder: '原因，例如：全勤獎金' } });
    const button = dom.element('button', { text: '儲存調整', attributes: { type: 'button' } });
    select.id = 'adjustEmployee';
    amount.id = 'adjustAmount';
    note.id = 'adjustNote';
    button.id = 'saveAdjustment';
    dom.replace(select, ...data.employees.map(employee => dom.option(employee.id, employee.name)));
    box.append(dom.element('h3', { text: '薪資加扣項目' }), select, amount, note, button);
    $('#payroll').insertBefore(box, $('#payroll').querySelector('.table-wrap'));
    button.onclick = async () => {
      const value = Number(amount.value);
      if (!value) return alert('請輸入調整金額。');
      button.disabled = true;
      const before = structuredClone(data);
      const next = structuredClone(data);
      const employeeId = select.value;
      const key = `${employeeId}-${month}`;
      next.payrollAdjustments[key] = [
        ...(next.payrollAdjustments[key] || []),
        { amount: value, note: note.value, date: new Date().toISOString() }
      ];
      if (!await window.shiftBossData.persist(before, next, '薪資調整未成功寫入雲端')) {
        button.disabled = false;
        return;
      }
      alert('已儲存薪資調整。');
      location.reload();
    };
  }

  payroll();
})();
