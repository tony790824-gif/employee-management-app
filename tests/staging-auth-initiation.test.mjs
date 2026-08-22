import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { environmentProfiles } from '../config/environments.mjs';

const result = spawnSync(process.execPath, ['scripts/build.mjs', '--environment=staging'], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || 'Staging build failed.');

const profile = environmentProfiles.staging;
assert.equal(profile.auth.audience, 'https://bankeban-staging-api');
assert.equal(profile.auth.domain, 'dev-nkduawjn5itjlhx4.us.auth0.com');
assert.ok(profile.auth.clientId, 'Staging public Client ID is required.');

const stagingIndex = await readFile('dist-staging/index.html', 'utf8');
const localAuth0Sdk = await readFile('dist-staging/vendor/auth0-spa-js.production.js', 'utf8');
assert.match(stagingIndex, /<script src="\/vendor\/auth0-spa-js\.production\.js"><\/script>/);
assert.doesNotMatch(stagingIndex, /cdn\.auth0\.com|integrity=|crossorigin=/);
assert.match(localAuth0Sdk, /createAuth0Client/);
const sdkSandbox = {
  TextEncoder, TextDecoder, URL, URLSearchParams, AbortController,
  fetch, Headers, Request, Response, crypto: webcrypto,
  navigator: { userAgent: 'Bankeban Auth0 SDK regression' },
  setTimeout, clearTimeout
};
vm.runInNewContext(localAuth0Sdk, sdkSandbox, { filename: 'auth0-spa-js.production.js' });
assert.equal(typeof sdkSandbox.auth0?.createAuth0Client, 'function',
  'The same-origin Auth0 browser bundle must expose window.auth0.createAuth0Client.');
assert.match(stagingIndex, /<script src="staging-auth\.js"><\/script>/);

const sourceIndex = await readFile('index.html', 'utf8');
assert.doesNotMatch(sourceIndex, /auth0-spa-js|staging-auth\.js/, 'Shared/Production entry must not load Staging Auth0 assets.');

const runtimeConfig = await readFile('dist-staging/environment-config.js', 'utf8');
assert.match(runtimeConfig, /"audience": "https:\/\/bankeban-staging-api"/);
assert.match(runtimeConfig, /"clientId": "nOBwjFDzFaEVnsWCfeoofsCyeDMqkrMu"/);

const authSource = await readFile('staging-auth.js', 'utf8');
assert.match(authSource, /\['staging', 'production'\]\.includes\(environment\?\.name\)/);
assert.match(authSource, /new URL\('\.\/', window\.location\.href\)\.href/);
assert.match(authSource, /authorizationParams:\s*\{[\s\S]*redirect_uri: redirectUri,[\s\S]*audience: authConfig\.audience/);
assert.match(authSource, /useRefreshTokens: true/);
assert.match(authSource, /cacheLocation: 'memory'/);
assert.match(authSource, /await client\.loginWithRedirect\(\)/);
assert.match(authSource, /client\.getTokenSilently/);
assert.match(authSource, /https:\/\/banke\.tw\/session_id/);
assert.match(authSource, /client\.getIdTokenClaims/);
assert.match(authSource, /matchesAuth0SessionId/);
assert.match(authSource, /getClaimVerification: \(\) => claimVerification/);
assert.doesNotMatch(authSource, /getClient:\s*\(\)\s*=>\s*client/, 'Staging auth client must remain private.');
assert.match(authSource, /window\.shiftAuth = publicAuth/,
  'The authenticated frontend entry point must expose an environment-neutral API.');
assert.match(authSource, /phoneLabel, pinLabel, activationLabel, employeeLoginButton/);
assert.match(authSource, /legacyControl\.style\.display = 'none'/);
assert.match(authSource, /Line\\\/\|\\bFBAN\\\/\|\\bFBAV\\\/\|\\bFB_IAB\\\/\|\\bInstagram\\b\|\\bMessenger\\b/);
assert.match(authSource, /目前使用的是 App 內建瀏覽器，登入可能無法完成。請按右上角「⋯」/);
assert.match(authSource, /window\.navigator\.clipboard\.writeText\(redirectUri\)/);
assert.match(authSource, /showInAppBrowserNotice\(\)\) return/);
assert.match(authSource, /initializationPhase = 'app-session'/);
assert.match(authSource, /await window\.shiftAppSession\.enter[\s\S]*activateForegroundSync\(\)/);
assert.match(authSource, /initializationPhase === 'auth0'[\s\S]*`Auth0 \$\{environmentLabel\}`[\s\S]*`PostgreSQL \$\{environmentLabel\}`/);
assert.match(authSource, /IDENTITY_ACCESS_DENIED/);
assert.match(authSource, /loginButton\.textContent = '更換登入帳號'/);
assert.doesNotMatch(authSource, /console\.(?:log|info|debug)/, 'Staging auth entry must not expose tokens in logs.');

