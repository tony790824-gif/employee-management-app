# Production Operations Runbook

Status: **PENDING EXTERNAL APPROVAL**

This runbook defines the evidence required before Bankeban may leave the current Production Google Sheets path. It does not authorize Production deployment, Migration, Auth0 mutation, database writes, or a destructive restore.

## Release objectives

- Initial business RPO target: **15 minutes**. Provider history, independent encrypted backup, and retained audit evidence must satisfy this before cutover.
- Initial business RTO target: **60 minutes** from incident declaration to a verified read/write service or approved rollback path.
- Availability and latency SLOs require owner approval after the isolated capacity rehearsal. No SLO is considered met without monitoring evidence.

## Gate 1 — Production schema alignment

1. Create a separate least-privilege read-only database credential in the provider secret manager. Do not reuse Owner, Migrator, API, Push, or Staging credentials.
2. Configure it only in the protected operator environment as `DATABASE_READONLY_URL`, with `BANK_ENV=production`, `BANK_PRODUCTION_DATABASE_HOST`, and `DATABASE_SSL=require`.
3. Run `pnpm db:status:readonly`. The tool enables read-only transaction mode and issues only `SELECT`; it does not initialize `schema_migrations`, lock, migrate, or write.
4. Confirm database `neondb`, the expected read-only role, all tracked checksums, and the pending list. Migration `0010` must not appear in the tracked manifest.
5. Before an authorized apply, record a provider restore point/PITR timestamp, current ledger, checksum plan, expected grants, rollback/forward-fix owner, maintenance window, and stop conditions.
6. Migration apply is a separate approval. Stop at the first mismatch or failure; never edit an applied Migration.

## Gate 2 — Auth0 Production validation

1. Use a dedicated non-development Production tenant/Application/API. Staging tenant identifiers are forbidden.
2. Configure protected issuer, audience, JWKS, and Session claim values, then run `pnpm auth:readiness:production`. This reads public discovery/JWKS only and performs no Auth0 mutation.
3. In the Auth0 dashboard, separately verify exact Production callback/logout/web-origin/CORS allowlists, Authorization Code with PKCE S256, RS256 API signing, refresh rotation/reuse policy, token lifetime, and the `https://banke.tw/session_id` Action claim.
4. Deploy and accept the Auth0 security-event pipeline in isolated Staging before creating its Production EventBridge/SQS/Lambda resources. Prove reuse/account-disable events revoke local Sessions without logging identifiers or credentials.

## Gate 3 — Backup, restore, and rollback

1. Select a Production database plan that meets the 15-minute RPO and supports the required retention; the currently recorded short provider history alone is insufficient evidence.
2. Create an independent encrypted backup and record checksum, owner, retention, and access controls without storing URLs or credentials in Git.
3. Restore into a newly isolated non-Production database. Reconcile migration ledger, row counts, RLS, functions, grants, Workspace isolation, API role denial, and core bootstrap/Command behavior.
4. Time the full exercise against the 60-minute RTO. Never perform a destructive restore into the active Production database as a rehearsal.
5. Rollback order: stop traffic promotion, restore the last known frontend alias, stop the new API worker, preserve logs/outbox, choose restore or reviewed forward fix, and re-run readiness before traffic resumes.

## Gate 4 — Monitoring and incident response

Required alerts before launch:

- API readiness failure for two consecutive probes;
- five-minute 5xx rate above 1% or p95 API latency above the accepted capacity baseline;
- repeated 401/403 anomaly, authenticated rate-limit surge, or Origin rejection surge;
- Push queue age/dead delivery growth and provider 4xx/5xx rate;
- PostgreSQL connection saturation, CPU/storage pressure, replication/backup failure;
- Netlify/Render deployment failure and VAPID fingerprint mismatch.

The API emits `api_request_complete` with request ID, normalized route, status, duration, environment, and build SHA only. Alerts and log exports must never contain bearer tokens, cookies, Session IDs, database URLs, Push endpoints/keys, payloads, or personal data.

## Gate 5 — Release, CI, headers, and capacity

1. GitHub `Production Quality Gate` must pass with read-only repository permission and no deployment/database secrets.
2. Run `pnpm release:check`, `pnpm audit --prod`, and `git diff --check` against the exact candidate Commit.
   The local release gate rejects a frontend above 2 MB total or any single asset above 500 KB.
3. Confirm the built `_headers` has CSP, HSTS, frame/object protection, `nosniff`, Referrer Policy, and Permissions Policy. Production must contain no Staging API/Auth0 origin.
4. For PostgreSQL artifacts run `pnpm vapid:parity` with the authoritative public key; only the fingerprint may be reported.
5. Run `pnpm capacity:smoke:staging` against the approved Staging host. The bounded default probes readiness; the accepted rehearsal additionally uses `/v1/bootstrap/revision` with an ephemeral protected token and Workspace ID. It never targets Production and reports route/count/failure/p95 without credentials.
6. Record immutable frontend/API Commit, artifact checksum, schema ledger, Auth0 configuration evidence, backup evidence, monitoring state, and rollback owner in the release ticket.

## External stop conditions

Stop immediately on checksum drift, wrong host/database/role, non-read-only inspection, missing backup, unmet RPO/RTO, Auth0 issuer/audience drift, VAPID mismatch, failed device gate, alerting gap, capacity threshold failure, or any request to bypass Session/Workspace/RLS/security headers. Production remains unavailable until every item is independently accepted.
