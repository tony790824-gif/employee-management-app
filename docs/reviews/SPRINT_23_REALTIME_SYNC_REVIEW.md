# Sprint 23 Architecture Review — Real-time Synchronization Hardening

Date: 2026-07-28

## Decision

Extend the accepted Sprint 21/22 controller with one authenticated revision-only read. The server computes one deterministic revision across the caller's role-visible bootstrap and Time-Off state. The browser downloads the full bootstrap only when that revision changes.

## Role review

### A — CTO

The design retains one synchronization controller and one authorization boundary. It avoids a new realtime vendor, a second state system, and a database migration.

### B — Senior Frontend Engineer

The existing timer, debounce, cooldown, in-flight promise, lifecycle events, and state store remain authoritative. Time-Off no longer performs a second read on every unchanged polling cycle; changed bootstrap events refresh it once and preserve drafts.

### C — Backend Architect

`GET /v1/bootstrap/revision` is read-only and returns a minimal response. Both revision and full bootstrap are derived from the same role-visible controlled reads, so a time-off-only mutation cannot be missed.

### D — Database Architect

No schema or migration is required. The tradeoff is that revision derivation still executes controlled role-visible database reads. Measure query load before Production scale; introduce a transactional revision ledger only with evidence and a separately reviewed migration.

### E — Security Engineer

Every revision request still verifies Auth0, local Session, Workspace Membership, role, and signed tenant context. The client-provided Workspace remains untrusted. The endpoint exposes no row data, token, Session ID, or private reason.

### F — QA Lead

Regression covers changed/unchanged revision, time-off-only change, one timer, debounce, in-flight suppression, hidden/offline/logout behavior, safe retry, Time-Off draft preservation, Google Sheets isolation, and API contract behavior. Real devices remain mandatory.

### G — Product Manager

The change directly reduces stale approval, schedule, clock, and approved-hours views without interrupting current work or adding visible complexity.

### H — DevOps Engineer

No Production deploy, new service, new dependency, environment change, or infrastructure change is required. Existing Staging deployment remains the later acceptance target.

### I — Senior Code Reviewer

The primary risks were competing refresh listeners, duplicate Time-Off reads, and revision scope that omitted approvals. The final design removes the unconditional Time-Off polling listener and includes authorized Time-Off state in the server revision.

## Final review outcome

No unresolved architectural P0/P1 issue was found in the code change. Release remains blocked on real Windows, iPhone, Android, and iPad Sprint 23 evidence. The server-side cost of deriving the revision is documented as a measurable performance debt, not hidden as completed optimization.
