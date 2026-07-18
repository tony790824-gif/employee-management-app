# Auth0 Staging connection gate

The code foundation is provider-ready, but no Auth0 tenant, client ID, token or secret is stored in this repository. Do not configure Production.

## One external step required from the project owner

Create an **isolated Auth0 Staging tenant**, then configure one API and one browser application using Authorization Code with PKCE:

- API signing algorithm: RS256.
- Access-token lifetime: 5 minutes.
- Refresh tokens: rotation enabled, expiration enabled, reuse detection/family revocation enabled.
- Allowed callback/logout/web origins: only the isolated Staging frontend origin.
- Add a namespaced access-token claim `https://banke.tw/session_id` containing the provider session identifier through an Auth0 Action.
- Record the non-secret issuer, audience, JWKS URL and browser client ID in the local Staging secret/config store. Do not paste client secrets, refresh tokens, private keys or database URLs into chat or Git.

After that step, the next acceptance must verify discovery/JWKS, PKCE login, refresh rotation, refresh reuse, logout, account disable and local-session revocation against synthetic accounts. Until that acceptance passes, the formal Identity Provider is **not connected** and Production remains blocked.

## Server environment names

- `BANK_OIDC_ISSUER`
- `BANK_OIDC_AUDIENCE`
- `BANK_OIDC_JWKS_URL`
- `BANK_OIDC_SESSION_CLAIM` (defaults to `https://banke.tw/session_id`)
- `BANK_TENANT_CONTEXT_KEY` (base64url, at least 256 bits; secret manager only)
- `BANK_TENANT_CONTEXT_KEY_ID`

The active context key metadata/secret must also be installed through the migrator into `app_private.tenant_context_keys`; the runtime database role cannot read that table.
