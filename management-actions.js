(() => {
  const $ = selector => document.querySelector(selector);
  const stateStore = window.shiftStateStore;
  const security = window.shiftAccountSecurity;
  const pendingForms = new WeakSet();
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
    const existing = next.employees.find(employee => employee.id === requestedId);
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
    if (record.credentialState !== 'active' && record.credentialState !== 'pending' && !record.activationCodeHash) {
      activationCode = security.generateActivationCode();
      record.activationCodeHash = await security.hashSecret(activationCode);
      record.credentialState = 'pending';
    }

    next.employees = next.employees.filter(employee => employee.id !== id);
    next.employees.push(record);
    const postgresOperation = existing
      ? undefined
      : () => {
          if (typeof window.shiftPostgresCloud?.createEmployee !== 'function') {
            throw new Error('PostgreSQL Staging 員工 Command 尚未連線。');
          }
          return window.shiftPostgresCloud.createEmployee(record);
        };
    if (!await persistBossChange(before, next, '員工資料未成功寫入雲端', postgresOperation)) return;
    $('#employeeDialog').close();
    invite(record, activationCode);
    location.reload();
  }));

  $('#addShift').addEventListener('click', event => {
    event.preventDefault();
    const data = read();
    if (!data.employees.length) return alert('請先新增員工。');
    window.fillEmployeeSelect($('#shiftEmployee'));
    $('#shiftDate').value = `${$('#monthPicker').value}-01`;
    $('#shiftDialog').showModal();
  });

  $('#shiftForm').addEventListener('submit', event => submitOnce(event, async form => {
    const next = read();
    const before = structuredClone(next);
    const employeeId = $('#shiftEmployee').value;
    const date = $('#shiftDate').value;
    const start = $('#shiftStart').value;
    const end = $('#shiftEnd').value;
    if (end <= start) {
      alert('結束時間須晚於開始時間。');
      return;
    }
    const clash = next.shifts.some(shift => shift.employeeId === employeeId && shift.date === date && start < shift.end && end > shift.start);
    if (clash && !confirm('這位員工在同一時段已有班次，仍要新增嗎？')) return;
    const leaves = next.leaves?.[`${employeeId}-${date.slice(0, 7)}`] || [];
    if (leaves.includes(date) && !confirm('這天已核准休假，仍要新增班次嗎？')) return;
    const shift = { id: uid(), employeeId, date, start, end, note: $('#shiftNote').value };
    next.shifts.push(shift);
    if (!await persistBossChange(
      before,
      next,
      '班次未成功寫入雲端',
      () => {
        if (typeof window.shiftPostgresCloud?.createShift !== 'function') {
          throw new Error('PostgreSQL Staging 班次 Command 尚未連線。');
        }
        return window.shiftPostgresCloud.createShift(shift);
      }
    )) return;
    $('#shiftDialog').close();
    location.reload();
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
