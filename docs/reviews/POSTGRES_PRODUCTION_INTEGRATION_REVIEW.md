# PostgreSQL Production Integration Review

Date: 2026-07-20
Status: Accepted as an inactive integration boundary; Production cutover is not approved.

## Scope and decision

This Sprint does not switch the product from Google Sheets to PostgreSQL. It adds one browser transport factory for the existing Node/PostgreSQL API and includes that factory in reproducible build assets. Every committed environment keeps its current backend and an empty `postgresApiUrl`, so the new path cannot send network requests until a later, explicitly approved cutover.

Three options were reviewed:

1. Immediate Production frontend cutover: rejected because the complete read/bootstrap surface, isolated live API deployment, reconciliation, rollback and cross-role E2E are not yet accepted.
2. Duplicate PostgreSQL-specific screens/state store: rejected because it would fork business logic and increase migration risk.
3. Inactive strangler transport boundary using the current environment/build architecture: selected because it is reversible, testable and does not change accepted behavior.

## Architecture review

### A — CTO / principal engineer

The selected boundary centralizes transport policy while preserving the current product path. Tenant authority remains on the server: `X-Workspace-Id` is request scope only and the verified subject, Session and live Membership must determine authorization.

### B — senior reviewer objections

The review identified these material risks: accidental activation, HTTP downgrade, credentials in URLs, token leakage, unbounded payloads, hanging requests, open redirects, unbounded responses, command injection, duplicate commands, stale Session continuation and build/service-worker omission. The implementation addresses them with empty environment endpoints, HTTPS/loopback validation, credential/query/fragment rejection, no-store/omit-credentials transport, byte limits, abort timeout, redirect rejection, response limits, command allowlist, idempotency validation, invalid-session signaling and explicit asset inclusion.

Remaining objections are intentionally not hidden: the formal API lacks the complete UI bootstrap/read surface, no isolated live Staging API endpoint is connected, and browser cutover/reconciliation/rollback E2E is pending.

### C — security review

No secret, database URL or bearer token is committed or logged. Remote plaintext transport fails closed. Invalid Workspace format and unknown commands fail before network I/O. A client-supplied Workspace value is not treated as authorization. 401/403 responses expose only a non-sensitive code/status event. Production remains disabled.

### D — performance review

The client applies a 15-second timeout, a 1 MiB serialized request ceiling and a 2 MiB response ceiling. No polling, background synchronization or additional request is introduced while disabled. Future pagination and cache strategy must be validated with the full read surface; they are not invented in this Sprint.

### E — product review

Users receive no new workflow and no UI disruption. This is valuable only as risk reduction for the eventual managed PostgreSQL cutover. It does not count as a completed live Production capability.

### F — commercial review

A reversible boundary lowers migration and support risk without forcing a premature backend switch. Commercial readiness moves from 79% to 80% because testable integration groundwork exists, but release remains blocked until live Staging evidence is complete.

## Verification and acceptance

Acceptance requires:

- focused API-client tests;
- environment isolation tests proving no profile activates PostgreSQL;
- full regression, quality and build gates;
- no database/schema/data mutation;
- no Production or Netlify Draft Preview deployment;
- explicit exclusion of unrelated working-tree files from the commit.

## Next unique priority

Deploy the existing Node API to an isolated Staging endpoint, complete the missing read/bootstrap surface and perform a reversible boss/employee cutover rehearsal. Production must remain unchanged during that Sprint.
