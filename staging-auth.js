(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (!['staging', 'production'].includes(environment?.name)) return;
  if (window.shiftAuth) return;

  const environmentLabel = environment.name === 'production' ? 'Production' : 'Staging';
  const environmentLabelUpper = environmentLabel.toUpperCase();

  const authConfig = environment.auth;
  const loginButton = document.querySelector('#bossLogin');
  const employeeLoginButton = document.querySelector('#employeeLogin');
  const hint = document.querySelector('#loginHint');
  const phoneLabel = document.querySelector('#loginPhone')?.closest('label');
  const pinLabel = document.querySelector('#loginPinWrap');
  const activationLabel = document.querySelector('#loginActivationWrap');
  const auth0Sdk = window.auth0;
  const redirectUri = new URL('./', window.location.href).href;
  const sessionClaimName = 'https://banke.tw/session_id';
  const sessionReauthenticationCodes = new Set(['SESSION_INVALID', 'TOKEN_SESSION_INVALID']);
  const identityAccessDeniedCode = 'IDENTITY_ACCESS_DENIED';
  const inAppBrowserPattern = /(?:\bLine\/|\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bInstagram\b|\bMessenger\b)/i;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.navigator?.standalone === true;
  const inAppBrowser = !standalone && inAppBrowserPattern.test(window.navigator?.userAgent || '');
  let client;
  let inAppBrowserNotice;
  let initializationPhase = 'auth0';
  let initializationPromise;
  let authGeneration = 0;
  let authRunSequence = 0;
  let activeAuthRun;
  let verifiedOfflineBinding = '';
  let boundSessionId = '';
  let boundSubject = '';
  let renewalPromise;
  let redirectStarted = false;
  let authenticationClosed = false;
  let verifiedToken = '';
  let verifiedTokenExpiresAt = 0;
  let renewalRetryAt = 0;
  let reconnectNotice;
  const diagnostic = (event, data) => window.shiftResumeDiagnostics?.mark(event,
    { ...(activeAuthRun ? runFields(activeAuthRun) : {}), ...data });
  const timing = event => {
    window.shiftRuntimeTiming?.mark(event);
    const names = { 'ui-usable': 'UI_USABLE' };
    if (names[event]) diagnostic(names[event]);
  };
  const tokenUsable = () => Boolean(verifiedToken && Date.now() < verifiedTokenExpiresAt);
  const isBackground = () => document.visibilityState === 'hidden';
  const showReconnect = visible => {
    if (!reconnectNotice && visible && document.createElement && document.body) {
      reconnectNotice = document.createElement('div');
      reconnectNotice.id = 'authReconnectStatus';
      reconnectNotice.setAttribute('role', 'status');
      reconnectNotice.textContent = '正在重新連線…（目前畫面已保留）';
      reconnectNotice.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:1000;padding:8px 12px;background:#fff8e6;color:#513e18;border:1px solid #d8c69e;border-radius:8px;pointer-events:none';
      document.body.append(reconnectNotice);
    }
    if (reconnectNotice) reconnectNotice.hidden = !visible;
  };
  const silentReauthenticationCodes = new Set([
    'login_required', 'consent_required', 'interaction_required', 'account_selection_required'
  ]);
  const authError = (code, message) => Object.assign(new Error(message), { code });
  const emptyClaimVerification = () => Object.freeze({
    checked: false,
    exists: false,
    nonEmptyString: false,
    auth0SessionIdAvailable: false,
    matchesAuth0SessionId: false
  });
  let claimVerification = emptyClaimVerification();

  const decodeJwtPayload = token => {
    const encoded = String(token || '').split('.')[1];
    if (!encoded) throw new Error('Access token is not a JWT.');
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  const inspectSessionClaim = async accessToken => {
    const payload = decodeJwtPayload(accessToken);
    const claimValue = payload[sessionClaimName];
    const idTokenClaims = await client.getIdTokenClaims();
    const auth0SessionId = idTokenClaims?.sid;
    const verification = Object.freeze({
      checked: true,
      exists: Object.hasOwn(payload, sessionClaimName),
      nonEmptyString: typeof claimValue === 'string' && claimValue.trim().length > 0,
      auth0SessionIdAvailable: typeof auth0SessionId === 'string' && auth0SessionId.trim().length > 0,
      matchesAuth0SessionId: typeof claimValue === 'string' &&
        typeof auth0SessionId === 'string' &&
        claimValue === auth0SessionId
    });
    return { payload, auth0SessionId, verification };
  };

  const verifySessionClaim = async run => {
    diagnostic('SILENT_RENEW_START');
    let accessToken;
    try {
      accessToken = await client.getTokenSilently({ authorizationParams: { audience: authConfig.audience } });
      diagnostic('SILENT_RENEW_PASS');
    } catch (error) {
      diagnostic('SILENT_RENEW_FAIL', window.shiftResumeDiagnostics?.authError(error));
      throw error;
    }
    assertCurrentRun(run);
    const { payload, auth0SessionId, verification } = await inspectSessionClaim(accessToken);
    assertCurrentRun(run);
    if (verification.matchesAuth0SessionId && window.crypto?.subtle) {
      const bytes = new TextEncoder().encode(`${authConfig.domain}\u0000${auth0SessionId}`);
      const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes));
      assertCurrentRun(run);
      boundSessionId = auth0SessionId;
      boundSubject = payload.sub;
      rememberToken(accessToken, payload);
      verifiedOfflineBinding = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    claimVerification = verification;
    return claimVerification;
  };

  // Never carry a command body through an authentication redirect or replay it.
  function rememberToken(token, payload) {
    verifiedToken = token;
    // Never extend JWT expiry; signature and revocation remain enforced by the API.
    verifiedTokenExpiresAt = Number.isFinite(payload.exp) ? payload.exp * 1000 - 5_000 : 0;
  }

  const redirectForRenewal = async () => {
    if (authenticationClosed) throw authError('SESSION_INVALID', '登入已結束，原操作未送出。');
    if (isBackground()) throw authError('AUTH_RENEWAL_DEFERRED', '返回前景後再更新登入；原操作未送出。');
    if (!redirectStarted) {
      redirectStarted = true;
      try {
        diagnostic('AUTHORIZE_REDIRECT_REQUESTED', { reason: 'AUTH_AUTHORIZE_RENEWAL', source: 'staging-auth' });
        window.shiftResumeDiagnostics?.intent('AUTH_AUTHORIZE_RENEWAL', 'staging-auth');
        await client.loginWithRedirect({ appState: { authenticationRenewal: true } });
      } catch {
        diagnostic('NAV_CANCELLED', { reason: 'AUTH_AUTHORIZE_RENEWAL', source: 'staging-auth' });
        throw authError('AUTH_REAUTHENTICATION_REQUIRED', '登入續期未完成，請重新開啟 APP 登入；原操作未送出。');
      }
    }
    throw authError('AUTH_REAUTHENTICATION_REQUIRED', '正在更新登入，原操作未送出；返回後請重新確認並儲存。');
  };

  const getAccessToken = async ({ write = false } = {}) => {
    diagnostic('TOKEN_CHECK', { has_token: Boolean(verifiedToken),
      seconds_to_expiry: verifiedToken ? (verifiedTokenExpiresAt + 5_000 - Date.now()) / 1000 : undefined });
    if (authenticationClosed) throw authError('SESSION_INVALID', '登入已結束，原操作未送出。');
    if (redirectStarted) {
      throw authError('AUTH_REAUTHENTICATION_REQUIRED', '正在更新登入，原操作未送出。');
    }
    // Focus is not an auth signal. Reuse the validated, unexpired memory token.
    if (tokenUsable() && verifiedTokenExpiresAt - Date.now() > 30_000) return verifiedToken;
    if (isBackground() || Date.now() < renewalRetryAt) {
      if (tokenUsable()) return verifiedToken;
      throw authError('AUTH_RENEWAL_DEFERRED', '登入暫時無法續期，畫面已保留；原操作未送出。');
    }
    const hadUsableToken = tokenUsable();
    if (!renewalPromise) {
      timing('auth-renewal-start');
      showReconnect(!hadUsableToken);
      renewalPromise = (async () => {
        diagnostic('SILENT_RENEW_START');
        const token = await client.getTokenSilently({
          authorizationParams: { audience: authConfig.audience }, cacheMode: 'off', timeoutInSeconds: 8
        });
        diagnostic('SILENT_RENEW_PASS');
        if (authenticationClosed) throw authError('SESSION_INVALID', '登入已結束，原操作未送出。');
        const { payload, auth0SessionId, verification } = await inspectSessionClaim(token);
        if (authenticationClosed) throw authError('SESSION_INVALID', '登入已結束，原操作未送出。');
        if (!verification.exists || !verification.nonEmptyString || !verification.matchesAuth0SessionId) {
          throw authError('TOKEN_SESSION_INVALID', '登入 session 驗證失敗，原操作未送出。');
        }
        if (auth0SessionId !== boundSessionId || payload.sub !== boundSubject) {
          verifiedToken = '';
          return redirectForRenewal();
        }
        claimVerification = verification;
        rememberToken(token, payload);
        renewalRetryAt = 0;
        showReconnect(false);
        return token;
      })().catch(error => {
        diagnostic('SILENT_RENEW_FAIL', window.shiftResumeDiagnostics?.authError(error));
        if (authenticationClosed) throw authError('SESSION_INVALID', '登入已結束，原操作未送出。');
        if (silentReauthenticationCodes.has(error?.error || error?.code)) {
          if (!tokenUsable()) return redirectForRenewal();
          renewalRetryAt = verifiedTokenExpiresAt;
          return verifiedToken;
        }
        const transient = error?.error === 'timeout' || ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name);
        if (transient) {
          renewalRetryAt = Date.now() + 15_000;
          showReconnect(!tokenUsable());
          if (tokenUsable()) return verifiedToken;
          throw authError('AUTH_RENEWAL_TEMPORARILY_UNAVAILABLE', '登入續期暫時逾時，畫面已保留；原操作未送出，請稍後再試。');
        }
        throw error;
      }).finally(() => { renewalPromise = undefined; timing('auth-renewal-end'); });
    }
    const token = await renewalPromise;
    if (write && !hadUsableToken) {
      throw authError('AUTH_RENEWED_RETRY_REQUIRED', '登入已更新，這次操作尚未送出；請確認內容後再按一次儲存。');
    }
    return token;
  };

  const setStatus = message => {
    if (hint) hint.textContent = message;
  };

  const setBusy = busy => {
    if (!loginButton) return;
    loginButton.disabled = busy;
    loginButton.textContent = busy ? '正在連接 Auth0…' : '使用 Auth0 登入';
  };

  const copyPreviewUrl = async feedback => {
    let copied = false;
    try {
      if (typeof window.navigator?.clipboard?.writeText === 'function') {
        await window.navigator.clipboard.writeText(redirectUri);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const input = document.createElement('textarea');
      input.value = redirectUri;
      input.readOnly = true;
      input.setAttribute('aria-hidden', 'true');
      document.body.append(input);
      input.select();
      try {
        copied = document.execCommand?.('copy') === true;
      } catch {
        copied = false;
      }
      input.remove();
    }

    feedback.textContent = copied
      ? '網址已複製，請貼到 Safari 或預設瀏覽器開啟。'
      : '無法自動複製，請長按上方網址後複製。';
  };

  const createInAppBrowserNotice = () => {
    if (inAppBrowserNotice) return inAppBrowserNotice;

    const overlay = document.createElement('div');
    overlay.id = 'stagingInAppBrowserNotice';
    overlay.className = 'login-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'stagingInAppBrowserTitle');

    const card = document.createElement('section');
    card.className = 'login-card';
    const mark = document.createElement('span');
    mark.className = 'login-mark';
    mark.textContent = '↗';
    const title = document.createElement('h1');
    title.id = 'stagingInAppBrowserTitle';
    title.textContent = '請改用外部瀏覽器';
    const message = document.createElement('p');
    message.textContent = '目前使用的是 App 內建瀏覽器，登入可能無法完成。請按右上角「⋯」，選擇「使用 Safari 開啟」或「使用預設瀏覽器開啟」。';
    const urlLabel = document.createElement('label');
    urlLabel.textContent = '預覽網址';
    const urlField = document.createElement('input');
    urlField.value = redirectUri;
    urlField.readOnly = true;
    urlField.setAttribute('aria-label', '可複製的預覽網址');
    urlField.addEventListener('focus', () => urlField.select());
    urlLabel.append(urlField);
    const actions = document.createElement('div');
    actions.className = 'login-actions';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'primary';
    copyButton.textContent = '複製網址';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ghost';
    closeButton.textContent = '關閉提示';
    const feedback = document.createElement('small');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    copyButton.addEventListener('click', () => copyPreviewUrl(feedback));
    closeButton.addEventListener('click', () => {
      overlay.hidden = true;
      loginButton?.focus();
    });
    actions.append(copyButton, closeButton);
    card.append(mark, title, message, urlLabel, actions, feedback);
    overlay.append(card);
    document.body.append(overlay);
    inAppBrowserNotice = overlay;
    return overlay;
  };

  const showInAppBrowserNotice = () => {
    if (!inAppBrowser) return false;
    const notice = createInAppBrowserNotice();
    notice.hidden = false;
    notice.querySelector('.primary')?.focus();
    setStatus('目前使用 App 內建瀏覽器，請改用 Safari 或預設瀏覽器登入。');
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = '查看開啟方式';
    }
    return true;
  };

  const currentRun = run => !authenticationClosed && run.generation === authGeneration;
  function assertCurrentRun(run) {
    if (!currentRun(run)) throw authError('AUTH_INIT_CANCELLED', '登入初始化已取消。');
  }
  const runFields = run => ({ run_id: run.id, auth_run_id: run.id, generation: run.generation,
    reason: run.reason, caller: 'staging-auth', elapsed_ms: Date.now() - run.started,
    stale_result_ignored: !currentRun(run) });
  async function runStage(run, stage, event, operation) {
    assertCurrentRun(run);
    run.stage = stage;
    const started = Date.now();
    diagnostic(`${event}_START`, { ...runFields(run), error_stage: stage, elapsed_ms: 0 });
    let failure;
    try {
      const result = await operation();
      assertCurrentRun(run);
      return result;
    } catch (error) {
      failure = error;
      if (event === 'API_BOOTSTRAP') diagnostic(error?.code === 'POSTGRES_API_TIMEOUT'
        ? 'API_BOOTSTRAP_TIMEOUT' : 'API_BOOTSTRAP_FAIL', {
        ...runFields(run), error_stage: stage, operation: error?.operation,
        ...window.shiftResumeDiagnostics?.authError(error)
      });
      throw error;
    } finally {
      diagnostic(`${event}_END`, { ...runFields(run), error_stage: stage,
        elapsed_ms: Date.now() - started, success: !failure,
        ...(failure ? window.shiftResumeDiagnostics?.authError(failure) : {}) });
    }
  }

  const initialize = async run => {
    if (showInAppBrowserNotice()) return;
    if (!authConfig?.domain || !authConfig?.clientId || !authConfig?.audience) {
      throw new Error(`${environmentLabel} Auth0 public configuration is incomplete.`);
    }
    if (typeof auth0Sdk?.Auth0Client !== 'function') {
      throw new Error('Auth0 SPA SDK failed to load.');
    }

    if (!client) client = new auth0Sdk.Auth0Client({
      domain: authConfig.domain,
      clientId: authConfig.clientId,
      authorizationParams: {
        redirect_uri: redirectUri,
        audience: authConfig.audience,
        scope: 'openid profile'
      },
      useRefreshTokens: false,
      authorizeTimeoutInSeconds: 8,
      cacheLocation: 'memory'
    });

    const authenticated = await runStage(run, 'auth-session', 'AUTH_SESSION_INIT', async () => {
      // Explicit API retry may reuse the already verified identity, not restart Auth0.
      if (run.reason === 'API_RETRY' && tokenUsable() && verifiedOfflineBinding) return true;
      const query = new URLSearchParams(window.location.search);
      if (query.get('code') && query.get('state')) {
        diagnostic('AUTH_CALLBACK_DETECTED', runFields(run));
        await runStage(run, 'auth-callback', 'AUTH_CALLBACK', async () => {
          await client.handleRedirectCallback();
          assertCurrentRun(run);
          window.history.replaceState({}, document.title, redirectUri);
        });
        run.stage = 'auth-session';
      } else {
        // The factory performs this even before callback processing; do it only on cold loads.
        diagnostic('SILENT_RENEW_START');
        try {
          await client.checkSession({ timeoutInSeconds: 8 });
          diagnostic('SILENT_RENEW_PASS');
        } catch (error) {
          diagnostic('SILENT_RENEW_FAIL', window.shiftResumeDiagnostics?.authError(error));
          throw error;
        }
      }
      assertCurrentRun(run);
      const authenticated = await client.isAuthenticated();
      assertCurrentRun(run);
      if (!authenticated) return false;
      const verification = await verifySessionClaim(run);
      if (!verification.exists || !verification.nonEmptyString || !verification.matchesAuth0SessionId) {
        throw new Error('Auth0 session claim validation failed closed.');
      }
      return true;
    });
    if (authenticated) {
      if (environment.dataBackend === 'postgres') {
        if (!verifiedOfflineBinding) throw new Error('Auth0 identity binding is unavailable.');
        initializationPhase = 'app-session';
        setStatus(`Auth0 驗證成功，正在載入 PostgreSQL ${environmentLabel} 資料…`);
        if (loginButton) loginButton.textContent = '正在載入資料…';
        const bootstrap = await runStage(run, 'api-bootstrap', 'API_BOOTSTRAP', () => window.shiftPostgresCloud.connect({
          getAccessToken,
          offlineIdentityBinding: verifiedOfflineBinding,
          assertCurrent: () => assertCurrentRun(run),
          diagnosticContext: () => runFields(run)
        }));
        initializationPhase = 'app-ui';
        run.stage = 'app-ui';
        await window.shiftAppSession.enter(bootstrap.role, bootstrap.employeeId || '', { isCurrent: () => currentRun(run) });
        assertCurrentRun(run);
        window.shiftPostgresCloud.activateForegroundSync();
        diagnostic('UI_USABLE', runFields(run));
        setStatus(`PostgreSQL ${environmentLabel} 資料載入完成。`);
      } else {
        setStatus(`Auth0 ${environmentLabel} login succeeded; the session claim is present and matches the Auth0 session ID.`);
      }
      loginButton.textContent = 'Auth0 已登入';
      loginButton.disabled = true;
      return;
    }

    setStatus(`${environmentLabelUpper} 僅使用 Auth0 Authorization Code + PKCE 登入。`);
    setBusy(false);
  };

  const loginWithRedirect = async () => {
    if (showInAppBrowserNotice()) return;
    if (!client) return;
    setBusy(true);
    try {
      diagnostic('AUTHORIZE_REDIRECT_REQUESTED', { reason: 'USER_LOGIN', source: 'staging-auth' });
      window.shiftResumeDiagnostics?.intent('USER_LOGIN', 'staging-auth');
      await client.loginWithRedirect();
    } catch (error) {
      diagnostic('NAV_CANCELLED', { reason: 'USER_LOGIN', source: 'staging-auth' });
      setStatus(`Auth0 登入無法啟動：${error instanceof Error ? error.message : '未知錯誤'}`);
      setBusy(false);
    }
  };

  const resetLoggedOutUi = () => {
    authenticationClosed = true;
    authGeneration += 1;
    verifiedToken = '';
    verifiedTokenExpiresAt = 0;
    showReconnect(false);
    claimVerification = emptyClaimVerification();
    verifiedOfflineBinding = '';
    boundSessionId = '';
    boundSubject = '';
    setStatus(`${environmentLabelUpper} 僅使用 Auth0 Authorization Code + PKCE 登入。`);
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = '使用 Auth0 登入';
      loginButton.onclick = loginWithRedirect;
    }
  };

  const logoutProvider = async () => {
    resetLoggedOutUi();
    if (!client) return;
    window.shiftResumeDiagnostics?.intent('AUTH_LOGOUT', 'staging-auth');
    await client.logout({ logoutParams: { returnTo: redirectUri } });
  };

  const recoverInvalidPostgresSession = async error => {
    if (environment.dataBackend !== 'postgres' || !sessionReauthenticationCodes.has(error?.code)) return false;

    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    window.shiftStateStore?.clearSensitive?.();
    setStatus(`PostgreSQL ${environmentLabel} 登入階段已過期，正在安全重新登入…`);
    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = '正在重新登入…';
    }

    try {
      await logoutProvider();
    } catch {
      setStatus(`PostgreSQL ${environmentLabel} 登入階段已過期，請按「重新登入」。`);
      if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = '重新登入';
        loginButton.onclick = logoutProvider;
      }
    }
    return true;
  };

  const recoverDeniedPostgresIdentity = error => {
    if (environment.dataBackend !== 'postgres' || error?.code !== identityAccessDeniedCode) return false;

    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    window.shiftStateStore?.clearSensitive?.();
    claimVerification = emptyClaimVerification();
    setStatus(`此 Auth0 ${environmentLabel} 帳號尚未綁定可用的工作區，或帳號已停權。請更換為已核准的老闆或員工帳號。`);
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = '更換登入帳號';
      loginButton.onclick = logoutProvider;
    }
    return true;
  };

  for (const legacyControl of [phoneLabel, pinLabel, activationLabel, employeeLoginButton]) {
    if (!legacyControl) continue;
    legacyControl.hidden = true;
    legacyControl.style.display = 'none';
  }
  if (loginButton) {
    loginButton.onclick = loginWithRedirect;
    setBusy(true);
  }

  const publicAuth = Object.freeze({
    loginWithRedirect,
    logoutProvider,
    getAccessToken,
    ensureInitialized: () => startInitialization(),
    getClaimVerification: () => claimVerification,
    redirectUri,
    audience: authConfig?.audience || ''
  });
  window.shiftAuth = publicAuth;
  window.shiftStagingAuth = publicAuth;

  function startInitialization(reason = 'APP_BOOT') {
    if (initializationPromise) return initializationPromise;
    if (authenticationClosed) return Promise.resolve();
    const run = { id: ++authRunSequence, generation: ++authGeneration, reason, started: Date.now(), stage: 'auth-session' };
    activeAuthRun = run;
    initializationPhase = 'auth0';
    diagnostic('AUTH_INIT_START', runFields(run));
    let failed = false;
    const operation = initialize(run).catch(async error => {
      failed = true;
      run.error = error;
      if (!currentRun(run)) return;
      if (await recoverInvalidPostgresSession(error)) return;
      if (!currentRun(run)) return;
      if (recoverDeniedPostgresIdentity(error)) return;
      const system = initializationPhase === 'auth0'
        ? `Auth0 ${environmentLabel}`
        : `PostgreSQL ${environmentLabel}`;
      setStatus(`${system} 初始化未完成，請稍後重試。`);
      // A data-connection error must never leave the Auth0 spinner/button stuck.
      const retryApi = run.stage === 'api-bootstrap' &&
        ['POSTGRES_API_TIMEOUT', 'POSTGRES_API_UNAVAILABLE'].includes(error?.code);
      if (loginButton) {
        loginButton.disabled = !retryApi;
        loginButton.textContent = retryApi ? '重新連線' : '初始化未完成';
        if (retryApi) loginButton.onclick = () => startInitialization('API_RETRY');
      }
    }).finally(() => {
      diagnostic('AUTH_INIT_END', { ...runFields(run), success: !failed,
        error_stage: run.stage, ...(run.error ? window.shiftResumeDiagnostics?.authError(run.error) : {}) });
      if (failed && initializationPromise === operation) initializationPromise = undefined;
    });
    initializationPromise = operation;
    return operation;
  }
  void startInitialization();
})();
