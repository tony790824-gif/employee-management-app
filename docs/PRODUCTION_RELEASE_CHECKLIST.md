# Production Release Checklist

Status: **NOT READY - external evidence required**

Sprint 35 inventory (2026-08-09): Repository and Sprint 34 Neon reader evidence remain PASS. Production schema parity is PARTIAL; capacity is UNKNOWN; Netlify/Render/Auth0 public identities are NOT_CONFIGURED; their management evidence, DNS/TLS, monitoring and recovery are BLOCKED. No Production request or mutation was made during this inventory.

Neon Backup & Restore evidence update: PITR is available with a six-hour history window, but scheduled snapshots are disabled, no snapshot exists, and no isolated restore was executed. The combined backup/restore/RPO/RTO item remains unchecked and PARTIAL/BLOCKED as applicable.

Neon Monitoring evidence update: primary compute is configured for 0.25-2 CU autoscaling and 5-minute autosuspend; RAM/CPU/activity/deadlock/cache/working-set/connection/pooler/database-size monitoring is available. No exact utilization/headroom threshold was retained, so capacity acceptance remains unchecked and PARTIAL.

Netlify evidence update: the Project exists and has Deploy Preview history, but has never had a Production Deploy. Production deploy/domain/branch items remain unchecked; rollback is BLOCKED because no Production deployment history exists. No Preview is accepted as Production evidence.

Render evidence update: a Production-named Environment exists, but its only Service is explicitly the Staging Node API. Independent Production service/API/runtime/deploy/health items remain unchecked and NOT_CONFIGURED/BLOCKED. Environment naming alone is not Production service evidence.

Auth0 evidence update: only one Development Tenant and the Staging SPA exist. Production Tenant/SPA/API/issuer/audience/allowlists remain unchecked and NOT_CONFIGURED; Team Tenant capacity is BLOCKED. Development resources are not Production evidence.

This checklist is Production-specific and complements `docs/RELEASE_CHECKLIST.md`. Checking an item requires direct evidence; repository implementation or Staging proof alone is insufficient.

## Sprint 36 pre-provisioning gates

- [ ] Gate A: dedicated Auth0 Production Tenant/SPA/API explicitly approved and evidenced.
- [ ] Gate B: Neon recovery/capacity work explicitly approved; existing Production database and Sprint 34 roles preserved.
- [ ] Gate C: independent Render Production API/Push worker explicitly approved and evidenced.
- [ ] Gate D: Netlify Production candidate explicitly approved; no Staging/Google Sheets/placeholder/Secret contamination.
- [ ] Gate E: DNS/TLS change explicitly approved with exact rollback records.
- [ ] Monitoring, alert delivery, capacity thresholds and evidence retention PASS.
- [ ] Gate F: exact Production Migration manifest/checksum/recovery plan explicitly approved.
- [ ] Gate G: owner go/no-go and reversible traffic switch explicitly approved.

Unchecked gates are release blockers. Approval for one line never approves another.

## Candidate and repository

- [x] Repository contains confirmation-gated Neon reader provision/verify/disable procedures and fail-closed platform credential validation.
- [x] Distinct Neon reader is SQL-created, exact-role verified and metadata-only; credential value was not exposed or committed.
- [ ] Netlify and Render access is proven read-only for the exact Production resources; otherwise automated evidence remains BLOCKED.
- [ ] Auth0 M2M token contains exactly the five approved read scopes and no mutation scope.
- [ ] Exact candidate Commit recorded; `main` and `origin/main` are 0/0.
- [ ] Build, Check, full tests, Release Gate, Production Repository Gate, sensitive scan, dependency audit, and `git diff --check` pass.
- [ ] `pnpm production:platform:validate` reports no `FAIL`; every `BLOCKED`/`NOT_CONFIGURED` item is resolved with evidence.
- [ ] `pnpm production:evidence:collect` reports PASS for authorized Netlify, Render, Neon and Auth0 evidence; verify the committed SHA-256 manifest.
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

- [x] Read-only role is distinct from Owner, Migrator, API, Push and Staging roles; no dangerous role attributes or DDL privileges exist.
- [x] Classified Function ACL evidence passes: all 11 Bankeban Functions are owned by `neondb_owner`, application PUBLIC/reader EXECUTE counts are zero, and `banke_api_production` has exactly four explicit approved grants.
- [x] Platform Function evidence reports the 37 reviewed `public.pgcrypto` / `cloud_admin` Extension Functions separately as `ACCEPTED_PLATFORM_INFORMATION`; no pgcrypto ACL, owner, or Extension object was mutated.
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
