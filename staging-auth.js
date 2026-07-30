(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.name !== 'staging') return;

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

  const verifySessionClaim = async () => {
    const accessToken = await client.getTokenSilently({
      authorizationParams: { audience: authConfig.audience }
    });
    const payload = decodeJwtPayload(accessToken);
    const claimValue = payload[sessionClaimName];
    const idTokenClaims = await client.getIdTokenClaims();
    const auth0SessionId = idTokenClaims?.sid;
    claimVerification = Object.freeze({
      checked: true,
      exists: Object.hasOwn(payload, sessionClaimName),
      nonEmptyString: typeof claimValue === 'string' && claimValue.trim().length > 0,
      auth0SessionIdAvailable: typeof auth0SessionId === 'string' && auth0SessionId.trim().length > 0,
      matchesAuth0SessionId: typeof claimValue === 'string' &&
        typeof auth0SessionId === 'string' &&
        claimValue === auth0SessionId
    });
    return claimVerification;
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

  const initialize = async () => {
    if (showInAppBrowserNotice()) return;
    if (!authConfig?.domain || !authConfig?.clientId || authConfig?.audience !== 'https://bankeban-staging-api') {
      throw new Error('Staging Auth0 public configuration is incomplete.');
    }
    if (typeof auth0Sdk?.createAuth0Client !== 'function') {
      throw new Error('Auth0 SPA SDK failed to load.');
    }

    client = await auth0Sdk.createAuth0Client({
      domain: authConfig.domain,
      clientId: authConfig.clientId,
      authorizationParams: {
        redirect_uri: redirectUri,
        audience: authConfig.audience,
        scope: 'openid profile offline_access'
      },
      useRefreshTokens: true,
      cacheLocation: 'memory'
    });

    const query = new URLSearchParams(window.location.search);
    if (query.has('code') && query.has('state')) {
      await client.handleRedirectCallback();
      window.history.replaceState({}, document.title, redirectUri);
    }

    if (await client.isAuthenticated()) {
      const verification = await verifySessionClaim();
      if (!verification.exists || !verification.nonEmptyString || !verification.matchesAuth0SessionId) {
        throw new Error('Auth0 session claim validation failed closed.');
      }
      if (environment.dataBackend === 'postgres') {
        initializationPhase = 'app-session';
        setStatus('Auth0 驗證成功，正在載入 PostgreSQL Staging 資料…');
        const bootstrap = await window.shiftPostgresCloud.connect({
          getAccessToken: () => client.getTokenSilently({ authorizationParams: { audience: authConfig.audience } })
        });
        initializationPhase = 'app-ui';
        await window.shiftAppSession.enter(bootstrap.role, bootstrap.employeeId || '');
        window.shiftPostgresCloud.activateForegroundSync();
        setStatus('PostgreSQL Staging 資料載入完成。');
      } else {
        setStatus('Auth0 Staging login succeeded; the session claim is present and matches the Auth0 session ID.');
      }
      loginButton.textContent = 'Auth0 已登入';
      loginButton.disabled = true;
      return;
    }

    setStatus('STAGING 僅使用 Auth0 Authorization Code + PKCE 登入。');
    setBusy(false);
  };

  const loginWithRedirect = async () => {
    if (showInAppBrowserNotice()) return;
    if (!client) return;
    setBusy(true);
    try {
      await client.loginWithRedirect();
    } catch (error) {
      setStatus(`Auth0 登入無法啟動：${error instanceof Error ? error.message : '未知錯誤'}`);
      setBusy(false);
    }
  };

  const resetLoggedOutUi = () => {
    claimVerification = emptyClaimVerification();
    setStatus('STAGING 僅使用 Auth0 Authorization Code + PKCE 登入。');
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = '使用 Auth0 登入';
      loginButton.onclick = loginWithRedirect;
    }
  };

  const logoutProvider = async () => {
    resetLoggedOutUi();
    if (!client) return;
    await client.logout({ logoutParams: { returnTo: redirectUri } });
  };

  const recoverInvalidPostgresSession = async error => {
    if (environment.dataBackend !== 'postgres' || !sessionReauthenticationCodes.has(error?.code)) return false;

    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    window.shiftStateStore?.clearSensitive?.();
    setStatus('PostgreSQL Staging 登入階段已過期，正在安全重新登入…');
    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = '正在重新登入…';
    }

    try {
      await logoutProvider();
    } catch {
      setStatus('PostgreSQL Staging 登入階段已過期，請按「重新登入」。');
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
    setStatus('此 Auth0 Staging 帳號尚未綁定可用的工作區，或帳號已停權。請更換為已核准的老闆或員工測試帳號。');
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

  window.shiftStagingAuth = Object.freeze({
    loginWithRedirect,
    logoutProvider,
    getAccessToken: () => client?.getTokenSilently({ authorizationParams: { audience: authConfig.audience } }),
    getClaimVerification: () => claimVerification,
    redirectUri,
    audience: authConfig?.audience || ''
  });

  initialize().catch(async error => {
    if (await recoverInvalidPostgresSession(error)) return;
    if (recoverDeniedPostgresIdentity(error)) return;
    const system = initializationPhase === 'auth0' ? 'Auth0 Staging' : 'PostgreSQL Staging';
    setStatus(`${system} 初始化失敗：${error instanceof Error ? error.message : '未知錯誤'}`);
    if (loginButton) loginButton.disabled = true;
  });
})();
