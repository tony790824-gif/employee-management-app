(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.dataBackend !== 'postgres') return;

  const stateStore = window.shiftStateStore;
  const workspacePattern = /^ws_[a-f0-9]{32}$/;
  const ownerBindingPattern = /^[a-f0-9]{64}$/;
  let client = null;
  let currentSession = null;
  let currentUser = null;
  let identityBinding = '';
  let commandRevision = null;
  let offlineRetryTimer = null;
  let foregroundDebounceTimer = null;
  let foregroundPollTimer = null;
  let foregroundPromise = null;
  let foregroundFailureReported = false;
  let foregroundSyncActivated = false;
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
  const OFFLINE_OWNER_KEY = environment.storageKey('postgres-offline-owner-v1');
  let offlineRuntime = null;
  try {
    offlineRuntime = window.BankePostgresOffline?.create({
      storageKey: environment.storageKey('postgres-offline-v1')
    }) || null;
  } catch (error) {
    console.warn('PostgreSQL offline storage unavailable', { code: error?.code || 'OFFLINE_STORAGE_UNAVAILABLE' });
  }
  const offlinePanel = document.querySelector('#offlineSyncStatus');
  const offlineMessage = document.querySelector('#offlineSyncMessage');
  const offlineDiscard = document.querySelector('#offlineSyncDiscard');

  const isEmployeeSession = () => currentSession?.role === 'employee' && Boolean(currentSession.employeeId);

  function updateOfflineStatus({ conflict = false, failed = false } = {}) {
    if (!offlinePanel || !offlineMessage || !offlineRuntime || !currentSession) {
      if (offlinePanel) offlinePanel.hidden = true;
      return;
    }
    const queue = offlineRuntime.queueSnapshot();
    const pending = queue.filter(item => item.status === 'pending').length;
    const hasConflict = conflict || queue.some(item => item.status === 'conflict');
    const hasFailed = failed || queue.some(item => item.status === 'failed');
    const hasClockInConflict = queue.some(item => item.status === 'failed'
      && item.commandName === 'attendance.clock-in' && item.errorCode === 'RESOURCE_CONFLICT');
    offlinePanel.hidden = window.navigator?.onLine !== false && !queue.length;
    offlineDiscard.hidden = !hasConflict && !hasFailed;
    offlineMessage.textContent = hasConflict
      ? '伺服器資料已更新，待同步操作未自動送出。請放棄後重新確認並操作。'
      : hasClockInConflict
        ? '你仍有一筆尚未打卡下班的紀錄，請先完成下班打卡。'
        : hasFailed
          ? '有待同步操作被伺服器拒絕，請放棄後重新確認並操作。'
          : pending
            ? `離線模式：${pending} 筆操作等待安全同步。`
            : '目前離線，畫面顯示最近一次安全同步資料。';
  }

  function fallbackOwnerBinding() {
    let value = String(sessionStorage.getItem(OFFLINE_OWNER_KEY) || '');
    if (!ownerBindingPattern.test(value)) {
      const entropy = window.crypto.randomUUID().replaceAll('-', '');
      value = `${entropy}${entropy}`;
      sessionStorage.setItem(OFFLINE_OWNER_KEY, value);
    }
    return value;
  }

  function bindOfflineOwner() {
    if (!offlineRuntime || !currentSession) return;
    try {
      offlineRuntime.bindOwner(identityBinding || fallbackOwnerBinding());
      updateOfflineStatus();
    } catch (error) {
      console.warn('PostgreSQL offline identity binding failed', { code: error?.code || 'OFFLINE_OWNER_INVALID' });
      offlineRuntime = null;
      if (offlinePanel) offlinePanel.hidden = true;
    }
  }

  function cacheOfflineResource(name, payload) {
    if (!offlineRuntime || !currentSession) return payload;
    try {
      offlineRuntime.cacheResource(name, payload);
    } catch (error) {
      console.warn('PostgreSQL offline cache write failed', { code: error?.code || 'OFFLINE_CACHE_FAILED' });
    }
    return payload;
  }

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
    bindOfflineOwner();
    cacheOfflineResource('bootstrap', bootstrap);
    sessionStorage.setItem(environment.storageKey('shift-postgres-auth'), JSON.stringify(currentSession));
    document.dispatchEvent(new CustomEvent('postgres-bootstrap-refreshed', {
      detail: { source, revision: nextRevision, changedSections, currentUserChanged }
    }));
    if (changed) announceRevision(nextRevision);
    return { ...bootstrap, changed: true };
  }

  const canRunForegroundSync = () => Boolean(
    foregroundSyncActivated
    && client
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
    if (offlineRuntime?.isDraining()) return null;
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

  async function connect({ getAccessToken, offlineIdentityBinding = '' }) {
    if (typeof getAccessToken !== 'function') throw new Error('PostgreSQL 登入缺少 Access Token provider。');
    if (offlineIdentityBinding && !ownerBindingPattern.test(offlineIdentityBinding)) {
      throw new Error('PostgreSQL 離線身份綁定格式不正確。');
    }
    identityBinding = offlineIdentityBinding;
    foregroundSyncActivated = false;
    stopForegroundSync();
    client = window.BankePostgresApi.createClient({
      baseUrl: environment.postgresApiUrl,
      getAccessToken,
      getWorkspaceId: async () => environment.postgresWorkspaceId,
      onCommandRevision: revision => {
        commandRevision = revision;
        announceRevision(revision);
      }
    });
    await client.readiness();
    await client.establishSession();
    const bootstrap = await refreshBootstrap();
    lastForegroundCompletedAt = Date.now();
    lastUserActivityAt = Date.now();
    void drainOfflineQueue();
    return bootstrap;
  }

  function activateForegroundSync() {
    if (!client || !currentSession) {
      throw new Error('PostgreSQL Staging Session 尚未完成，無法啟動同步。');
    }
    foregroundSyncActivated = true;
    lastUserActivityAt = Date.now();
    startForegroundPolling();
  }

  function cancelOfflineRetry() {
    if (offlineRetryTimer !== null) clearTimeout(offlineRetryTimer);
    offlineRetryTimer = null;
  }

  function scheduleOfflineRetry(retryAt) {
    cancelOfflineRetry();
    if (!Number.isFinite(retryAt) || retryAt <= 0 || !client || !currentSession
      || window.navigator?.onLine === false) return;
    offlineRetryTimer = setTimeout(() => {
      offlineRetryTimer = null;
      void drainOfflineQueue();
    }, Math.max(0, retryAt - Date.now()));
  }

  function offlineQueueResult(record) {
    updateOfflineStatus();
    document.dispatchEvent(new CustomEvent('postgres-offline-command-queued', {
      detail: { commandName: record.commandName, duplicate: Boolean(record.duplicate) }
    }));
    return Object.freeze({ ok: true, queued: true, duplicate: Boolean(record.duplicate) });
  }

  function enqueueOfflineCommand(commandName, input, idempotencyKey) {
    if (!offlineRuntime?.isQueueable(commandName)) {
      const error = new Error('這項操作必須連線後才能完成。');
      error.code = 'OFFLINE_COMMAND_NOT_ALLOWED';
      throw error;
    }
    const baseRevision = Number(stateStore.read()?.sync?.revision);
    const record = offlineRuntime.enqueue({ commandName, input, baseRevision, idempotencyKey });
    return offlineQueueResult(record);
  }

  async function drainOfflineQueue() {
    if (!offlineRuntime || !client || !currentSession || window.navigator?.onLine === false) {
      updateOfflineStatus();
      return null;
    }
    if (foregroundPromise) await foregroundPromise;
    cancelOfflineRetry();
    let outcome;
    try {
      outcome = await offlineRuntime.drain({
        getRevision: async () => validateRevision(await client.bootstrapRevision()),
        execute: async record => {
          commandRevision = null;
          const result = await client.executeCommand(record.commandName, record.input, {
            idempotencyKey: record.idempotencyKey
          });
          return { result, revision: commandRevision };
        },
        onChange: change => {
          updateOfflineStatus({ conflict: change.type === 'conflict', failed: change.type === 'failed' });
          document.dispatchEvent(new CustomEvent('postgres-offline-queue-changed', {
            detail: { type: change.type, commandName: change.record?.commandName || '' }
          }));
        }
      });
      if (outcome?.completed) await refreshBootstrap({ source: 'offline-recovery' });
      const hasClockInConflict = outcome?.failed && offlineRuntime.queueSnapshot().some(item =>
        item.status === 'failed' && item.commandName === 'attendance.clock-in'
        && item.errorCode === 'RESOURCE_CONFLICT');
      if (hasClockInConflict) {
        try {
          await refreshBootstrap({ source: 'offline-clock-in-conflict' });
        } catch (error) {
          console.warn('PostgreSQL attendance conflict refresh failed', {
            code: error?.code || 'ATTENDANCE_CONFLICT_REFRESH_FAILED',
            status: Number(error?.status || 0),
            requestId: error?.requestId || ''
          });
        }
      }
      scheduleOfflineRetry(outcome?.retryAt || 0);
      updateOfflineStatus({ conflict: outcome?.conflict, failed: outcome?.failed });
      if (foregroundSyncActivated) startForegroundPolling();
      return outcome;
    } catch (error) {
      if (!offlineRuntime.isNetworkError(error)) {
        console.warn('PostgreSQL offline queue drain failed', {
          code: error?.code || 'OFFLINE_DRAIN_FAILED',
          status: Number(error?.status || 0),
          requestId: error?.requestId || ''
        });
      }
      updateOfflineStatus();
      return null;
    }
  }

  async function executeAndRefresh(commandName, input) {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    const idempotencyKey = offlineRuntime ? window.crypto.randomUUID() : '';
    if (window.navigator?.onLine === false) return enqueueOfflineCommand(commandName, input, idempotencyKey);
    try {
      const result = await client.executeCommand(commandName, input,
        idempotencyKey ? { idempotencyKey } : undefined);
      await refreshBootstrap();
      return result;
    } catch (error) {
      if (offlineRuntime?.isNetworkError(error)) return enqueueOfflineCommand(commandName, input, idempotencyKey);
      throw error;
    }
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
  const listTimeOffRequests = async () => {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    if (window.navigator?.onLine === false) {
      const cached = offlineRuntime?.readResource('timeOff');
      if (cached) return cached;
    }
    try {
      return cacheOfflineResource('timeOff', await client.listTimeOffRequests());
    } catch (error) {
      const cached = offlineRuntime?.isNetworkError(error) && offlineRuntime.readResource('timeOff');
      if (cached) return cached;
      throw error;
    }
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
  const listNotifications = async () => {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    if (window.navigator?.onLine === false) {
      const cached = offlineRuntime?.readResource('notifications');
      if (cached) return cached;
    }
    try {
      return cacheOfflineResource('notifications', await client.listNotifications());
    } catch (error) {
      const cached = offlineRuntime?.isNetworkError(error) && offlineRuntime.readResource('notifications');
      if (cached) return cached;
      throw error;
    }
  };
  const markNotificationRead = (notificationId, baseRevision) => executeAndRefresh(
    'notifications.mark-read',
    { notificationId, baseRevision }
  );
  const markAllNotificationsRead = () => executeAndRefresh('notifications.mark-all-read', {});
  const updateNotificationPreferences = preferences => executeAndRefresh(
    'notifications.update-preferences', preferences
  );
  const pushStatus = () => {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    return client.pushStatus();
  };
  const registerPushSubscription = input => executeAndRefresh('push.register', input);
  const unregisterPushSubscription = endpoint => executeAndRefresh('push.unregister', { endpoint });
  const sendTestPush = endpoint => executeAndRefresh('push.test', { endpoint });

  async function logout() {
    const activeClient = client;
    foregroundSyncActivated = false;
    stopForegroundSync();
    cancelOfflineRetry();
    offlineRuntime?.clearAll();
    client = null;
    currentSession = null;
    currentUser = null;
    identityBinding = '';
    commandRevision = null;
    foregroundFailureReported = false;
    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    sessionStorage.removeItem(OFFLINE_OWNER_KEY);
    stateStore.clearSensitive();
    updateOfflineStatus();
    document.dispatchEvent(new CustomEvent('postgres-session-cleared'));
    if (activeClient) await activeClient.logout();
  }

  initializeRevisionSignals();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handleForegroundEntry);
  window.addEventListener('focus', handleForegroundEntry);
  window.addEventListener('online', () => {
    void drainOfflineQueue().finally(handleForegroundEntry);
  });
  window.addEventListener('offline', () => {
    stopForegroundSync();
    cancelOfflineRetry();
    updateOfflineStatus();
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(type =>
    window.addEventListener(type, handleActivity, { passive: true }));
  window.addEventListener('pagehide', stopForegroundSync);
  window.addEventListener('beforeunload', () => {
    stopForegroundSync();
    revisionChannel?.close();
    revisionChannel = null;
  });
  document.addEventListener('postgres-session-cleared', () => {
    foregroundSyncActivated = false;
    stopForegroundSync();
    cancelOfflineRetry();
  });
  offlineDiscard?.addEventListener('click', async () => {
    offlineRuntime?.clearQueue();
    updateOfflineStatus();
    if (client && currentSession && window.navigator?.onLine !== false) {
      try {
        await refreshBootstrap({ source: 'offline-conflict-discard' });
      } catch (error) {
        offlineMessage.textContent = '目前無法取得伺服器最新資料，請在網路穩定後再試一次。';
      }
    }
  });

  window.shiftPostgresCloud = Object.freeze({
    connect,
    activateForegroundSync,
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
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    updateNotificationPreferences,
    pushStatus,
    registerPushSubscription,
    unregisterPushSubscription,
    sendTestPush,
    drainOfflineQueue,
    getOfflineQueue: () => offlineRuntime?.queueSnapshot() || [],
    hasEmployeeSession: isEmployeeSession,
    isConnected: () => Boolean(currentSession),
    getSession: () => currentSession,
    getCurrentUser: () => currentUser
  });

  const cloudStatus = document.querySelector('#cloudStatus');
  if (cloudStatus) cloudStatus.textContent = 'PostgreSQL Staging';
})();
