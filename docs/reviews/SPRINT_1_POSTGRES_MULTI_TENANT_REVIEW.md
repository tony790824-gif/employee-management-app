# Sprint 1 Architecture Review — PostgreSQL multi-tenant foundation

Date: 2026-07-18
Decision: implementation accepted as an isolated foundation; Production cutover rejected until live gates pass.

## Role review

### A — CTO
The strangler approach preserves the accepted Google Sheets path while introducing a formal database and command boundary. It avoids a risky big-bang rewrite and makes every future cutover step measurable.

### B — Senior Frontend/Flutter Engineer
The frontend was deliberately not changed. A future adapter must preserve current projections, revision conflicts, offline behavior, and employee/boss UI isolation; direct database access is rejected.

### C — Backend Architect
Commands, idempotency receipts, audit, and outbox share one transaction. Concerns: only a subset of reads/commands exists; there is no refresh-token service; outbox publishing and expiry cleanup workers are not implemented.

### D — Database Architect
Composite tenant keys, foreign keys, indexes, checks, revisions, and FORCE RLS are appropriate. Concerns: live PostgreSQL syntax/planner validation is still missing; retention jobs, PITR proof, partition strategy, connection-role grants, and zero-downtime forward fixes require Staging evidence.

### E — Security Engineer
JWT is RS256-only, tenant claims are rechecked against active membership, CORS is exact, request sizes are bounded, secrets are external, and legacy credentials are excluded. Concerns: formal Identity Provider, key rotation/JWKS, rate limiting, device/session revocation, API gateway protection, secret rotation, and live cross-tenant penetration tests remain open.

### F — QA Lead
Unit/structural/API boundary coverage is useful but not a substitute for a real engine. Required next: migrate up/down in disposable Staging, two-tenant RLS tests, identical/different import replay, reconciliation, rollback/restore, concurrency, timeout, weak-network, and E2E coverage.

### G — Product Manager
Users receive no new visible function in this Sprint, which is correct: the value is reducing data-loss and isolation risk. Cutover should not occur until behavior parity is demonstrated.

### H — DevOps Engineer
Production migration and destructive rollback gates are present. Missing: managed database, least-privilege roles, CI service database, backup/PITR alerts, metrics/log shipping, deployment manifests, and documented secret injection.

### I — Code Reviewer
The implementation is modular and avoids coupling to the PWA. Review found and fixed the importer RLS-context ordering, non-canonical snapshot checksums, a Windows ESM entry-point comparison, an unused crypto import, and syntax-check coverage for new modules.

## Ten identified failure or maintenance risks

1. SQL has not executed against a real PostgreSQL server.
2. The command surface is incomplete compared with the current application.
3. There is no formal login/refresh/logout implementation.
4. There is no frontend data adapter or cutover switch.
5. RLS has not been exercised with two live tenants and least-privilege roles.
6. Snapshot reconciliation is not automated beyond row counts/checksum.
7. Import is intentionally initial-only; delta synchronization is absent.
8. Outbox publication and receipt-expiry cleanup workers are absent.
9. Production backup/PITR/restore evidence is absent.
10. Observability, load testing, and real-device E2E remain incomplete.

## Five security, performance and UX findings

Security: no IdP/key rotation, no gateway rate limit, no device revocation, no live role grants test, no cross-tenant penetration evidence.

Performance: no query-plan evidence, no load test, no outbox worker, no pagination beyond employee list size, no pool sizing from measurements.
UX: no migration status UI, no reenrollment journey, no reconciliation UI, no graceful adapter fallback, no user-facing cutover communications.

## Final decision

No reviewer found a reason to discard the architecture. All reviewers reject Production launch now. The foundation may be committed because it is isolated and does not alter existing behavior; the next Sprint must be a controlled Staging PostgreSQL execution/reconciliation/restore rehearsal, not feature development.
