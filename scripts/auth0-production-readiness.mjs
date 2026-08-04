import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function auth0ProductionConfig(env = process.env) {
  if (String(env.BANK_ENV || '').toLowerCase() !== 'production') {
    throw new Error('Auth0 Production readiness requires BANK_ENV=production.');
  }
  const issuer = new URL(required(env, 'BANK_OIDC_ISSUER'));
  const jwks = new URL(required(env, 'BANK_OIDC_JWKS_URL'));
  const audience = required(env, 'BANK_OIDC_AUDIENCE');
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new Error('Production Auth0 issuer must be a credential-free HTTPS URL.');
  }
  if (!issuer.hostname.endsWith('.auth0.com') || issuer.hostname.startsWith('dev-')) {
    throw new Error('Production Auth0 issuer must use the approved non-development Auth0 tenant.');
  }
  if (jwks.origin !== issuer.origin || !jwks.pathname.endsWith('/.well-known/jwks.json')) {
    throw new Error('Production JWKS must be the issuer same-origin well-known endpoint.');
  }
  if (audience === 'https://bankeban-staging-api' || !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9._~/-]*)?$/i.test(audience)) {
    throw new Error('Production Auth0 audience is invalid or points to Staging.');
  }
  if (required(env, 'BANK_OIDC_SESSION_CLAIM') !== 'https://banke.tw/session_id') {
    throw new Error('Production Session claim name is invalid.');
  }
  return Object.freeze({ issuer: issuer.href, jwks: jwks.href, audience });
}

export async function verifyAuth0Production(config, fetcher = fetch) {
  const discoveryResponse = await fetcher(new URL('.well-known/openid-configuration', config.issuer), {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000)
  });
  if (!discoveryResponse.ok) throw new Error(`Auth0 discovery returned HTTP ${discoveryResponse.status}.`);
  const discovery = await discoveryResponse.json();
  if (discovery.issuer !== config.issuer || discovery.jwks_uri !== config.jwks) {
    throw new Error('Auth0 discovery issuer/JWKS does not match the approved Production configuration.');
  }
  const jwksResponse = await fetcher(config.jwks, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000)
  });
  if (!jwksResponse.ok) throw new Error(`Auth0 JWKS returned HTTP ${jwksResponse.status}.`);
  const jwks = await jwksResponse.json();
  const signingKeys = Array.isArray(jwks.keys)
    ? jwks.keys.filter(key => key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256' && key.kid)
    : [];
  if (!signingKeys.length) throw new Error('Auth0 JWKS has no approved RS256 signing key.');
  return Object.freeze({ discovery: 'passed', rs256SigningKeys: signingKeys.length });
}

async function main() {
  const result = await verifyAuth0Production(auth0ProductionConfig());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
