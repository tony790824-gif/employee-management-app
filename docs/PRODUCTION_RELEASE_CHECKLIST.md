# Production Release Checklist

Status: **NOT READY - external evidence required**

This checklist is Production-specific and complements `docs/RELEASE_CHECKLIST.md`. Checking an item requires direct evidence; repository implementation or Staging proof alone is insufficient.

## Candidate and repository

- [ ] Exact candidate Commit recorded; `main` and `origin/main` are 0/0.
- [ ] Build, Check, full tests, Release Gate, Production Repository Gate, sensitive scan, dependency audit, and `git diff --check` pass.
- [ ] `pnpm production:platform:validate` reports no `FAIL`; every `BLOCKED`/`NOT_CONFIGURED` item is resolved with evidence.
- [ ] No real `.env`, secret, token, cookie, database URL, private key, test password, or personal data is tracked.

## Frontend / Netlify

- [ ] Approved Production site, custom domain and deploy context are verified read-only.
- [ ] HTTPS and HTTP-to-HTTPS redirect pass; TLS certificate is authorized and not near expiry.
- [ ] `environment-config.js` identifies Production and points only to the approved Production API.
- [ ] Production Service Worker/cache namespace is isolated from Local, Staging, Draft and Google Sheets staging assets.
- [ ] CSP, HSTS, `nosniff`, Referrer Policy, Permissions Policy, `frame-ancestors 'none'`, cache policy and secure cookies pass.
- [ ] Rollback alias/artifact and owner are recorded. No publish occurs during validation.

## API / Render

- [ ] Approved Production service and URL are verified; `/v1/health` and `/v1/readiness` return HTTP 200 with Production environment and immutable build identity.
- [ ] Build/start commands, runtime, region, auto-deploy policy, timeout/proxy settings and protected environment names match the approved design.
- [ ] Exact CORS contains only the approved Production frontend; no Draft, Local or Staging origin is present.
- [ ] Rate limit, request size, telemetry masking and error responses pass without exposing secrets or stack traces.

## Database / Neon

- [ ] Read-only role is distinct from Owner, Migrator, API, Push and Staging roles; no dangerous role attributes or DDL privileges exist.
- [ ] `neondb`, direct approved host, TLS, server version and connection capacity are verified.
- [ ] Migration ledger/order/checksums and repository manifest align; `0010` is not included.
- [ ] Tables, indexes, constraints, functions, triggers, policies, RLS and FORCE RLS match the reviewed schema.
- [ ] Backup/PITR retention meets RPO 15 minutes and an independent isolated restore meets RTO 60 minutes.

## Auth0, DNS and operations

- [ ] Dedicated non-development Tenant/Application/API/Connection/Action are verified.
- [ ] PKCE S256, RS256, exact callbacks/logout/web origins/CORS, token lifetime, refresh rotation/reuse detection, MFA/protections and security-event delivery pass.
- [ ] DNS records, certificate chain, HSTS, mixed-content and secure-cookie behavior pass.
- [ ] Uptime, error, latency, rate-limit, push, database, backup and deployment alerts are connected to named responders.
- [ ] Rollback and incident runbooks have owners and a completed rehearsal record.

## Release decision

- [ ] Every Blocker and High item in `docs/PRODUCTION_READINESS_REPORT.md` and `docs/PRODUCTION_PLATFORM_VALIDATION_REPORT.md` is closed with direct evidence.
- [ ] Explicit owner authorization for the Production release window is recorded separately.
