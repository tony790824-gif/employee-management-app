# P0 Auth0 Staging security-event pipeline review

Date: 2026-07-19
Scope: implementation and IaC only; no external resource or deployment.

## A — CTO

The confirmed architecture is preserved: Auth0 partner EventBridge source, SQS isolation, Lambda consumer and a controlled PostgreSQL function. Staging and Production identifiers, roles and secrets are separate, and no public unsigned webhook is introduced.

## B — Senior backend engineer

Main objections were ambiguous event correlation, retrying entire batches, import-time AWS calls, direct table access and duplicate mutations. The final design requires a safe subject/session identifier, uses partial-batch responses, initializes dependencies lazily, calls one controlled function and applies transaction-level idempotency.

## C — Database architect

The inbox is append-oriented metadata with a composite environment/issuer/event key. It stores no raw payload. Inbox insertion and session state transition are atomic. Public and event-role direct table access are denied. Applying migration `0009` remains a separate Staging gate.

## D — Security engineer

Reviewed threats: forged HTTP events, wrong AWS account/source/queue, stale events, cross-environment delivery, duplicate/replayed events, uncorrelated account revocation, leaked DB event credential and sensitive logs. Controls fail closed and the event role is host/database/username pinned with one function grant. Residual risk is the unperformed real partner-source E2E and operational secret/alert setup.

## E — QA lead

Synthetic tests cover valid compromise, duplicate delivery, account-wide revoke isolation, wrong source, expired event, missing correlation, safe logs, Staging-only startup, retry/DLQ and privilege/IaC boundaries. A real AWS/Auth0/PostgreSQL integration test is intentionally not claimed.

## F — Product manager

This is not a visible feature; its value is closing the gap where a still-valid access token could survive provider-side refresh reuse or account disable. It reduces incident exposure without changing user flows.

## G — DevOps engineer

The template uses encrypted queues, independent EventBridge and SQS DLQs, reserved concurrency, limited IAM, explicit log retention and Secrets Manager. Before deployment it still needs packaging, alarms, approved network egress and a DLQ replay runbook.

## H — Performance engineer

Batch size 10, five-second batching, two concurrent consumers and a two-connection pool bound load on the small Staging database. Indexes support received-time and subject investigations. Production sizing must be based on observed queue age, Lambda duration and database time, not copied blindly.

## I — Code reviewer

The implementation remains small and testable. No framework was added, no current frontend/Auth0/database path was changed, and failure logs contain only codes and message fingerprints. The review found and removed conflicting SQS encryption properties and unnecessary log-group creation permission before acceptance.

## Decision

No reviewer found a blocking design defect in the prepared code/IaC. Approval is limited to committing the implementation. Operational completion remains blocked until separately approved Staging resources and real end-to-end security-event acceptance succeed.
