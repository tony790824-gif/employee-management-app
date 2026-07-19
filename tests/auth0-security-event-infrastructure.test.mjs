import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { securityEventRoleConfig } from '../database/apply-security-event-role-grants.mjs';

const template = await readFile('infrastructure/aws/auth0-security-events-staging.yaml', 'utf8');
const migration = await readFile('database/migrations/0009_auth0_security_event_inbox.up.sql', 'utf8');
const handler = await readFile('security-events/handler.mjs', 'utf8');
const database = await readFile('security-events/database.mjs', 'utf8');
const grants = await readFile('database/apply-security-event-role-grants.mjs', 'utf8');

assert.match(template, /EventSourceName: !Ref Auth0PartnerEventSourceName/);
assert.match(template, /aws:SourceArn: !GetAtt Auth0SecurityEventRule\.Arn/);
assert.match(template, /deadLetterTargetArn: !GetAtt SecurityEventDeadLetterQueue\.Arn/);
assert.match(template, /maxReceiveCount: 5/);
assert.match(template, /ReportBatchItemFailures/);
assert.match(template, /ReservedConcurrentExecutions: 2/);
assert.match(template, /KmsMasterKeyId: alias\/aws\/sqs/);
assert.doesNotMatch(template, /SqsManagedSseEnabled/);
assert.doesNotMatch(template, /logs:CreateLogGroup/);
assert.match(template, /DependsOn: SecurityEventLogGroup/);
assert.match(template, /BANK_ENV: staging/);
assert.doesNotMatch(template, /BANK_ENV:\s*production/);
assert.doesNotMatch(template, /SecretString|ClientSecret|DatabaseUrl/);

assert.match(migration, /CREATE TABLE app_private\.security_event_inbox/);
assert.match(migration, /PRIMARY KEY \(environment, issuer, event_id\)/);
assert.match(migration, /ON CONFLICT DO NOTHING/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /status = 'compromised'/);
assert.match(migration, /status = 'revoked'/);
assert.match(migration, /REVOKE ALL ON TABLE app_private\.security_event_inbox FROM PUBLIC/);
assert.doesNotMatch(migration, /payload\s+jsonb|raw_event|access_token|refresh_token/);

assert.match(handler, /DATABASE_EVENT_SECRET_ARN/);
assert.match(handler, /batchItemFailures/);
assert.match(database, /url\.username !== EVENT_ROLE/);
assert.match(database, /rejectUnauthorized: true/);
assert.match(grants, /target\.environment !== 'staging'/);
assert.match(grants, /REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private/);
assert.match(grants, /GRANT EXECUTE ON FUNCTION \$\{EVENT_FUNCTION\}/);
assert.doesNotMatch(grants, /CREATE ROLE|BYPASSRLS\s+TO/);
assert.doesNotMatch(handler + database, /console\.(?:log|info|error)\([^\n]*(?:connectionString|SecretString)/);

const stagingRole = securityEventRoleConfig({
  BANK_ENV: 'staging',
  DATABASE_MIGRATOR_URL: 'postgres://owner@staging.example/banke_staging',
  DATABASE_EVENT_URL: 'postgres://banke_event_staging@staging-pooler.example/banke_staging',
  DATABASE_SSL: 'require',
  BANK_STAGING_DATABASE_HOST: 'staging.example'
});
assert.equal(stagingRole.environment, 'staging');
assert.equal(stagingRole.eventUrl.username, 'banke_event_staging');
assert.throws(() => securityEventRoleConfig({
  BANK_ENV: 'production',
  DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/neondb',
  DATABASE_EVENT_URL: 'postgres://banke_event_staging@production.example/neondb',
  DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example',
  BANK_ALLOW_PRODUCTION_MIGRATIONS: 'APPLY_BANKE_PRODUCTION_MIGRATIONS'
}), /Staging-only/);
assert.throws(() => securityEventRoleConfig({
  BANK_ENV: 'staging',
  DATABASE_MIGRATOR_URL: 'postgres://owner@staging.example/banke_staging',
  DATABASE_EVENT_URL: 'postgres://banke_api_staging@staging.example/banke_staging',
  DATABASE_SSL: 'require',
  BANK_STAGING_DATABASE_HOST: 'staging.example'
}), /isolated Staging event role/);

console.log('Auth0 security event IaC and database boundary checks passed.');
