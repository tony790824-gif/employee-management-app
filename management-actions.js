(() => {
  const $ = selector => document.querySelector(selector);
  const stateStore = window.shiftStateStore;
  const security = window.shiftAccountSecurity;
  const pendingForms = new WeakSet();
  let editingShift = null;
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);
  const uid = () => globalThis.crypto?.randomUUID?.() || String(Date.now());

  function setSubmitting(form, value) {
    [...form.querySelectorAll('button.primary')].forEach(button => { button.disabled = value; });
  }

  async function persistBossChange(before, next, failureMessage, postgresOperation) {
    write(next);
    if (window.shiftEnvironment?.dataBackend === 'postgres') {
      if (typeof postgresOperation !== 'function') {
        write(before);
        alert(`${failureMessage}：PostgreSQL Staging 尚未開放這項異動。`);
        return false;
      }
      try {
        await postgresOperation();
        return true;
      } catch (error) {
        write(before);
        alert(`${failureMessage}：${error?.message || '請稍後再試。'}`);
        return false;
      }
    }
    if (!window.sheetsCloud?.saveBossData) return true;
    try {
      await window.sheetsCloud.saveBossData(next);
      return true;
    } catch (error) {
      if (error?.code !== 'REVISION_CONFLICT') {
        write(before);
        alert(`${failureMessage}：${error?.message || '請稍後再試。'}`);
      }
      return false;
    }
  }

  window.shiftBossData = Object.freeze({ persist: persistBossChange });

  async function submitOnce(event, operation) {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const form = event.currentTarget;
    if (pendingForms.has(form)) return;
    pendingForms.add(form);
    setSubmitting(form, true);
    try {
      await operation(form);
    } finally {
      setSubmitting(form, false);
      pendingForms.delete(form);
    }
  }

  function invite(record, activationCode) {
    if (window.shiftEnvironment?.dataBackend === 'postgres') {
      alert(`已新增 ${record.name} 的員工資料。\n\n登入使用 Auth0 帳號；本次不會建立登入帳號或發放 PIN 啟用碼。員工登入前仍須完成帳號與員工資料的連結。`);
      return;
    }
    if (!activationCode) return;
    alert(`已新增 ${record.name}。\n\n一次性啟用碼：${activationCode}\n\n請把這組啟用碼交給員工。員工第一次登入時輸入啟用碼並自行設定 6 位數 PIN；啟用後此碼立即失效。`);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-close-dialog]');
    if (!button) return;
    event.preventDefault();
    button.closest('dialog')?.close();
  });

  $('#addEmployee').addEventListener('click', event => {
    event.preventDefault();
    window.openEmployeeDialog();
  });

  $('#employeeForm').addEventListener('submit', event => submitOnce(event, async form => {
    const next = read();
    const before = structuredClone(next);
    const requestedId = $('#employeeId').value;
    const existing = window.shiftEmployeeAdministration?.find(requestedId)
      || next.employees.find(employee => employee.id === requestedId);
    if (requestedId && !existing && window.shiftEnvironment?.dataBackend === 'postgres') {
      alert('員工資料已更新，請關閉表單並重新取得最新資料。');
      return;
    }
    const id = requestedId || uid();
    const phone = security.cleanPhone($('#employeePhone').value);
    if (!phone) {
      alert('請輸入有效的員工電話號碼。');
      return;
    }
    if (next.employees.some(employee => employee.id !== id && security.cleanPhone(employee.phone) === phone)) {
      alert('這個電話號碼已被其他員工使用。');
      return;
    }

    const record = {
      ...(existing || {}),
      id,
      name: $('#employeeName').value.trim(),
      phone,
      role: $('#employeeRole').value.trim(),
      rate: Number($('#employeeRate').value),
      leaveQuota: Number($('#employeeLeaveQuota').value)
    };
    let activationCode = '';
    if (window.shiftEnvironment?.dataBackend !== 'postgres'
      && record.credentialState !== 'active' && record.credentialState !== 'pending' && !record.activationCodeHash) {
      activationCode = security.generateActivationCode();
      record.activationCodeHash = await security.hashSecret(activationCode);
      record.credentialState = 'pending';
    }

    next.employees = next.employees.filter(employee => employee.id !== id);
    next.employees.push(record);
    const postgresOperation = existing
      ? () => window.shiftPostgresCloud.updateEmployee(record)
      : () => {
          if (typeof window.shiftPostgresCloud?.createEmployee !== 'function') {
            throw new Error('PostgreSQL Staging 員工 Command 尚未連線。');
          }
          return window.shiftPostgresCloud.createEmployee(record);
        };
    if (!await persistBossChange(before, next, '員工資料未成功寫入雲端', postgresOperation)) return;
    $('#employeeDialog').close();
    if (!existing) invite(record, activationCode);
    await window.shiftEmployeeAdministration?.refresh();
  }));

  $('#addShift').addEventListener('click', event => {
    event.preventDefault();
    const data = read();
    if (!data.employees.length) return alert('請先新增員工。');
    editingShift = null;
    window.fillEmployeeSelect($('#shiftEmployee'));
    $('#shiftDate').value = `${$('#monthPicker').value}-01`;
    $('#shiftDialog').showModal();
  });
  window.shiftScheduleEditor = Object.freeze({ open: shift => {
    if (window.shiftEnvironment?.dataBackend === 'postgres' && !['boss','manager'].includes(window.shiftPostgresCloud?.getCurrentUser?.()?.role)) return;
    editingShift = { ...shift };
    window.fillEmployeeSelect($('#shiftEmployee'));
    $('#shiftEmployee').value = shift.employeeId;
    $('#shiftDate').value = shift.date;
    $('#shiftStart').value = shift.start;
    $('#shiftEnd').value = shift.end;
    $('#shiftNote').value = shift.note || '';
    $('#shiftDialog').showModal();
  } });

  $('#shiftForm').addEventListener('submit', event => submitOnce(event, async form => {
    const next = read();
    const before = structuredClone(next);
    const employeeId = $('#shiftEmployee').value;
    const date = $('#shiftDate').value;
    const start = $('#shiftStart').value;
    const end = $('#shiftEnd').value;
    const shift = { ...(editingShift || {}), id: editingShift?.id || uid(), employeeId, date, start, end, note: $('#shiftNote').value };
    try { window.BankeShiftTime.interval(shift); } catch {
      alert('請輸入有效班次時間；起訖不可相同。結束早於開始代表次日下班。');
      return;
    }
    const clash = next.shifts.some(item => item.id !== editingShift?.id && item.employeeId === employeeId && window.BankeShiftTime.overlaps(item,shift));
    if (clash) return alert('這位員工已有重疊班次（含前一天跨日班），請調整時間。');
    const finishDate = window.BankeShiftTime.interval(shift).endDate;
    const dates = [date, ...(finishDate !== date && end !== '00:00' ? [finishDate] : [])];
    if (dates.some(day => (next.leaves?.[`${employeeId}-${day.slice(0,7)}`] || []).includes(day)) && !confirm('班次涵蓋已核准休假日，仍要儲存班次嗎？')) return;
    if (editingShift && !next.shifts.some(item=>item.id===editingShift.id)) return alert('班次已更新，請重新開啟。');
    next.shifts = next.shifts.filter(item=>item.id!==editingShift?.id);
    next.shifts.push(shift);
    if (!await persistBossChange(
      before,
      next,
      '班次未成功寫入雲端',
      () => {
        const operation = editingShift ? 'updateShift' : 'createShift';
        if (typeof window.shiftPostgresCloud?.[operation] !== 'function') {
          throw new Error('PostgreSQL Staging 班次 Command 尚未連線。');
        }
        return window.shiftPostgresCloud[operation](shift);
      }
    )) return;
    $('#shiftDialog').close();
  }));

  $('#addAttendance').addEventListener('click', event => {
    event.preventDefault();
    const data = read();
    if (!data.employees.length) return alert('請先新增員工。');
    window.fillEmployeeSelect($('#attendanceEmployee'));
    $('#attendanceEmployee').disabled = false;
    $('#attendanceDate').value = `${$('#monthPicker').value}-01`;
    $('#attendanceDialog').showModal();
  });

  $('#employeeLeaveBtn').addEventListener('click', event => {
    event.preventDefault();
    if (
      window.shiftEnvironment?.dataBackend === 'postgres'
      && document.body.classList.contains('employee-mode')
    ) {
      document.querySelector('[data-tab="schedule"]')?.click();
      window.requestAnimationFrame(() => {
        document.querySelector('#schedule .calendar-box')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        document.querySelector('.calendar-day')?.focus();
      });
      return;
    }
    const employeeId = $('#employeeModeSelect').value;
    if (!employeeId) return;
    window.fillEmployeeSelect($('#attendanceEmployee'));
    $('#attendanceEmployee').value = employeeId;
    $('#attendanceEmployee').disabled = true;
    $('#attendanceDate').value = `${$('#monthPicker').value}-01`;
    $('#attendanceType').value = '事假';
    $('#attendanceDialog').showModal();
  });

  $('#attendanceForm').addEventListener('submit', event => submitOnce(event, async form => {
    const next = read();
    const before = structuredClone(next);
    next.attendance.push({
      id: uid(),
      employeeId: $('#attendanceEmployee').value,
      date: $('#attendanceDate').value,
      type: $('#attendanceType').value,
      hours: Number($('#attendanceHours').value),
      note: $('#attendanceNote').value
    });
    if (!await persistBossChange(before, next, '出勤資料未成功寫入雲端')) return;
    $('#attendanceEmployee').disabled = false;
    $('#attendanceDialog').close();
    location.reload();
  }));
})();
