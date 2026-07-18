# Auth0 Staging connection gate

The code foundation is provider-ready, but no Auth0 tenant, client ID, token or secret is stored in this repository. Do not configure Production.

## One external step required from the project owner

Create an **isolated Auth0 Staging tenant**, then configure one API and one browser application using Authorization Code with PKCE:

- API Identifier / audience: `https://bankeban-staging-api`. Keep this existing immutable Identifier; do not delete and recreate the API solely to rename it.
- API signing algorithm: RS256.
- Access-token lifetime: 5 minutes.
- Allow Offline Access: enabled for this Staging API. Refresh tokens are still issued only when the browser application requests the `offline_access` scope and its Refresh Token grant is enabled.
- Refresh tokens: rotation enabled, expiration enabled, reuse detection/family revocation enabled.
- Allowed callback/logout/web origins: only the isolated Staging frontend origin.
- Add a namespaced access-token claim `https://banke.tw/session_id` containing the provider session identifier through an Auth0 Action.
- Record the non-secret issuer, audience, JWKS URL and browser client ID in the local Staging secret/config store. Do not paste client secrets, refresh tokens, private keys or database URLs into chat or Git.

## 2026-07-19 Staging acceptance status

The isolated Auth0 Staging application has passed a real browser Authorization Code + PKCE S256 flow with `openid profile offline_access`. The issued access token passed exact issuer/audience/RS256/expiry validation, the namespaced session claim was non-empty and matched the ID-token `sid`, refresh rotation succeeded, reuse of the previous refresh token was rejected, the token family was revoked, and provider logout returned only to the allowlisted Local URL. The acceptance harness keeps tokens in process memory and reports only boolean results.

The isolated Staging PostgreSQL/API tests also prove that a suspended user, inactive Workspace A membership, compromised local session and logged-out local session are rejected even when presented with a newly signed or unexpired access token. A user who loses Workspace A membership but retains an active Workspace B membership can access only Workspace B.

Production remains blocked: an Auth0 refresh-reuse/disable event still needs a verified public Staging event path that marks the corresponding local PostgreSQL session compromised or revoked automatically. The current acceptance proves the provider and local enforcement layers separately; it does not claim that external Auth0 events are already delivered to the private Local API.

## Public metadata readiness check

After the non-secret issuer, audience and JWKS URL are stored in the ignored local `.env`, run:

```powershell
pnpm auth:check
```

The check fails closed unless discovery matches the configured issuer/JWKS origin, Authorization Code and PKCE S256 are advertised, and at least one usable 2048-bit RS256 signing key is published. It does not authenticate a user and does not require or print a Client Secret, access token or refresh token.

## Server environment names

- `BANK_OIDC_ISSUER`
- `BANK_OIDC_AUDIENCE`
- `BANK_OIDC_JWKS_URL`
- `BANK_OIDC_SESSION_CLAIM` (defaults to `https://banke.tw/session_id`)
- `BANK_TENANT_CONTEXT_KEY` (base64url, at least 256 bits; secret manager only)
- `BANK_TENANT_CONTEXT_KEY_ID`

The active context key metadata/secret must also be installed through the migrator into `app_private.tenant_context_keys`; the runtime database role cannot read that table.

For the current isolated Staging tenant, set `BANK_OIDC_AUDIENCE` to exactly `https://bankeban-staging-api`. Auth0 API Identifiers are audience identifiers and do not need to resolve as public web pages.