const sessionId = 'synthetic-session-id';
const accessTokenPayload = Buffer.from(JSON.stringify({
  'https://banke.tw/session_id': sessionId
})).toString('base64url');
const loginButton = { disabled: false, textContent: '', onclick: null };
const hint = { textContent: '' };
const removedSessionKeys = [];
let sensitiveStateCleared = 0;
let providerLogoutCalls = 0;
let appSessionEntries = 0;
let foregroundSyncActivations = 0;
const authClient = {
  isAuthenticated: async () => true,
  getTokenSilently: async () => `header.${accessTokenPayload}.signature`,
  getIdTokenClaims: async () => ({ sid: sessionId }),
  logout: async ({ logoutParams }) => {
    providerLogoutCalls += 1;
    assert.equal(logoutParams.returnTo, 'https://draft.staging.example/');
  }
};
const sandbox = {
  window: {
    crypto: webcrypto,
    shiftEnvironment: {
      name: 'staging',
      dataBackend: 'postgres',
      auth: {
        domain: profile.auth.domain,
        clientId: profile.auth.clientId,
        audience: profile.auth.audience
      },
      storageKey: key => `staging:${key}`
    },
    location: { href: 'https://draft.staging.example/' },
    history: { replaceState() {} },
    auth0: { createAuth0Client: async () => authClient },
    shiftPostgresCloud: {
      connect: async () => {
        const error = new Error('Authorization or command validation failed.');
        error.code = 'SESSION_INVALID';
        throw error;
      },
      activateForegroundSync: () => { foregroundSyncActivations += 1; }
    },
    shiftAppSession: { enter: async () => { appSessionEntries += 1; } },
    shiftStateStore: { clearSensitive: () => { sensitiveStateCleared += 1; } }
  },
  document: {
    title: 'Staging',
    querySelector: selector => selector === '#bossLogin' ? loginButton : selector === '#loginHint' ? hint : null
  },
  sessionStorage: { removeItem: key => removedSessionKeys.push(key) },
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  setTimeout,
  clearTimeout
};
vm.runInNewContext(authSource, sandbox, { filename: 'staging-auth.js' });
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 20));

assert.equal(providerLogoutCalls, 1, 'Expired local sessions must trigger Auth0 provider reauthentication.');
assert.equal(sensitiveStateCleared, 1, 'Expired local sessions must clear cached sensitive state.');
assert.deepEqual(removedSessionKeys, ['staging:shift-postgres-auth']);
assert.equal(appSessionEntries, 0, 'The application must not enter an invalid PostgreSQL session.');
assert.equal(foregroundSyncActivations, 0, 'Invalid sessions must not activate protected foreground polling.');
assert.equal(hint.textContent, 'STAGING 僅使用 Auth0 Authorization Code + PKCE 登入。');
assert.equal(loginButton.textContent, '使用 Auth0 登入');
assert.equal(loginButton.disabled, false);
assert.equal(sandbox.window.shiftStagingAuth.getClaimVerification().checked, false);

await sandbox.window.shiftStagingAuth.logoutProvider();
assert.equal(providerLogoutCalls, 2, 'manual logout must invoke Auth0 provider logout');
assert.equal(loginButton.textContent, '使用 Auth0 登入', 'logout must restore the login action immediately');
assert.equal(hint.textContent, 'STAGING 僅使用 Auth0 Authorization Code + PKCE 登入。');

