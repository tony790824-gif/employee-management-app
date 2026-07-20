import { parseAuth0SqsRecord, securityEventLog } from './auth0-event.mjs';
import { createSecurityEventRepository } from './database.mjs';

const REQUIRED_ENV = Object.freeze([
  'AUTH0_ISSUER', 'AUTH0_EVENT_SOURCE', 'AUTH0_SECURITY_EVENT_QUEUE_ARN',
  'AWS_ACCOUNT_ID', 'AWS_PARTITION', 'AWS_REGION', 'DATABASE_EVENT_SECRET_ARN',
  'BANK_STAGING_DATABASE_HOST', 'BANK_STAGING_DATABASE_NAME'
]);

function runtimeConfig(env) {
  if (env.BANK_ENV !== 'staging') throw new Error('BANK_ENV_INVALID');
  for (const name of REQUIRED_ENV) {
    if (!String(env[name] || '').trim()) throw new Error(`ENVIRONMENT_MISSING_${name}`);
  }
  const issuer = String(env.AUTH0_ISSUER);
  if (!/^https:\/\/[^/]+\/$/.test(issuer)) throw new Error('AUTH0_ISSUER_INVALID');
  const auth0EventSource = String(env.AUTH0_EVENT_SOURCE);
  const awsAccountId = String(env.AWS_ACCOUNT_ID);
  const awsPartition = String(env.AWS_PARTITION);
  const awsRegion = String(env.AWS_REGION);
  const queueArn = String(env.AUTH0_SECURITY_EVENT_QUEUE_ARN);
  if (!/^aws\.partner\/auth0\.com\/.+/.test(auth0EventSource)) throw new Error('AUTH0_EVENT_SOURCE_INVALID');
  if (!/^\d{12}$/.test(awsAccountId)
    || !/^aws(?:-us-gov|-cn)?$/.test(awsPartition)
    || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(awsRegion)) {
    throw new Error('AWS_IDENTITY_INVALID');
  }
  if (queueArn !== `arn:${awsPartition}:sqs:${awsRegion}:${awsAccountId}:banke-auth0-security-events-staging`) {
    throw new Error('AUTH0_SECURITY_EVENT_QUEUE_ARN_INVALID');
  }
  const maxEventAgeSeconds = Number(env.AUTH0_EVENT_MAX_AGE_SECONDS || 86_400);
  if (!Number.isSafeInteger(maxEventAgeSeconds) || maxEventAgeSeconds < 300 || maxEventAgeSeconds > 86_400) {
    throw new Error('AUTH0_EVENT_MAX_AGE_SECONDS_INVALID');
  }
  return {
    auth0Issuer: issuer,
    auth0EventSource,
    queueArn,
    awsAccountId,
    awsRegion,
    maxEventAgeSeconds
  };
}

async function databaseSecret(secretArn, region) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(String(response.SecretString || '{}'));
  if (typeof secret.connectionString !== 'string' || !secret.connectionString) {
    throw new Error('DATABASE_EVENT_SECRET_INVALID');
  }
  return secret.connectionString;
}

export function createSecurityEventHandler({ env = process.env, now = () => new Date(), repositoryFactory, logger = console } = {}) {
  const config = runtimeConfig(env);
  let repositoryPromise;
  const repository = () => {
    repositoryPromise ||= (repositoryFactory
      ? repositoryFactory()
      : databaseSecret(env.DATABASE_EVENT_SECRET_ARN, config.awsRegion)
        .then(connectionString => createSecurityEventRepository(connectionString, env)));
    return repositoryPromise.catch(error => {
      repositoryPromise = undefined;
      throw error;
    });
  };
  return async event => {
    if (!Array.isArray(event?.Records) || event.Records.length === 0 || event.Records.length > 10) {
      throw new Error('SQS_BATCH_INVALID');
    }
    const failures = [];
    for (const record of event.Records) {
      try {
        const securityEvent = parseAuth0SqsRecord(record, config, now());
        const result = await (await repository()).ingest(securityEvent);
        logger.info(JSON.stringify({
          level: 'info', code: 'SECURITY_EVENT_ACCEPTED',
          status: result?.status || 'unknown', duplicate: result?.duplicate === true
        }));
      } catch (error) {
        logger.error(JSON.stringify(securityEventLog(error, record)));
        failures.push({ itemIdentifier: String(record?.messageId || 'unknown') });
      }
    }
    return { batchItemFailures: failures };
  };
}

let defaultHandler;
export async function handler(event) {
  defaultHandler ||= createSecurityEventHandler();
  return defaultHandler(event);
}
