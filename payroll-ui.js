(() => {
  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;
  const $ = selector => document.querySelector(selector);
  const dom = window.shiftDomSafety;
  const cloud = window.shiftPostgresCloud;
  const body = $('#payrollBody');
  const panel = $('#payroll');
  const exportButton = $('#exportBtn');
  const headings = ['員工', '月份', '底薪／出勤薪資', '加項', '扣項', '月佣金', '應付薪資', '管理'];
  const money = value => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
  const manager = () => ['boss', 'manager'].includes(cloud.getCurrentUser?.()?.role);
  let rows = [], generation = 0, busy = false, loadedMonth = '';
  const errors = { PAYROLL_UNAVAILABLE: '薪資資料庫更新尚未套用；不顯示未驗證的薪資。',
    REVISION_CONFLICT: '資料已被更新，請重新開啟表單後再修改。', PAYROLL_ITEM_VOIDED: '這筆項目已作廢，請新增正確項目。' };
  panel.querySelector('h2').textContent = '每月應付薪資';
  panel.querySelector('.panel-head p').textContent = '時薪制依實際出勤時數計算（整元四捨五入）；固定底薪不另加時薪。加項＋佣金－扣項。';
  dom.replace(panel.querySelector('thead tr'), ...headings.map(text => dom.element('th', { text })));
  const details = dom.element('section', { className: 'payroll-details' });
  panel.append(details);
  const button = (text, handler) => {
    const node = dom.element('button', { text, attributes: { type: 'button' } });
    node.disabled = busy;
    node.addEventListener('click', handler);
    return node;
  };
  const field = (form, label, value, attributes = {}) => {
    const input = dom.element('input', { value, attributes });
    form.append(dom.element('label', { text: label }, [input]));
    return input;
  };
  async function mutate(operation, dialog) {
    if (busy || !manager()) return;
    busy = true;
    dialog?.querySelectorAll('button').forEach(item => { item.disabled = true; });
    try {
      await operation();
      dialog?.close(); dialog?.remove();
    } catch (error) { alert(errors[error?.code] || '薪資未能儲存；請檢查欄位與連線。'); }
    finally {
      busy = false;
      dialog?.querySelectorAll('button').forEach(item => { item.disabled = false; });
      await refresh();
    }
  }
  function openEditor(row, item, monthly = false) {
    if (!manager() || busy) return;
    const dialog = dom.element('dialog');
    const form = dom.element('form');
    dialog.append(form);
    form.append(dom.element('h3', { text: `${row.name} · ${row.month} · ${monthly ? '底薪與月佣金' : item ? '修改加扣項' : '新增加扣項'}` }));
    const select = dom.element('select');
    (monthly ? [['hourly','依實際出勤時薪'],['fixed','本月固定底薪']] : [['addition','加項'],['deduction','扣項']])
      .forEach(([value,label]) => select.append(dom.option(value,label)));
    select.value = monthly ? row.baseMode : item?.kind || 'addition';
    form.append(dom.element('label', { text: monthly ? '薪資方式' : '類型' }, [select]));
    const title = monthly ? null : field(form, '項目名稱', item?.name || '', { required: '', maxlength: 120 });
    const amount = field(form, monthly ? '固定底薪（元）' : '金額（正整數元）', monthly ? row.baseSalary : item?.amount || '',
      { type: 'number', required: '', min: monthly ? 0 : 1, max: 999999999, step: 1 });
    const commission = monthly ? field(form, '本月佣金（元）', row.commission, { type: 'number', required: '', min: 0, max: 999999999, step: 1 }) : null;
    const note = field(form, '備註', monthly ? row.note : item?.note || '', { maxlength: 1000 });
    const syncMode = () => { if (monthly) { amount.disabled = select.value === 'hourly'; if (amount.disabled) amount.value = '0'; } };
    select.addEventListener('change', syncMode); syncMode();
    const save = dom.element('button', { text: '儲存', className: 'primary', attributes: { type: 'submit' } });
    form.append(dom.element('menu', {}, [button('取消', () => { dialog.close(); dialog.remove(); }), save]));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const common = { employeeId: row.employeeId, month: row.month, baseRevision: monthly ? row.revision : item?.revision || 0 };
      const input = monthly ? { ...common, baseMode: select.value, baseSalary: Number(amount.value), commission: Number(commission.value), note: note.value }
        : { ...common, id: item?.id || crypto.randomUUID(), kind: select.value, name: title.value, amount: Number(amount.value), note: note.value };
      void mutate(() => monthly ? cloud.saveMonthlyPayroll(input) : cloud.savePayrollAdjustment(input), dialog);
    });
    document.body.append(dialog); dialog.showModal();
  }
  function render() {
    dom.replace(body, ...rows.map(row => {
      const actions = dom.element('td');
      if (manager()) actions.append(button('底薪／佣金', () => openEditor(row,null,true)), button('新增加扣項', () => openEditor(row)));
      return dom.element('tr', {}, [dom.cell(row.name), dom.cell(row.month), dom.cell(money(row.basePay)),
        dom.cell(money(row.additions)), dom.cell(money(row.deductions)), dom.cell(money(row.commission)), dom.cell(money(row.payable)), actions]);
    }));
    if (!rows.length) body.append(dom.emptyRow(8,'本月無薪資資料'));
    dom.replace(details, ...rows.map(row => {
      const box = dom.element('details', {}, [dom.element('summary', { text: `${row.name}：${row.baseMode === 'fixed' ? '固定底薪' : `時薪 ${money(row.hourlyRate)} × ${row.hours} 小時`} · 加扣項明細` })]);
      if (row.note) box.append(dom.element('p', { text: `本月備註：${row.note}` }));
      row.adjustments.forEach(item => {
        const line = dom.element('div', { className: 'payroll-item' }, [dom.element('p', { text: `${item.status === 'voided' ? '【已作廢】' : ''}${item.kind === 'deduction' ? '扣項' : '加項'} ${item.name}：${money(item.amount)} ${item.note}` })]);
        if (manager() && item.status !== 'voided') line.append(button('修改', () => openEditor(row,item)), button('作廢', () => {
          if (confirm(`作廢 ${row.name} ${row.month}「${item.name}」？原紀錄會保留，不再計入薪資。`))
            void mutate(() => cloud.voidPayrollAdjustment({ employeeId: row.employeeId, month: row.month, id: item.id, baseRevision: item.revision }));
        }));
        box.append(line);
      });
      return box;
    }));
  }
  async function refresh() {
    if (busy) return;
    const current = ++generation;
    const month = $('#monthPicker').value;
    rows = []; loadedMonth = ''; exportButton.disabled = true; details.replaceChildren();
    dom.replace(body, dom.emptyRow(8,'正在取得薪資…'));
    if (!cloud.getCurrentUser?.()) { body.replaceChildren(); return; }
    try {
      const result = await cloud.payroll(month);
      if (generation !== current || !cloud.getCurrentUser?.()) return;
      if (result?.ok !== true || result.month !== month || !Array.isArray(result.data)) throw new Error('INVALID_RESPONSE');
      rows = result.data; loadedMonth = month; render(); exportButton.disabled = false;
    } catch (error) {
      if (generation !== current) return;
      dom.replace(body, dom.emptyRow(8,errors[error?.code] || '無法取得薪資，請確認線上登入及連線。'));
    }
  }
  exportButton.onclick = () => {
    if (!loadedMonth || exportButton.disabled) return;
    const quote = value => `"${String(value).replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
    const data = [headings.slice(0,7), ...rows.map(row => [row.name,row.month,row.basePay,row.additions,row.deductions,row.commission,row.payable])];
    const url = URL.createObjectURL(new Blob(['\ufeff'+data.map(row=>row.map(quote).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}));
    const link = dom.element('a', { attributes: { href:url, download:`應付薪資-${loadedMonth}.csv` } }); link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  };
  document.addEventListener('postgres-session-cleared', () => { generation++; rows=[]; loadedMonth=''; body.replaceChildren(); details.replaceChildren(); exportButton.disabled=true; });
  document.querySelector('[data-tab="payroll"]')?.addEventListener('click',()=>void refresh());
  document.addEventListener('boss-hours-updated',()=>void refresh());
  document.addEventListener('postgres-bootstrap-refreshed',()=>void refresh());
  window.shiftPayroll = Object.freeze({ refresh });
  void refresh();
})();