const successfulOrder = [];
const successfulLoginButton = { disabled: false, textContent: '', onclick: null };
const successfulHint = { textContent: '' };
const successfulAuthClient = {
  handleRedirectCallback: async () => { successfulOrder.push('callback'); },
  isAuthenticated: async () => { successfulOrder.push('authenticated'); return true; },
  getTokenSilently: async () => {
    successfulOrder.push('access-token');
    return `header.${accessTokenPayload}.signature`;
  },
  getIdTokenClaims: async () => {
    successfulOrder.push('id-token');
    return { sid: sessionId };
  }
};
const successfulSandbox = {
  window: {
    crypto: webcrypto,
    shiftEnvironment: {
      name: 'staging',
      dataBackend: 'postgres',
      auth: {
        domain: profile.auth.domain,
        clientId: profile.auth.clientId,
        audience: profile.auth.audience
      },
      storageKey: key => `staging:${key}`
    },
    location: {
      href: 'https://draft.staging.example/?code=synthetic&state=synthetic',
      search: '?code=synthetic&state=synthetic'
    },
    history: { replaceState: () => successfulOrder.push('history') },
    auth0: {
      createAuth0Client: async () => {
        successfulOrder.push('client');
        return successfulAuthClient;
      }
    },
    shiftPostgresCloud: {
      connect: async ({ getAccessToken }) => {
        successfulOrder.push('connect');
        await getAccessToken();
        return { role: 'employee', employeeId: 'employee-1' };
      },
      activateForegroundSync: () => successfulOrder.push('activate-sync')
    },
    shiftAppSession: {
      enter: async () => successfulOrder.push('enter-ui')
    },
    shiftStateStore: { clearSensitive() {} }
  },
  document: {
    title: 'Staging',
    querySelector: selector => selector === '#bossLogin'
      ? successfulLoginButton
      : selector === '#loginHint'
        ? successfulHint
        : null
  },
  sessionStorage: { removeItem() {} },
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  setTimeout,
  clearTimeout
};
vm.runInNewContext(authSource, successfulSandbox, { filename: 'staging-auth-success.js' });
for (let index = 0; index < 8; index += 1) await Promise.resolve();
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 20));
assert.deepEqual(successfulOrder, [
  'client',
  'callback',
  'history',
  'authenticated',
  'access-token',
  'id-token',
  'connect',
  'access-token',
  'enter-ui',
  'activate-sync'
], 'Auth0 callback, App Session, bootstrap UI, and polling activation must remain strictly ordered.');
assert.equal(successfulLoginButton.disabled, true);
assert.equal(successfulLoginButton.textContent, 'Auth0 已登入');
assert.equal(successfulHint.textContent, 'PostgreSQL Staging 資料載入完成。');

const deniedLoginButton = { disabled: false, textContent: '', onclick: null };
const deniedHint = { textContent: '' };
const deniedSessionKeys = [];
let deniedSensitiveStateCleared = 0;
let deniedProviderLogoutCalls = 0;
let deniedAppSessionEntries = 0;
let deniedForegroundSyncActivations = 0;
const deniedAuthClient = {
  isAuthenticated: async () => true,
  getTokenSilently: async () => `header.${accessTokenPayload}.signature`,
  getIdTokenClaims: async () => ({ sid: sessionId }),
  logout: async ({ logoutParams }) => {
    deniedProviderLogoutCalls += 1;
    assert.equal(logoutParams.returnTo, 'https://draft.staging.example/');
  }
};
const deniedSandbox = {
  window: {
    crypto: webcrypto,
    shiftEnvironment: {
      name: 'staging',
      dataBackend: 'postgres',
      auth: {
        domain: profile.auth.domain,
        clientId: profile.auth.clientId,
        audience: profile.auth.audience
      },
      storageKey: key => `staging:${key}`
    },
    location: { href: 'https://draft.staging.example/' },
    history: { replaceState() {} },
    auth0: { createAuth0Client: async () => deniedAuthClient },
    shiftPostgresCloud: {
      connect: async () => {
        const error = new Error('Authorization or command validation failed.');
        error.code = 'IDENTITY_ACCESS_DENIED';
        error.status = 403;
        throw error;
      },
      activateForegroundSync: () => { deniedForegroundSyncActivations += 1; }
    },
    shiftAppSession: { enter: async () => { deniedAppSessionEntries += 1; } },
    shiftStateStore: { clearSensitive: () => { deniedSensitiveStateCleared += 1; } }
  },
  document: {
    title: 'Staging',
    querySelector: selector => selector === '#bossLogin' ? deniedLoginButton : selector === '#loginHint' ? deniedHint : null
  },
  sessionStorage: { removeItem: key => deniedSessionKeys.push(key) },
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  setTimeout,
  clearTimeout
};
vm.runInNewContext(authSource, deniedSandbox, { filename: 'staging-auth-identity-denied.js' });
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 20));

assert.equal(deniedProviderLogoutCalls, 0, 'Denied identities must not be silently redirected in a loop.');
assert.equal(deniedSensitiveStateCleared, 1, 'Denied identities must clear cached sensitive state.');
assert.deepEqual(deniedSessionKeys, ['staging:shift-postgres-auth']);
assert.equal(deniedAppSessionEntries, 0, 'Denied identities must not enter the application UI.');
assert.equal(deniedForegroundSyncActivations, 0, 'Denied identities must not activate protected polling.');
assert.match(deniedHint.textContent, /尚未綁定可用的工作區/);
assert.equal(deniedLoginButton.textContent, '更換登入帳號');
assert.equal(deniedLoginButton.disabled, false);
await deniedLoginButton.onclick();
assert.equal(deniedProviderLogoutCalls, 1, 'The account-switch action must perform Auth0 provider logout.');

