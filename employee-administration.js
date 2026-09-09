(() => {
  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;
  const dom = window.shiftDomSafety;
  const cloud = window.shiftPostgresCloud;
  const cards = document.querySelector('#employeeCards');
  const archived = document.querySelector('#removedEmployees');
  const accountLabels = { READY: '已連結可登入帳號', UNLINKED: '尚未連結登入帳號',
    DISABLED: '登入已停用', IDENTITY_MISSING: '登入身分尚未完成', PRIVILEGED: '主管帳號：需由帳號管理處理' };
  const statusLabels = { active: '在職', inactive: '停用', departed: '離職' };
  const messages = { REVISION_CONFLICT: '資料已被更新，請確認最新內容後再操作。',
    EMPLOYEE_ACCOUNT_NOT_ELIGIBLE: '帳號不可連結，請確認同店成員資格及目前連結。',
    EMPLOYEE_ATTENDANCE_OPEN: '員工尚未下班，請先完成下班打卡。',
    EMPLOYEE_PRIVILEGED_ACCOUNT: '此員工連結主管帳號，不能從員工管理修改其權限。',
    EMPLOYEE_ADMIN_UNAVAILABLE: '員工管理資料庫更新尚未套用；目前不能編輯、停用或連結帳號。' };
  let staff = [];
  let accounts = [];
  let generation = 0;
  let busy = false;
  let available = false;
  let editing = null;
  const isManager = () => ['boss', 'manager'].includes(cloud.getCurrentUser?.()?.role);
  const button = (label, action, disabled = false) => {
    const item = dom.element('button', { text: label, attributes: { type: 'button' } });
    item.disabled = disabled || busy || !available;
    item.addEventListener('click', action);
    return item;
  };
  async function mutate(action) {
    if (busy || !isManager()) return;
    busy = true;
    render();
    try { await action(); }
    catch (error) { alert(messages[error?.code] || '操作未完成，請確認連線後再試。'); }
    finally { busy = false; await refresh(); }
  }
  function render() {
    if (!isManager()) { cards.replaceChildren(); return; }
    archived.hidden = true;
    archived.replaceChildren();
    dom.replace(cards, ...staff.map(employee => {
      const privileged = employee.accountStatus === 'PRIVILEGED';
      const card = dom.element('article', { className: 'card' }, [
        dom.element('h3', { text: employee.name }),
        dom.element('p', { text: `狀態：${statusLabels[employee.status] || '未知'}` }),
        dom.element('p', { text: `電話：${employee.phone}` }),
        dom.element('p', { text: `登入：${accountLabels[employee.accountStatus] || '未確認'}` }),
        ...(employee.accountPhone ? [dom.element('p', { text: `連結帳號：${employee.accountPhone}` })] : [])
      ]);
      card.append(button('編輯資料', () => {
        editing = { ...employee };
        window.openEmployeeDialog(editing);
      }, privileged));
      for (const [status, label] of Object.entries(statusLabels)) {
        if (status === employee.status) continue;
        card.append(button(status === 'active' ? '恢復在職（不自動恢復登入）' : label, () => {
          if (!confirm(`${employee.name}：確定改為${label}？歷史班表、出勤與薪資不會刪除。`)) return;
          void mutate(() => cloud.setEmployeeStatus(employee.id, status, employee.revision));
        }, privileged));
      }
      if (employee.status === 'active' && !employee.accountUserId) {
        const select = dom.element('select', { attributes: { 'aria-label': `${employee.name} 的登入帳號` } });
        select.append(dom.option('', '選擇同店已核准的登入帳號'));
        accounts.forEach(account => select.append(dom.option(account.userId, `${account.displayName}（${account.phone}）`)));
        card.append(select, button('連結登入帳號', () => {
          if (!select.value) return alert('請選擇登入帳號。');
          const account = accounts.find(item => item.userId === select.value);
          if (!account || !confirm(`確認將 ${account.displayName}（${account.phone}）連結給 ${employee.name}？`)) return;
          void mutate(() => cloud.linkEmployeeAccount(employee.id, account.userId, employee.revision));
        }, accounts.length === 0));
        if (!accounts.length) card.append(dom.element('p', { text: '沒有可連結帳號。須先由管理者登記同店 Auth0 員工身分；不會依電話自動認領帳號。' }));
      } else if (employee.status === 'active' && employee.canResumeAccount && !privileged) {
        card.append(button('恢復原帳號登入', () => {
          if (confirm(`確定恢復 ${employee.name} 的原帳號登入權限？`)) {
            void mutate(() => cloud.linkEmployeeAccount(employee.id, employee.accountUserId, employee.revision));
          }
        }));
      }
      return card;
    }));
    if (!staff.length) cards.append(dom.element('p', { text: '尚無員工資料，請先新增員工。' }));
  }
  async function refresh() {
    if (busy) { render(); return; }
    const current = ++generation;
    staff = []; accounts = []; available = false;
    if (!isManager()) { cards.replaceChildren(); return; }
    archived.hidden = true;
    dom.replace(cards, dom.element('p', { text: '正在取得員工及登入狀態…' }));
    try {
      const result = await cloud.employeeAdministration();
      if (current !== generation || !isManager()) return;
      if (result?.ok !== true || !Array.isArray(result.data) || !Array.isArray(result.accounts)) throw new Error('INVALID_RESPONSE');
      staff = result.data; accounts = result.accounts; available = true;
      render();
    } catch (error) {
      if (current !== generation || !isManager()) return;
      const warning = dom.element('p', { text: messages[error?.code] || '無法取得員工登入狀態，請確認連線。', attributes: { role: 'status' } });
      // Older databases remain usable for viewing; never imply unverified account state or enable writes.
      const existing = window.shiftStateStore?.read()?.employees || [];
      dom.replace(cards, warning, ...existing.map(employee => dom.element('article', { className: 'card' }, [
        dom.element('h3', { text: employee.name }), dom.element('p', { text: '登入狀態：未確認（目前僅供查看）' })
      ])));
    }
  }
  window.shiftEmployeeAdministration = Object.freeze({
    find: id => editing?.id === id ? editing : staff.find(item => item.id === id), refresh
  });
  const help = document.querySelector('#employeeForm .cloud-help');
  if (help) help.textContent = '員工資料與登入帳號分開管理。新增後請在員工卡片確認登入狀態並連結已核准的 Auth0 帳號；不使用 PIN 啟用碼。';
  document.addEventListener('postgres-session-cleared', () => { generation++; staff = []; accounts = []; editing = null; available = false; cards.replaceChildren(); });
  document.querySelector('[data-tab="employees"]')?.addEventListener('click', () => void refresh());
  document.addEventListener('postgres-bootstrap-refreshed', () => void refresh());
  void refresh();
})();
