(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.dataBackend !== 'postgres') return;

  const stateStore = window.shiftStateStore;
  const workspacePattern = /^ws_[a-f0-9]{32}$/;
  let client = null;
  let currentSession = null;
  let currentUser = null;
  let foregroundDebounceTimer = null;
  let foregroundPollTimer = null;
  let foregroundPromise = null;
  let foregroundFailureReported = false;
  let lastForegroundCompletedAt = 0;
  let lastUserActivityAt = Date.now();
  let revisionChannel = null;
  const FOREGROUND_DEBOUNCE_MS = 250;
  const FOREGROUND_COOLDOWN_MS = 1000;
  const ACTIVE_POLL_INTERVAL_MS = 2_000;
  const IDLE_POLL_INTERVAL_MS = 20_000;
  const BACKGROUND_POLL_INTERVAL_MS = 60_000;
  const ACTIVE_WINDOW_MS = 30_000;
  const REVISION_SIGNAL_TYPE = 'banke-bootstrap-revision';
  const REVISION_STORAGE_KEY = environment.storageKey('postgres-revision-signal');
  const REVISION_CHANNEL_NAME = `${environment.storagePrefix || 'banke:'}postgres-revision-v1`;

  const isEmployeeSession = () => currentSession?.role === 'employee' && Boolean(currentSession.employeeId);

  function validateCurrentUser(value, payload) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('PostgreSQL bootstrap currentUser format is invalid.');
    }
    const displayName = value.displayName === null
      ? null
      : typeof value.displayName === 'string' && value.displayName === value.displayName.trim()
        && value.displayName.length > 0 && value.displayName.length <= 120
        ? value.displayName
        : undefined;
    if (displayName === undefined) throw new Error('PostgreSQL bootstrap currentUser display name is invalid.');
    if (!['boss', 'employee'].includes(value.role) || value.role !== payload.role) {
      throw new Error('PostgreSQL bootstrap currentUser role is inconsistent.');
    }
    const employeeId = value.employeeId === null ? null : value.employeeId;
    if (value.role === 'employee' && (typeof employeeId !== 'string' || employeeId !== payload.employeeId)) {
      throw new Error('PostgreSQL bootstrap currentUser employee identity is inconsistent.');
    }
    if (value.role === 'boss' && employeeId !== null) {
      throw new Error('PostgreSQL bootstrap currentUser manager identity is invalid.');
    }
    if (value.workspaceId !== payload.workspaceId || !workspacePattern.test(value.workspaceId)) {
      throw new Error('PostgreSQL bootstrap currentUser Workspace is inconsistent.');
    }
    return Object.freeze({ displayName, role: value.role, employeeId, workspaceId: value.workspaceId });
  }

  function validateBootstrap(payload) {
    if (!payload || payload.ok !== true || !payload.data || typeof payload.data !== 'object') {
      throw new Error('PostgreSQL bootstrap 回應格式不正確。');
    }
    if (payload.workspaceId !== environment.postgresWorkspaceId || !workspacePattern.test(payload.workspaceId)) {
      throw new Error('PostgreSQL bootstrap 工作區不一致。');
    }
    if (!['boss', 'employee'].includes(payload.role)) throw new Error('PostgreSQL bootstrap 角色不正確。');
    if (payload.role === 'employee' && typeof payload.employeeId !== 'string') {
      throw new Error('PostgreSQL bootstrap 缺少員工身份。');
    }
    const normalized = stateStore.normalize(payload.data);
    if (normalized.workspace.id !== payload.workspaceId) throw new Error('PostgreSQL bootstrap 資料邊界不一致。');
    return { ...payload, currentUser: validateCurrentUser(payload.currentUser, payload), data: normalized };
  }

  const bootstrapRevision = value => Number(value?.data?.sync?.revision);

  function stableJson(value) {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key =>
        `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function changedBootstrapSections(previous, next) {
    const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
    keys.delete('sync');
    return [...keys].filter(key => stableJson(previous?.[key]) !== stableJson(next?.[key])).sort();
  }

  function mergeBootstrapSections(previous, next, changedSections) {
    const merged = { ...(previous || {}) };
    changedSections.forEach(key => {
      if (Object.hasOwn(next, key)) merged[key] = next[key];
      else delete merged[key];
    });
    merged.sync = next.sync;
    return merged;
  }

  function validateRevision(payload) {
    const revision = Number(payload?.revision);
    if (!payload || payload.ok !== true || payload.workspaceId !== environment.postgresWorkspaceId
      || !workspacePattern.test(payload.workspaceId) || !Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('PostgreSQL bootstrap revision response is invalid.');
    }
    return revision;
  }

  function announceRevision(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    const message = Object.freeze({ type: REVISION_SIGNAL_TYPE, revision, emittedAt: Date.now() });
    try {
      revisionChannel?.postMessage(message);
    } catch {}
    try {
      localStorage.setItem(REVISION_STORAGE_KEY, JSON.stringify(message));
    } catch {}
    try {
      window.navigator?.serviceWorker?.controller?.postMessage({
        type: 'BANKE_BOOTSTRAP_REVISION',
        revision
      });
    } catch {}
  }

  function handleRevisionSignal(message) {
    if (!client || !currentSession || !message || message.type !== REVISION_SIGNAL_TYPE) return;
    const revision = Number(message.revision);
    const currentRevision = Number(stateStore.read()?.sync?.revision);
    if (!Number.isSafeInteger(revision) || revision < 0
      || (Number.isSafeInteger(currentRevision) && revision <= currentRevision)) return;
    if (document.visibilityState === 'visible') scheduleForegroundSync();
    startForegroundPolling();
  }

  async function refreshBootstrap({ onlyIfChanged = false, source = 'manual' } = {}) {
    if (!client) throw new Error('PostgreSQL Staging 尚未連線。');
    const activeClient = client;
    const activeSession = currentSession;
    const bootstrap = validateBootstrap(await activeClient.bootstrap());
    if (activeClient !== client || activeSession !== currentSession) {
      return { ...bootstrap, changed: false, stale: true };
    }
    const previousData = stateStore.read();
    const previousRevision = Number(previousData?.sync?.revision);
    const nextRevision = bootstrapRevision(bootstrap);
    const changed = !Number.isSafeInteger(previousRevision) || previousRevision !== nextRevision;
    if (onlyIfChanged && !changed) return { ...bootstrap, changed: false };
    const changedSections = changedBootstrapSections(previousData, bootstrap.data);
    const currentUserChanged = stableJson(currentUser) !== stableJson(bootstrap.currentUser);
    stateStore.write(mergeBootstrapSections(previousData, bootstrap.data, changedSections));
    currentSession = Object.freeze({ role: bootstrap.role, employeeId: bootstrap.employeeId || '' });
    currentUser = bootstrap.currentUser;
    sessionStorage.setItem(environment.storageKey('shift-postgres-auth'), JSON.stringify(currentSession));
    document.dispatchEvent(new CustomEvent('postgres-bootstrap-refreshed', {
      detail: { source, revision: nextRevision, changedSections, currentUserChanged }
    }));
    if (changed) announceRevision(nextRevision);
    return { ...bootstrap, changed: true };
  }

  const canRunForegroundSync = () => Boolean(
    client
    && currentSession
    && window.navigator?.onLine !== false
  );

  function cancelForegroundDebounce() {
    if (foregroundDebounceTimer !== null) clearTimeout(foregroundDebounceTimer);
    foregroundDebounceTimer = null;
  }

  function stopForegroundPolling() {
    if (foregroundPollTimer !== null) clearTimeout(foregroundPollTimer);
    foregroundPollTimer = null;
  }

  async function runForegroundSync() {
    if (!canRunForegroundSync()) return null;
    if (foregroundPromise) return foregroundPromise;
    foregroundPromise = (async () => {
      try {
        const activeClient = client;
        const activeSession = currentSession;
        const previousRevision = Number(stateStore.read()?.sync?.revision);
        const nextRevision = validateRevision(await activeClient.bootstrapRevision());
        if (activeClient !== client || activeSession !== currentSession) {
          return { changed: false, revision: nextRevision, stale: true };
        }
        const changed = !Number.isSafeInteger(previousRevision) || previousRevision !== nextRevision;
        const bootstrap = changed
          ? await refreshBootstrap({ source: 'foreground' })
          : { changed: false, revision: nextRevision };
        if (!bootstrap?.stale) {
          foregroundFailureReported = false;
          document.dispatchEvent(new CustomEvent('postgres-foreground-synced', {
            detail: {
              changed: Boolean(bootstrap?.changed),
              revision: bootstrap?.changed ? bootstrapRevision(bootstrap) : nextRevision
            }
          }));
        }
        return bootstrap;
      } catch (error) {
        if (!foregroundFailureReported) {
          console.warn('PostgreSQL foreground sync failed', {
            code: error?.code || 'FOREGROUND_SYNC_FAILED',
            status: Number(error?.status || 0),
            requestId: error?.requestId || ''
          });
          foregroundFailureReported = true;
        }
        return null;
      } finally {
        foregroundPromise = null;
        lastForegroundCompletedAt = Date.now();
      }
    })();
    return foregroundPromise;
  }

  function scheduleForegroundSync() {
    if (!canRunForegroundSync()) return;
    if (foregroundPromise) return;
    const cooldownRemaining = Math.max(0,
      FOREGROUND_COOLDOWN_MS - (Date.now() - lastForegroundCompletedAt));
    cancelForegroundDebounce();
    foregroundDebounceTimer = setTimeout(() => {
      foregroundDebounceTimer = null;
      void runForegroundSync();
    }, Math.max(FOREGROUND_DEBOUNCE_MS, cooldownRemaining));
  }

  function pollingInterval() {
    if (document.visibilityState !== 'visible') return BACKGROUND_POLL_INTERVAL_MS;
    return Date.now() - lastUserActivityAt <= ACTIVE_WINDOW_MS
      ? ACTIVE_POLL_INTERVAL_MS
      : IDLE_POLL_INTERVAL_MS;
  }

  function startForegroundPolling() {
    stopForegroundPolling();
    if (!canRunForegroundSync()) return;
    foregroundPollTimer = setTimeout(() => {
      foregroundPollTimer = null;
      void runForegroundSync().finally(startForegroundPolling);
    }, pollingInterval());
  }

  function stopForegroundSync() {
    cancelForegroundDebounce();
    stopForegroundPolling();
  }

  function handleForegroundEntry() {
    if (!canRunForegroundSync()) return;
    lastUserActivityAt = Date.now();
    scheduleForegroundSync();
    startForegroundPolling();
  }

  function handleActivity() {
    if (!canRunForegroundSync() || document.visibilityState !== 'visible') return;
    const wasIdle = Date.now() - lastUserActivityAt > ACTIVE_WINDOW_MS;
    lastUserActivityAt = Date.now();
    if (wasIdle) startForegroundPolling();
  }

  function handleVisibilityChange() {
    cancelForegroundDebounce();
    if (document.visibilityState === 'visible') handleForegroundEntry();
    else startForegroundPolling();
  }

  function initializeRevisionSignals() {
    if (typeof window.BroadcastChannel === 'function') {
      revisionChannel = new window.BroadcastChannel(REVISION_CHANNEL_NAME);
      revisionChannel.addEventListener('message', event => handleRevisionSignal(event.data));
    }
    window.addEventListener('storage', event => {
      if (event.key !== REVISION_STORAGE_KEY || !event.newValue) return;
      try {
        handleRevisionSignal(JSON.parse(event.newValue));
      } catch {}
    });
    window.navigator?.serviceWorker?.addEventListener?.('message', event => {
      if (event.data?.type !== 'BANKE_BOOTSTRAP_REVISION_AVAILABLE') return;
      handleRevisionSignal({
        type: REVISION_SIGNAL_TYPE,
        revision: event.data.revision
      });
    });
  }

  async function connect({ getAccessToken }) {
    if (typeof getAccessToken !== 'function') throw new Error('PostgreSQL 登入缺少 Access Token provider。');
    client = window.BankePostgresApi.createClient({
      baseUrl: environment.postgresApiUrl,
      getAccessToken,
      getWorkspaceId: async () => environment.postgresWorkspaceId,
      onCommandRevision: announceRevision
    });
    await client.readiness();
    await client.establishSession();
    const bootstrap = await refreshBootstrap();
    lastForegroundCompletedAt = Date.now();
    lastUserActivityAt = Date.now();
    startForegroundPolling();
    return bootstrap;
  }

  async function executeAndRefresh(commandName, input) {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    const result = await client.executeCommand(commandName, input);
    await refreshBootstrap();
    return result;
  }

  const saveEmployeeLeave = (month, dates) => executeAndRefresh('leaves.replace-month', { month, dates });
  const saveBossLeave = (employeeId, month, dates) => executeAndRefresh(
    'leaves.replace-month',
    { employeeId, month, dates }
  );
  const clockInEmployee = () => executeAndRefresh('attendance.clock-in', {});
  const clockOutEmployee = () => executeAndRefresh('attendance.clock-out', {});
  const createEmployee = employee => executeAndRefresh('employees.create', {
    name: employee.name,
    phone: employee.phone,
    jobTitle: employee.role || '',
    hourlyRate: Number(employee.rate),
    leaveQuota: Number(employee.leaveQuota ?? 8)
  });
  const createShift = shift => executeAndRefresh('shifts.create', {
    employeeId: shift.employeeId,
    date: shift.date,
    startTime: shift.start,
    endTime: shift.end,
    note: shift.note || ''
  });
  const approveAttendanceHours = (attendanceId, hours, baseRevision) => executeAndRefresh(
    'attendance.approve-hours',
    { attendanceId, hours, baseRevision }
  );
  const listTimeOffRequests = () => {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    return client.listTimeOffRequests();
  };
  const submitScheduleLeaveRequest = input => executeAndRefresh('schedule-leave-requests.submit', input);
  const cancelScheduleLeaveRequest = (requestId, baseRevision) => executeAndRefresh(
    'schedule-leave-requests.cancel',
    { requestId, baseRevision }
  );
  const submitLeaveRequest = input => executeAndRefresh('leave-requests.submit', input);
  const cancelLeaveRequest = (requestId, baseRevision) => executeAndRefresh(
    'leave-requests.cancel',
    { requestId, baseRevision }
  );
  const approveTimeOffRequest = (requestId, baseRevision, reviewNote = '') => executeAndRefresh(
    'time-off-requests.approve',
    { requestId, baseRevision, reviewNote }
  );
  const rejectTimeOffRequest = (requestId, baseRevision, reviewNote = '') => executeAndRefresh(
    'time-off-requests.reject',
    { requestId, baseRevision, reviewNote }
  );

  async function logout() {
    const activeClient = client;
    stopForegroundSync();
    client = null;
    currentSession = null;
    currentUser = null;
    foregroundFailureReported = false;
    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    stateStore.clearSensitive();
    document.dispatchEvent(new CustomEvent('postgres-session-cleared'));
    if (activeClient) await activeClient.logout();
  }

  initializeRevisionSignals();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handleForegroundEntry);
  window.addEventListener('focus', handleForegroundEntry);
  window.addEventListener('online', handleForegroundEntry);
  window.addEventListener('offline', stopForegroundSync);
  ['pointerdown', 'keydown', 'touchstart'].forEach(type =>
    window.addEventListener(type, handleActivity, { passive: true }));
  window.addEventListener('pagehide', stopForegroundSync);
  window.addEventListener('beforeunload', () => {
    stopForegroundSync();
    revisionChannel?.close();
    revisionChannel = null;
  });
  document.addEventListener('postgres-session-cleared', stopForegroundSync);

  window.shiftPostgresCloud = Object.freeze({
    connect,
    logout,
    refreshBootstrap,
    saveEmployeeLeave,
    saveBossLeave,
    clockInEmployee,
    clockOutEmployee,
    createEmployee,
    createShift,
    approveAttendanceHours,
    listTimeOffRequests,
    submitScheduleLeaveRequest,
    cancelScheduleLeaveRequest,
    submitLeaveRequest,
    cancelLeaveRequest,
    approveTimeOffRequest,
    rejectTimeOffRequest,
    hasEmployeeSession: isEmployeeSession,
    isConnected: () => Boolean(currentSession),
    getSession: () => currentSession,
    getCurrentUser: () => currentUser
  });

  const cloudStatus = document.querySelector('#cloudStatus');
  if (cloudStatus) cloudStatus.textContent = 'PostgreSQL Staging';
})();