const createElement = tagName => {
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    hidden: false,
    textContent: '',
    value: '',
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    querySelector(selector) {
      if (selector === '.primary') {
        return this.children.flatMap(child => child.children || []).find(child => child.className === 'primary') || null;
      }
      return null;
    },
    focus() {},
    select() {},
    remove() {},
    async dispatch(type) { return listeners.get(type)?.(); }
  };
};

const runBrowserScenario = async ({ userAgent, standalone = false }) => {
  let authClientCreations = 0;
  const copiedUrls = [];
  const scenarioLoginButton = { disabled: false, textContent: '', onclick: null, focus() {} };
  const scenarioHint = { textContent: '' };
  const body = createElement('body');
  const scenarioDocument = {
    body,
    title: 'Staging',
    createElement,
    execCommand: () => false,
    querySelector: selector => selector === '#bossLogin' ? scenarioLoginButton : selector === '#loginHint' ? scenarioHint : null
  };
  const scenarioSandbox = {
    window: {
      crypto: webcrypto,
      shiftEnvironment: {
        name: 'staging',
        dataBackend: 'postgres',
        auth: {
          domain: profile.auth.domain,
          clientId: profile.auth.clientId,
          audience: profile.auth.audience
        },
        storageKey: key => `staging:${key}`
      },
      location: { href: 'https://draft.staging.example/' },
      history: { replaceState() {} },
      matchMedia: () => ({ matches: standalone }),
      navigator: {
        userAgent,
        clipboard: { writeText: async value => copiedUrls.push(value) }
      },
      auth0: {
        createAuth0Client: async () => {
          authClientCreations += 1;
          return {
            isAuthenticated: async () => false,
            loginWithRedirect: async () => {}
          };
        }
      }
    },
    document: scenarioDocument,
    sessionStorage: { removeItem() {} },
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(authSource, scenarioSandbox, { filename: 'staging-auth.js' });
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 20));
  return { authClientCreations, body, copiedUrls, loginButton: scenarioLoginButton, hint: scenarioHint };
};

const lineScenario = await runBrowserScenario({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.12.0'
});
assert.equal(lineScenario.authClientCreations, 0, 'LINE in-app browsers must be stopped before Auth0 initialization.');
assert.equal(lineScenario.body.children.length, 1, 'LINE in-app browsers must display one compatibility notice.');
assert.equal(lineScenario.body.children[0].hidden, false);
assert.match(lineScenario.hint.textContent, /App 內建瀏覽器/);
assert.equal(lineScenario.loginButton.textContent, '查看開啟方式');
const lineCard = lineScenario.body.children[0].children[0];
const lineActions = lineCard.children.find(child => child.className === 'login-actions');
const lineCopyButton = lineActions.children.find(child => child.className === 'primary');
await lineCopyButton.dispatch('click');
assert.deepEqual(lineScenario.copiedUrls, ['https://draft.staging.example/']);

for (const userAgent of [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/491.0.0.0.0;]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/MessengerForiOS;FBAV/491.0.0.0.0;]',
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Mobile [FB_IAB/FB4A;FBAV/491.0.0.0.0;]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 360.0.0'
]) {
  const socialBrowser = await runBrowserScenario({ userAgent });
  assert.equal(socialBrowser.authClientCreations, 0, 'Supported social in-app browsers must be stopped before Auth0 initialization.');
  assert.equal(socialBrowser.body.children.length, 1, 'Supported social in-app browsers must display the compatibility notice.');
}

for (const userAgent of [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'
]) {
  const normalBrowser = await runBrowserScenario({ userAgent });
  assert.equal(normalBrowser.authClientCreations, 1, 'Safari and Chrome must continue normal Auth0 initialization.');
  assert.equal(normalBrowser.body.children.length, 0, 'Safari and Chrome must not display the in-app browser notice.');
}

const installedPwa = await runBrowserScenario({
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Instagram 360.0.0',
  standalone: true
});
assert.equal(installedPwa.authClientCreations, 1, 'Installed PWA mode must not be treated as an in-app browser.');
assert.equal(installedPwa.body.children.length, 0, 'Installed PWA mode must not display the compatibility notice.');

console.log('Staging Auth0 PKCE initiation tests passed.');
