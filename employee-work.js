(() => {
  const stateStore = window.shiftStateStore;
  const dom = window.shiftDomSafety;
  const $ = s => document.querySelector(s);
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);
  const money = amount => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount);
  const today = () => new Date().toLocaleDateString('en-CA');
  const month = () => $('#monthPicker').value;
  const currentId = () => document.body.dataset.employeeId || '';
  const roundedHours = iso => Math.max(0.5, Math.round(((Date.now() - new Date(iso).getTime()) / 3600000) * 2) / 2);
  const requireCloudSession = () => {
    if (window.LOCAL_PREVIEW) return false;
    if (!window.sheetsCloud?.hasEmployeeSession()) throw new Error('員工登入狀態已失效，請重新登入。');
    return true;
  };
  let clockBusy = false;

  const panel = document.createElement('section');
  panel.id = 'employeeWorkPanel';
  panel.className = 'employee-work-panel';
  panel.hidden = true;
  const clockStatus = dom.element('p', { text: '尚未打卡' }); clockStatus.id = 'clockStatus';
  const earnings = dom.element('strong', { text: '$0' }); earnings.id = 'employeeEarnings';
  const clockIn = dom.element('button', { className: 'primary', text: '打卡上班', attributes: { type: 'button' } }); clockIn.id = 'clockInBtn';
  const clockOut = dom.element('button', { className: 'ghost', text: '打卡下班', attributes: { type: 'button' } }); clockOut.id = 'clockOutBtn';
  panel.append(
    dom.element('div', {}, [dom.element('p', { className: 'eyebrow', text: '我的出勤' }), dom.element('h3', { text: '今日打卡與本月收入' }), clockStatus]),
    dom.element('div', { className: 'work-actions' }, [earnings, dom.element('small', { text: '本月目前工作收入' }), dom.element('div', {}, [clockIn, clockOut])])
  );
  $('#schedule .calendar-box').insertAdjacentElement('afterend', panel);

  function activeRecord(data, employeeId) {
    return (data.attendance || []).find(item => item.employeeId === employeeId && item.date === today() && item.type === '出勤' && item.clockIn && !item.clockOut);
  }

  function render() {
    const employeeId = currentId();
    const visible = document.body.classList.contains('employee-mode') && Boolean(employeeId);
    panel.hidden = !visible;
    if (!visible) return;
    const data = read();
    const employee = (data.employees || []).find(item => item.id === employeeId);
    const active = activeRecord(data, employeeId);
    const completed = (data.attendance || []).filter(item => item.employeeId === employeeId && item.type === '出勤' && item.date?.startsWith(month())).reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const ongoing = active && active.date.startsWith(month()) ? roundedHours(active.clockIn) : 0;
    $('#employeeEarnings').textContent = money((completed + ongoing) * Number(employee?.rate || 0));
    $('#clockStatus').textContent = active ? `已於 ${new Date(active.clockIn).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 上班；下班後由老闆確認時數。` : '尚未打卡；完成工作後請按「打卡下班」。';
    $('#clockInBtn').hidden = Boolean(active);
    $('#clockOutBtn').hidden = !active;
    $('#clockInBtn').disabled = clockBusy;
    $('#clockOutBtn').disabled = clockBusy;
  }

  $('#clockInBtn').onclick = async () => {
    const employeeId = currentId();
    if (!employeeId || clockBusy) return;
    clockBusy = true;
    render();
    try {
      if (requireCloudSession()) await window.sheetsCloud.clockInEmployee();
      else {
        const data = read();
        if (activeRecord(data, employeeId)) return;
        data.attendance ||= [];
        data.attendance.push({ id: crypto.randomUUID(), employeeId, date: today(), type: '出勤', hours: 0, clockIn: new Date().toISOString(), note: '員工已打卡上班' });
        write(data);
      }
    } catch (error) {
      alert(error.message || '上班打卡失敗，請稍後再試。');
    } finally {
      clockBusy = false;
      render();
    }
  };

  $('#clockOutBtn').onclick = async () => {
    const employeeId = currentId();
    if (!employeeId || clockBusy) return;
    clockBusy = true;
    render();
    try {
      if (requireCloudSession()) await window.sheetsCloud.clockOutEmployee();
      else {
        const data = read();
        const record = activeRecord(data, employeeId);
        if (!record) return;
        record.clockOut = new Date().toISOString();
        record.hours = roundedHours(record.clockIn);
        record.note = '員工已完成打卡；老闆可在出勤／請假調整時數。';
        write(data);
      }
      alert('已打卡下班，老闆可再確認或修改工作時數。');
    } catch (error) {
      alert(error.message || '下班打卡失敗，請稍後再試。');
    } finally {
      clockBusy = false;
      render();
    }
  };

  document.addEventListener('employee-view-update', render);
  setInterval(render, 60000);
  render();
})();
