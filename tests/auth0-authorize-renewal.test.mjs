import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createOidcVerifier } from '../server/jwt-verifier.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';

// Offline fixtures only: no real credentials, identity provider or database.
const source = await readFile('staging-auth.js', 'utf8');
const transport = await readFile('postgres-api-client.js', 'utf8');
const issuer = 'https://authorize-renewal.example/';
const audience = 'https://api.authorize-renewal.example';
const claim = 'https://banke.tw/session_id';
const workspace = `ws_${'a'.repeat(32)}`;
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'renewal-test', use: 'sig', alg: 'RS256' };
const now = 1_800_000_000;
const issue = (sid, sub = 'synthetic-user', extra = {}) => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: issuer, aud: audience, sub, iat: now,
    exp: now + 300, [claim]: sid, ...extra })).toString('base64url');
  return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key.privateKey).toString('base64url')}`;
};
const verifier = createOidcVerifier({ issuer, audience, jwksUri: `${issuer}.well-known/jwks.json`,
  now: () => now * 1000, fetcher: async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ keys: [jwk] }) }) });
const signer = createTenantContextSigner({ key: Buffer.alloc(32, 7).toString('base64url'),
  keyId: 'synthetic-renewal-key', now: () => now * 1000 });

async function scenario({ sid = 'session-browser-A', sub = 'synthetic-user', revoked = false } = {}) {
  let cached = true;
  let nextSid = sid;
  let nextSub = sub;
  let idSid = sid;
  let token = issue(sid, sub);
  let nextError;
  let renewalPause;
  let clientOptions;
  let renewals = 0;
  const redirects = [];
  const requests = [];
  const sessions = new Map([[sid, { subject: sub, status: revoked ? 'revoked' : 'active' }]]);
  const sdk = {
    isAuthenticated: async () => true,
    getTokenSilently: async options => {
      assert.equal(options.authorizationParams.audience, audience);
      if (options.cacheMode === 'cache-only') return cached ? token : undefined;
      if (!cached) {
        renewals += 1;
        if (renewalPause) await renewalPause;
        if (nextError) throw nextError;
        token = issue(nextSid, nextSub);
        idSid = nextSid;
        cached = true;
      }
      return token;
    },
    getIdTokenClaims: async () => ({ sid: idSid }),
    loginWithRedirect: async options => { redirects.push(options); },
    logout: async () => {}
  };
  const loginButton = {};
  const hint = {};
  let api;
  const browser = {
    crypto: webcrypto,
    shiftEnvironment: { name: 'production', dataBackend: 'postgres',
      auth: { domain: 'authorize-renewal.example', clientId: 'synthetic-client', audience }, storageKey: x => `test:${x}` },
    location: { href: 'https://app.authorize-renewal.example/' }, history: { replaceState() {} },
    auth0: { createAuth0Client: async options => { clientOptions = options; return sdk; } },
    shiftPostgresCloud: {
      connect: async ({ getAccessToken }) => {
        api = sandbox.BankePostgresApi.createClient({ baseUrl: `${audience}/v1`, getAccessToken,
          getWorkspaceId: async () => workspace, cryptoImpl: webcrypto,
          fetchImpl: async (url, options) => {
            requests.push({ url, method: options.method });
            const identity = await verifier(options.headers.Authorization.slice(7));
            const context = signer.sign({ identity, workspaceId: workspace, purpose: 'read' });
            const decoded = JSON.parse(Buffer.from(context.payload, 'base64url').toString());
            assert.equal(decoded.sessionId, identity.sessionId);
            const binding = sessions.get(identity.sessionId);
            const allowed = binding?.status === 'active' && binding.subject === identity.subject;
            return new Response(JSON.stringify(allowed ? { ok: true } : { code: 'SESSION_INVALID', error: 'Session invalid' }),
              { status: allowed ? 200 : 401, headers: { 'x-bootstrap-revision': '1' } });
          } });
        const identity = await verifier(await getAccessToken());
        if (sessions.get(identity.sessionId)?.status !== 'active') throw Object.assign(new Error('revoked'), { code: 'SESSION_INVALID' });
        return { role: 'boss' };
      }, activateForegroundSync() {}
    },
    shiftAppSession: { enter: async () => {} }, shiftStateStore: { clearSensitive() {} }
  };
  const sandbox = vm.createContext({ window: browser,
    document: { title: 'test', querySelector: id => id === '#bossLogin' ? loginButton : id === '#loginHint' ? hint : null },
    sessionStorage: { removeItem() {} }, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    atob: x => Buffer.from(x, 'base64').toString('binary'), AbortController, setTimeout, clearTimeout });
  vm.runInContext(transport, sandbox);
  vm.runInContext(source, sandbox);
  for (let i = 0; i < 40 && !browser.shiftAuth.getClaimVerification().checked; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(clientOptions.useRefreshTokens, false);
  assert.equal(clientOptions.cacheLocation, 'memory');
  assert.equal(clientOptions.authorizationParams.scope, 'openid profile');
  return { browser, get api() { return api; }, requests, sessions, redirects,
    get renewals() { return renewals; },
    pauseRenewal(promise) { renewalPause = promise; },
    expire({ session = sid, subject = sub, error } = {}) { cached = false; nextSid = session; nextSub = subject; nextError = error; },
    corruptClaim() { cached = true; token = issue('wrong-session-id'); }
  };
}

const normal = await scenario();
assert.equal(normal.browser.shiftAuth.getClaimVerification().matchesAuth0SessionId, true);
normal.expire();
assert.equal((await normal.api.listEmployees()).ok, true, 'silent authorize renewal must reach the API with the same signed session');
assert.equal(normal.renewals, 1);
assert.equal(normal.redirects.length, 0);
assert.equal(normal.sessions.size, 1);

const write = await scenario();
write.expire();
await assert.rejects(() => write.api.executeCommand('shifts.create', {}), e => e.code === 'AUTH_RENEWED_RETRY_REQUIRED');
assert.equal(write.requests.length, 0, 'renewal must happen before any write fetch');
await new Promise(resolve => setTimeout(resolve, 25));
assert.equal(write.requests.length, 0, 'the rejected command must never automatically replay');
await write.api.executeCommand('shifts.create', {});
assert.equal(write.requests.length, 1, 'only a separate explicit user attempt sends a command');

for (const error of ['login_required', 'consent_required', 'interaction_required', 'timeout']) {
  const fallback = await scenario();
  fallback.expire({ error: { error } });
  await assert.rejects(() => fallback.api.executeCommand('shifts.create', {}), e => e.code === 'AUTH_REAUTHENTICATION_REQUIRED');
  assert.equal(fallback.redirects.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fallback.redirects[0])), { appState: { authenticationRenewal: true } });
  await assert.rejects(() => fallback.api.listEmployees(), e => e.code === 'AUTH_REAUTHENTICATION_REQUIRED');
  assert.equal(fallback.redirects.length, 1, 'concurrent polling must not cause redirect loops');
  assert.equal(fallback.requests.length, 0);
}

const changed = await scenario();
changed.expire({ session: 'session-browser-B' });
await assert.rejects(() => changed.api.listEmployees(), e => e.code === 'AUTH_REAUTHENTICATION_REQUIRED');
assert.equal(changed.requests.length, 0, 'new sessions must re-enter normal bootstrap; never reuse old UI binding');
const secondBrowser = await scenario({ sid: 'session-browser-B' });
assert.notEqual(await normal.browser.shiftAuth.getAccessToken(), await secondBrowser.browser.shiftAuth.getAccessToken());
assert.equal((await secondBrowser.api.listEmployees()).ok, true);
const differentUser = await scenario();
differentUser.expire({ subject: 'different-user' });
await assert.rejects(() => differentUser.api.listEmployees(), e => e.code === 'AUTH_REAUTHENTICATION_REQUIRED');

normal.sessions.get('session-browser-A').status = 'revoked';
normal.expire();
await assert.rejects(() => normal.api.listEmployees(), e => e.code === 'SESSION_INVALID');
assert.equal(normal.redirects.length, 0, 'a database revocation is not a silent auth error');
const loggedOut = await scenario();
await loggedOut.api.logout();
loggedOut.sessions.get('session-browser-A').status = 'revoked';
await loggedOut.browser.shiftAuth.logoutProvider();
await assert.rejects(() => loggedOut.api.listEmployees(), e => e.code === 'SESSION_INVALID');
assert.equal(loggedOut.requests.length, 1, 'no API request after local logout');
const logoutDuringRenewal = await scenario();
let releaseRenewal;
logoutDuringRenewal.pauseRenewal(new Promise(resolve => { releaseRenewal = resolve; }));
logoutDuringRenewal.expire({ error: { error: 'login_required' } });
const pendingRequest = assert.rejects(() => logoutDuringRenewal.api.listEmployees(), e => e.code === 'SESSION_INVALID');
await new Promise(resolve => setTimeout(resolve, 10));
await logoutDuringRenewal.browser.shiftAuth.logoutProvider();
releaseRenewal();
await pendingRequest;
assert.equal(logoutDuringRenewal.redirects.length, 0, 'a pending renewal must not start a new login after logout');
assert.equal(logoutDuringRenewal.requests.length, 0);
const invalid = await scenario();
invalid.corruptClaim();
await assert.rejects(() => invalid.api.listEmployees(), e => e.code === 'TOKEN_SESSION_INVALID');
assert.equal(invalid.requests.length, 0);
const denied = await scenario();
denied.expire({ error: { error: 'access_denied' } });
await assert.rejects(() => denied.api.listEmployees(), e => e.error === 'access_denied');
assert.equal(denied.redirects.length, 0, 'security denials must not be bypassed with a new login loop');

// The existing SQL contract still requires the verified session, and logout revokes it.
const bindingSql = await readFile('database/migrations/0005_identity_context_name_resolution.up.sql', 'utf8');
assert.match(bindingSql, /provider_session_id = context->>'sessionId'/);
assert.match(bindingSql, /local_session.status <> 'active'/);
assert.match(bindingSql, /local_session.expires_at <= clock_timestamp\(\)/);
const logoutSql = await readFile('database/migrations/0004_identity_tenant_boundary.up.sql', 'utf8');
assert.match(logoutSql, /SET status = 'revoked', revoked_at = clock_timestamp\(\), revoke_reason = 'logout'/);
const establishSql = await readFile('database/migrations/0017_active_session_reestablishment.up.sql', 'utf8');
assert.match(establishSql, /local_session.subject <> context->>'subject'/);
assert.match(establishSql, /IF NOT FOUND THEN[\s\S]*INSERT INTO app_private.auth_sessions/);
assert.doesNotMatch(source, /offline_access|useRefreshTokens: true/);
console.log('Authorize renewal regression passed: same/new session, silent/redirect, signed API binding, revocation, logout, no write replay.');
