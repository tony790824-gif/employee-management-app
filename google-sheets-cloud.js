(() => {
  if (window.LOCAL_PREVIEW) return;
  const storageKey = key => window.shiftEnvironment?.storageKey?.(key) || key;
  const stateKey = storageKey('shift-app-data-v3');
  const endpoint = String(window.GOOGLE_SHEETS_WEB_APP_URL || '').trim();
  if (!endpoint) throw new Error('缺少 Google Sheets Web App URL 設定。');
  let ready = false, savePromise = null, pendingSave = null, timer, applyingRemote = false, syncConflict = false, conflictNotified = false;
  const waiting = new Map();
  const hash = async value => {
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(raw)].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const config = () => JSON.parse(localStorage.getItem(storageKey('shift-cloud-config')) || '{}');
  const enabled = () => config().mode === 'google_sheets';
  const status = text => { const el = document.querySelector('#cloudStatus'); if (el) el.textContent = text; };
  const validWorkspaceId = value => /^ws_[a-f0-9]{32}$/i.test(String(value || ''));
  const session = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey('shift-sheets-auth')) || 'null');
      const valid = value && typeof value === 'object' && !Array.isArray(value)
        && typeof value.sessionToken === 'string' && value.sessionToken.length >= 32
        && Number(value.sessionExpiresAt) > Date.now()
        && validWorkspaceId(value.workspaceId)
        && (value.role === 'boss' || value.role === 'employee');
      if (valid) return value;
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      return null;
    } catch {
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      return null;
    }
  };

  function responseError(response, fallback) {
    const error = new Error(response?.error || fallback);
    error.code = response?.code || 'REQUEST_FAILED';
    if (error.code === 'SESSION_INVALID' || error.code === 'WORKSPACE_MISMATCH') {
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      window.dispatchEvent(new CustomEvent('shift-session-invalid'));
    }
    return error;
  }

  function validateWorkspaceResponse(response, auth = null) {
    const responseWorkspaceId = String(response?.workspaceId || '');
    const dataWorkspaceId = String(response?.data?.workspace?.id || '');
    if (!validWorkspaceId(responseWorkspaceId) || responseWorkspaceId !== dataWorkspaceId || (auth && auth.workspaceId !== responseWorkspaceId)) {
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      window.dispatchEvent(new CustomEvent('shift-session-invalid'));
      const error = new Error('公司工作區驗證失敗，已停止同步以避免資料混用。');
      error.code = 'WORKSPACE_MISMATCH';
      throw error;
    }
    return responseWorkspaceId;
  }

  function writeRemote(data) {
    applyingRemote = true;
    try { window.shiftStateStore.write(data); }
    finally { applyingRemote = false; }
  }

  function revisionOf(data) {
    const value = Number(data?.sync?.revision);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function preserveConflict(attempted, remote) {
    syncConflict = true;
    pendingSave = null;
    localStorage.setItem(storageKey('shift-sync-conflict-backup'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      attempted,
      remote
    }));
    status('資料版本衝突・尚未儲存');
    if (!conflictNotified) {
      conflictNotified = true;
      alert('雲端資料已被其他裝置更新，這次修改沒有覆蓋雲端。\n\n目前畫面仍保留您的修改，可先按「備份」匯出；接著重新整理取得最新資料後再重做。');
    }
  }

  function init() {
    const frame = document.createElement('iframe');
    frame.src = endpoint;
    frame.hidden = true;
    frame.style.display = 'none';
    frame.title = 'Google Sheets 雲端連線';
    document.body.appendChild(frame);
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin && !event.origin.endsWith('.googleusercontent.com') && event.origin !== 'https://script.google.com') return;
    const message = event.data || {};
    if (message.channel !== 'staff-sheets') return;
    if (message.type === 'ready') { ready = true; if (enabled()) status('Google Sheets 已連線'); return; }
    const task = waiting.get(message.requestId);
    if (!task) return;
    waiting.delete(message.requestId);
    clearTimeout(task.timeout);
    task.resolve(message.response);
  });

  // 用隱藏表單 POST 資料，避開 Apps Script 外層 iframe 攔住訊息的問題。
  function call(request) {
    return new Promise((resolve, reject) => {
      const send = () => {
        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => { waiting.delete(requestId); reject(new Error('Google Sheets 連線逾時，請重新整理後再試。')); }, 25000);
        waiting.set(requestId, { resolve, timeout });
        const name = `staff-sheets-${requestId}`;
        const frame = document.createElement('iframe');
        frame.name = name;
        frame.hidden = true;
        frame.style.display = 'none';
        document.body.appendChild(frame);
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = endpoint;
        form.target = name;
        form.hidden = true;
        const input = document.createElement('input');
        input.name = 'payload';
        input.value = JSON.stringify({ requestId, request });
        const requestIdInput = document.createElement('input');
        requestIdInput.name = 'requestId';
        requestIdInput.value = requestId;
        form.appendChild(input);
        form.appendChild(requestIdInput);
        document.body.appendChild(form);
        form.submit();
        setTimeout(() => { form.remove(); frame.remove(); }, 30000);
      };
      if (ready) send();
      else {
        const start = Date.now();
        const check = () => ready ? send() : Date.now() - start > 15000
          ? reject(new Error('Google Sheets 雲端尚未準備完成。')) : setTimeout(check, 150);
        check();
      }
    });
  }

  async function login(role, phone, pin, initialData, activationCode = '') {
    if (!window.shiftAccountSecurity?.isValidPhone(String(phone || ''))
      || !window.shiftAccountSecurity?.isValidPin(String(pin || ''))) {
      throw new Error('帳號或 PIN 格式不正確。');
    }
    if (activationCode && !window.shiftAccountSecurity.isValidActivationCode(String(activationCode))) {
      throw new Error('一次性啟用碼格式不正確。');
    }
    const pinHash = await hash(pin);
    const action = role === 'boss' ? 'bossLogin' : 'employeeLogin';
    const activationHash = activationCode ? await hash(activationCode) : '';
    const response = await call({
      action,
      phone,
      pinHash,
      activationHash: role === 'employee' ? activationHash : undefined,
      initialData: role === 'boss' ? initialData : undefined
    });
    if (response?.ok) {
      if (!response.sessionToken || Number(response.sessionExpiresAt) <= Date.now()) {
        throw new Error('雲端未建立安全登入工作階段，請重新登入。');
      }
      const workspaceId = validateWorkspaceResponse(response);
      sessionStorage.setItem(storageKey('shift-sheets-auth'), JSON.stringify({
        sessionToken: response.sessionToken,
        sessionExpiresAt: Number(response.sessionExpiresAt),
        workspaceId,
        role: response.role,
        employeeId: response.employeeId || ''
      }));
    }
    return response;
  }

  async function push(data) {
    const auth = session();
    if (!auth || auth.role !== 'boss') throw new Error('老闆登入狀態已失效，無法儲存公司資料。');
    if (syncConflict) throw new Error('目前有尚未處理的資料版本衝突，請先備份並重新整理。');
    clearTimeout(timer);
    pendingSave = data;
    if (savePromise) return savePromise;
    savePromise = (async () => {
      try {
        while (pendingSave) {
          const current = pendingSave;
          pendingSave = null;
          const baseRevision = revisionOf(current);
          if (baseRevision === null) throw new Error('本機資料缺少同步版本，請重新整理後再試。');
          const result = await call({ action: 'save', sessionToken: auth.sessionToken, baseRevision, data: current });
          if (result?.code === 'REVISION_CONFLICT') {
            validateWorkspaceResponse(result, auth);
            preserveConflict(current, result.data);
            throw responseError(result, '資料版本衝突');
          }
          if (!result?.ok) throw responseError(result, '雲端儲存失敗');
          validateWorkspaceResponse(result, auth);
          const acceptedRevision = revisionOf(result.data);
          if (acceptedRevision === null || acceptedRevision <= baseRevision) throw new Error('雲端未回傳有效的新資料版本。');
          if (pendingSave) {
            pendingSave.sync = { revision: acceptedRevision };
            writeRemote(pendingSave);
          } else {
            writeRemote(result.data);
          }
          localStorage.removeItem(storageKey('shift-sync-conflict-backup'));
        }
        status('Google Sheets 已同步');
      } catch (error) {
        status('Google Sheets 同步失敗');
        throw error;
      } finally {
        savePromise = null;
      }
    })();
    return savePromise;
  }

  async function employeeCommand(action, payload = {}) {
    const auth = session();
    if (!auth || auth.role !== 'employee' || !auth.employeeId) throw new Error('員工登入狀態已失效，請重新登入。');
    const result = await call({ action, sessionToken: auth.sessionToken, ...payload });
    if (!result?.ok) throw responseError(result, '員工資料儲存失敗。');
    validateWorkspaceResponse(result, auth);
    if (result.role !== 'employee' || result.employeeId !== auth.employeeId || !result.data) throw new Error('雲端回傳的員工身份不一致。');
    window.shiftStateStore.write(result.data);
    status('Google Sheets 已同步');
    return result;
  }

  const saveEmployeeLeave = (month, dates) => employeeCommand('employeeSaveLeave', { month, dates });
  const clockInEmployee = () => employeeCommand('employeeClockIn');
  const clockOutEmployee = () => employeeCommand('employeeClockOut');
  const hasEmployeeSession = () => session()?.role === 'employee';

  async function fetchSessionData() {
    const auth = session();
    if (!auth) throw responseError({ code: 'SESSION_INVALID' }, '登入已過期，請重新登入。');
    const result = await call({ action: 'pull', sessionToken: auth.sessionToken });
    if (!result?.ok) throw responseError(result, '雲端讀取失敗。');
    validateWorkspaceResponse(result, auth);
    if (result.role !== auth.role || (auth.role === 'employee' && result.employeeId !== auth.employeeId) || !result.data) {
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      throw responseError({ code: 'SESSION_INVALID' }, '登入身分驗證失敗，請重新登入。');
    }
    return result;
  }

  async function resumeSession() {
    const result = await fetchSessionData();
    writeRemote(result.data);
    status('Google Sheets 已連線');
    return result;
  }

  async function pull() {
    if (!session() || syncConflict) return;
    try {
      const result = await fetchSessionData();
      const local = localStorage.getItem(stateKey);
      const remote = JSON.stringify(result.data);
      if (local !== remote) { writeRemote(result.data); location.reload(); }
      status('Google Sheets 已連線');
    } catch (error) {
      status(error?.code === 'SESSION_INVALID' ? '登入已過期' : 'Google Sheets 雲端連線失敗');
    }
  }

  async function logout() {
    const auth = session();
    sessionStorage.removeItem(storageKey('shift-sheets-auth'));
    if (!auth) return;
    try {
      await call({ action: 'logout', sessionToken: auth.sessionToken });
    } catch (_) {
      // Local logout must succeed even when the network is unavailable.
    }
  }

  window.sheetsCloud = { login, resumeSession, logout, pull, saveBossData: push, saveEmployeeLeave, clockInEmployee, clockOutEmployee, hasEmployeeSession };
  const baseSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    baseSet(key, value);
    if (key === stateKey && !applyingRemote && !syncConflict && enabled() && session()?.role === 'boss') {
      clearTimeout(timer);
      timer = setTimeout(() => push(JSON.parse(value)).catch(error => console.warn(error)), 600);
    }
  };
  init();
  window.addEventListener('load', () => {
    if (!enabled()) return;
    pull();
    setInterval(() => {
      if (!document.hidden) pull();
    }, 15000);
  });
})();
