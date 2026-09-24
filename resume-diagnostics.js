(() => {
  'use strict';
  if (window.shiftResumeDiagnostics) return;
  // Temporary, local-only diagnostics. No network transport and no identity/token values.
  const KEY = 'banke:resume-diagnostics:v1';
  const TAB_KEY = 'banke:resume-diagnostics:tab';
  const LIMIT = 200;
  const id = () => window.crypto.randomUUID();
  let tabId;
  try {
    tabId = sessionStorage.getItem(TAB_KEY);
    if (!/^[a-f0-9-]{36}$/.test(tabId || '')) { tabId = id(); sessionStorage.setItem(TAB_KEY, tabId); }
  } catch { tabId = id(); }
  const bootId = id();
  const events = new Set(['BOOT', 'FOCUS', 'BLUR', 'VISIBILITY', 'PAGEHIDE', 'PAGESHOW',
    'BEFOREUNLOAD', 'ONLINE', 'OFFLINE', 'FREEZE', 'RESUME', 'AUTH_INIT_START', 'AUTH_INIT_END',
    'TOKEN_CHECK', 'SILENT_RENEW_START', 'SILENT_RENEW_PASS', 'SILENT_RENEW_FAIL',
    'AUTHORIZE_REDIRECT_REQUESTED', 'AUTH_CALLBACK_DETECTED', 'BOOTSTRAP_START', 'BOOTSTRAP_END',
    'UI_USABLE', 'NAV_INTENT', 'NAV_CANCELLED', 'SW_CONTROLLERCHANGE', 'SW_UPDATE_FOUND',
    'SW_INSTALLED', 'SW_ACTIVATED', 'AUTH_CALLBACK_START', 'AUTH_CALLBACK_END',
    'AUTH_SESSION_INIT_START', 'AUTH_SESSION_INIT_END', 'API_BOOTSTRAP_START', 'API_BOOTSTRAP_END',
    'API_BOOTSTRAP_TIMEOUT', 'API_BOOTSTRAP_FAIL', 'API_REQUEST_START', 'API_REQUEST_END',
    'API_REQUEST_TIMEOUT', 'API_REQUEST_FAIL', 'TOKEN_READY', 'HOME_RENDER_START', 'HOME_RENDER_END',
    'LOGIN_SCREEN_USABLE', 'LOGIN_BUTTON_CLICK', 'AUTH_REDIRECT_START']);
  const reasons = new Set(['AUTH_AUTHORIZE_RENEWAL', 'USER_LOGIN', 'AUTH_LOGOUT',
    'BACKUP_RESTORE', 'LEGACY_PAYROLL_SAVE', 'LEGACY_ATTENDANCE_SAVE', 'LEGACY_LEAVE_DECISION',
    'LEGACY_STORAGE_ATTENDANCE', 'LEGACY_CLOUD_REFRESH', 'LEGACY_LOGOUT',
    'SERVICE_WORKER_UPDATE_RELOAD', 'SW_NOTIFICATION_OPEN', 'USER_LINK', 'USER_FORM',
    'APP_BOOT', 'API_RETRY', 'API_REQUEST']);
  const sources = new Set(['staging-auth', 'enhancements', 'management-actions', 'access',
    'boss-hours', 'google-sheets-cloud', 'login', 'pwa', 'service-worker', 'document', 'postgres-api-client']);
  const errorCodes = new Set(['login_required', 'consent_required', 'interaction_required',
    'account_selection_required', 'timeout', 'invalid_grant', 'access_denied',
    'TOKEN_SESSION_INVALID', 'SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED',
    'AUTH_RENEWAL_DEFERRED', 'AUTH_RENEWAL_TEMPORARILY_UNAVAILABLE', 'AUTH_INIT_CANCELLED',
    'POSTGRES_API_TIMEOUT', 'POSTGRES_API_UNAVAILABLE', 'POSTGRES_API_REQUEST_FAILED',
    'missing_transaction', 'state_mismatch', 'OTHER']);
  const errorTypes = new Set(['Error', 'TypeError', 'TimeoutError', 'AbortError',
    'AuthenticationError', 'GenericError', 'PopupTimeoutError', 'PostgresApiError', 'OTHER']);
  const operations = new Set(['health', 'readiness', 'session-establish', 'session-logout', 'bootstrap',
    'bootstrap-revision', 'employees', 'employee-administration', 'payroll', 'time-off-requests',
    'notifications', 'announcements', 'push-status', 'command', 'announcement-detail', 'other']);
  const paths = new Set(['/', '/index.html', '/announcements', '/announcements/[redacted]', '/[redacted]']);
  const safePath = value => paths.has(value) ? value
    : /^\/announcements\//.test(value || '') ? '/announcements/[redacted]' : '/[redacted]';
  const bools = ['was_discarded', 'online', 'standalone', 'sw_controller', 'persisted', 'has_token', 'success',
    'stale_result_ignored', 'started_hidden'];
  function sanitize(value) {
    if (!value || !events.has(value.event) || !Number.isFinite(value.timestamp)
      || !/^[a-f0-9-]{36}$/.test(value.boot_id || '') || !/^[a-f0-9-]{36}$/.test(value.tab_id || '')) return null;
    const result = { event: value.event, timestamp: value.timestamp, boot_id: value.boot_id, tab_id: value.tab_id };
    for (const key of bools) if (typeof value[key] === 'boolean') result[key] = value[key];
    if (['navigate', 'reload', 'back_forward', 'prerender', 'unknown'].includes(value.navigation_type)) result.navigation_type = value.navigation_type;
    if (['visible', 'hidden', 'prerender', 'unknown'].includes(value.visibility)) result.visibility = value.visibility;
    if (typeof value.pathname === 'string') result.pathname = safePath(value.pathname);
    if (reasons.has(value.reason)) result.reason = value.reason;
    if (sources.has(value.source)) result.source = value.source;
    if (sources.has(value.caller)) result.caller = value.caller;
    if (operations.has(value.operation)) result.operation = value.operation;
    if (['auth-callback', 'auth-session', 'api-bootstrap', 'api-request', 'app-ui'].includes(value.error_stage)) result.error_stage = value.error_stage;
    for (const key of ['run_id', 'auth_run_id', 'generation', 'elapsed_ms', 'request_id']) {
      if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 2147483647) result[key] = value[key];
    }
    if (errorCodes.has(value.error_code)) result.error_code = value.error_code;
    if (errorTypes.has(value.error_type)) result.error_type = value.error_type;
    if (Number.isFinite(value.seconds_to_expiry)) result.seconds_to_expiry = Math.max(-86400, Math.min(31536000, Math.floor(value.seconds_to_expiry)));
    return result;
  }
  let memory = [];
  let persistence = true;
  // Independent of the lifecycle ring: polling cannot evict login measurements.
  const LOGIN_KEY = 'banke:login-performance:v1';
  const loginStages = ['APP_BOOT', 'LOGIN_SCREEN_USABLE', 'LOGIN_BUTTON_CLICK', 'AUTH_REDIRECT_START',
    'AUTH_START', 'AUTH_CALLBACK_START', 'AUTH_CALLBACK_END', 'TOKEN_READY',
    'READINESS_START', 'READINESS_END', 'BOOTSTRAP_START', 'BOOTSTRAP_END',
    'FIRST_HOME_DATA_START', 'FIRST_HOME_DATA_END', 'HOME_RENDER_START', 'HOME_RENDER_END', 'UI_USABLE'];
  const loginKinds = ['APP_LOGIN', 'API_RETRY', 'AUTHORIZE_RENEWAL'];
  const validTime = value => Number.isSafeInteger(value) && value >= 0;
  const validId = value => /^[a-f0-9-]{36}$/.test(value || '');
  const pageStarted = Number.isFinite(performance.timeOrigin) && performance.timeOrigin > 0
    ? Math.min(Date.now(), Math.round(performance.timeOrigin)) : Date.now();
  let loginMemory = [], loginPersistent = true, currentLogin;
  function cleanLogin(value) {
    if (!value || !validId(value.id) || !validId(value.tab_id) || !validId(value.boot_id)
      || !validTime(value.started) || !validTime(value.updated) || !loginKinds.includes(value.kind)) return null;
    const stages = {};
    for (const name of loginStages) {
      const stage = value.stages?.[name];
      if (stage && validTime(stage.timestamp) && (stage.success === null || typeof stage.success === 'boolean')) {
        stages[name] = { timestamp: stage.timestamp, success: stage.success };
      }
    }
    return { id: value.id, tab_id: value.tab_id, boot_id: value.boot_id, kind: value.kind,
      started: value.started, updated: value.updated, stages,
      run_id: validTime(value.run_id) ? value.run_id : null,
      awaiting_callback: value.awaiting_callback === true,
      failed: value.failed === true,
      error_code: errorCodes.has(value.error_code) ? value.error_code : null };
  }
  function readLogins() {
    try {
      const raw = localStorage.getItem(LOGIN_KEY);
      if (raw && raw.length > 100000) return [];
      const values = JSON.parse(raw || '[]');
      return Array.isArray(values) ? values.slice(-10).map(cleanLogin).filter(Boolean) : [];
    } catch { loginPersistent = false; return loginMemory; }
  }
  function saveLogin(removeId) {
    loginMemory = [...readLogins().filter(item => item.id !== currentLogin.id && item.id !== removeId),
      cleanLogin(currentLogin)].filter(Boolean).slice(-10);
    try { localStorage.setItem(LOGIN_KEY, JSON.stringify(loginMemory)); loginPersistent = true; }
    catch { loginPersistent = false; }
  }
  function newLogin(timestamp, kind = 'APP_LOGIN') {
    return { id: id(), tab_id: tabId, boot_id: bootId, kind, started: pageStarted, updated: timestamp,
      stages: { APP_BOOT: { timestamp: pageStarted, success: true } },
      run_id: null, awaiting_callback: false, failed: false, error_code: null };
  }
  function captureLogin(entry) {
    if (entry.stale_result_ignored) return;
    const { event, timestamp } = entry;
    if (event === 'BOOT') { currentLogin = newLogin(timestamp); saveLogin(); return; }
    if (!currentLogin) return;
    if (event === 'LOGIN_SCREEN_USABLE' && (currentLogin.failed || currentLogin.stages.UI_USABLE)) {
      currentLogin = newLogin(timestamp);
      currentLogin.run_id = entry.run_id ?? null;
    }
    if (event === 'AUTHORIZE_REDIRECT_REQUESTED') {
      if (currentLogin.stages.UI_USABLE || currentLogin.failed) currentLogin = newLogin(timestamp,
        entry.reason === 'AUTH_AUTHORIZE_RENEWAL' ? 'AUTHORIZE_RENEWAL' : 'APP_LOGIN');
      currentLogin.stages.AUTH_START = { timestamp, success: null };
      currentLogin.run_id = entry.run_id ?? currentLogin.run_id;
      currentLogin.awaiting_callback = true;
      currentLogin.updated = timestamp;
      saveLogin(); return;
    }
    if (event === 'AUTH_INIT_START') {
      if (entry.reason === 'API_RETRY' || currentLogin.stages.UI_USABLE || currentLogin.failed) {
        currentLogin = newLogin(timestamp, entry.reason === 'API_RETRY' ? 'API_RETRY' : 'APP_LOGIN');
      }
      currentLogin.run_id = entry.run_id ?? null;
    }
    if (entry.run_id !== undefined && currentLogin.run_id !== null && entry.run_id !== currentLogin.run_id) return;
    if (currentLogin.stages.UI_USABLE || currentLogin.failed) return;
    let removeId;
    if (event === 'AUTH_CALLBACK_START') {
      // Join only this tab's recorded redirect, never infer a callback from a URL/identity.
      const previous = readLogins().findLast(item => item.id !== currentLogin.id && item.tab_id === tabId
        && item.awaiting_callback && !item.failed && !item.stages.UI_USABLE
        && timestamp >= item.updated && timestamp - item.updated <= 15 * 60 * 1000);
      if (previous) {
        removeId = currentLogin.id;
        currentLogin = { ...previous, boot_id: bootId, run_id: entry.run_id ?? null,
          stages: { ...currentLogin.stages, ...previous.stages } };
      }
      currentLogin.awaiting_callback = false;
    }
    let name = {
      AUTH_INIT_START: 'AUTH_START', AUTH_CALLBACK_START: 'AUTH_CALLBACK_START',
      AUTH_CALLBACK_END: 'AUTH_CALLBACK_END', TOKEN_READY: 'TOKEN_READY',
      HOME_RENDER_START: 'HOME_RENDER_START', HOME_RENDER_END: 'HOME_RENDER_END',
      LOGIN_SCREEN_USABLE: 'LOGIN_SCREEN_USABLE', LOGIN_BUTTON_CLICK: 'LOGIN_BUTTON_CLICK',
      AUTH_REDIRECT_START: 'AUTH_REDIRECT_START'
    }[event];
    if (event === 'UI_USABLE' && entry.caller === 'staging-auth' && entry.run_id === currentLogin.run_id) name = 'UI_USABLE';
    if (event === 'API_REQUEST_START' || event === 'API_REQUEST_END') {
      const prefix = { readiness: 'READINESS', 'session-establish': 'BOOTSTRAP', bootstrap: 'FIRST_HOME_DATA' }[entry.operation];
      if (prefix) name = `${prefix}_${event === 'API_REQUEST_START' ? 'START' : 'END'}`;
    }
    const failure = (['AUTH_INIT_END', 'AUTH_CALLBACK_END', 'AUTH_SESSION_INIT_END', 'API_REQUEST_END', 'HOME_RENDER_END'].includes(event)
      && entry.success === false && (event !== 'API_REQUEST_END' || name));
    if (!name && !failure && event !== 'NAV_CANCELLED') return;
    if (name && !currentLogin.stages[name]) currentLogin.stages[name] = {
      timestamp, success: name.endsWith('_START') || name === 'AUTH_START' ? null : entry.success !== false
    };
    if (name === 'TOKEN_READY') currentLogin.stages.AUTH_START.success = true;
    if (failure || event === 'NAV_CANCELLED') {
      currentLogin.failed = true;
      currentLogin.awaiting_callback = false;
      currentLogin.error_code = entry.error_code || 'OTHER';
    }
    currentLogin.updated = timestamp;
    saveLogin(removeId);
  }
  function loginSnapshot() {
    const summaries = readLogins().map(item => {
      const diff = (start, end) => item.stages[start] && item.stages[end]
        ? Math.max(0, item.stages[end].timestamp - item.stages[start].timestamp) : null;
      const readiness = diff('READINESS_START', 'READINESS_END');
      // Fast readiness establishes warmth at this request, not cold/warm at app launch.
      // Slow readiness is NOT evidence of a Render cold start (network/DB can also be slow).
      const classification = item.stages.READINESS_END?.success === true && readiness !== null && readiness <= 1000
        ? 'WARM_AT_READINESS' : 'UNKNOWN';
      const basis = classification === 'WARM_AT_READINESS' ? 'READINESS_PASS_WITHIN_1000_MS' : 'INSUFFICIENT_EVIDENCE';
      const stages = {};
      for (const name of loginStages) {
        const stage = item.stages[name];
        stages[name] = { elapsed_ms: stage ? Math.max(0, stage.timestamp - item.started) : null,
          success: stage?.success ?? null, status: !stage ? 'NOT_OBSERVED' : stage.success === null ? 'STARTED' : stage.success ? 'PASS' : 'FAIL',
          temperature: classification, temperature_basis: basis };
      }
      const auth = diff('AUTH_START', 'TOKEN_READY');
      const bootstrap = diff('BOOTSTRAP_START', 'BOOTSTRAP_END');
      const home = diff('FIRST_HOME_DATA_START', 'FIRST_HOME_DATA_END');
      const total = diff('APP_BOOT', 'UI_USABLE');
      return { login_id: item.id, kind: item.kind, run_id: item.run_id,
        status: item.stages.UI_USABLE ? 'PASS' : item.failed ? 'FAIL' : 'INCOMPLETE',
        temperature: classification, temperature_basis: basis, temperature_at_app_open: 'UNKNOWN',
        error_code: item.error_code, stages,
        durations_ms: { app_open_to_usable: total, readiness, auth0_and_claim_validation: auth,
          api_session_tenant_bootstrap: bootstrap, first_home_data: home,
          home_scripts_and_render: diff('HOME_RENDER_START', 'HOME_RENDER_END'),
          other_frontend_and_user_wait: total !== null && [auth, readiness, bootstrap, home].every(x => x !== null)
            ? Math.max(0, total - auth - readiness - bootstrap - home) : null },
        // Additive presentation only: retain all v1 durations and persisted records.
        // The off-origin interval includes user interaction AND redirect/network time;
        // it cannot be attributed to Auth0 processing or measured as pure human wait.
        phase_breakdown_ms: {
          pre_auth_and_user_wait: diff('APP_BOOT', 'AUTH_START'),
          auth_interactive_roundtrip_including_user_wait: diff('AUTH_START', 'AUTH_CALLBACK_START'),
          auth_callback_processing: diff('AUTH_CALLBACK_START', 'AUTH_CALLBACK_END'),
          token_and_claim_processing_after_callback: diff('AUTH_CALLBACK_END', 'TOKEN_READY'),
          system_after_callback_to_usable: diff('AUTH_CALLBACK_START', 'UI_USABLE'),
          token_ready_to_usable: diff('TOKEN_READY', 'UI_USABLE')
        },
        controlled_login_ms: {
          login_screen_to_click_ms: diff('LOGIN_SCREEN_USABLE', 'LOGIN_BUTTON_CLICK'),
          click_to_auth_redirect_ms: diff('LOGIN_BUTTON_CLICK', 'AUTH_REDIRECT_START'),
          auth_redirect_to_callback_ms: diff('AUTH_REDIRECT_START', 'AUTH_CALLBACK_START'),
          callback_to_token_ready_ms: diff('AUTH_CALLBACK_START', 'TOKEN_READY'),
          token_ready_to_ui_usable_ms: diff('TOKEN_READY', 'UI_USABLE'),
          click_to_ui_usable_ms: diff('LOGIN_BUTTON_CLICK', 'UI_USABLE')
        } };
    });
    return { version: 1, persistence: loginPersistent ? 'LOCAL_STORAGE' : 'UNAVAILABLE', limit: 10,
      measurement: 'DOCUMENT_START_TO_DOM_USABLE; AUTH_INCLUDES_INTERACTIVE_USER_WAIT_IF_ANY',
      phase_measurement: 'PRE_AUTH_AND_INTERACTIVE_ROUNDTRIP_EXCLUDED_FROM_SYSTEM_AFTER_CALLBACK; ROUNDTRIP_INCLUDES_USER_WAIT_AND_NETWORK; NULL_MEANS_NOT_OBSERVED; INTERVALS_OVERLAP_DO_NOT_SUM',
      controlled_measurement: 'CLICK_TO_UI_EXCLUDES_LOGIN_SCREEN_WAIT_ONLY; OFF_ORIGIN_USER_WAIT_AND_NETWORK_NOT_SEPARATELY_OBSERVABLE; AUTO_LOGIN_WITHOUT_CLICK_HAS_NULL_CLICK_TIMINGS',
      operations: { BOOTSTRAP: 'session-establish', FIRST_HOME_DATA: 'bootstrap' }, summaries };
  }
  let swNavigation = null;
  // The SW cannot use localStorage. Its sole openWindow path persists one fixed,
  // destination-free record in same-origin CacheStorage before navigation.
  if (window.caches) void (async () => {
    try {
      if (!(await window.caches.keys()).includes('banke-resume-navigation-v1')) return;
      const cache = await window.caches.open('banke-resume-navigation-v1');
      const response = await cache.match('./__resume_nav_intent__');
      const value = response && await response.json();
      if (value?.event === 'NAV_INTENT' && value.reason === 'SW_NOTIFICATION_OPEN'
        && value.source === 'service-worker' && Number.isFinite(value.timestamp)) {
        swNavigation = { event: 'NAV_INTENT', reason: 'SW_NOTIFICATION_OPEN', source: 'service-worker', timestamp: value.timestamp };
      }
    } catch { /* Optional SW evidence must not block the app. */ }
  })();
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && raw.length > 150000) return [];
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.slice(-LIMIT).map(sanitize).filter(Boolean) : [];
    } catch { persistence = false; return memory; }
  }
  function mark(event, data = {}) {
    try {
      const entry = sanitize({ ...data, event, timestamp: Date.now(), boot_id: bootId, tab_id: tabId });
      if (!entry) return;
      try { captureLogin(entry); } catch { /* Measurement cannot affect the application. */ }
      memory = [...read(), entry].slice(-LIMIT);
      try { localStorage.setItem(KEY, JSON.stringify(memory)); persistence = true; }
      catch { persistence = false; }
    } catch { /* Diagnostics must never affect auth, navigation, or application commands. */ }
  }
  const intent = (reason, source) => {
    if (reasons.has(reason) && sources.has(source)) mark('NAV_INTENT', { reason, source });
  };
  function authError(error) {
    return {
      error_type: errorTypes.has(error?.name) ? error.name : 'OTHER',
      error_code: errorCodes.has(error?.error || error?.code) ? (error.error || error.code) : 'OTHER'
    };
  }
  function analyze(records) {
    const own = records.filter(entry => entry.tab_id === tabId);
    const bootIndex = own.findLastIndex(entry => entry.event === 'BOOT');
    const boot = own[bootIndex];
    if (!boot) return { classification: 'UNKNOWN', reason: 'BOOT_NOT_RETAINED' };
    const previous = own.slice(0, bootIndex);
    const previousId = previous.at(-1)?.boot_id;
    const previousBoot = previous.filter(entry => entry.boot_id === previousId);
    // Completed UI recovery / failed navigation invalidates old navigation intent.
    const barrier = previousBoot.findLastIndex(entry => ['UI_USABLE', 'NAV_CANCELLED'].includes(entry.event));
    const relevant = previousBoot.slice(barrier + 1).filter(entry => boot.timestamp - entry.timestamp >= 0 && boot.timestamp - entry.timestamp <= 120000);
    const nav = relevant.findLast(entry => entry.event === 'NAV_INTENT');
    const authorize = relevant.some(entry => entry.event === 'AUTHORIZE_REDIRECT_REQUESTED');
    const controller = relevant.findLast(entry => entry.event === 'SW_CONTROLLERCHANGE' && boot.timestamp - entry.timestamp <= 10000);
    let classification = 'UNKNOWN';
    let evidence = 'NO_CONCLUSIVE_TRANSITION';
    if (previousId && previousId !== boot.boot_id) {
      if (authorize || nav?.reason === 'AUTH_AUTHORIZE_RENEWAL' || nav?.reason === 'USER_LOGIN') {
        classification = 'AUTH0_FULL_PAGE_REDIRECT'; evidence = 'RECORDED_AUTHORIZE_INTENT';
      } else if (nav?.reason === 'SERVICE_WORKER_UPDATE_RELOAD') {
        classification = 'SERVICE_WORKER_RELOAD'; evidence = 'EXPLICIT_SW_RELOAD_INTENT';
      } else if (nav) {
        classification = 'APP_NAVIGATION'; evidence = 'RECORDED_NAV_INTENT';
      } else if (controller && boot.navigation_type === 'reload') {
        classification = 'SERVICE_WORKER_RELOAD'; evidence = 'CONTROLLERCHANGE_CORRELATION_NOT_CAUSATION';
      } else if (boot.was_discarded || boot.navigation_type === 'reload') {
        classification = 'BROWSER_OR_PWA_RELOAD'; evidence = 'NO_RECORDED_APP_NAV_INTENT';
      }
    }
    const lastBlur = own.findLast(entry => entry.event === 'BLUR' || (entry.event === 'VISIBILITY' && entry.visibility === 'hidden'));
    const resume = lastBlur && own.find(entry => entry.timestamp >= lastBlur.timestamp && (entry.event === 'FOCUS' || (entry.event === 'VISIBILITY' && entry.visibility === 'visible')));
    const usable = resume && own.find(entry => entry.timestamp >= resume.timestamp && entry.event === 'UI_USABLE');
    return {
      classification, evidence, new_boot: Boolean(previousId && previousId !== boot.boot_id),
      navigation_type: boot.navigation_type, was_discarded: boot.was_discarded,
      nav_intent: nav?.reason || 'NONE', previous_boot_id: previousId || null,
      resume_to_ui_usable_ms: usable ? Math.max(0, usable.timestamp - resume.timestamp) : null
    };
  }
  function snapshot() {
    const records = read();
    return { version: 1, persistence: persistence ? 'LOCAL_STORAGE' : 'UNAVAILABLE',
      current_boot_id: bootId, analysis: analyze(records), events: records,
      sw_navigation: swNavigation, login_performance: loginSnapshot() };
  }
  let dialog;
  function open() {
    if (!document.body) return;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'resumeDiagnosticsDialog';
      dialog.setAttribute('aria-label', '診斷紀錄');
      dialog.style.cssText = 'width:min(90vw,900px);max-height:85vh;overflow:auto';
      const title = document.createElement('h2'); title.textContent = '診斷紀錄（僅限本機）';
      const help = document.createElement('p'); help.textContent = '登入效能摘要獨立保留最近 10 次，不受 200 筆生命週期紀錄覆蓋。快速 readiness 只證明當次請求已醒著；慢回應不等於冷啟動。';
      const output = document.createElement('textarea'); output.readOnly = true;
      output.setAttribute('aria-label', '安全診斷紀錄'); output.style.cssText = 'width:100%;height:45vh;font:12px monospace';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '複製診斷紀錄';
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(output.value); status.textContent = '已複製安全診斷紀錄。'; }
        catch { output.focus(); output.select(); status.textContent = '請按 Ctrl+C 複製已選取的安全紀錄。'; }
      });
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉';
      const copyLogin = document.createElement('button'); copyLogin.type = 'button'; copyLogin.textContent = '複製登入效能摘要';
      copyLogin.addEventListener('click', async () => {
        output.value = JSON.stringify(loginSnapshot(), null, 2);
        try { await navigator.clipboard.writeText(output.value); status.textContent = '已複製登入效能摘要。'; }
        catch { output.focus(); output.select(); status.textContent = '請按 Ctrl+C 複製已選取的安全摘要。'; }
      });
      close.addEventListener('click', () => dialog.close());
      dialog.append(title, help, output, copy, copyLogin, close, status);
      document.body.append(dialog);
    }
    dialog.querySelector('textarea').value = JSON.stringify(snapshot(), null, 2);
    if (!dialog.open) dialog.showModal();
  }
  window.shiftResumeDiagnostics = Object.freeze({ mark, intent, authError, snapshot, open });
  mark('BOOT', {
    navigation_type: performance.getEntriesByType('navigation')[0]?.type || 'unknown',
    was_discarded: document.wasDiscarded === true,
    visibility: document.visibilityState || 'unknown', online: navigator.onLine,
    standalone: window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true,
    sw_controller: Boolean(navigator.serviceWorker?.controller), pathname: window.location.pathname
  });
  for (const [event, name] of Object.entries({ focus: 'FOCUS', blur: 'BLUR', beforeunload: 'BEFOREUNLOAD', online: 'ONLINE', offline: 'OFFLINE' })) {
    window.addEventListener(event, () => mark(name));
  }
  for (const [event, name] of Object.entries({ pagehide: 'PAGEHIDE', pageshow: 'PAGESHOW' })) {
    window.addEventListener(event, value => mark(name, { persisted: value.persisted === true }));
  }
  document.addEventListener('visibilitychange', () => mark('VISIBILITY', { visibility: document.visibilityState }));
  for (const name of ['freeze', 'resume']) document.addEventListener(name, () => mark(name.toUpperCase()));
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => mark('SW_CONTROLLERCHANGE'));
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === 'd' && !event.repeat) {
      event.preventDefault(); event.stopPropagation(); open();
    }
  }, true);
  // Capture ordinary links/forms without recording their destinations or form fields.
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')
      || event.ctrlKey || event.metaKey || event.shiftKey || event.button > 0) return;
    queueMicrotask(() => {
      if (!event.defaultPrevented && !link.getAttribute('href')?.startsWith('#')) intent('USER_LINK', 'document');
    });
  }, true);
  document.addEventListener('submit', event => {
    queueMicrotask(() => {
      if (!event.defaultPrevented && event.target?.method !== 'dialog') intent('USER_FORM', 'document');
    });
  }, true);
})();
