import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { environmentProfiles } from '../config/environments.mjs';
import { checkOidcReadiness } from '../server/oidc-readiness.mjs';
import { createOidcVerifier } from '../server/jwt-verifier.mjs';

const CALLBACK_URL = 'http://127.0.0.1:4173/';
const SESSION_CLAIM = 'https://banke.tw/session_id';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SAFE_OAUTH_ERRORS = new Set(['access_denied', 'invalid_grant', 'invalid_request', 'temporarily_unavailable']);
const profile = environmentProfiles.staging;
const auth = profile.auth;
const issuer = `https://${auth.domain}/`;
const jwksUri = `${issuer}.well-known/jwks.json`;

function fail(message) {
  throw new Error(message);
}

function requireStaging() {
  if (process.env.BANK_ENV !== 'staging') fail('BANK_ENV must be staging.');
  if (!auth?.domain || !auth?.clientId || auth.audience !== 'https://bankeban-staging-api') {
    fail('Auth0 Staging public configuration is invalid.');
  }
  if (!auth.domain.endsWith('.auth0.com')) fail('Auth0 Staging domain is invalid.');
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function decodeJwtPayload(token) {
  if (!TOKEN_PATTERN.test(String(token || ''))) fail('OIDC token is not a JWT.');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('OIDC token payload is invalid.');
    return payload;
  } catch {
    fail('OIDC token payload is invalid.');
  }
}

function oauthError(body) {
  const value = typeof body?.error === 'string' && SAFE_OAUTH_ERRORS.has(body.error)
    ? body.error
    : 'oauth_request_failed';
  return value;
}

async function tokenRequest(parameters) {
  const response = await fetch(`${issuer}oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(parameters),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  });
  let body = {};
  try { body = await response.json(); } catch { /* fail with a sanitized error below */ }
  return { ok: response.ok, status: response.status, body };
}

function requiredToken(body, name) {
  const value = body?.[name];
  if (typeof value !== 'string' || value.length < 20 || value.length > 16_384) {
    fail(`Auth0 did not return a valid ${name}.`);
  }
  return value;
}

function sendHtml(response, status, title, details) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const rows = Object.entries(details)
    .map(([key, value]) => `<li><strong>${key}</strong>: ${value === true ? 'PASS' : value === false ? 'FAIL' : 'PENDING'}</li>`)
    .join('');
  response.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui;margin:3rem;line-height:1.7;background:#fff8ef;color:#3f3029}main{max-width:760px;margin:auto;padding:2rem;background:white;border-radius:18px;box-shadow:0 12px 40px #6d4c3d22}h1{font-size:1.6rem}li{margin:.6rem 0}</style>
    <main><h1>${title}</h1><p>此頁不顯示或儲存任何 Token、Authorization Code、Session ID 或密碼。</p><ul>${rows}</ul></main></html>`);
}

