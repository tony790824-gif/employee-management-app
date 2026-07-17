# Staging Frontend Environment

The Staging frontend is a separate build artifact for controlled acceptance. It must never be uploaded to the Production site and it only uses the Staging Apps Script deployment.

## Repeatable builds

```powershell
pnpm build:local
pnpm build:staging
pnpm build
```

- `dist-local/`: local preview, no cloud connection, `banke:local:` storage namespace.
- `dist-staging/`: Staging frontend, Staging backend only, `banke:staging:` storage namespace.
- `dist/`: Production release assets; existing unprefixed browser storage remains compatible.

Build outputs are generated and are not committed.

## Isolation controls

- Backend URL is generated from `config/environments.mjs`.
- Staging assets contain no Production Apps Script URL.
- localStorage and sessionStorage keys are prefixed for Local and Staging.
- Every environment has a different Service Worker cache prefix/name; activation deletes only same-prefix caches.
- Every environment has a different PWA manifest identity, name, and start URL.
- Staging and Local display a fixed environment badge. Production has no badge.
- Staging must use a dedicated non-Production origin. Two Service Worker environments cannot safely share one origin and scope.

Serve `dist-staging/` from a dedicated local port or Staging host. Confirm the badge, Network destinations, and Console. Any Production Apps Script request is a release blocker.

No command in this document deploys Production.
