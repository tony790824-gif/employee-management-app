import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { checkOidcReadiness } from '../server/oidc-readiness.mjs';

const ISSUER = 'https://tenant.test.invalid/';
const JWKS_URI = `${ISSUER}.well-known/jwks.json`;
const DISCOVERY_URI = `${ISSUER}.well-known/openid-configuration`;
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'readiness-key-1', use: 'sig', alg: 'RS256' };

function discovery(overrides = {}) {
  return {
    issuer: ISSUER,
    jwks_uri: JWKS_URI,
    authorization_endpoint: `${ISSUER}authorize`,
    token_endpoint: `${ISSUER}oauth/token`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    id_token_signing_alg_values_supported: ['RS256'],
    ...overrides
  };
}

function fetcher(metadata = discovery(), keys = [jwk]) {
  return async url => {
    if (url === DISCOVERY_URI) return { ok: true, json: async () => metadata };
    if (url === JWKS_URI) return { ok: true, json: async () => ({ keys }) };
    return { ok: false, json: async () => ({}) };
  };
}

assert.deepEqual(await checkOidcReadiness({
  issuer: ISSUER, audience: 'banke-local-api', jwksUri: JWKS_URI, fetcher: fetcher()
}), { ok: true, discovery: true, pkceS256: true, rs256KeyCount: 1 });

await assert.rejects(() => checkOidcReadiness({
  issuer: ISSUER, audience: 'banke-local-api', jwksUri: JWKS_URI,
  fetcher: fetcher(discovery({ issuer: 'https://attacker.invalid/' }))
}), error => error.code === 'OIDC_DISCOVERY_INVALID');

await assert.rejects(() => checkOidcReadiness({
  issuer: ISSUER, audience: 'banke-local-api', jwksUri: JWKS_URI,
  fetcher: fetcher(discovery({ code_challenge_methods_supported: ['plain'] }))
}), error => error.code === 'OIDC_DISCOVERY_INVALID');

const weakPair = generateKeyPairSync('rsa', { modulusLength: 1024 });
const weakJwk = { ...weakPair.publicKey.export({ format: 'jwk' }), kid: 'weak-key', use: 'sig', alg: 'RS256' };
await assert.rejects(() => checkOidcReadiness({
  issuer: ISSUER, audience: 'banke-local-api', jwksUri: JWKS_URI, fetcher: fetcher(discovery(), [weakJwk])
}), error => error.code === 'JWKS_INVALID');

await assert.rejects(() => checkOidcReadiness({
  issuer: 'http://tenant.test.invalid/', audience: 'banke-local-api', jwksUri: JWKS_URI, fetcher: fetcher()
}), error => error.code === 'AUTH_CONFIG_INVALID');

console.log('OIDC discovery, PKCE S256 and JWKS readiness tests passed');
