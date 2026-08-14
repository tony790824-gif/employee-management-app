import process from 'node:process';
import { createRequestHandler } from './app.mjs';
import { createCommandService } from './commands.mjs';
import { assertApiDatabaseTarget, createPool } from './db.mjs';
import { createOidcVerifier } from './jwt-verifier.mjs';
import { createRateLimiter, rateLimitConfig } from './rate-limit.mjs';
import { createTenantContextSigner } from './tenant-context.mjs';

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

function runtimeEnvironment(env) {
  const environment = String(env.BANK_ENV || 'local').toLowerCase();
  if (!['local', 'staging', 'production'].includes(environment)) {
    throw new Error('BANK_ENV 格式不正確。');
  }
  return environment;
}

function runtimeBuildSha(env) {
  const configured = String(env.BANK_BUILD_SHA || env.COMMIT_REF || env.RENDER_GIT_COMMIT || '')
    .trim().toLowerCase();
  return /^[a-f0-9]{7,64}$/.test(configured) ? configured : 'unknown';
}

export function createApiRuntime({ env = process.env } = {}) {
  const environment = runtimeEnvironment(env);
  const pool = createPool(env);
  const verifyAccessToken = createOidcVerifier({
    issuer: required(env, 'BANK_OIDC_ISSUER'),
    audience: required(env, 'BANK_OIDC_AUDIENCE'),
    jwksUri: required(env, 'BANK_OIDC_JWKS_URL'),
    sessionClaim: String(env.BANK_OIDC_SESSION_CLAIM || 'https://banke.tw/session_id')
  });
  const tenantContextSigner = createTenantContextSigner({
    key: required(env, 'BANK_TENANT_CONTEXT_KEY'),
    keyId: required(env, 'BANK_TENANT_CONTEXT_KEY_ID')
  });
  const allowedOrigins = required(env, 'BANK_ALLOWED_ORIGINS')
    .split(',').map(value => value.trim()).filter(Boolean);
  const buildSha = runtimeBuildSha(env);
  const requestHandler = createRequestHandler({
    commandService: createCommandService({ pool, tenantContextSigner }),
    verifyAccessToken,
    pool,
    allowedOrigins,
    environment,
    rateLimiter: createRateLimiter(rateLimitConfig(env)),
    buildSha
  });
  let readiness = null;

  return Object.freeze({
    environment,
    buildSha,
    pool,
    requestHandler,
    ensureReady() {
      readiness ||= assertApiDatabaseTarget(pool, env).catch(error => {
        readiness = null;
        throw error;
      });
      return readiness;
    },
    close() {
      return pool.end();
    }
  });
}
