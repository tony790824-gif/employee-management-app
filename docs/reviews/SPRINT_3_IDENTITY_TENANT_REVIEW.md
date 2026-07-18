# Sprint 3 Identity and tenant-boundary review

Date: 2026-07-18
Decision: Staging code/database foundation accepted; external Auth0 E2E and Production approval pending.

## Architecture Review

### A — CTO

Auth0 is selected as the single managed OIDC provider. It removes undifferentiated password/recovery/refresh-token operations while PostgreSQL retains application authorization and tenant membership as the source of truth.

### B — Senior Frontend Engineer

No frontend or Google Sheets login was switched. Future browser work must use Authorization Code + PKCE, memory-first access tokens and isolated Staging storage; it is intentionally outside this Sprint.

### C — Backend Architect

The API rejects tenant claims, validates same-origin JWKS and signs single-use internal assertions. Remaining work is the real Auth0 callback/refresh/event adapter and remaining read endpoints.

### D — Database Architect

Security-definer functions are the only runtime capability. They re-resolve user/membership/session on every call. Migrations 0004–0008 add identity/session/context tables and fix two live-engine defects without rewriting applied migration checksums.

### E — Security Engineer

The Sprint closes the forged-GUC database-credential P0 for the implemented API surface. It does not close bearer-token theft, secret-manager rotation, provider event delivery, rate limiting, or monitoring; those remain explicit gates.

### F — QA Lead

Synthetic live tests cover two tenants, every implemented command, suspension/removal, logout, refresh-reuse simulation, assertion replay, direct-table denial, issuer/audience/time failures, JWKS rotation and unknown `kid`.

### G — Product Manager

No visible feature was added. The value is risk reduction and a maintainable SaaS identity boundary; customer-facing login work waits until the external Staging provider exists.

### H — DevOps Engineer

Secrets remain in ignored environment configuration. Production was not touched. Context-key provisioning/rotation and Auth0 event operations need a dedicated runbook before cutover.

### I — Code Reviewer

The implementation modifies existing API/migration structure rather than introducing a parallel stack. Transitional `withTenantTransaction` and static test verifier remain clearly non-Production technical debt.

## Self-review findings

### Ten improvements examined

1. Replace static PEM with same-origin JWKS — implemented.
2. Reject token tenant claims — implemented.
3. Enforce `kid`, RS256, RSA size and critical-header rules — implemented.
4. Bound JWKS cache, refresh and timeout — implemented.
5. Add local revocable sessions — implemented.
6. Resolve membership on every request — implemented.
7. Remove runtime direct-table access — implemented.
8. Add signed, expiring, single-use internal context — implemented.
9. Bind provider session to issuer, subject and internal user — implemented.
10. Add a real Auth0 event adapter and context-key rotation automation — backlog pending external setup.

### Ten bug/edge cases examined

Wrong issuer, wrong audience, expired token, future `nbf`, future `iat`, missing session claim, unknown `kid`, forged workspace claim, assertion replay and removed membership all fail closed. Live testing also found and fixed Session second/millisecond precision and leave resource-ID operator precedence.

### Five security findings

Direct role DML, forged GUC, token tenant claims, assertion replay and stale membership were closed. Provider refresh-event delivery, bearer proof-of-possession and secret-manager rotation remain tracked risks.

### Five performance findings

JWKS is cached; concurrent refreshes share one promise; key/rejected-`kid` sets are bounded; database calls are one controlled statement; membership/session indexes exist. Nonce cleanup per request and SECURITY DEFINER command size should be load-tested before Production.

### Five UX findings

No user-facing UI changed. Future work must cover PKCE redirect recovery, expired-session messaging, workspace selection, logout-all-devices and accessible mobile loading/error states.

## Commercial review

Managed identity lowers account-recovery, abuse and compliance burden. It does not directly increase revenue, but it is mandatory for selling a trustworthy multi-tenant workforce product and reduces high-cost tenant-leak incidents. Offering customers multiple identity/database backends is rejected because it increases support and reliability cost.
