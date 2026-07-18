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

After that step, the next acceptance must verify discovery/JWKS, PKCE login, refresh rotation, refresh reuse, logout, account disable and local-session revocation against synthetic accounts. Until that acceptance passes, the formal Identity Provider is **not connected** and Production remains blocked.

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
