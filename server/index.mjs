import process from 'node:process';
import { createApiServer } from './app.mjs';
import { createCommandService } from './commands.mjs';
import { assertApiDatabaseTarget, createPool } from './db.mjs';
import { createOidcVerifier } from './jwt-verifier.mjs';
import { createTenantContextSigner } from './tenant-context.mjs';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

const environment = String(process.env.BANK_ENV || 'local').toLowerCase();
if (!['local', 'staging', 'production'].includes(environment)) throw new Error('BANK_ENV 格式不正確。');
const pool = createPool();
const verifyAccessToken = createOidcVerifier({
  issuer: required('BANK_OIDC_ISSUER'),
  audience: required('BANK_OIDC_AUDIENCE'),
  jwksUri: required('BANK_OIDC_JWKS_URL'),
  sessionClaim: String(process.env.BANK_OIDC_SESSION_CLAIM || 'https://banke.tw/session_id')
});
const tenantContextSigner = createTenantContextSigner({
  key: required('BANK_TENANT_CONTEXT_KEY'),
  keyId: required('BANK_TENANT_CONTEXT_KEY_ID')
});
const allowedOrigins = required('BANK_ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean);
const commandService = createCommandService({ pool, tenantContextSigner });
const server = createApiServer({ commandService, verifyAccessToken, pool, allowedOrigins });
const port = Number(process.env.PORT || 8080);

async function start() {
  await assertApiDatabaseTarget(pool);
  server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({ level: 'info', message: 'Banke API listening', environment, port }));
  });
}

start().catch(async error => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'Banke API startup failed closed',
    code: 'DATABASE_TARGET_INVALID'
  }));
  await pool.end().catch(() => {});
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', message: 'Banke API shutting down', signal }));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
