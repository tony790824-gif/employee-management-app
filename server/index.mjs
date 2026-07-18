import process from 'node:process';
import { createApiServer } from './app.mjs';
import { createCommandService } from './commands.mjs';
import { createPool } from './db.mjs';
import { createJwtVerifier } from './jwt-verifier.mjs';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

const environment = String(process.env.BANK_ENV || 'local').toLowerCase();
if (!['local', 'staging', 'production'].includes(environment)) throw new Error('BANK_ENV 格式不正確。');
const pool = createPool();
const verifyAccessToken = createJwtVerifier({
  publicKeyPem: required('BANK_JWT_PUBLIC_KEY').replaceAll('\\n', '\n'),
  issuer: required('BANK_JWT_ISSUER'),
  audience: required('BANK_JWT_AUDIENCE')
});
const allowedOrigins = required('BANK_ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean);
const commandService = createCommandService({ pool });
const server = createApiServer({ commandService, verifyAccessToken, pool, allowedOrigins });
const port = Number(process.env.PORT || 8080);

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ level: 'info', message: 'Banke API listening', environment, port }));
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
