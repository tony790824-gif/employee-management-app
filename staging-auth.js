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
  let client;
  let claimVerification = Object.freeze({
    checked: false,
    exists: false,
    nonEmptyString: false,
    auth0SessionIdAvailable: false,
    matchesAuth0SessionId: false
  });

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

  const initialize = async () => {
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
      setStatus(verification.exists && verification.nonEmptyString && verification.matchesAuth0SessionId
        ? 'Auth0 Staging login succeeded; the session claim is present and matches the Auth0 session ID.'
        : 'Auth0 Staging login succeeded, but the session claim could not be matched to the Auth0 session ID.');
      loginButton.textContent = 'Auth0 已登入';
      loginButton.disabled = true;
      return;
    }

    setStatus('STAGING 僅使用 Auth0 Authorization Code + PKCE 登入。');
    setBusy(false);
  };

  const loginWithRedirect = async () => {
    if (!client) return;
    setBusy(true);
    try {
      await client.loginWithRedirect();
    } catch (error) {
      setStatus(`Auth0 登入無法啟動：${error instanceof Error ? error.message : '未知錯誤'}`);
      setBusy(false);
    }
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
    getClaimVerification: () => claimVerification,
    redirectUri,
    audience: authConfig?.audience || ''
  });

  initialize().catch(error => {
    setStatus(`Auth0 Staging 初始化失敗：${error instanceof Error ? error.message : '未知錯誤'}`);
    if (loginButton) loginButton.disabled = true;
  });
})();
