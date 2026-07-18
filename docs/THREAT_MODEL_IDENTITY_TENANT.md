# Identity and tenant-boundary threat model

Date: 2026-07-18
Scope: Local and isolated Staging PostgreSQL/API. Production and the current Google Sheets frontend are unchanged.

## Trust boundaries

1. Auth0 signs short-lived access tokens; clients cannot mint trusted identities.
2. The Node API validates the token and accepts a requested workspace only as untrusted input.
3. The API creates a 30-second HMAC assertion using a service key not available to the database runtime role.
4. Controlled PostgreSQL functions verify the assertion and resolve issuer/subject to an active user and active membership.
5. The runtime database role cannot directly read or write business tables and cannot execute internal verification helpers.

## Threats and controls

| Threat | Control | Residual risk / next gate |
|---|---|---|
| Access token theft | TLS, short Auth0 TTL, strict RS256/issuer/audience/time/JWKS validation, local session check on every request | A stolen bearer token remains usable until expiry or local revocation; DPoP is a later risk-based option |
| Refresh token theft | Real Auth0 Staging rotation, expiration, reuse rejection and family revocation passed without persisting token values | A verified public Staging event path that marks the matching local session compromised automatically is still required |
| API database credential leak | Runtime role has zero table/sequence grants and only four controlled function grants | Credential rotation, vault integration and alerting remain operational work |
| Forged `workspace_id` | Token tenant claims are rejected; requested workspace is checked against live membership | None for the tested API surface; all future functions must use the same boundary |
| Forged custom GUC | Runtime role cannot query tables; controlled functions overwrite internal GUC only after signed identity/membership validation | Database owner or migrator compromise remains out of scope for the runtime boundary |
| Removed/suspended member uses old token | User, identity principal, workspace, membership status and role are checked on every call; a newly signed token cannot restore access | Identity-provider disable events still need external integration |
| Token/context replay | Access token is bounded by Auth0/session; internal assertions use a UUID nonce consumed in PostgreSQL | Bearer access-token replay is not proof-of-possession |
| Signing-key rotation | JWKS cache supports `kid` rotation and unknown keys fail closed; internal context keys have status/not-before/expiry | Context-key rotation runbook/automation remains P1 |
| Logout | Real Auth0 provider logout returns only to the allowlisted Local URL; local logout revokes the PostgreSQL session and rejects the old access token | Provider logout and local revocation are independently proven; automatic provider-event delivery remains pending |
| Malicious JWT headers/JWKS | RS256 only, no critical headers, HTTPS same-origin JWKS, redirect denial, timeout, key-count and RSA-size bounds | Availability still depends on cached JWKS and Auth0 uptime |

## Security invariants proven in Staging

- Workspace A identity cannot access Workspace B.
- Adding a token `workspace_id` is rejected.
- Setting `app.current_workspace_id` manually does not grant table access.
- The API role cannot select employees, update memberships, or call `verify_tenant_context` directly.
- A repeated signed tenant assertion is rejected.
- Suspended user, suspended membership, compromised session and logged-out session are rejected even with an unexpired access token.
- Refreshing/re-signing a token cannot bypass a suspended user or inactive membership, and removing Workspace A membership does not affect an independently valid Workspace B membership.
- Real Auth0 Staging PKCE S256, refresh rotation, old-token reuse rejection, token-family revocation and provider logout passed without logging token/session values.

## Not yet proven

- Automatic Auth0 refresh-reuse/account-disable event delivery to the corresponding local PostgreSQL session.
- Secret-manager rotation, monitoring, rate limiting, WAF and incident response.
- Real browser/mobile token storage and cross-device session management.
- Production load, chaos and failover behavior.
