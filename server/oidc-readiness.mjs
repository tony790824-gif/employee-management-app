import { ApiError, assert } from './errors.mjs';
import { createRs256KeyMap } from './jwt-verifier.mjs';

function trustedHttpsUrl(value, label) {
  let parsed;
  try { parsed = new URL(String(value || '')); }
  catch { throw new ApiError(500, 'AUTH_CONFIG_INVALID', `${label} must be a valid HTTPS URL.`); }
  assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash,
    500, 'AUTH_CONFIG_INVALID', `${label} must be a valid HTTPS URL.`);
  return parsed;
}

async function fetchJson(fetcher, url, timeoutMilliseconds, unavailableCode, invalidCode) {
  let response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMilliseconds)
    });
  } catch {
    throw new ApiError(503, unavailableCode, 'OIDC provider metadata is temporarily unavailable.');
  }
  assert(response?.ok, 503, unavailableCode, 'OIDC provider metadata is temporarily unavailable.');
  try { return await response.json(); }
  catch { throw new ApiError(503, invalidCode, 'OIDC provider metadata is invalid.'); }
}

export async function checkOidcReadiness({
  issuer,
  audience,
  jwksUri,
  fetcher = globalThis.fetch,
  timeoutMilliseconds = 5000
}) {
  const issuerUrl = trustedHttpsUrl(issuer, 'OIDC issuer');
  const configuredJwksUrl = trustedHttpsUrl(jwksUri, 'OIDC JWKS URI');
  assert(issuerUrl.search === '' && configuredJwksUrl.search === '',
    500, 'AUTH_CONFIG_INVALID', 'OIDC endpoints must not contain query parameters.');
  assert(issuerUrl.origin === configuredJwksUrl.origin,
    500, 'AUTH_CONFIG_INVALID', 'OIDC issuer and JWKS URI must use the same trusted origin.');
  assert(typeof audience === 'string' && audience.length >= 3 && audience.length <= 512,
    500, 'AUTH_CONFIG_INVALID', 'OIDC audience is invalid.');
  assert(typeof fetcher === 'function', 500, 'AUTH_CONFIG_INVALID', 'OIDC metadata fetcher is required.');
  assert(Number.isSafeInteger(timeoutMilliseconds) && timeoutMilliseconds >= 1000 && timeoutMilliseconds <= 15_000,
    500, 'AUTH_CONFIG_INVALID', 'OIDC metadata timeout is invalid.');

  const normalizedIssuer = issuerUrl.href;
  const discoveryUrl = new URL('.well-known/openid-configuration',
    normalizedIssuer.endsWith('/') ? normalizedIssuer : `${normalizedIssuer}/`).href;
  const discovery = await fetchJson(fetcher, discoveryUrl, timeoutMilliseconds,
    'OIDC_DISCOVERY_UNAVAILABLE', 'OIDC_DISCOVERY_INVALID');
  assert(discovery && typeof discovery === 'object' && !Array.isArray(discovery),
    503, 'OIDC_DISCOVERY_INVALID', 'OIDC discovery metadata is invalid.');
  assert(discovery.issuer === normalizedIssuer,
    503, 'OIDC_DISCOVERY_INVALID', 'OIDC discovery issuer does not match configuration.');
  assert(discovery.jwks_uri === configuredJwksUrl.href,
    503, 'OIDC_DISCOVERY_INVALID', 'OIDC discovery JWKS URI does not match configuration.');

  const authorizationEndpoint = trustedHttpsUrl(discovery.authorization_endpoint, 'OIDC authorization endpoint');
  const tokenEndpoint = trustedHttpsUrl(discovery.token_endpoint, 'OIDC token endpoint');
  assert(authorizationEndpoint.origin === issuerUrl.origin && tokenEndpoint.origin === issuerUrl.origin,
    503, 'OIDC_DISCOVERY_INVALID', 'OIDC endpoints must use the configured issuer origin.');
  assert(Array.isArray(discovery.response_types_supported) && discovery.response_types_supported.includes('code'),
    503, 'OIDC_DISCOVERY_INVALID', 'OIDC Authorization Code flow is not advertised.');
  assert(Array.isArray(discovery.code_challenge_methods_supported)
    && discovery.code_challenge_methods_supported.includes('S256'),
  503, 'OIDC_DISCOVERY_INVALID', 'OIDC PKCE S256 is not advertised.');
  assert(Array.isArray(discovery.id_token_signing_alg_values_supported)
    && discovery.id_token_signing_alg_values_supported.includes('RS256'),
  503, 'OIDC_DISCOVERY_INVALID', 'OIDC RS256 signing is not advertised.');

  const jwks = await fetchJson(fetcher, configuredJwksUrl.href, timeoutMilliseconds,
    'JWKS_UNAVAILABLE', 'JWKS_INVALID');
  const keys = createRs256KeyMap(jwks);
  return Object.freeze({ ok: true, discovery: true, pkceS256: true, rs256KeyCount: keys.size });
}
