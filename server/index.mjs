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

start().catch(async error => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'Banke API startup failed closed',
    code: 'DATABASE_TARGET_INVALID'
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
