import process from 'node:process';
import { createServer } from 'node:http';
import {
  assertPushDatabaseTarget,
  createPushPool
} from './db.mjs';
import { createApiRuntime } from './runtime.mjs';
import { createWebPushDispatcher, webPushConfig } from './web-push.mjs';

const apiRuntime = createApiRuntime();
const { environment, buildSha } = apiRuntime;
const server = createServer(apiRuntime.requestHandler);
const pushConfig = webPushConfig();
const pushPool = pushConfig.enabled ? createPushPool() : null;
const pushDispatcher = pushPool
  ? createWebPushDispatcher({ pool: pushPool, config: pushConfig })
  : null;
const port = Number(process.env.PORT || 8080);
const bindHost = String(process.env.BANK_API_BIND_HOST || '127.0.0.1').trim();
if (!['127.0.0.1', '0.0.0.0'].includes(bindHost)) {
  throw new Error('BANK_API_BIND_HOST must be 127.0.0.1 or 0.0.0.0.');
}

async function start() {
  await apiRuntime.ensureReady();
  if (pushPool) {
    await assertPushDatabaseTarget(pushPool);
    await pushDispatcher.start();
  }
  server.listen(port, bindHost, () => {
    console.log(JSON.stringify({
      level: 'info',
      message: 'Banke API listening',
      environment,
      port,
      bindHost,
      buildSha,
      webPush: pushDispatcher ? 'enabled' : 'disabled'
    }));
  });
}

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{2,64}$/;
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const AUTHENTICATION_CODES = new Set(['28P01']);
const AUTHORIZATION_CODES = new Set(['28000']);
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECTION_TIMEOUT_CODES = new Set(['ETIMEDOUT']);
const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET']);

function safeStartupErrorCode(error) {
  const candidate = String(error?.code || error?.cause?.code || '').trim().toUpperCase();
  return SAFE_ERROR_CODE_PATTERN.test(candidate) ? candidate : '';
}

function safeStartupErrorName(error) {
  const candidate = String(error?.name || 'Error').trim();
  return SAFE_ERROR_NAME_PATTERN.test(candidate) ? candidate : 'Error';
}

function classifyStartupError(error) {
  const message = String(error?.message || '');
  const normalizedMessage = message.toLowerCase();
  const errorCode = safeStartupErrorCode(error);

  if (message === 'Database startup target verification failed.') {
    return 'DATABASE_NAME_MISMATCH';
  }
  if (/\bdatabase\b.+\bdoes not exist\b/.test(normalizedMessage)) return 'DATABASE_NAME_MISMATCH';
  if (AUTHENTICATION_CODES.has(errorCode)
    || normalizedMessage.includes('password authentication failed')) return 'DATABASE_AUTH_FAILED';
  if (AUTHORIZATION_CODES.has(errorCode)
    || /no pg_hba entry|permission denied|not authorized/.test(normalizedMessage)) {
    return 'DATABASE_AUTHORIZATION_FAILED';
  }
  if (DNS_CODES.has(errorCode)
    || /getaddrinfo|name or service not known/.test(normalizedMessage)) return 'DATABASE_DNS_FAILED';
  if (CONNECTION_TIMEOUT_CODES.has(errorCode)
    || /connection terminated due to connection timeout|connection timeout|connection timed out|timeout expired/.test(normalizedMessage)) {
    return 'DATABASE_CONNECT_TIMEOUT';
  }
  if (CONNECTION_CODES.has(errorCode)) return 'DATABASE_CONNECTION_FAILED';
  if (/(?:TLS|SSL|CERT|X509)/.test(errorCode)
    || /\b(?:tls|ssl|certificate)\b|unable to verify (?:the )?(?:first )?certificate|unable to verify leaf signature|hostname\/ip does not match certificate|certificate has expired|self[- ]signed certificate/.test(normalizedMessage)) {
    return 'DATABASE_TLS_FAILED';
  }
  return 'DATABASE_STARTUP_FAILED';
}

start().catch(async error => {
  const errorCode = safeStartupErrorCode(error);
  console.error(JSON.stringify({
    classification: classifyStartupError(error),
    errorName: safeStartupErrorName(error),
    ...(errorCode ? { errorCode } : {})
  }));
  await pushDispatcher?.stop().catch(() => {});
  await pushPool?.end().catch(() => {});
  await apiRuntime.close().catch(() => {});
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', message: 'Banke API shutting down', signal }));
  server.close(async () => {
    await pushDispatcher?.stop().catch(() => {});
    await pushPool?.end().catch(() => {});
    await apiRuntime.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
