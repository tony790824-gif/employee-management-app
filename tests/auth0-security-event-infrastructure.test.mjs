import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { securityEventRoleConfig } from '../database/apply-security-event-role-grants.mjs';

const template = await readFile('infrastructure/aws/auth0-security-events-staging.yaml', 'utf8');
const migration = await readFile('database/migrations/0009_auth0_security_event_inbox.up.sql', 'utf8');
const handler = await readFile('security-events/handler.mjs', 'utf8');
const database = await readFile('security-events/database.mjs', 'utf8');
const grants = await readFile('database/apply-security-event-role-grants.mjs', 'utf8');

assert.match(template, /EventSourceName: !Ref Auth0PartnerEventSourceName/);
assert.match(template, /SecurityEventRuleState:\s+Type: String\s+Default: DISABLED/);
assert.match(template, /SecurityEventConsumerEnabled:\s+Type: String\s+Default: 'false'/);
assert.match(template, /State: !Ref SecurityEventRuleState/);
assert.match(template, /Enabled: !If \[IsSecurityEventConsumerEnabled, true, false\]/);
assert.match(template, /aws:SourceArn: !GetAtt Auth0SecurityEventRule\.Arn/);
assert.match(template, /aws:SourceAccount: !Ref AWS::AccountId/);
assert.match(template, /deadLetterTargetArn: !GetAtt SecurityEventProcessingDeadLetterQueue\.Arn/);
assert.match(template, /DeadLetterConfig:\s+Arn: !GetAtt EventBridgeDeliveryDeadLetterQueue\.Arn/);
assert.match(template, /maxReceiveCount: 5/);
assert.match(template, /ReportBatchItemFailures/);
assert.match(template, /ReservedConcurrentExecutions: 2/);
assert.match(template, /KmsMasterKeyId: alias\/aws\/sqs/);
assert.match(template, /ReceiveMessageWaitTimeSeconds: 20/);
assert.match(template, /VisibilityTimeout: 185/);
assert.match(template, /QueueName: banke-auth0-security-events-staging/);
assert.doesNotMatch(template, /SqsManagedSseEnabled/);
assert.doesNotMatch(template, /logs:CreateLogGroup/);
assert.match(template, /DependsOn: SecurityEventLogGroup/);
assert.match(template, /Sid: DenyInsecureTransport/);
assert.match(template, /aws:SecureTransport: false/);
assert.match(template, /S3ObjectVersion: !Ref LambdaArtifactObjectVersion/);
assert.match(template, /Action: kms:Decrypt/);
assert.match(template, /kms:ViaService: !Sub secretsmanager\.\$\{AWS::Region\}\.\$\{AWS::URLSuffix\}/);
assert.match(template, /'kms:EncryptionContext:SecretARN': !Ref StagingDatabaseSecretArn/);
assert.match(template, /LogFormat: JSON/);
assert.match(template, /AWS_PARTITION: !Ref AWS::Partition/);
assert.match(template, /MetricName: Errors/);
assert.match(template, /MetricName: Throttles/);
assert.match(template, /MetricName: Duration/);
assert.match(template, /MetricName: ApproximateAgeOfOldestMessage/);
assert.equal((template.match(/MetricName: ApproximateNumberOfMessagesVisible/g) || []).length, 2);
assert.match(template, /MetricName: InvocationsFailedToBeSentToDLQ/);
assert.match(template, /TreatMissingData: notBreaching/);
assert.match(template, /BANK_ENV: staging/);
assert.doesNotMatch(template, /BANK_ENV:\s*production/);
assert.doesNotMatch(template, /SecretString|ClientSecret|DatabaseUrl/);
assert.doesNotMatch(template, /Action:\s*['"]?\*|Resource:\s*['"]?\*|AdministratorAccess|PowerUserAccess/);

const resourceNames = [...template.matchAll(/^  ([A-Za-z][A-Za-z0-9]+):\r?\n    Type: AWS::/gm)].map(match => match[1]);
assert.equal(resourceNames.length, new Set(resourceNames).size, 'CloudFormation logical IDs must be unique');
const resourceSet = new Set(resourceNames);
const pseudoParameters = new Set(['AWS::AccountId', 'AWS::NoValue', 'AWS::Partition', 'AWS::Region', 'AWS::URLSuffix']);
const parameterNames = [...template.matchAll(/^  ([A-Za-z][A-Za-z0-9]+):\r?\n    Type: String/gm)].map(match => match[1]);
const conditionNames = [...template.matchAll(/^  ([A-Za-z][A-Za-z0-9]+): !Not/gm)].map(match => match[1]);
const knownRefs = new Set([...resourceNames, ...parameterNames, ...conditionNames, ...pseudoParameters]);
for (const [, ref] of template.matchAll(/!Ref ([A-Za-z][A-Za-z0-9:]*)/g)) {
  assert.ok(knownRefs.has(ref), `Unresolved CloudFormation !Ref: ${ref}`);
}
for (const [, logicalId] of template.matchAll(/!GetAtt ([A-Za-z][A-Za-z0-9]*)\./g)) {
  assert.ok(resourceSet.has(logicalId), `Unresolved CloudFormation !GetAtt: ${logicalId}`);
}

const allowedResourceTypes = new Set([
  'AWS::CloudWatch::Alarm',
  'AWS::Events::EventBus',
  'AWS::Events::Rule',
  'AWS::IAM::Role',
  'AWS::Lambda::EventSourceMapping',
  'AWS::Lambda::Function',
  'AWS::Logs::LogGroup',
  'AWS::SQS::Queue',
  'AWS::SQS::QueuePolicy'
]);
for (const [, type] of template.matchAll(/^    Type: (AWS::[A-Za-z0-9:]+)$/gm)) {
  assert.ok(allowedResourceTypes.has(type), `Unexpected AWS resource type: ${type}`);
}

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
