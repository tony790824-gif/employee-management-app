(() => {
  'use strict';

  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;
  const cloud = window.shiftPostgresCloud;
  const dom = window.shiftDomSafety;
  const navigation = window.shiftNotificationNavigation;
  const trigger = document.querySelector('#notificationButton');
  const badge = document.querySelector('#notificationBadge');
  const dialog = document.querySelector('#notificationDialog');
  const close = document.querySelector('#notificationClose');
  const markAll = document.querySelector('#notificationMarkAllRead');
  const summary = document.querySelector('#notificationSummary');
  const message = document.querySelector('#notificationMessage');
  const list = document.querySelector('#notificationList');
  const preferenceClock = document.querySelector('#notificationClockEvents');
  const preferenceLeave = document.querySelector('#notificationLeaveEvents');
  const preferenceShift = document.querySelector('#notificationShiftEvents');
  const preferenceSave = document.querySelector('#notificationPreferenceSave');
  const pushSettings = document.querySelector('#pushNotificationSettings');
  const pushStatusText = document.querySelector('#pushNotificationStatus');
  const pushHelp = document.querySelector('#pushNotificationHelp');
  const pushEnable = document.querySelector('#pushNotificationEnable');
  const pushDisable = document.querySelector('#pushNotificationDisable');
  const pushRepair = document.querySelector('#pushNotificationRepair');
  const pushTest = document.querySelector('#pushNotificationTest');
  if (!cloud || !dom || !navigation || !trigger || !badge || !dialog || !close || !markAll || !summary || !message || !list) return;

  let items = [];
  let unreadCount = 0;
  let preferences = Object.freeze({ clockEvents: true, leaveEvents: true, shiftEvents: true, revision: 0 });
  let loadPromise = null;
  let mutationPromise = null;
  let preferenceMutationPromise = null;
  let pushMutationPromise = null;
  let pushStatusPromise = null;
  let currentPushSubscription = null;
  let currentPushClientMode = null;
  let pushAvailable = false;
  let activePushSubscriptionCount = 0;
  let registrationPushManagerAvailable = null;
  let lastPushSupportDiagnostic = '';
  let pendingNotificationDestination = '';
  const configuredPushTimeout = Number(window.shiftEnvironment?.pushOperationTimeoutMs);
  const PUSH_BROWSER_OPERATION_TIMEOUT_MS = Number.isSafeInteger(configuredPushTimeout)
    && configuredPushTimeout >= 1
    && configuredPushTimeout <= 60000
    ? configuredPushTimeout
    : 15000;
  const PUSH_DIAGNOSTIC_STAGES = new Set([
    'permission-before',
    'permission-after',
    'subscribe-start',
    'subscribe-complete',
    'subscribe-failed'
  ]);
  const pushErrorMessages = Object.freeze({
    PUSH_RATE_LIMITED: '測試通知次數已達安全上限，請在 10 分鐘後再試。',
    PUSH_SUBSCRIPTION_NOT_FOUND: '此裝置的推播註冊已失效，請按「重新註冊」後再試。',
    PUSH_SUBSCRIPTION_CONFLICT: '此瀏覽器的推播訂閱已綁定其他測試帳號，請重新註冊。',
    COMMAND_INVALID: '測試通知資料格式無效，請重新註冊後再試。',
    COMMAND_FORBIDDEN: '目前帳號沒有使用測試通知的權限。',
    WORKSPACE_ACCESS_DENIED: '目前帳號無法在這個工作區使用測試通知。',
    WEB_PUSH_UNAVAILABLE: '測試環境的背景推播服務暫時無法使用。',
    ORIGIN_NOT_ALLOWED: '此測試網址尚未加入允許清單。',
    PUSH_PERMISSION_TIMEOUT: 'Edge 尚未完成此測試網址的通知授權。請點網址列左側圖示 →「此網站的權限」→「通知」→「允許」，再重新整理。',
    PUSH_PERMISSION_DENIED: 'Edge 已拒絕此測試網址的通知權限。請點網址列左側圖示 →「此網站的權限」→「通知」→「允許」，再重新整理。',
    PUSH_PERMISSION_REQUIRED: '尚未完成此測試網址的通知授權，請允許通知後再試。',
    PUSH_SERVICE_WORKER_TIMEOUT: '瀏覽器背景服務尚未就緒，請重新整理頁面後再試。',
    PUSH_SUBSCRIPTION_LOOKUP_TIMEOUT: '無法讀取此裝置的推播狀態，請關閉並重新開啟瀏覽器後再試。',
    PUSH_SUBSCRIPTION_CREATE_TIMEOUT: '瀏覽器未能完成推播訂閱，請確認 Windows 通知服務與網路後再試。',
    POSTGRES_API_TIMEOUT: '推播服務回應逾時，請稍後再試。',
    POSTGRES_API_UNAVAILABLE: '目前無法連線推播服務，請確認網路後再試。',
    SESSION_INVALID: '登入狀態已失效，請重新登入。',
    TOKEN_SESSION_INVALID: '登入狀態已失效，請重新登入。'
  });

  const pushSupportSnapshot = () => Object.freeze({
    Notification: 'Notification' in window,
    ServiceWorker: 'serviceWorker' in navigator,
    PushManager: 'PushManager' in window,
    ServiceWorkerRegistration: 'ServiceWorkerRegistration' in window,
    SecureContext: window.isSecureContext === true,
    WebPushPublicKey: Boolean(window.shiftEnvironment?.webPushPublicKey),
    registrationPushManager: registrationPushManagerAvailable
  });
  const pushBrowserCapable = support => Boolean(
    support.Notification
    && support.ServiceWorker
    && support.PushManager
    && support.ServiceWorkerRegistration
    && support.SecureContext
  );
  const pushCapable = () => {
    const support = pushSupportSnapshot();
    return pushBrowserCapable(support)
      && support.WebPushPublicKey
      && support.registrationPushManager === true;
  };
  const unavailablePushCapabilities = () => Object.entries(pushSupportSnapshot())
    .filter(([, supported]) => supported === false)
    .map(([name]) => `support.${name} = false`);
  function logPushSupport() {
    if (window.shiftEnvironment?.name !== 'staging') return;
    const support = pushSupportSnapshot();
    const diagnostic = Object.freeze(Object.fromEntries(
      Object.entries(support).map(([name, value]) => [`support.${name}`, value])
    ));
    const serialized = JSON.stringify(diagnostic);
    if (serialized === lastPushSupportDiagnostic) return;
    lastPushSupportDiagnostic = serialized;
    window.console?.info?.('[Bankeban push support]', diagnostic);
  }
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone === true;
  const isIPadOs = () => /ipad/i.test(navigator.userAgent || '')
    || (String(navigator.platform || '') === 'MacIntel'
      && Number(navigator.maxTouchPoints || 0) > 1);
  const isAppleMobile = () => /iphone|ipod/i.test(navigator.userAgent || '') || isIPadOs();
  const base64UrlBytes = value => {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob((value + padding).replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  };
  const platform = () => {
    const agent = String(navigator.userAgent || '').toLowerCase();
    if (isIPadOs()) return 'ipados';
    if (agent.includes('iphone') || agent.includes('ipod')) return 'ios';
    if (agent.includes('android')) return 'android';
    if (agent.includes('windows')) return 'windows';
    if (agent.includes('mac os')) return 'macos';
    if (agent.includes('linux')) return 'linux';
    return 'unknown';
  };

  function subscriptionInput(subscription) {
    const value = subscription?.toJSON?.();
    if (!value?.endpoint || !value.keys?.p256dh || !value.keys?.auth) {
      throw new Error('瀏覽器推播訂閱格式不正確，請重新註冊。');
    }
    return {
      endpoint: value.endpoint,
      expirationTime: value.expirationTime === 0 ? null : (value.expirationTime ?? null),
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
      userAgent: String(navigator.userAgent || '').slice(0, 256),
      platform: platform(),
      clientMode: window.shiftPwaContext?.mode?.() === 'pwa' ? 'pwa' : 'browser'
    };
  }

  const validNotification = item => item
    && typeof item === 'object'
    && /^[a-f0-9-]{36}$/i.test(String(item.id || ''))
    && typeof item.type === 'string'
    && typeof item.title === 'string'
    && item.title.length >= 1
    && item.title.length <= 120
    && typeof item.body === 'string'
    && item.body.length >= 1
    && item.body.length <= 500
    && Number.isSafeInteger(Number(item.revision))
    && Number(item.revision) >= 0;

  function setMessage(value = '') {
    message.hidden = !value;
    message.textContent = value;
  }

  function pushErrorMessage(error, fallback) {
    const code = String(error?.code || '');
    if (isAppleMobile()) {
      const appleMessage = {
        PUSH_PERMISSION_TIMEOUT: 'iPhone／iPad 尚未完成通知授權。請確認從主畫面開啟班客邦，並到「設定」→「通知」允許通知後再試。',
        PUSH_PERMISSION_DENIED: 'iPhone／iPad 已拒絕通知權限。請到「設定」→「通知」允許班客邦通知，再回到主畫面 PWA 重試。',
        PUSH_PERMISSION_REQUIRED: 'iPhone／iPad 尚未允許通知，請從主畫面 PWA 重新啟用。',
        PUSH_SUBSCRIPTION_CREATE_TIMEOUT: 'iPhone／iPad 未能完成推播訂閱，請確認通知權限與網路後再試。',
        PUSH_APPLE_HOME_SCREEN_REQUIRED: 'iPhone／iPad 必須先加入主畫面，再從主畫面開啟才能啟用推播。'
      }[code];
      if (appleMessage) return appleMessage;
    }
    if (code) return pushErrorMessages[code] || fallback;
    if (error?.name === 'NotAllowedError') return '瀏覽器未允許通知，請確認網站通知權限後再試。';
    if (error?.name === 'AbortError') return '瀏覽器中止了推播訂閱，請確認網路後再試。';
    return fallback;
  }

  function withPushBrowserTimeout(promise, code) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(code);
        error.code = code;
        reject(error);
      }, PUSH_BROWSER_OPERATION_TIMEOUT_MS);
      Promise.resolve(promise).then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function pushDiagnostic(stage, {
    permission = '',
    userActivation = null,
    errorCode = ''
  } = {}) {
    if (window.shiftEnvironment?.name !== 'staging' || !PUSH_DIAGNOSTIC_STAGES.has(stage)) return;
    const safePermission = ['default', 'denied', 'granted'].includes(permission)
      ? permission
      : undefined;
    const safeErrorCode = String(errorCode || '').replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
    window.console?.info?.('[Bankeban push setup]', Object.freeze({
      stage,
      ...(safePermission ? { permission: safePermission } : {}),
      ...(typeof userActivation === 'boolean' ? { userActivation } : {}),
      ...(safeErrorCode ? { errorCode: safeErrorCode } : {})
    }));
  }

  function formatTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function render() {
    const normalizedUnread = Math.max(0, Number(unreadCount) || 0);
    badge.hidden = normalizedUnread === 0;
    badge.textContent = normalizedUnread > 99 ? '99+' : String(normalizedUnread);
    badge.setAttribute('aria-label', `${normalizedUnread} 則未讀通知`);
    summary.textContent = normalizedUnread ? `${normalizedUnread} 則未讀通知` : '沒有未讀通知';
    markAll.disabled = normalizedUnread === 0 || Boolean(mutationPromise);
    renderPushSettings();

    if (!items.length) {
      dom.replace(list, dom.element('p', { className: 'notification-empty', text: '目前沒有通知。' }));
      return;
    }
    dom.replace(list, ...items.map(item => {
      const unread = !item.readAt;
      const button = dom.element('button', {
        className: `notification-item${unread ? ' is-unread' : ''}`,
        attributes: {
          type: 'button',
          'aria-label': `${unread ? '未讀：' : ''}${item.title}`
        }
      }, [
        dom.element('span', { className: 'notification-item-heading' }, [
          dom.element('span', { className: 'notification-item-title', text: item.title }),
          dom.element('time', {
            className: 'notification-item-time',
            text: formatTime(item.createdAt),
            attributes: { datetime: String(item.createdAt || '') }
          })
        ]),
        dom.element('p', { className: 'notification-item-body', text: item.body })
      ]);
      button.disabled = Boolean(mutationPromise);
      button.addEventListener('click', () => {
        const path = navigation.pathForNotification(item);
        openNotificationDestination(path);
        if (unread) void markRead(item);
      });
      return button;
    }));
  }

  function renderPreferences() {
    if (!preferenceClock || !preferenceLeave || !preferenceShift || !preferenceSave) return;
    preferenceClock.checked = preferences.clockEvents;
    preferenceLeave.checked = preferences.leaveEvents;
    preferenceShift.checked = preferences.shiftEvents;
    preferenceSave.disabled = Boolean(preferenceMutationPromise);
  }

  function renderPushSettings() {
    if (!pushSettings || !pushStatusText || !pushHelp || !pushEnable || !pushDisable || !pushRepair || !pushTest) return;
    pushSettings.hidden = !pushAvailable;
    if (!pushAvailable) return;
    const busy = Boolean(pushMutationPromise);
    const denied = pushCapable() && Notification.permission === 'denied';
    const registered = Boolean(currentPushSubscription) && activePushSubscriptionCount > 0;
    const needsRepair = Boolean(currentPushSubscription) && activePushSubscriptionCount === 0;
    pushEnable.hidden = registered || needsRepair || denied;
    pushDisable.hidden = !registered;
    pushRepair.hidden = !registered && !needsRepair;
    pushTest.hidden = !registered;
    [pushEnable, pushDisable, pushRepair, pushTest].forEach(button => { button.disabled = busy; });
    if (!pushCapable()) {
      const unavailable = unavailablePushCapabilities();
      pushStatusText.textContent = unavailable.length
        ? `背景推播尚不可用：${unavailable.join('、')}`
        : '背景推播能力仍在初始化，請稍後再試。';
      pushHelp.textContent = isAppleMobile() && !isStandalone()
        ? 'iPhone／iPad 請先將網站加入主畫面，再從主畫面開啟並啟用推播。'
        : '請依上方未通過的能力項目檢查瀏覽器或 Staging 建置設定。';
      pushEnable.hidden = true;
      return;
    }
    if (denied) {
      pushStatusText.textContent = '通知權限已被瀏覽器封鎖';
      pushHelp.textContent = '請到瀏覽器或系統設定允許通知後，再回來重新註冊。';
      return;
    }
    pushStatusText.textContent = registered
      ? `此裝置已啟用背景推播（目前帳號共 ${activePushSubscriptionCount} 個有效裝置）`
      : needsRepair ? '此裝置的推播訂閱需要重新註冊' : '此裝置尚未啟用背景推播';
    pushHelp.textContent = registered
      ? '推播是通知中心的傳送方式；完整通知仍以通知中心為準。'
      : needsRepair
        ? '目前瀏覽器訂閱與登入 Session 不一致，請按「重新註冊」。'
      : '只有按下「啟用推播」後，瀏覽器才會詢問通知權限。';
  }

  function refreshPushStatus() {
    if (!pushSettings || !cloud.isConnected()) return Promise.resolve(null);
    if (pushStatusPromise) return pushStatusPromise;
    const operation = (async () => {
      try {
        const status = await cloud.pushStatus();
        pushAvailable = status?.ok === true && status?.available !== false;
        activePushSubscriptionCount = Number.isSafeInteger(Number(status?.activeSubscriptionCount))
          ? Math.max(0, Number(status.activeSubscriptionCount))
          : 0;
        registrationPushManagerAvailable = null;
        const initialSupport = pushSupportSnapshot();
        if (pushBrowserCapable(initialSupport)) {
          try {
            const registration = await navigator.serviceWorker.ready;
            registrationPushManagerAvailable = Boolean(registration?.pushManager);
            currentPushSubscription = registrationPushManagerAvailable
              ? await registration.pushManager.getSubscription()
              : null;
            if (!currentPushSubscription) currentPushClientMode = null;
            const detectedMode = window.shiftPwaContext?.mode?.() === 'pwa' ? 'pwa' : 'browser';
            if (currentPushSubscription && detectedMode === 'pwa' && currentPushClientMode !== 'pwa') {
              try {
                await cloud.registerPushSubscription(subscriptionInput(currentPushSubscription));
                currentPushClientMode = 'pwa';
                activePushSubscriptionCount = Math.max(1, activePushSubscriptionCount);
              } catch (error) {
                pushDiagnostic('subscription-metadata-failed', {
                  errorCode: error?.code || error?.name || 'UNKNOWN'
                });
              }
            }
          } catch {
            registrationPushManagerAvailable = false;
            currentPushSubscription = null;
            currentPushClientMode = null;
          }
        } else {
          registrationPushManagerAvailable = false;
          currentPushSubscription = null;
          currentPushClientMode = null;
        }
        logPushSupport();
        renderPushSettings();
        return status;
      } catch {
        pushAvailable = false;
        activePushSubscriptionCount = 0;
        currentPushSubscription = null;
        currentPushClientMode = null;
        logPushSupport();
        renderPushSettings();
        return null;
      }
    })();
    pushStatusPromise = operation;
    return operation.finally(() => {
      if (pushStatusPromise === operation) pushStatusPromise = null;
    });
  }

  function startPushActivation({ replace = false } = {}) {
    if (pushMutationPromise) {
      setMessage('推播設定正在處理，請稍候。');
      return;
    }
    if (!pushCapable()) {
      setMessage('此瀏覽器或目前環境不支援背景推播。');
      return;
    }
    const permissionBefore = Notification.permission;
    pushDiagnostic('permission-before', {
      permission: permissionBefore,
      userActivation: navigator.userActivation?.isActive === true
    });
    let permissionRequest;
    try {
      permissionRequest = permissionBefore === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(permissionBefore);
    } catch (error) {
      pushDiagnostic('permission-after', {
        permission: Notification.permission,
        errorCode: error?.name || 'UNKNOWN'
      });
      setMessage(pushErrorMessage(error, '無法取得通知權限，請確認 Edge 網站權限後再試。'));
      return;
    }
    void enablePush({ replace, permissionBefore, permissionRequest });
  }

  async function enablePush({ replace = false, permissionBefore, permissionRequest }) {
    const operation = (async () => {
      let permission = permissionBefore;
      let permissionAfterLogged = false;
      let subscriptionReady = false;
      let subscribeFailureLogged = false;
      try {
        setMessage('正在啟用背景推播…');
        if (isAppleMobile() && !isStandalone()) {
          const error = new Error('Apple Home Screen PWA required');
          error.code = 'PUSH_APPLE_HOME_SCREEN_REQUIRED';
          throw error;
        }
        if (permission === 'default') {
          setMessage('正在確認此測試網址的通知權限…');
          try {
            permission = await withPushBrowserTimeout(
              permissionRequest,
              'PUSH_PERMISSION_TIMEOUT'
            );
          } catch (error) {
            permission = Notification.permission;
            if (permission === 'denied') error.code = 'PUSH_PERMISSION_DENIED';
            pushDiagnostic('permission-after', {
              permission,
              errorCode: error?.code || error?.name || 'UNKNOWN'
            });
            permissionAfterLogged = true;
            if (error?.code !== 'PUSH_PERMISSION_TIMEOUT' || permission !== 'granted') throw error;
          }
        }
        if (!permissionAfterLogged) pushDiagnostic('permission-after', { permission });
        if (permission !== 'granted') {
          const error = new Error('Push permission unavailable');
          error.code = permission === 'denied' ? 'PUSH_PERMISSION_DENIED' : 'PUSH_PERMISSION_REQUIRED';
          throw error;
        }
        setMessage('正在連接瀏覽器推播服務…');
        const registration = await withPushBrowserTimeout(
          navigator.serviceWorker.ready,
          'PUSH_SERVICE_WORKER_TIMEOUT'
        );
        let subscription = await withPushBrowserTimeout(
          registration.pushManager.getSubscription(),
          'PUSH_SUBSCRIPTION_LOOKUP_TIMEOUT'
        );
        if (replace && subscription) {
          await cloud.unregisterPushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
          subscription = null;
        }
        if (!subscription) {
          pushDiagnostic('subscribe-start');
          try {
            subscription = await withPushBrowserTimeout(registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: base64UrlBytes(window.shiftEnvironment.webPushPublicKey)
            }), 'PUSH_SUBSCRIPTION_CREATE_TIMEOUT');
            pushDiagnostic('subscribe-complete');
          } catch (error) {
            pushDiagnostic('subscribe-failed', {
              errorCode: error?.code || error?.name || 'UNKNOWN'
            });
            subscribeFailureLogged = true;
            throw error;
          }
        }
        subscriptionReady = true;
        setMessage('正在儲存此裝置的推播設定…');
        await cloud.registerPushSubscription(subscriptionInput(subscription));
        currentPushSubscription = subscription;
        currentPushClientMode = window.shiftPwaContext?.mode?.() === 'pwa' ? 'pwa' : 'browser';
        activePushSubscriptionCount = Math.max(1, activePushSubscriptionCount);
        setMessage('此裝置已啟用背景推播。');
      } catch (error) {
        if (permission === 'granted' && !subscriptionReady && !subscribeFailureLogged) {
          pushDiagnostic('subscribe-failed', {
            errorCode: error?.code || error?.name || 'UNKNOWN'
          });
        }
        setMessage(pushErrorMessage(error, '無法啟用背景推播，請稍後再試。'));
      }
    })();
    pushMutationPromise = operation;
    renderPushSettings();
    try {
      await operation;
    } finally {
      if (pushMutationPromise === operation) pushMutationPromise = null;
      renderPushSettings();
    }
  }

  async function disablePush() {
    if (pushMutationPromise || !currentPushSubscription) return;
    pushMutationPromise = (async () => {
      try {
        const subscription = currentPushSubscription;
        await cloud.unregisterPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
        currentPushSubscription = null;
        currentPushClientMode = null;
        activePushSubscriptionCount = Math.max(0, activePushSubscriptionCount - 1);
        setMessage('此裝置的背景推播已停用。');
      } catch (error) {
        setMessage(pushErrorMessage(error, '無法停用背景推播，請稍後再試。'));
      } finally {
        pushMutationPromise = null;
        renderPushSettings();
      }
    })();
    await pushMutationPromise;
  }

  async function unregisterCurrentPushForLogout() {
    if (!currentPushSubscription || pushMutationPromise) return false;
    const subscription = currentPushSubscription;
    await cloud.unregisterPushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
    currentPushSubscription = null;
    currentPushClientMode = null;
    activePushSubscriptionCount = Math.max(0, activePushSubscriptionCount - 1);
    return true;
  }

  async function testPush() {
    if (pushMutationPromise || !currentPushSubscription) return;
    pushMutationPromise = (async () => {
      try {
        await cloud.sendTestPush(currentPushSubscription.endpoint);
        setMessage('測試通知已排入傳送；請稍候查看系統通知。');
      } catch (error) {
        setMessage(pushErrorMessage(error, '測試通知無法傳送，請稍後再試。'));
      } finally {
        pushMutationPromise = null;
        renderPushSettings();
      }
    })();
    await pushMutationPromise;
  }

  function normalizePayload(payload) {
    if (payload?.ok === true && payload.available === false) {
      return { items: [], unreadCount: 0, available: false };
    }
    if (!payload || payload.ok !== true || !Array.isArray(payload.items)
      || !Number.isSafeInteger(Number(payload.unreadCount)) || Number(payload.unreadCount) < 0) {
      throw new Error('通知資料格式無效。');
    }
    const normalized = payload.items.filter(validNotification).map(item => Object.freeze({
      id: String(item.id),
      type: String(item.type),
      title: String(item.title),
      body: String(item.body),
      resourceType: item.resourceType == null ? null : String(item.resourceType),
      resourceId: item.resourceId == null ? null : String(item.resourceId),
      readAt: item.readAt == null ? null : String(item.readAt),
      createdAt: String(item.createdAt || ''),
      revision: Number(item.revision)
    }));
    if (normalized.length !== payload.items.length) throw new Error('通知資料包含無效欄位。');
    const rawPreferences = payload.preferences ?? {
      clockEvents: true, leaveEvents: true, shiftEvents: true, revision: 0
    };
    if (!rawPreferences || typeof rawPreferences !== 'object'
      || typeof rawPreferences.clockEvents !== 'boolean'
      || typeof rawPreferences.leaveEvents !== 'boolean'
      || typeof rawPreferences.shiftEvents !== 'boolean'
      || !Number.isSafeInteger(Number(rawPreferences.revision))
      || Number(rawPreferences.revision) < 0) {
      throw new Error('通知偏好設定格式無效。');
    }
    return {
      items: normalized,
      unreadCount: Number(payload.unreadCount),
      available: true,
      preferences: Object.freeze({
        clockEvents: rawPreferences.clockEvents,
        leaveEvents: rawPreferences.leaveEvents,
        shiftEvents: rawPreferences.shiftEvents,
        revision: Number(rawPreferences.revision)
      })
    };
  }

  async function loadNotifications({ silent = false } = {}) {
    if (!cloud.isConnected()) return null;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const next = normalizePayload(await cloud.listNotifications());
        items = next.items;
        unreadCount = next.unreadCount;
        if (next.preferences) preferences = next.preferences;
        trigger.hidden = !next.available;
        if (!next.available && dialog.open) dialog.close();
        setMessage();
        render();
        renderPreferences();
        return next;
      } catch (error) {
        if (!silent) setMessage(error?.message || '通知載入失敗，請稍後再試。');
        return null;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  async function markRead(item) {
    if (mutationPromise || item?.readAt) return;
    mutationPromise = (async () => {
      try {
        await cloud.markNotificationRead(item.id, item.revision);
        await loadNotifications();
      } catch (error) {
        setMessage(error?.message || '通知狀態更新失敗，請稍後再試。');
      } finally {
        mutationPromise = null;
        render();
      }
    })();
    await mutationPromise;
  }

  async function markAllRead() {
    if (mutationPromise || unreadCount === 0) return;
    mutationPromise = (async () => {
      try {
        await cloud.markAllNotificationsRead();
        await loadNotifications();
      } catch (error) {
        setMessage(error?.message || '通知狀態更新失敗，請稍後再試。');
      } finally {
        mutationPromise = null;
        render();
      }
    })();
    await mutationPromise;
  }

  async function savePreferences() {
    if (preferenceMutationPromise || !preferenceClock || !preferenceLeave || !preferenceShift) return;
    const next = Object.freeze({
      clockEvents: preferenceClock.checked === true,
      leaveEvents: preferenceLeave.checked === true,
      shiftEvents: preferenceShift.checked === true
    });
    preferenceMutationPromise = (async () => {
      try {
        const result = await cloud.updateNotificationPreferences(next);
        preferences = Object.freeze({ ...next, revision: Number(result?.data?.revision || 0) });
        setMessage('通知設定已儲存。');
      } catch (error) {
        renderPreferences();
        setMessage(error?.message || '通知設定無法儲存，請稍後再試。');
      } finally {
        preferenceMutationPromise = null;
        renderPreferences();
      }
    })();
    renderPreferences();
    await preferenceMutationPromise;
  }

  const openNotificationCenter = () => {
    if (!cloud.isConnected()) return false;
    setMessage();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void loadNotifications();
    void refreshPushStatus();
    return true;
  };
  const openNotificationDestination = path => {
    const target = navigation.targetForPath(path);
    if (!target) return false;
    if (!cloud.isConnected()) {
      pendingNotificationDestination = path;
      return false;
    }
    pendingNotificationDestination = '';
    if (target === 'notifications') return openNotificationCenter();
    if (dialog.open) dialog.close();
    if (target === 'announcements') return navigation.openAnnouncement(path);
    if (target === 'time-off' && window.shiftTimeOffUi?.activate) {
      window.shiftTimeOffUi.activate();
      return true;
    }
    const tab = document.querySelector(`[data-tab="${target}"]`);
    if (!tab || typeof tab.click !== 'function') return false;
    tab.click();
    return true;
  };
  trigger.addEventListener('click', openNotificationCenter);
  close.addEventListener('click', () => dialog.close());
  markAll.addEventListener('click', () => void markAllRead());
  preferenceSave?.addEventListener('click', () => void savePreferences());
  pushEnable?.addEventListener('click', () => startPushActivation());
  pushDisable?.addEventListener('click', () => void disablePush());
  pushRepair?.addEventListener('click', () => startPushActivation({ replace: true }));
  pushTest?.addEventListener('click', () => void testPush());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener('postgres-bootstrap-refreshed', () => {
    void loadNotifications({ silent: true });
    void refreshPushStatus();
    if (pendingNotificationDestination) openNotificationDestination(pendingNotificationDestination);
  });
  document.addEventListener('postgres-session-cleared', () => {
    items = [];
    unreadCount = 0;
    preferences = Object.freeze({ clockEvents: true, leaveEvents: true, shiftEvents: true, revision: 0 });
    pushAvailable = false;
    activePushSubscriptionCount = 0;
    currentPushSubscription = null;
    currentPushClientMode = null;
    pushStatusPromise = null;
    registrationPushManagerAvailable = null;
    lastPushSupportDiagnostic = '';
    trigger.hidden = true;
    setMessage();
    render();
    renderPreferences();
    if (dialog.open) dialog.close();
  });
  window.navigator?.serviceWorker?.addEventListener?.('message', event => {
    if (event.data?.type === 'BANKE_PUSH_SUBSCRIPTION_CHANGED') {
      currentPushSubscription = null;
      currentPushClientMode = null;
      renderPushSettings();
      setMessage('推播訂閱已變更，請重新註冊此裝置。');
    }
    if (event.data?.type === 'BANKE_OPEN_NOTIFICATION_CENTER') {
      openNotificationDestination('/?open=notifications');
    }
    if (event.data?.type === 'BANKE_OPEN_NOTIFICATION_DESTINATION') {
      openNotificationDestination(event.data.path);
    }
  });
  const openTarget = typeof URLSearchParams === 'function'
    ? new URLSearchParams(window.location?.search || '').get('open')
    : '';
  const openFromPush = navigation.pathForTarget(openTarget);
  if (openFromPush) {
    window.addEventListener('load', () => {
      openNotificationDestination(openFromPush);
    }, { once: true });
  }

  window.shiftNotificationCenter = Object.freeze({
    unregisterCurrentPushForLogout
  });
  render();
  renderPreferences();
  void loadNotifications({ silent: true });
  void refreshPushStatus();
})();
