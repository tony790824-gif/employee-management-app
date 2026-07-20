# AWS Staging infrastructure preparation

Date: 2026-07-20
Status: locally validated Infrastructure as Code only; no AWS resource has been created or changed.

## Fixed architecture boundary

```text
Auth0 Staging partner source
  -> EventBridge partner bus and allowlisted rule (default: DISABLED)
  -> encrypted primary SQS queue
  -> Lambda SQS mapping (default: disabled)
  -> Node.js security-event handler
  -> Secrets Manager reference
  -> isolated Staging PostgreSQL controlled function

EventBridge target delivery failure -> dedicated EventBridge delivery DLQ
Lambda processing failure -> dedicated processing DLQ
CloudWatch -> Lambda error/throttle/duration, queue age, both DLQs, DLQ-delivery failure
```

This does not alter the accepted Production architecture. The template is Staging-only and contains no Production endpoint, credential, database URL or secret value.

## Template

`infrastructure/aws/auth0-security-events-staging.yaml`

Required non-secret parameters:

| Parameter | Purpose |
|---|---|
| `Auth0PartnerEventSourceName` | Exact Auth0 Staging AWS partner event source name |
| `Auth0Issuer` | Exact Auth0 Staging issuer with trailing slash |
| `LambdaArtifactBucket` | Approved Staging artifact bucket |
| `LambdaArtifactKey` | Reviewed Lambda artifact object key |
| `LambdaArtifactObjectVersion` | Immutable S3 object version; mutable latest artifacts are not accepted |
| `StagingDatabaseSecretArn` | ARN of the isolated Staging database secret; the value is never in this template |
| `StagingDatabaseHost` | Exact approved Staging PostgreSQL host |
| `StagingDatabaseName` | Exact approved Staging PostgreSQL database |

Optional parameters:

| Parameter | Default | Purpose |
|---|---:|---|
| `StagingDatabaseSecretKmsKeyArn` | empty | Exact customer-managed KMS key. When provided, Lambda receives only `kms:Decrypt` via Secrets Manager for the exact secret encryption context. |
| `AlarmNotificationTopicArn` | empty | Existing Staging SNS topic for alarm actions. Alarms still exist when omitted, but deployment acceptance requires an approved notification route. |
| `SecurityEventConsumerEnabled` | `false` | Enables the Lambda SQS consumer only after database, secret, artifact and networking checks pass. |
| `SecurityEventRuleState` | `DISABLED` | Enables Auth0 event ingress only after the consumer passes a synthetic Staging check. |

Secret values belong only in AWS Secrets Manager. Parameter files, source control, build logs and CloudFormation outputs must contain ARNs/identifiers only.

## Safety controls

- EventBridge can send only from the exact rule ARN and current AWS account.
- Every SQS queue denies non-TLS transport.
- Primary queue, EventBridge delivery DLQ and Lambda processing DLQ are encrypted with the AWS-managed SQS key.
- EventBridge delivery failures and application-processing failures are separated for reliable diagnosis and replay.
- The SQS visibility timeout is 185 seconds: six times the 30-second Lambda timeout plus the 5-second batching window.
- Lambda concurrency and SQS mapping concurrency are both capped at two.
- The execution role can consume only the primary queue, read only the exact database secret, optionally decrypt only the exact secret through Secrets Manager, and write only its pre-created log group.
- Lambda code references an immutable S3 object version.
- The Auth0 rule and Lambda consumer are both disabled by default.

## IAM allowlist

| Resource | Allowed | Explicitly not granted |
|---|---|---|
| Primary SQS queue | `ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` | send, purge, policy changes, other queues |
| Database secret | `GetSecretValue` on one ARN | list/create/update/delete secrets |
| Optional KMS key | `Decrypt` through Secrets Manager with the exact secret ARN encryption context | encrypt, generate keys, grants, other keys/direct KMS use |
| CloudWatch Logs | create stream and put events in one pre-created log group | create/delete log groups, read unrelated logs |
| PostgreSQL | controlled by the separate `banke_event_staging` database role | no database credential or table grant exists in this template |

The template contains no wildcard `Allow` action/resource, managed administrator policy, `iam:PassRole`, VPC mutation permission or CloudFormation execution role.

## Monitoring

The template creates fail-safe alarms for:

- Lambda `Errors`;
- Lambda `Throttles`;
- Lambda p95 duration at 80% of timeout;
- primary queue oldest-message age;
- messages in the processing DLQ;
- messages in the EventBridge delivery DLQ;
- EventBridge failing to write to its DLQ.

Missing metrics do not alarm. Before external Staging creation, `AlarmNotificationTopicArn` must be connected to an approved, tested notification destination.

## Local validation

```text
pnpm infra:validate:aws:staging
pnpm test
pnpm check
```

Local validation checks fixed Staging names, default-disabled ingress/consumer, all internal `Ref`/`GetAtt` targets, the approved AWS resource-type allowlist, IAM wildcard/admin exclusions, immutable artifact versioning, encryption, TLS-only queue access, retry/DLQ separation, visibility timeout and alarm coverage.

The local environment intentionally does not install AWS CLI, SAM CLI or `cfn-lint`. Therefore local checks do not claim AWS control-plane acceptance. Before creating any resource, a human-approved external step must run AWS CloudFormation `ValidateTemplate`, create a reviewed change set in the isolated Staging account/region and confirm it contains only the expected resources. That external step is not part of this milestone.

## Future activation order (not executed)

1. Confirm the isolated Auth0 partner event source, Staging AWS account/region and notification route.
2. Build and review the reproducible Lambda artifact, checksum and SBOM; uploading it to a versioned Staging artifact bucket requires separate approval.
3. Create the Staging database migration/role and Secrets Manager secret using an approved secure channel.
4. Validate the template and inspect a CloudFormation change set while both gates remain disabled.
5. Create the stack with `SecurityEventConsumerEnabled=false` and `SecurityEventRuleState=DISABLED`.
6. Verify IAM, queues, secret access, log redaction, alarms and database/network readiness.
7. Enable only the consumer and run a synthetic SQS event.
8. Enable the EventBridge rule and run the approved Auth0 Staging E2E.
9. Exercise retry, both DLQs, alarm notification and controlled replay before acceptance.

Any unexpected Production identifier, IAM wildcard, secret output, failed alarm path, unreviewed resource or change-set drift is a stop condition.

## Operational limitations

- No real AWS account/template validation, change set or resource exists yet.
- Reproducible Lambda packaging, runtime dependency inclusion, SHA256, CycloneDX SBOM and local invocation are complete; artifact upload and code-signing validation remain external pre-deployment tasks.
- Lambda-to-Neon network egress must be selected and tested without weakening TLS; no VPC/NAT design is added by this milestone.
- DLQ replay remains manual and must preserve the existing database idempotency key.
- Alarm thresholds are conservative Staging defaults and require tuning from observed non-sensitive telemetry.

## AWS references

- CloudFormation partner event bus: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-events-eventbus.html
- Lambda SQS configuration: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
- Lambda SQS partial failures: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html
- EventBridge retry/DLQ: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html
- SQS DLQ alarms: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/dead-letter-queues-alarms-cloudwatch.html
- Secrets Manager encryption permissions: https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html
