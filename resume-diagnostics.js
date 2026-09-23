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
    'SW_INSTALLED', 'SW_ACTIVATED']);
  const reasons = new Set(['AUTH_AUTHORIZE_RENEWAL', 'USER_LOGIN', 'AUTH_LOGOUT',
    'BACKUP_RESTORE', 'LEGACY_PAYROLL_SAVE', 'LEGACY_ATTENDANCE_SAVE', 'LEGACY_LEAVE_DECISION',
    'LEGACY_STORAGE_ATTENDANCE', 'LEGACY_CLOUD_REFRESH', 'LEGACY_LOGOUT',
    'SERVICE_WORKER_UPDATE_RELOAD', 'SW_NOTIFICATION_OPEN', 'USER_LINK', 'USER_FORM']);
  const sources = new Set(['staging-auth', 'enhancements', 'management-actions', 'access',
    'boss-hours', 'google-sheets-cloud', 'login', 'pwa', 'service-worker', 'document']);
  const errorCodes = new Set(['login_required', 'consent_required', 'interaction_required',
    'account_selection_required', 'timeout', 'invalid_grant', 'access_denied',
    'TOKEN_SESSION_INVALID', 'SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED',
    'AUTH_RENEWAL_DEFERRED', 'AUTH_RENEWAL_TEMPORARILY_UNAVAILABLE', 'OTHER']);
  const errorTypes = new Set(['Error', 'TypeError', 'TimeoutError', 'AbortError',
    'AuthenticationError', 'GenericError', 'PopupTimeoutError', 'OTHER']);
  const paths = new Set(['/', '/index.html', '/announcements', '/announcements/[redacted]', '/[redacted]']);
  const safePath = value => paths.has(value) ? value
    : /^\/announcements\//.test(value || '') ? '/announcements/[redacted]' : '/[redacted]';
  const bools = ['was_discarded', 'online', 'standalone', 'sw_controller', 'persisted', 'has_token', 'success'];
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
    if (errorCodes.has(value.error_code)) result.error_code = value.error_code;
    if (errorTypes.has(value.error_type)) result.error_type = value.error_type;
    if (Number.isFinite(value.seconds_to_expiry)) result.seconds_to_expiry = Math.max(-86400, Math.min(31536000, Math.floor(value.seconds_to_expiry)));
    return result;
  }
  let memory = [];
  let persistence = true;
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
      sw_navigation: swNavigation };
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
      const help = document.createElement('p'); help.textContent = '僅保留最近 200 筆非敏感事件。分類是線索；controllerchange 不等於已證明更新造成重載。';
      const output = document.createElement('textarea'); output.readOnly = true;
      output.setAttribute('aria-label', '安全診斷紀錄'); output.style.cssText = 'width:100%;height:45vh;font:12px monospace';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '複製診斷紀錄';
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(output.value); status.textContent = '已複製安全診斷紀錄。'; }
        catch { output.focus(); output.select(); status.textContent = '請按 Ctrl+C 複製已選取的安全紀錄。'; }
      });
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉';
      close.addEventListener('click', () => dialog.close());
      dialog.append(title, help, output, copy, close, status);
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
