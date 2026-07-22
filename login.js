(() => {
  const $ = s => document.querySelector(s);
  const storageKey = key => window.shiftEnvironment?.storageKey?.(key) || key;
  const clean = value => String(value || '').replace(/[^0-9]/g, '');
  const stateStore = window.shiftStateStore;
  const overlay = $('#loginOverlay');
  const phone = $('#loginPhone');
  const pin = $('#loginPin');
  const activation = $('#loginActivation');
  const activationWrap = $('#loginActivationWrap');
  const hint = $('#loginHint');
  const loginButtons = [$('#bossLogin'), $('#employeeLogin')];
  const defaultHint = hint.textContent;
  const APP_SCRIPTS = Object.freeze([
    'dom-safety.js',
    'app.js',
    'access.js',
    'employee-work.js',
    'boss-hours.js',
    'management-actions.js',
    'enhancements.js',
    'employee-layout.js'
  ]);
  let appLoadPromise = null;
  let busy = false;
  const read = () => stateStore.read();
  const write = data => stateStore.write(data);

  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`無法載入 ${source}，請重新整理後再試。`));
    document.body.appendChild(script);
  });

  function loadAuthenticatedApp() {
    if (!appLoadPromise) {
      appLoadPromise = APP_SCRIPTS.reduce(
        (chain, source) => chain.then(() => loadScript(source)),
        Promise.resolve()
      );
    }
    return appLoadPromise;
  }

  function setBusy(value, message = '') {
    busy = value;
    loginButtons.forEach(button => { button.disabled = value; });
    phone.disabled = value;
    pin.disabled = value;
    activation.disabled = value;
    $('#togglePin').disabled = value;
    hint.textContent = message || defaultHint;
  }

  function clearSession() {
    sessionStorage.removeItem(storageKey('shift-signed-in'));
    sessionStorage.removeItem(storageKey('shift-sheets-auth'));
    localStorage.removeItem(storageKey('shift-session-role'));
    localStorage.removeItem(storageKey('shift-person'));
  }

  function purgeRenderedData() {
    ['#stats', '#calendarGrid', '#scheduleBody', '#attendanceBody', '#employeeCards', '#payrollBody', '#removedEmployees']
      .forEach(selector => document.querySelector(selector)?.replaceChildren());
  }

  function sheetsSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(storageKey('shift-sheets-auth')) || 'null');
      const valid = session && typeof session === 'object' && !Array.isArray(session)
        && typeof session.sessionToken === 'string' && session.sessionToken.length >= 32
        && Number(session.sessionExpiresAt) > Date.now()
        && /^ws_[a-f0-9]{32}$/i.test(String(session.workspaceId || ''))
        && (session.role === 'boss' || session.role === 'employee');
      if (valid) return session;
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      return null;
    } catch {
      sessionStorage.removeItem(storageKey('shift-sheets-auth'));
      return null;
    }
  }

  function clearCloudSensitiveCache() {
    if (isLocalPreview) return;
    try {
      const cloud = JSON.parse(localStorage.getItem(storageKey('shift-cloud-config')) || '{}');
      if (cloud.mode === 'google_sheets') stateStore.clearSensitive();
    } catch {
      stateStore.clearSensitive();
    }
  }

  async function enter(role, employeeId = '') {
    if (role !== 'boss' && role !== 'employee') throw new Error('登入身份無效。');
    if (role === 'employee' && !employeeId) throw new Error('找不到員工身份，請重新登入。');

    localStorage.setItem(storageKey('shift-session-role'), role);
    if (employeeId) localStorage.setItem(storageKey('shift-person'), employeeId);
    else localStorage.removeItem(storageKey('shift-person'));
    window.SHIFT_AUTHORIZED = true;
    try {
      await loadAuthenticatedApp();
    } catch (error) {
      window.SHIFT_AUTHORIZED = false;
      document.body.classList.remove('app-authenticated', 'employee-mode');
      purgeRenderedData();
      clearSession();
      clearCloudSensitiveCache();
      throw error;
    }

    sessionStorage.setItem(storageKey('shift-signed-in'), 'yes');
    document.body.classList.add('app-authenticated');
    $('#installAppBtn').hidden = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    $('#roleSelect').value = role;
    $('#roleSelect').dispatchEvent(new Event('change'));
    if (employeeId) {
      $('#employeeModeSelect').value = employeeId;
      $('#employeeModeSelect').dispatchEvent(new Event('change'));
    }
    overlay.hidden = true;
  }

  window.shiftAppSession = Object.freeze({ enter });

  // 本機預覽只用來檢查畫面，絕不能等待 Google Sheets 或要求登入。
  const isLocalPreview = window.LOCAL_PREVIEW === true;
  const useSheets = () => !isLocalPreview && window.shiftEnvironment?.dataBackend === 'google_sheets'
    && Boolean(window.sheetsCloud && window.GOOGLE_SHEETS_WEB_APP_URL);
  async function sheetsLogin(role, number, code, activationCode = '') {
    const response = await window.sheetsCloud.login(role, number, code, read(), activationCode);
    if (!response?.ok) {
      const error = new Error(response?.error || 'Google Sheets 雲端登入失敗。');
      error.code = response?.code || 'REQUEST_FAILED';
      throw error;
    }
    if (role === 'employee' && !response.employeeId) throw new Error('雲端未回傳員工身份，請老闆確認員工資料。');
    write(response.data);
    localStorage.setItem(storageKey('shift-cloud-config'), JSON.stringify({ mode: 'google_sheets', url: window.GOOGLE_SHEETS_WEB_APP_URL }));
    return response;
  }

  $('#togglePin').onclick = () => {
    const showing = pin.type === 'text';
    pin.type = showing ? 'password' : 'text';
    $('#togglePin').textContent = showing ? '顯示 PIN' : '隱藏 PIN';
  };

  $('#bossLogin').onclick = async () => {
    if (busy) return;
    const number = clean(phone.value);
    const code = String(pin.value || '').trim();
    if (!window.shiftAccountSecurity.isValidPhone(number) || !window.shiftAccountSecurity.isValidPin(code)) {
      return alert('請輸入有效手機號碼與 6 位數純數字 PIN。');
    }
    setBusy(true, '正在驗證並載入班表…');
    let entered = false;
    try {
      if (!useSheets()) throw new Error('無法連上 Google Sheets，為保護帳號安全，離線時不提供登入。');
      await sheetsLogin('boss', number, code);
      await enter('boss');
      entered = true;
    } catch (error) { alert(error.message || '登入失敗。'); }
    finally { if (!entered) setBusy(false); }
  };

  $('#employeeLogin').onclick = async () => {
    if (busy) return;
    const number = clean(phone.value);
    const code = String(pin.value || '').trim();
    if (!window.shiftAccountSecurity.isValidPhone(number) || !window.shiftAccountSecurity.isValidPin(code)) {
      return alert('請輸入有效手機號碼與 6 位數純數字 PIN。');
    }
    setBusy(true, '正在驗證並載入個人班表…');
    let entered = false;
    try {
      if (!useSheets()) throw new Error('無法連上 Google Sheets，為保護帳號安全，離線時不提供登入。');
      const activationCode = window.shiftAccountSecurity.normalizeActivationCode(activation.value);
      if (activationCode && !window.shiftAccountSecurity.isValidActivationCode(activationCode)) {
        throw new Error('一次性啟用碼必須是現行 8 碼大寫英數格式。');
      }
      const result = await sheetsLogin('employee', number, code, activationCode);
      await enter('employee', result.employeeId);
      entered = true;
    } catch (error) {
      if (String(error.code || '').startsWith('ACTIVATION_')) {
        activationWrap.hidden = false;
        activation.focus();
      }
      alert(error.message || '登入失敗。');
    }
    finally { if (!entered) setBusy(false); }
  };

  // 安裝成手機 APP 或重新開啟時，恢復原本登入的身份，不能跳回老闆畫面。
  const previewRole = new URLSearchParams(location.search).get('preview');
  if (previewRole === 'boss' || previewRole === 'employee') {
    // 預覽頁永遠直接進入；即使電腦內還沒有任何資料也建立一位示範員工。
    const previewData = read();
    previewData.employees ||= [];
    if (previewRole === 'employee' && !previewData.employees.length) {
      previewData.employees.push({
        id: 'local-preview-employee',
        name: '預覽員工',
        phone: '0912345678',
        role: '門市人員',
        rate: 200,
        leaveQuota: 8
      });
      write(previewData);
    }
    const employeeId = previewRole === 'employee' ? previewData.employees[0]?.id || '' : '';
    window.requestAnimationFrame(() => {
      setBusy(true, '正在開啟本機預覽…');
      enter(previewRole, employeeId).catch(error => {
        setBusy(false);
        alert(error.message || '本機預覽載入失敗。');
      });
    });
  } else if (sessionStorage.getItem(storageKey('shift-signed-in')) === 'yes') {
    if (window.shiftEnvironment?.dataBackend === 'postgres') {
      // Auth0 owns restoration for the isolated PostgreSQL rehearsal. Never
      // interpret its namespaced session as a Google Sheets session.
      overlay.hidden = false;
      return;
    }
    const savedRole = localStorage.getItem(storageKey('shift-session-role')) || 'boss';
    const savedEmployee = savedRole === 'employee' ? localStorage.getItem(storageKey('shift-person')) || '' : '';
    const savedCloudSession = isLocalPreview ? null : sheetsSession();
    const invalidRole = savedRole !== 'boss' && savedRole !== 'employee';
    const invalidEmployee = savedRole === 'employee' && !savedEmployee;
    const invalidCloudSession = !isLocalPreview && (
      !savedCloudSession ||
      savedCloudSession.role !== savedRole ||
      (savedRole === 'employee' && savedCloudSession.employeeId !== savedEmployee)
    );
    if (invalidRole || invalidEmployee || invalidCloudSession) {
      clearSession();
      clearCloudSensitiveCache();
      overlay.hidden = false;
    } else {
      setBusy(true, '正在恢復登入狀態…');
      window.sheetsCloud.resumeSession().then(result => {
        const roleMatches = result.role === savedRole;
        const employeeMatches = savedRole !== 'employee' || result.employeeId === savedEmployee;
        if (!roleMatches || !employeeMatches) throw new Error('登入身分驗證失敗，請重新登入。');
        return enter(savedRole, savedEmployee);
      }).catch(error => {
        clearSession();
        clearCloudSensitiveCache();
        setBusy(false);
        overlay.hidden = false;
        alert(error.message || '登入狀態已失效，請重新登入。');
      });
    }
  } else {
    overlay.hidden = false;
  }

  window.shiftLogout = async () => {
    const postgresSession = window.shiftEnvironment?.dataBackend === 'postgres';
    document.body.classList.remove('app-authenticated', 'employee-mode');
    overlay.hidden = false;
    purgeRenderedData();
    if (window.shiftEnvironment?.dataBackend === 'postgres' && window.shiftPostgresCloud) {
      await Promise.race([
        window.shiftPostgresCloud.logout(),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    } else if (!isLocalPreview && window.sheetsCloud) {
      await Promise.race([
        window.sheetsCloud.logout(),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    }
    clearSession();
    clearCloudSensitiveCache();
    window.SHIFT_AUTHORIZED = false;
    if (postgresSession && typeof window.shiftStagingAuth?.logoutProvider === 'function') {
      await window.shiftStagingAuth.logoutProvider();
      return;
    }
    location.reload();
  };

  window.addEventListener('shift-session-invalid', () => {
    if (sessionStorage.getItem(storageKey('shift-signed-in')) === 'yes') window.shiftLogout();
  });
})();
