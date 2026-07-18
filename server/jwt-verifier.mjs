import { createPublicKey, verify } from 'node:crypto';
import { ApiError, assert } from './errors.mjs';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const KID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function decodeJson(value, label) {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    assert(decoded && typeof decoded === 'object' && !Array.isArray(decoded), 401, 'TOKEN_INVALID', `${label} is invalid.`);
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'TOKEN_INVALID', `${label} is invalid.`);
  }
}

function audienceMatches(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

function parseToken(token) {
  assert(typeof token === 'string' && token.length <= 8192 && TOKEN_PATTERN.test(token),
    401, 'TOKEN_INVALID', 'Access token is invalid.');
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  return {
    encodedHeader,
    encodedPayload,
    signature: Buffer.from(encodedSignature, 'base64url'),
    header: decodeJson(encodedHeader, 'JWT header'),
    claims: decodeJson(encodedPayload, 'JWT payload')
  };
}

function validateClaims(claims, { issuer, audience, sessionClaim, clockToleranceSeconds, now }) {
  const timestamp = Math.floor(now() / 1000);
  assert(claims.iss === issuer, 401, 'TOKEN_ISSUER_INVALID', 'Access token issuer is invalid.');
  assert(audienceMatches(claims.aud, audience), 401, 'TOKEN_AUDIENCE_INVALID', 'Access token audience is invalid.');
  assert(Number.isSafeInteger(claims.exp) && claims.exp >= timestamp - clockToleranceSeconds,
    401, 'TOKEN_EXPIRED', 'Access token has expired.');
  assert(Number.isSafeInteger(claims.iat) && claims.iat <= timestamp + clockToleranceSeconds,
    401, 'TOKEN_INVALID', 'Access token issued-at time is invalid.');
  assert(claims.nbf === undefined || (Number.isSafeInteger(claims.nbf) && claims.nbf <= timestamp + clockToleranceSeconds),
    401, 'TOKEN_NOT_ACTIVE', 'Access token is not active.');
  assert(typeof claims.sub === 'string' && claims.sub.length >= 3 && claims.sub.length <= 256,
    401, 'TOKEN_INVALID', 'Access token subject is invalid.');
  assert(claims.workspace_id === undefined, 401, 'TOKEN_TENANT_CLAIM_REJECTED', 'Tenant claims are not accepted from access tokens.');
  const sessionId = claims[sessionClaim];
  assert(typeof sessionId === 'string' && sessionId.length >= 8 && sessionId.length <= 256,
    401, 'TOKEN_SESSION_INVALID', 'Access token session claim is invalid.');
  return Object.freeze({
    issuer: claims.iss,
    subject: claims.sub,
    sessionId,
    tokenId: typeof claims.jti === 'string' ? claims.jti : '',
    issuedAt: claims.iat,
    expiresAt: claims.exp
  });
}

function parseMaxAge(value, fallbackSeconds, maximumSeconds) {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(String(value || ''));
  if (!match) return fallbackSeconds;
  return Math.min(maximumSeconds, Math.max(1, Number(match[1])));
}

export function createOidcVerifier({
  issuer,
  audience,
  jwksUri,
  sessionClaim = 'https://banke.tw/session_id',
  fetcher = globalThis.fetch,
  now = () => Date.now(),
  clockToleranceSeconds = 30,
  cacheSeconds = 300,
  maximumCacheSeconds = 900,
  fetchTimeoutMilliseconds = 5000
}) {
  assert(/^https:\/\/[A-Za-z0-9.-]+\/?(?:[^\s]*)$/.test(String(issuer || '')),
    500, 'AUTH_CONFIG_INVALID', 'OIDC issuer must be an HTTPS URL.');
  assert(/^https:\/\/[A-Za-z0-9.-]+\/(?:[^\s]*)$/.test(String(jwksUri || '')),
    500, 'AUTH_CONFIG_INVALID', 'OIDC JWKS URI must be an HTTPS URL.');
  assert(new URL(issuer).origin === new URL(jwksUri).origin,
    500, 'AUTH_CONFIG_INVALID', 'OIDC issuer and JWKS URI must use the same trusted origin.');
  assert(typeof audience === 'string' && audience.length > 0,
    500, 'AUTH_CONFIG_INVALID', 'OIDC audience is required.');
  assert(typeof sessionClaim === 'string' && sessionClaim.startsWith('https://'),
    500, 'AUTH_CONFIG_INVALID', 'OIDC session claim must be namespaced.');
  assert(typeof fetcher === 'function', 500, 'AUTH_CONFIG_INVALID', 'OIDC JWKS fetcher is required.');
  assert(Number.isSafeInteger(fetchTimeoutMilliseconds) && fetchTimeoutMilliseconds >= 1000
    && fetchTimeoutMilliseconds <= 15_000, 500, 'AUTH_CONFIG_INVALID', 'OIDC JWKS timeout is invalid.');

  let cache = new Map();
  let cacheExpiresAt = 0;
  let pendingFetch = null;
  const rejectedKids = new Map();

  async function refreshKeys(force = false) {
    if (!force && cache.size && cacheExpiresAt > now()) return;
    if (pendingFetch) return pendingFetch;
    pendingFetch = (async () => {
      let response;
      try {
        response = await fetcher(jwksUri, {
          headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(fetchTimeoutMilliseconds)
        });
      } catch {
        throw new ApiError(503, 'JWKS_UNAVAILABLE', 'Identity signing keys are temporarily unavailable.');
      }
      assert(response && response.ok, 503, 'JWKS_UNAVAILABLE', 'Identity signing keys are temporarily unavailable.');
      let body;
      try { body = await response.json(); }
      catch { throw new ApiError(503, 'JWKS_INVALID', 'Identity signing keys are invalid.'); }
      assert(body && Array.isArray(body.keys) && body.keys.length > 0 && body.keys.length <= 32,
        503, 'JWKS_INVALID', 'Identity signing keys are invalid.');
      const next = new Map();
      for (const jwk of body.keys) {
        if (!jwk || !KID_PATTERN.test(String(jwk.kid || '')) || jwk.kty !== 'RSA'
          || (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== 'RS256')) continue;
        if (typeof jwk.n !== 'string' || Buffer.from(jwk.n, 'base64url').length < 256) continue;
        try { next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' })); }
        catch { /* malformed keys are ignored; an empty usable set fails closed below */ }
      }
      assert(next.size > 0, 503, 'JWKS_INVALID', 'Identity signing keys contain no usable RS256 key.');
      cache = next;
      const ttl = parseMaxAge(response.headers?.get?.('cache-control'), cacheSeconds, maximumCacheSeconds);
      cacheExpiresAt = now() + ttl * 1000;
      rejectedKids.clear();
    })().finally(() => { pendingFetch = null; });
    return pendingFetch;
  }

  return async token => {
    const parsed = parseToken(token);
    assert(parsed.header.alg === 'RS256' && parsed.header.typ === 'JWT'
      && parsed.header.crit === undefined && KID_PATTERN.test(String(parsed.header.kid || '')),
      401, 'TOKEN_INVALID', 'Access token header is invalid.');
    await refreshKeys(false);
    let publicKey = cache.get(parsed.header.kid);
    if (!publicKey) {
      const rejectedAt = rejectedKids.get(parsed.header.kid) || 0;
      if (now() - rejectedAt >= 30_000) {
        await refreshKeys(true);
        publicKey = cache.get(parsed.header.kid);
        if (!publicKey) {
          if (rejectedKids.size >= 32) rejectedKids.delete(rejectedKids.keys().next().value);
          rejectedKids.set(parsed.header.kid, now());
        }
      }
    }
    assert(publicKey, 401, 'TOKEN_KEY_UNKNOWN', 'Access token signing key is unknown.');
    const valid = verify('RSA-SHA256', Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`), publicKey, parsed.signature);
    assert(valid, 401, 'TOKEN_INVALID', 'Access token signature is invalid.');
    return validateClaims(parsed.claims, { issuer, audience, sessionClaim, clockToleranceSeconds, now });
  };
}

// Transitional verifier retained only for existing migration tests. Production startup uses createOidcVerifier.
export function createJwtVerifier({ publicKeyPem, issuer, audience, clockToleranceSeconds = 30, now = () => Date.now() }) {
  assert(typeof publicKeyPem === 'string' && publicKeyPem.includes('PUBLIC KEY'), 500, 'AUTH_CONFIG_INVALID', 'JWT public key is required.');
  const publicKey = createPublicKey(publicKeyPem);
  return token => {
    const parsed = parseToken(token);
    assert(parsed.header.alg === 'RS256' && parsed.header.typ === 'JWT', 401, 'TOKEN_INVALID', 'JWT algorithm is invalid.');
    assert(verify('RSA-SHA256', Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`), publicKey, parsed.signature),
      401, 'TOKEN_INVALID', 'Access token signature is invalid.');
    const timestamp = Math.floor(now() / 1000);
    assert(parsed.claims.iss === issuer && audienceMatches(parsed.claims.aud, audience), 401, 'TOKEN_INVALID', 'Access token issuer or audience is invalid.');
    assert(Number.isSafeInteger(parsed.claims.exp) && parsed.claims.exp >= timestamp - clockToleranceSeconds, 401, 'TOKEN_EXPIRED', 'Access token has expired.');
    assert(typeof parsed.claims.sub === 'string' && typeof parsed.claims.workspace_id === 'string', 401, 'TOKEN_INVALID', 'Access token claims are incomplete.');
    return Object.freeze({ userId: parsed.claims.sub, workspaceId: parsed.claims.workspace_id, tokenId: parsed.claims.jti || '' });
  };
}

export function bearerToken(headers) {
  const value = String(headers.authorization || '');
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value);
  if (!match) throw new ApiError(401, 'TOKEN_REQUIRED', 'A Bearer access token is required.');
  return match[1];
}
