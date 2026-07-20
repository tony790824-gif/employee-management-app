# Auth0 Staging security event pipeline

Date: 2026-07-19
Status: implementation and IaC prepared; no AWS/Auth0/Netlify resource was created or deployed.

## Scope

This pipeline is isolated to Staging:

```text
Auth0 Staging partner event source
  -> AWS EventBridge partner event bus and allowlisted rule
  -> encrypted SQS queue (consumer disabled by default)
  -> Node.js 22 Lambda handler
  -> controlled PostgreSQL function
  -> app_private.security_event_inbox + app_private.auth_sessions
```

Production, Google Sheets, Apps Script and the current frontend are not connected to this pipeline.

## Trust and source verification

This design intentionally does not expose a public HTTP webhook. Auth0 delivers to an AWS partner event source; AWS account ownership, EventBridge partner-source association and AWS IAM/SigV4 service authorization are the signature/trust boundary. EventBridge may send only to the exact SQS queue through a queue policy constrained by the exact rule ARN.

The Lambda handler then fails closed unless all of the following match its Staging configuration:

- the invocation record is from the exact SQS queue ARN;
- EventBridge account and region match the deployed Staging account/region;
- EventBridge source matches the exact Auth0 partner source;
- Auth0 issuer matches the configured Staging issuer;
- the event timestamp is valid and within the maximum age;
- event/session/user identifiers satisfy strict bounds;
- a revocation event has a safe subject or provider session correlation.

An arbitrary HTTP request, an event from another AWS account/source/queue, or a Production event cannot reach the database through this path. Raw tokens, authorization codes, secrets and raw event payloads are not persisted or logged.

## Event mapping

| Auth0 event | Local action |
|---|---|
| `ferrt` / refresh reuse | Mark the safely correlated active session `compromised` |
| `fertft`, `srrt`, `session_revoked` | Mark the safely correlated active session `revoked` |
| `limit_sul`, blocked/deleted user | Revoke all active sessions for the exact issuer/subject |
| unsupported event | Store minimal metadata as `ignored`; do not mutate a session |
| no safe correlation | Fail closed; retry and ultimately DLQ |

The exact event type mapping must be revalidated against the actual Auth0 Staging event catalog before creating the EventBridge rule.

## Idempotency, retries and DLQ

- The inbox primary key is `(environment, issuer, event_id)`.
- `INSERT ... ON CONFLICT DO NOTHING` and the session mutation execute in one PostgreSQL transaction.
- A duplicate event returns the original result and does not repeat the session mutation.
- Lambda uses SQS partial batch responses so only failed records are retried.
- SQS moves a record to the dedicated processing DLQ after five receives.
- EventBridge has an independent 24-hour/185-attempt delivery policy and a separate delivery DLQ, so delivery and processing failures cannot be confused.
- The inbox stores a SHA-256 payload fingerprint, not the raw payload.
- The primary queue visibility timeout is six times the Lambda timeout plus its batching window.

## Secrets and least privilege

No secret belongs in the template or Git. The future Staging deployment uses:

- AWS Secrets Manager for the isolated `banke_event_staging` connection string;
- an event role with no administrative attributes or role membership;
- zero direct table/sequence/function access except `USAGE` on `app_private` and `EXECUTE` on the single reviewed ingest function;
- a database target guard for the exact Staging host, database and role;
- TLS certificate validation.

## Repeatable verification

```text
node tests/auth0-security-event-handler.test.mjs
node tests/auth0-security-event-infrastructure.test.mjs
```

The automated tests use synthetic identifiers only. They cover valid processing, source rejection, expiry rejection, missing correlation, duplicate/idempotent delivery, account-wide revocation isolation, safe logs, IaC retry/DLQ boundaries, encryption, Staging-only configuration and database privilege constraints.

## External deployment gate (not performed)

Before a real Staging deployment, a human must separately approve and create:

1. the Auth0 Staging AWS partner event stream/source;
2. the AWS Staging EventBridge/SQS/Lambda/Secrets Manager resources from the reviewed template;
3. the isolated database role and migration `0009` on Staging;
4. Lambda artifact packaging and network egress appropriate for the approved Staging PostgreSQL endpoint;
5. CloudWatch alarms for Lambda failures, queue age/depth and DLQ messages;
6. a synthetic end-to-end replay/revocation exercise.

Do not mark the release gate complete until that external Staging E2E succeeds. Do not reuse these resources or credentials in Production.

The reviewed template, least-privilege matrix, alarm inventory and safe two-stage activation order are documented in [AWS Staging infrastructure preparation](AWS_STAGING_INFRASTRUCTURE.md). Both event ingress and the Lambda consumer default to disabled.

## Primary references

- Auth0 Log Event Type Codes: https://auth0.com/docs/deploy-monitor/logs/log-event-type-codes
- Auth0 Event Streams: https://auth0.com/docs/customize/log-streams/event-streams
- AWS Lambda with SQS: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
- AWS partial batch responses: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html
- EventBridge retry and DLQ policy: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html
