(() => {
  const key = 'shift-app-data-v3';
  const stateStore = window.shiftStateStore;
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);
  const month = () => document.querySelector('#monthPicker')?.value || '';
  const label = record => !record.clockIn ? '手動紀錄' : record.clockOut ? '已打卡・已下班' : '已打卡・上班中';

  function saveHours(recordId, value) {
    if (!Number.isFinite(value) || value < 0) return alert('工作時數必須是 0 或正數。');
    const data = read();
    const target = data.attendance.find(item => item.id === recordId);
    if (!target) return;
    target.hours = value;
    target.clockVerified = true;
    write(data);
    document.dispatchEvent(new CustomEvent('boss-hours-updated'));
  }

  function enhanceAttendance() {
    if (document.body.classList.contains('employee-mode')) return;
    const body = document.querySelector('#attendanceBody');
    if (!body) return;
    const records = read().attendance
      .filter(item => item.date?.startsWith(month()))
      .sort((a, b) => b.date.localeCompare(a.date));
    const rows = [...body.querySelectorAll('tr')];
    if (!records.length || rows.length !== records.length) return;

    rows.forEach((row, index) => {
      const record = records[index];
      const typeCell = row.cells[2];
      const hoursCell = row.cells[3];
      const noteCell = row.cells[4];
      if (!typeCell || !hoursCell) return;

      let state = typeCell.querySelector('.attendance-clock-state');
      if (!state) {
        state = document.createElement('small');
        state.className = 'attendance-clock-state';
        typeCell.append(state);
      }
      state.textContent = label(record);
      state.classList.toggle('is-active', Boolean(record.clockIn && !record.clockOut));
      state.classList.toggle('is-complete', Boolean(record.clockOut));

      let input = hoursCell.querySelector('.hours-field');
      if (!input) {
        hoursCell.replaceChildren();
        input = document.createElement('input');
        input.className = 'hours-field';
        input.type = 'number';
        input.min = '0';
        input.step = '0.5';
        input.setAttribute('aria-label', `${record.date} 工作時數`);
        hoursCell.append(input, document.createTextNode(' 小時'));
        input.addEventListener('change', event => {
          saveHours(record.id, Number(event.target.value));
          enhanceAttendance();
        });
      }
      input.value = String(Number(record.hours || 0));
      input.title = '老闆可直接修改工作時數';

      if (noteCell && record.clockIn) {
        const start = new Date(record.clockIn).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const end = record.clockOut ? new Date(record.clockOut).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '進行中';
        noteCell.title = `打卡：${start} ～ ${end}`;
      }
    });
  }

  const observer = new MutationObserver(enhanceAttendance);
  const attendanceBody = document.querySelector('#attendanceBody');
  // render() 只會替換 tbody 的直接子列；只監聽這一層可避開
  // enhanceAttendance() 修改儲存格內容時再次觸發自己。
  if (attendanceBody) observer.observe(attendanceBody, { childList: true });
  document.addEventListener('employee-view-update', enhanceAttendance);
  document.addEventListener('boss-hours-updated', enhanceAttendance);
  window.addEventListener('storage', event => {
    if (event.key === key && !document.body.classList.contains('employee-mode') && document.querySelector('#attendance.active')) location.reload();
  });
  enhanceAttendance();
})();
