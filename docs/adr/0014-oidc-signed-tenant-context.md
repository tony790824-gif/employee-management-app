# ADR 0014 — Auth0 OIDC and signed database tenant context

- Date: 2026-07-18
- Status: Accepted for Staging foundation; external Auth0 connection pending
- Production cutover: Not approved

## Context

Sprint 2 proved that PostgreSQL FORCE RLS protects normal API transactions, but the runtime role could directly access business tables and choose `app.current_workspace_id`. Possession of the shared database credential therefore allowed a caller to forge another tenant's custom GUC.

## Decision

Use one managed Identity Provider, **Auth0**, through OAuth 2.0 Authorization Code with PKCE and OIDC. The API accepts only short-lived RS256 access tokens, validates issuer, audience, signature, `exp`, `nbf`, `iat`, a namespaced provider session identifier, and resolves signing keys through same-origin JWKS with bounded caching and rotation. Workspace claims in access tokens are rejected.

The frontend may request a workspace, but the API signs a 30-second, single-use internal assertion. PostgreSQL verifies the assertion with an active key inaccessible to the runtime role, maps OIDC issuer/subject to an active internal user, checks the user, workspace, membership, role and local session on every request, and only then creates transaction-local context. The runtime role has no direct business-table access and may execute only four controlled `app_private.api_*` functions.

Auth0 owns refresh-token rotation, reuse detection and provider-side revocation. The local `auth_sessions` record is independently revocable and is checked on every controlled database call. An Auth0 Staging tenant and event integration are still required before refresh-family replay can automatically mark the corresponding local session compromised.

## Rejected alternatives

- Token `workspace_id` as the authority: stale and client-influenced; membership changes would not take effect immediately.
- Unsigned custom GUC: reproducibly forgeable with a leaked runtime credential.
- One database role per user or tenant: high operational overhead and poor pool compatibility.
- Direct table RLS for the shared runtime role: a leaked credential remains a broad data-plane capability.
- Self-hosted passwords and refresh tokens: increases credential, recovery, abuse, rotation and support burden without product differentiation.

## Consequences

The database credential alone cannot read business tables or call internal verification functions. A valid OIDC identity, active provider/local session, active membership and an API-generated single-use assertion are all required. The HMAC context key becomes a high-value service secret and must be independently rotated through environment/secret management plus `tenant_context_keys`. Production remains blocked until Auth0 Staging is configured, end-to-end login/refresh/logout/reuse events pass, and the frontend adapter is separately approved.
