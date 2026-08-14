import process from 'node:process';
import { assertPushDatabaseTarget, createPushPool } from './db.mjs';
import { createWebPushDispatcher, webPushConfig } from './web-push.mjs';

const DEFAULT_SCHEDULED_BATCH_SIZE = 4;
const MAX_SCHEDULED_BATCH_SIZE = 4;

function scheduledBatchSize(env) {
  const value = Number(env.BANK_WEB_PUSH_SCHEDULED_BATCH_SIZE || DEFAULT_SCHEDULED_BATCH_SIZE);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SCHEDULED_BATCH_SIZE) {
    throw new Error(`BANK_WEB_PUSH_SCHEDULED_BATCH_SIZE must be an integer from 1 to ${MAX_SCHEDULED_BATCH_SIZE}.`);
  }
  return value;
}

function safeFailure(code) {
  const error = new Error('Netlify scheduled Push drain failed closed.');
  error.code = code;
  return error;
}

export function createScheduledPushDrain({
  env = process.env,
  configFactory = webPushConfig,
  poolFactory = createPushPool,
  targetVerifier = assertPushDatabaseTarget,
  dispatcherFactory = createWebPushDispatcher,
  logger = console
} = {}) {
  return async () => {
    const config = configFactory(env);
    if (!config.enabled) {
      logger.info(JSON.stringify({
        level: 'info',
        event: 'netlify_push_drain',
        outcome: 'disabled',
        claimed: 0
      }));
      return Object.freeze({ enabled: false, claimed: 0 });
    }

    const batchSize = scheduledBatchSize(env);
    const pool = poolFactory(env);
    let failure = null;
    let claimed = 0;
    try {
      await targetVerifier(pool, env);
      const dispatcher = dispatcherFactory({ pool, config, batchSize, logger });
      claimed = await dispatcher.drainOnce();
      logger.info(JSON.stringify({
        level: 'info',
        event: 'netlify_push_drain',
        outcome: 'complete',
        claimed
      }));
    } catch {
      failure = safeFailure('NETLIFY_PUSH_DRAIN_FAILED');
    } finally {
      try {
        await pool.end();
      } catch {
        failure ||= safeFailure('NETLIFY_PUSH_POOL_CLEANUP_FAILED');
      }
    }
    if (failure) {
      logger.error(JSON.stringify({
        level: 'error',
        event: 'netlify_push_drain',
        outcome: 'failed_closed',
        errorCode: failure.code
      }));
      throw failure;
    }
    return Object.freeze({ enabled: true, claimed });
  };
}