export async function runAuth0StagingTokenLifecycle({ onReady = () => {} } = {}) {
  requireStaging();
  await checkOidcReadiness({ issuer, audience: auth.audience, jwksUri });
  const verifyAccessToken = createOidcVerifier({ issuer, audience: auth.audience, jwksUri });
  const result = {
    pkceS256Login: false,
    issuerAudienceRs256Expiry: false,
    sessionClaimPresent: false,
    sessionClaimMatchesIdTokenSid: false,
    refreshTokenReceivedInMemory: false,
    refreshRotation: false,
    oldRefreshTokenReplayRejected: false,
    tokenFamilyRevoked: false,
    providerLogoutReturned: false
  };
  let state = '';
  let codeVerifier = '';
  let authorizationStarted = false;
  let lifecycleComplete = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', CALLBACK_URL);
      if (request.method !== 'GET' || url.pathname !== '/') {
        response.statusCode = 404;
        response.end();
        return;
      }
      if (url.searchParams.get('logout') === 'complete') {
        result.providerLogoutReturned = lifecycleComplete;
        sendHtml(response, lifecycleComplete ? 200 : 409, 'Auth0 Staging Token Lifecycle 驗收', result);
        resolveCompletion(Object.freeze({ ...result }));
        return;
      }
      if (url.searchParams.has('error')) fail(`Authorization failed: ${oauthError({ error: url.searchParams.get('error') })}`);
      const code = url.searchParams.get('code');
      if (!code) {
        if (authorizationStarted) fail('Authorization callback did not contain a code.');
        authorizationStarted = true;
        state = base64url(randomBytes(32));
        codeVerifier = base64url(randomBytes(64));
        const codeChallenge = base64url(createHash('sha256').update(codeVerifier, 'ascii').digest());
        const authorizationUrl = new URL(`${issuer}authorize`);
        authorizationUrl.search = new URLSearchParams({
          response_type: 'code',
          client_id: auth.clientId,
          redirect_uri: CALLBACK_URL,
          scope: 'openid profile offline_access',
          audience: auth.audience,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          state
        }).toString();
        response.statusCode = 302;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Location', authorizationUrl.href);
        response.end();
        return;
      }

      if (!safeEqual(url.searchParams.get('state'), state)) fail('Authorization state validation failed.');
      const exchange = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: auth.clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: CALLBACK_URL
      });
      if (!exchange.ok) fail(`Authorization code exchange failed: ${oauthError(exchange.body)}`);
      codeVerifier = '';
      state = '';
      const firstAccessToken = requiredToken(exchange.body, 'access_token');
      const firstRefreshToken = requiredToken(exchange.body, 'refresh_token');
      const idToken = requiredToken(exchange.body, 'id_token');
      result.pkceS256Login = true;
      result.refreshTokenReceivedInMemory = true;
      const firstIdentity = await verifyAccessToken(firstAccessToken);
      result.issuerAudienceRs256Expiry = firstIdentity.issuer === issuer && firstIdentity.expiresAt > firstIdentity.issuedAt;
      result.sessionClaimPresent = typeof firstIdentity.sessionId === 'string' && firstIdentity.sessionId.length >= 8;
      const idClaims = decodeJwtPayload(idToken);
      result.sessionClaimMatchesIdTokenSid = safeEqual(firstIdentity.sessionId, idClaims.sid);

      const rotated = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: auth.clientId,
        refresh_token: firstRefreshToken
      });
      if (!rotated.ok) fail(`Refresh rotation failed: ${oauthError(rotated.body)}`);
      const secondAccessToken = requiredToken(rotated.body, 'access_token');
      const secondRefreshToken = requiredToken(rotated.body, 'refresh_token');
      const secondIdentity = await verifyAccessToken(secondAccessToken);
      result.refreshRotation = !safeEqual(firstRefreshToken, secondRefreshToken)
        && safeEqual(firstIdentity.sessionId, secondIdentity.sessionId);

      const replay = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: auth.clientId,
        refresh_token: firstRefreshToken
      });
      result.oldRefreshTokenReplayRejected = !replay.ok && oauthError(replay.body) === 'invalid_grant';

      const familyAttempt = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: auth.clientId,
        refresh_token: secondRefreshToken
      });
      result.tokenFamilyRevoked = !familyAttempt.ok && oauthError(familyAttempt.body) === 'invalid_grant';
      lifecycleComplete = Object.entries(result)
        .filter(([key]) => key !== 'providerLogoutReturned')
        .every(([, value]) => value === true);
      if (!lifecycleComplete) fail('Token lifecycle acceptance did not pass all checks.');

      const returnTo = `${CALLBACK_URL}?logout=complete`;
      const logoutUrl = new URL(`${issuer}v2/logout`);
      logoutUrl.search = new URLSearchParams({ client_id: auth.clientId, returnTo }).toString();
      response.statusCode = 302;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Location', logoutUrl.href);
      response.end();
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message.replace(/[A-Za-z0-9_-]{80,}/g, '[REDACTED]') : 'Unknown failure';
      sendHtml(response, 500, 'Auth0 Staging Token Lifecycle 驗收失敗', result);
      rejectCompletion(new Error(safeMessage));
    }
  });

  server.listen(4173, '127.0.0.1');
  await once(server, 'listening');
  onReady(CALLBACK_URL);
  try {
    return await completion;
  } finally {
    server.close();
    await once(server, 'close');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAuth0StagingTokenLifecycle({
    onReady: () => console.log(JSON.stringify({ ready: true, url: CALLBACK_URL }))
  }).then(result => {
    console.log(JSON.stringify({ ok: true, ...result }));
  }).catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  });
}
