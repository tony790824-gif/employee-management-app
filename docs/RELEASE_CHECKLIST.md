# 班客邦 Release Checklist

## Sprint 34 Production read-only access gate

- [x] Repository includes manual Neon provision/verify/disable SQL, exact role checks, process-only secret handling and fail-closed automated tests.
- [x] Evidence commands no longer auto-load `.env.production` or reuse privileged application credentials.
- [x] Distinct Neon read-only access was provisioned and independently verified by the authorized human operator.
- [ ] Netlify, Render and Auth0 read-only access is provisioned and independently authorized.
- [x] Human Neon Provision/Verify evidence is rerun and appended as a sanitized SHA-256 record; the original Sprint 33D hashes remain historical and unchanged.
- [x] Codex made no Production request or change. The human Provision changed only the dedicated evidence role/ACL; no business-data write, Migration, deployment or platform/Auth0 change occurred.

## Sprint 33D Production evidence gate

- [x] Evidence collector enforces Production/read-only flags, GET-only management requests, SELECT-only database inspection, bounded responses and secret-safe output.
- [x] The original 13 sanitized records plus one human Neon record and the 14-entry manifest use SHA-256 and are covered by automated integrity tests.
- [ ] External Netlify/Render/Auth0 access, Production origins and DNS/monitoring/recovery remain BLOCKED pending approved read-only configuration.
- [x] No Production deploy, connection/write, Migration, environment/Auth0/platform/resource change, restore, traffic change or real notification occurred.

## Sprint 33C Production platform gate

- [x] Repository validator enforces explicit Production/read-only mode, safe methods, timeouts, response bounds, no-write SQL and secret redaction.
- [x] Missing Production configuration/access is reported as BLOCKED/NOT_CONFIGURED rather than PASS.
- [ ] Complete every external item in `docs/PRODUCTION_RELEASE_CHECKLIST.md`; current release remains NOT READY.
- [x] No Production deploy, database/Migration, Auth0/platform mutation, traffic change or real notification occurred in Sprint 33C.

## Sprint 33B Production Security & Operations Gate

- [x] Environment-specific frontend CSP/HSTS/frame/object/referrer/permissions headers are generated and Production contains no Staging API/Auth0 origin.
- [x] Authenticated Session/read/Command rate limits are bounded, principal-hashed, return 429 safely, and do not replace authorization.
- [x] Health/readiness expose non-sensitive environment/build identity; request telemetry excludes identity, Session, token, cookie, payload, endpoint, and personal data.
- [x] `db:status:readonly` requires a separate read-only role, approved host, TLS, `neondb`, and issues no schema/ledger/lock/write operation.
- [x] Auth0 Production public discovery/JWKS validator rejects development/Staging tenant and non-RS256 configuration.
- [x] VAPID parity reports a fingerprint only; capacity smoke is bounded and Staging-only; sensitive scan covers tracked files.
- [x] Release Gate enforces a 2 MB total frontend budget and a 500 KB per-asset budget.
- [x] GitHub quality workflow has read-only contents permission, frozen install, Release Gate, and dependency audit, with no deploy or database credential.
- [ ] Read-only Production schema evidence is owner-authorized and recorded — PENDING EXTERNAL APPROVAL.
- [ ] Production Auth0 Application/API/Action/security-event delivery is owner-validated — PENDING EXTERNAL APPROVAL.
- [ ] Production backup/isolated restore meets RPO 15 minutes and RTO 60 minutes — PENDING EXTERNAL APPROVAL.
- [ ] Monitoring alerts, capacity thresholds, and physical-device gates are accepted — PENDING EXTERNAL APPROVAL.
- [x] No Production deployment, database connection/write, Migration, Auth0 mutation, Google Sheets/Apps Script change, or cloud-resource creation occurred in Sprint 33B.

## Sprint 32 Announcement Center gate (Staging only)

- [x] `0022_announcement_center` apply/rollback/reapply and checksum `e5056c193598a4dcabcee961ce924caf428ca1207d059ed4448ae85dc9cfc8d3` verified on Neon Staging.
- [x] `announcement` and `announcement_read` use tenant-safe foreign keys, indexes, forced RLS, soft delete, and audience constraints.
- [x] Manager CRUD and employee audience-filtered read pass; employee mutation, unknown role, and cross-Workspace access fail closed.
- [x] API Role has zero direct table/sequence privilege and only the reviewed Announcement controlled functions.
- [x] Publication uses one `ANNOUNCEMENT_CREATED` outbox event and the existing Notification Center, Web Push queue/worker, badge, revision, priority/fallback, and deduplication paths.
- [x] Read state synchronizes the Announcement badge and matching Notification Center row without changing the existing notification schema columns/tables.
- [x] Navigation is restricted to `/announcements` or `/announcements/{uuid}`; external, protocol-relative, `javascript:`, and `data:` destinations are rejected.
- [x] Build, Check, full tests, Release Gate, dependency audit, environment isolation, sensitive scan, and `git diff --check` pass.
- [ ] Windows installed PWA list/detail/read/badge/push/click — PENDING USER VERIFICATION.
- [ ] Android installed PWA list/detail/read/badge/push/click — PENDING USER VERIFICATION.
- [ ] iPhone Home Screen PWA list/detail/read/badge/push/click — PENDING USER VERIFICATION.
- [ ] iPad Home Screen PWA list/detail/read/badge/push/click — PENDING USER VERIFICATION.
- [x] Production, Production database/Migration/Auth0, Google Sheets, Apps Script, and Production deployment unchanged.

## Sprint 31 real-event notification gate (Staging only)

- [x] `0019_real_event_notifications` checksum verified and Neon Staging apply/down/reapply completed.
- [x] Clock-in/out notify active boss/manager recipients in the same Workspace and exclude the actor.
- [x] Leave submissions notify only active reviewers; approval/rejection notify only the applicant.
- [x] Schedule creation/direct approved leave update notify only the affected employee.
- [x] Clock/leave/shift preferences suppress only future matching notifications; `push.test` remains independent.
- [x] Notification/outbox/delivery idempotency, bounded retry, 404/410 cleanup, Badge/revision refresh, and click destination allowlist remain covered.
- [x] API Role has zero direct notification/preference table privilege and only reviewed controlled function execution.
- [x] Workspace A/B isolation, cross-recipient denial, actor exclusion, and private-detail exclusion pass synthetic E2E.
- [x] Notification click uses exact same-scope destinations, prefers the recorded installed PWA client, never navigates/reloads an authenticated client, and opens one safe window only when no suitable PWA client exists.
- [x] `0020_push_subscription_priority` is applied only to Neon Staging; its checksum, least privilege, Browser-only fallback, Windows/Android/iOS PWA priority, Workspace isolation, Notification Center single-row behavior, deduplication, Badge, and notificationclick regressions pass.
- [x] `0021_push_delivery_fallback` is applied only to Neon Staging with checksum `7ec470b263bda1c0677432f1a0f5cb255cefcd25fdf4e256ea6b7fb35f3105f4`; PWA 404/410 revocation produces one eligible Browser fallback without duplicating Notification Center rows or widening API Role privileges.
- [x] Authenticated bootstrap reconciles an existing installed-PWA subscription to `client_mode=pwa` and the current Session before real-event delivery selection.
- [x] Source/Staging PostgreSQL Service Worker caches advanced to `banke-production-v7` / `banke-staging-postgres-v10` so installed clients do not retain the pre-priority worker.
- [ ] Same Windows Workspace/User with installed PWA plus Browser receives exactly one PWA system notification; Browser receives one only after the PWA subscription is disabled — PENDING USER VERIFICATION.
- [ ] Windows physical-device delivery/click/badge/preferences — PENDING USER VERIFICATION.
- [ ] iPhone Home Screen PWA delivery/click/badge/preferences — PENDING USER VERIFICATION.
- [ ] iPad Home Screen PWA delivery/click/badge/preferences — PENDING USER VERIFICATION.
- [ ] Android installed PWA real business-event delivery/preferences — PENDING USER VERIFICATION.
- [x] Production, Production DB/Migration/Auth0, Google Sheets, Apps Script, and Production deployment were not touched.

## Sprint 29 — Windows Edge and Apple Home Screen PWA Web Push gate

- [x] Existing standard Web Push, VAPID, Notification Center, Service Worker, and Staging
  provider allowlist architecture is reused without Firebase/APNs/email/SMS.
- [x] Desktop-style iPadOS is classified as `ipados`; Apple activation is limited to a Home
  Screen standalone PWA.
- [x] Denied/unsupported activation cannot leave the Push operation lock permanently active.
- [x] Duplicate activation, controlled unregister/disable, and stale account-switch
  subscription handling have automated coverage.
- [x] Notification click focuses/opens only a same-origin Notification Center target and
  external targets fail closed.
- [x] Stable notification tags and mark-all-read badge/list consistency have automated
  coverage.
- [ ] Windows Edge installed-PWA physical-device checklist is owner-verified.
- [ ] iPhone Home Screen PWA physical-device checklist is owner-verified.
- [ ] iPad Home Screen PWA physical-device checklist is owner-verified.
- [ ] Sprint 29 may be marked COMPLETE only after all available required physical-device
  evidence is recorded; current status is **PARTIAL / PENDING USER VERIFICATION**.
- [x] Production, Production database/Migration/Auth0, Google Sheets, Apps Script, and
  Production deployment were not operated.

## Sprint 28 — FCM standard Web Push transport hardening

- [x] Chrome/Android endpoints are restricted to exact `fcm.googleapis.com`; arbitrary HTTPS and lookalike hosts fail closed.
- [x] ADR 0017 remains standard Web Push with VAPID, `web-push`, and the existing Service Worker; no Firebase SDK/project/registration token was added.
- [x] Synthetic Neon Staging proves registration, same-endpoint update, controlled removal, and re-subscription.
- [x] HTTP 404 and 410 delivery responses make the delivery dead and revoke the affected subscription.
- [x] Foreground Notification Center, unread badge, background notification display, same-origin click-to-focus/open, and subscription-change signaling have automated coverage.
- [x] Workspace A/B, live Session/Membership, endpoint ownership, API table denial, and worker-function separation remain enforced.
- [x] Production, Production database, Production Auth0, Google Sheets, and Apps Script were not modified or deployed.
- [x] Android Chrome/installed-PWA core background delivery is owner-verified after 20:22 (Asia/Taipei) on 2026-07-30: Push enabled, same-device test sent, App returned to the Home screen, and Android system background notification received.
- [x] Sprint 28 is **COMPLETE** at implementation baseline `d19765f9bf8be3f8812f783f03b081aaf5678c75`; current assessed completion is 95%.
- [ ] Notification click, badge/list consistency, disable, and re-subscribe remain recommended real-device evidence for the Sprint 29 cross-device release gate; automated coverage already passes.

## Sprint 27 — Standard Web Push

- [x] Edge `*.notify.windows.com` endpoints are accepted by the same strict Node and database policy used for register/unregister/test; arbitrary HTTPS and lookalike domains remain rejected.
- [x] `0018_edge_web_push_provider_allowlist` is additive, Staging-gated, checksum-recorded, transaction-protected, and has a fail-closed down migration.
- [ ] Re-verify Edge re-registration end to end: controlled unregister → browser unsubscribe/new subscribe → controlled register → enabled UI.
- [x] Notification Center remains authoritative; Push is a best-effort delivery channel.
- [x] `0016_web_push_subscriptions` uses composite tenant constraints, forced RLS, PUBLIC revocation, idempotent enqueue, and complete down migration.
- [x] Neon Staging apply/down/reapply and checksum verification pass; `0009`/`0010` remain unapplied.
- [x] API Role has zero direct table/sequence privileges and only the two added controlled API function grants.
- [x] Separate worker Role design has no ownership, table/sequence access, elevated attributes, or RLS bypass.
- [x] Live Neon Staging synthetic E2E passes Workspace A/B isolation, registration/unregistration, queue projection, idempotency, rate limiting, payload privacy, Membership revocation, and API direct-table denial.
- [x] Payload excludes tokens, Session IDs, leave reasons, contact data, PINs, and subscription keys.
- [x] Service Worker validates payloads, restricts clicks to same-origin paths, and never stores credentials.
- [x] Browser permission is requested only after a user gesture; iPhone/iPad requires Home Screen PWA.
- [x] Explicit PostgreSQL logout attempts controlled subscription revocation before clearing the Session; failure still fails closed through live Session authorization.
- [x] Configure distinct Staging worker credential and VAPID secrets in Render; confirm the worker is enabled and readiness remains HTTP 200.
- [x] Build a non-Production `STAGING POSTGRES` Draft containing only the public VAPID key.
- [ ] Add the exact new Draft origin to existing Staging Auth0 and Render allowlists.
- [ ] Complete real Windows Chrome delivery acceptance.
- [x] Diagnose the Windows test-button failure as `429 PUSH_RATE_LIMITED`; preserve the three-per-ten-minute limit and replace the generic authorization message with code-specific Chinese guidance.
- [x] Cover clean-profile enable → register → immediate test, exact endpoint/payload/headers, and non-invalidating 429 handling.
- [ ] Re-verify the fixed Windows flow on the replacement non-Production Draft.
- [ ] Complete real iPhone Home Screen PWA delivery acceptance.
- [x] Production was not deployed, migrated, or modified.

## Sprint 25 — Notification Center Foundation

- [x] Notification schema is Workspace- and recipient-scoped with composite constraints, indexes, forced RLS, and PUBLIC revocation.
- [x] Outbox projection runs in the existing command transaction and copies no leave reason, contact data, token, Session ID, or credential.
- [x] API Role design has zero direct notification-table access and only three explicit notification function grants.
- [x] `GET /v1/notifications` is recipient-only and sorted unread first/newest first.
- [x] Mark-one and mark-all Commands use existing live authorization, idempotency, audit, and revision rules.
- [x] Notification state participates in the deterministic bootstrap revision and reuses Smart Polling/cross-tab/Service Worker signals.
- [x] PostgreSQL-only badge/dialog/read UI uses safe DOM rendering and mobile touch sizing; Google Sheets remains inactive.
- [x] Build, check, full regression, release gate, sensitive-information scan, and dependency audit pass.
- [x] `0014_notification_center` Staging apply/down/reapply, grants, dual-Workspace privacy, and boss/employee API E2E completed in Sprint 26.
- [x] Production was not deployed or modified; no database migration was executed.

## Sprint 24 — Real-time Sync v2 automated gate

- [x] One adaptive PostgreSQL synchronization controller uses 2-second active, 20-second idle, and 60-second background intervals.
- [x] Debounce, cooldown, one timer, and one in-flight request prevent duplicate or overlapping synchronization.
- [x] `X-Bootstrap-Revision` matches the authorized JSON body; malformed or mismatched headers fail closed.
- [x] Unchanged revisions do not fetch the full bootstrap or render; changed revisions merge changed top-level sections and notify affected listeners.
- [x] BroadcastChannel, storage, and Service Worker signals contain revision metadata only and remain environment-scoped.
- [x] Offline/online recovery retains current UI and does not create an unbounded retry loop.
- [x] Build, check, full regression, release gate, environment isolation, sensitive-information scan, and Production dependency audit pass.
- [ ] Windows, iPhone, Android, and iPad real-device Smart Polling acceptance is **PENDING USER VERIFICATION**.
- [x] No Production deployment, database/Migration operation, Auth0 change, Google Sheets change, Apps Script change, dependency change, or cloud-resource change was performed.

## Sprint 22 — PostgreSQL foreground polling synchronization

- [x] Poll interval is centralized at 15 seconds and runs only for authenticated, visible, online PostgreSQL views.
- [x] The implementation extends the single Sprint 21 controller and reuses its debounce, cooldown, shared in-flight request, bootstrap validation, and Session handling.
- [x] Hidden, offline, logout, Session clear, `pagehide`, and `beforeunload` stop scheduled cycles.
- [x] Visible, `pageshow`, focus, and online recovery resume one polling timer without duplicates.
- [x] Unchanged server revision does not replace state or rerender; changed revision follows the existing bootstrap render path.
- [x] Poll failures retain current UI, do not force logout, retry on a later cycle, and do not flood Console warnings.
- [x] Google Sheets and Production paths install no PostgreSQL polling listeners.
- [x] No WebSocket, SSE, dependency, API, database, migration, Auth0, Render, Netlify, Google Sheets, or Apps Script change was introduced.
- [x] Fake-timer focused tests, build, check, full regression, release gate, environment isolation, sensitive-information scan, and dependency audit pass.
- [ ] Windows signed-in boss/employee foreground polling acceptance shows approval within 20 seconds without manual reload, flicker, duplicate request, Console error, or form/navigation loss.
- [ ] iPhone Safari/PWA signed-in foreground polling acceptance passes; status remains **PENDING USER VERIFICATION**.
- [ ] Product owner records the final Sprint 22 release decision before Sprint 23 begins.

## Sprint 21 — PostgreSQL foreground synchronization

- [x] Foreground refresh is limited to authenticated PostgreSQL mode.
- [x] `visibilitychange`, `pageshow`, and focus signals are debounced and deduplicated.
- [x] Only one bootstrap request can be in flight; stale results after Session/client changes are ignored.
- [x] The server-issued revision is deterministic over role-visible bootstrap data.
- [x] Unchanged revision does not replace state or rerender the UI.
- [x] Changed revision refreshes the role-scoped view without navigation reset or full-page loading.
- [x] Time-off foreground refresh preserves unsent employee forms and retains current UI after failure.
- [x] Logout/Session clearing stops automatic protected API calls.
- [x] Google Sheets and Production environment behavior remains unchanged.
- [x] Focused regression, full tests, build, check, release gate, environment isolation, sensitive-information scan, and production dependency audit pass.
- [ ] New Draft origin is added to Auth0 Staging callback/logout/web-origin/CORS allowlists and Render `BANK_ALLOWED_ORIGINS`.
- [ ] Windows signed-in employee/boss foreground acceptance passes without reload, flicker, duplicate request, or Console error.
- [ ] iPhone Safari/PWA foreground acceptance passes; until then this item is **PENDING USER VERIFICATION**.

## Time-off workflow Phase 1 — Staging backend

- [x] Baseline commit is `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`; documented overall completion is 87%.
- [x] Scheduled leave and ad-hoc leave use distinct request kinds.
- [x] Pending requests do not alter authoritative schedule, hours, or payroll inputs.
- [x] Only approved scheduled leave updates final monthly `leave_selections`.
- [x] Ad-hoc leave does not consume the fixed eight-day scheduled-leave quota.
- [x] Employee submit/cancel is self-only; manager approve/reject is server-authorized.
- [x] Approved coworker scheduled leave exposes only name/date in the same Workspace.
- [x] Ad-hoc leave reasons are private to the applicant and authorized manager.
- [x] Cross-Workspace, unknown-role, direct-table, duplicate-submit, and duplicate-review tests fail closed.
- [x] Migration `0013_time_off_requests` up/down/reapply and checksum verification passed on Neon Staging; it is not applied to Production and `0009`／`0010` were not changed or applied.
- [x] `GET /v1/time-off-requests` and the six reviewed commands are documented consistently in OpenAPI and API documentation.
- [x] The six commands are `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- [x] Production, Google Sheets, Apps Script, Auth0, and frontend UI were not changed.
- [ ] **「前端排休／請假 UI 與老闆審核接線」** is implemented: employee “我的排休”／“我要請假”, quota/status, approved same-store overview, manager pending/processed review, confirmed approve/reject, and privacy-safe mobile presentation.
- [ ] A new non-Production Draft is created for this feature and iPhone UI acceptance passes.
- [ ] iPhone Safari and Android Chrome workflows pass on a non-Production Draft.
- [ ] Product owner approves any future legacy-data conversion rule.
- [ ] Explicit Production migration approval is granted.

## Reversible Staging browser PostgreSQL cutover — 2026-07-22

- [x] Built the isolated `STAGING POSTGRES` bundle with a fixed Render Staging API and approved synthetic Workspace scope; no Production build or deploy was promoted.
- [x] Deployed only to the fixed Netlify Draft origin and confirmed Auth0 login was initiated by the App with the Staging audience and approved callback origin.
- [x] Completed real employee UI leave and clock flows and real boss UI attendance-hour persistence; restored temporary leave and hour values after verification.
- [x] Exercised boss employee/shift command wiring and authoritative bootstrap refresh through focused regression coverage.
- [x] Confirmed the browser UI was hydrated from the PostgreSQL adapter and did not silently fall back to Apps Script/Google Sheets while `STAGING POSTGRES` was active.
- [x] Reconciled live boss/employee bootstrap scope, revision metadata and expected employee/leave/attendance values; the live Staging test passed with the approved unchanged key ID.
- [x] Confirmed a valid Workspace B boss cannot enter the Workspace A Draft and receives a fail-closed authorization/command validation error.
- [x] Confirmed Session/Membership/role and direct-table boundaries through live Staging regression; invalid Session and membership loss remain covered by the existing security suite.
- [x] Confirmed network unavailable and the 15-second bounded-timeout path produce explicit errors without silent fallback; idempotency prevents duplicate command execution.
- [x] Advanced the isolated PostgreSQL cache namespace to `banke-staging-postgres-v4`; no Local, normal Staging or Production cache name is reused.
- [x] Confirmed the browser Console had no JavaScript error in the accepted PostgreSQL view and after rollback.
- [x] Rolled the fixed Draft origin back to normal Google Sheets Staging and verified its label changed from `STAGING POSTGRES` to `STAGING` after service-worker activation.
- [x] Confirmed Production, Production database/Auth0/Netlify, Google Sheets data and Apps Script were not modified or deployed.
- [ ] Complete the separate real phone/tablet/desktop, installability, touch and accessibility acceptance before any Production promotion.

## Staging browser PostgreSQL cutover preflight — 2026-07-22

### Read-only configuration evidence

- [x] Confirmed normal Staging and Production remain on Google Sheets and have no committed PostgreSQL endpoint.
- [x] Confirmed the isolated `STAGING POSTGRES` build has separate manifest, service-worker/cache, localStorage and Session namespaces.
- [x] Confirmed Render Staging `https://bankeban-staging-node-api.onrender.com/v1/readiness` responds successfully.
- [x] Confirmed Neon Staging `neondb` has accepted `0011_ui_bootstrap`, the controlled function, approved checksum and key ID `render-staging-20260722-49a11f`.
- [x] Confirmed no additional Migration is required; 0009/0010 remain deliberately pending and must not be bundled into the cutover.
- [x] Confirmed Auth0 Staging source configuration uses PKCE S256, the Staging API audience and the accepted namespaced Session claim.
- [x] Inspected the current Netlify Draft Preview without changing it; it is `LOCAL PREVIEW`／Google Sheets and is not eligible for the PostgreSQL rehearsal.
- [x] Confirmed `.env` and `.env.production` remain Git-ignored and no credential is committed in this checklist.
- [x] Confirmed this Preflight performed no browser switch, full E2E, deploy, database mutation or Production change.

### External gates before the full Sprint

- [ ] Supply `BANKE_STAGING_POSTGRES_API_URL` from the approved Render Staging endpoint through the protected Draft build environment.
- [ ] Supply the approved synthetic `BANKE_STAGING_WORKSPACE_ID` through the protected Draft build environment; never commit it as a Production default.
- [ ] Choose a stable HTTPS Draft/branch origin and add the exact origin to Render's allowlist.
- [ ] Add the same exact origin and callback/logout routes to Auth0 Staging Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins and CORS.
- [ ] Confirm one synthetic Auth0 Staging boss and one synthetic employee; both must have active database identities, Sessions and Memberships in the approved synthetic Workspace.
- [ ] Confirm a second synthetic Workspace/identity is available for cross-tenant denial checks. Do not record credentials here.

### Next full Sprint execution and expected results

1. Record baseline Render readiness, Neon `0011` status/checksum/key ID and the unchanged Google Sheets Staging behavior.
2. Verify the synthetic boss/employee identities and live Membership/role state without exposing credentials.
3. Build only with `pnpm build:staging:postgres`; reject any output not visibly labelled `STAGING POSTGRES`.
4. Create a Netlify Draft deploy only. Do not publish to the Site's Production deploy or change Production aliases.
5. Bind the resulting exact Draft origin in Render/Auth0, then initiate Auth0 login from the App using Authorization Code + PKCE.
6. In browser Network/Console, prove every PostgreSQL data request uses only the approved Render HTTPS origin; no Apps Script, Google Sheets or Production API request is allowed, and there must be no JavaScript error.
7. Boss bootstrap must show the approved Workspace and employee roster; employee bootstrap must show only employee-authorized data; a client-supplied alternate Workspace and the second Workspace must be rejected.
8. Reconcile employee count, identifiers, role-visible schedule/leave/attendance/payroll fields and revision metadata against the accepted Staging snapshot without writing new business data.
9. Reload and logout must preserve/clear only the isolated Staging-PostgreSQL namespace; expired/revoked Session and removed Membership must fail closed without Google Sheets fallback.
10. Exercise API timeout, offline/weak network and repeated navigation: show a bounded error/retry state, never silent backend fallback, duplicate mutation or infinite spinner.
11. Verify the service worker and Cache Storage use only the Staging-PostgreSQL names; no Local, normal Staging or Production cached response may hydrate the App.
12. Run the rollback: stop using the Draft, clear only its isolated Session/storage/cache, reopen the unchanged normal Staging Google Sheets path, and reconfirm Render/Neon status without schema or data mutation.

### Immediate stop and rollback conditions

- [ ] Any request targets Production, Apps Script or Google Sheets while the PostgreSQL rehearsal is active.
- [ ] Render/Auth0 accepts an unlisted origin, or callback/logout returns to an unapproved host.
- [ ] Boss/employee role scope, live Membership or cross-Workspace denial differs from the accepted API evidence.
- [ ] Bootstrap reconciliation differs from the accepted snapshot or causes an unexpected write.
- [ ] Console error, infinite loading, silent timeout fallback, duplicate request/mutation or cache namespace pollution occurs.
- [ ] The unchanged Google Sheets Staging path cannot be restored immediately.

When any condition occurs: stop the Draft rehearsal, do not promote it, preserve logs without tokens or personal data, clear only the isolated Draft state, restore the unchanged Google Sheets Staging surface, and open a narrowly scoped defect. Production remains untouched.

## Neon Staging UI bootstrap acceptance — 2026-07-22

- [x] Confirmed `BANK_ENV=staging`, the approved Neon Staging host/database and separate API/migration roles before mutation.
- [x] Confirmed migrations 0001–0008 and the active synchronized key ID `render-staging-20260722-49a11f` before applying 0011.
- [x] Applied only `0011_ui_bootstrap`; 0009 and 0010 remain intentionally pending.
- [x] Recorded checksum `0218d807d58d5b112f4095ac6ac9dfa2652793082c2a6881babd0ad9751748bf` and verified ledger/function consistency.
- [x] Reapplied the least-privilege API allowlist: zero table grants and five controlled functions.
- [x] Passed live boss/employee bootstrap, Session/Membership/role scope and cross-Workspace denial E2E.
- [x] Completed a transactional rollback, confirmed absence, reapplied 0011 and reran the E2E successfully.
- [x] Confirmed the synchronized key was neither regenerated nor changed.
- [x] Confirmed Render Staging `/v1/readiness` returns HTTP 200 and `ok: true`.
- [ ] Complete browser-side reversible Staging PostgreSQL cutover, reconciliation, weak-network and rollback acceptance before changing any frontend data source.

Production, Google Sheets, Apps Script, Auth0 and the Production frontend were not modified or deployed.

## Isolated PostgreSQL UI rehearsal gate — 2026-07-22

- [x] Authenticated read/bootstrap exists behind a controlled database function and live Session/Membership verification.
- [x] Boss and employee bootstrap payloads are scoped by the server-authorized role; the frontend cannot select the trusted tenant.
- [x] A separate `STAGING POSTGRES` build has isolated manifest, cache, storage and session namespaces.
- [x] Normal Staging and Production remain on Google Sheets; the existing Draft Preview is unchanged.
- [x] Local adapter rehearsal covers readiness, session establishment, bootstrap, state hydration and logout cleanup.
- [x] Define the approved isolated Render Staging Node API resource with automatic deploys disabled and protected Staging-only configuration.
- [x] Create/link the Render resource, enter protected values and verify the first healthy deployment.
- [x] Apply `0011_ui_bootstrap` and refresh the exact API function allowlist in Staging.
- [ ] Complete live boss/employee read reconciliation, reload/logout, timeout/weak-network, rollback and browser E2E.

## PostgreSQL frontend cutover gate — 2026-07-20

- [x] A single reviewed browser API transport factory is packaged in reproducible builds.
- [x] Remote HTTP, credential-bearing URLs, oversized requests/responses, invalid Workspace IDs and unknown commands fail closed.
- [x] Session-invalid responses produce a non-sensitive event and never log bearer tokens.
- [x] Local, Staging and Production committed profiles keep `postgresApiUrl` empty; Staging/Production remain on Google Sheets.
- [x] Existing Netlify Draft Preview was not rebuilt, replaced or deployed by this Sprint.
- [x] Add the reviewed Render Blueprint and secret/configuration boundary for the isolated Staging endpoint.
- [ ] Create/link the Render resource and verify its HTTPS health/readiness endpoints.
- [x] Complete the read/bootstrap API required to render both roles without Google Sheets fallback (source and local rehearsal).
- [ ] Pass reconciliation, rollback, cache isolation, weak-network and boss/employee Staging cutover E2E.
- [ ] Obtain explicit approval before any Production endpoint, frontend switch or deployment.

## Project cleanup and technical-debt gate — 2026-07-20

- [x] 正式來源、建置白名單、runtime loader、package scripts 與 Runbook 引用已交叉盤點；未發現可安全刪除的 dead source。
- [x] `pg`、`@aws-sdk/client-secrets-manager`、`fflate` 均有可追蹤的實際用途，沒有移除依賴。
- [x] 自包含的 Auth0 Staging initiation 測試已加入完整測試鏈；人工 Staging acceptance 腳本已加入語法檢查。
- [x] migration rollback 快照的內容重複已確認為刻意設計，未誤刪 migration history。
- [x] helper 重複與 ADR 編號衝突已記錄為技術債，未在清理工作中跨信任邊界重構。
- [x] 完整 `release:check`、Staging build、依賴 audit 與 tracked-file Secret scan 已於 2026-07-20 通過。

本閘門不建立 AWS/Auth0/Netlify 資源、不修改或部署 Production，也不變更架構決策。

## Lambda artifact packaging gate — 2026-07-20

- [x] Production dependencies are installed from the committed pnpm lockfile with scripts disabled; the local cache is preferred and only missing locked content may be retrieved.
- [x] `pg` and `@aws-sdk/client-secrets-manager` are packaged explicitly; the function does not rely on mutable runtime-included SDK versions.
- [x] Hoisted dependencies contain no pnpm symlinks or absolute store paths.
- [x] ZIP entries are sorted and use a fixed timestamp; two independent builds produce identical bytes and SHA256.
- [x] Artifact contains a deterministic manifest and CycloneDX 1.5 SBOM.
- [x] `.env`, key, certificate and pnpm metadata files are excluded or rejected.
- [x] Packaged Handler, PostgreSQL driver and AWS SDK resolve in an isolated local invocation.
- [x] Artifact output is Git-ignored and no binary artifact or Secret is committed.
- [ ] Review the generated SHA256/SBOM and upload the exact ZIP to an approved versioned Staging artifact bucket.
- [ ] Run AWS `ValidateTemplate`, review a Staging-only change set and bind the resulting immutable S3 object version.

No AWS resource or service was created or deployed by this gate.

## AWS Staging infrastructure preparation gate — 2026-07-20

- [x] CloudFormation is Staging-only and contains no credential, database URL, token or Production endpoint.
- [x] Partner rule and Lambda consumer are independently disabled by default.
- [x] Lambda artifact requires an immutable S3 object version.
- [x] EventBridge delivery failure and Lambda processing failure use separate encrypted DLQs.
- [x] SQS visibility timeout covers six Lambda timeouts plus the batch window; partial-batch handling and five-attempt redrive remain enabled.
- [x] Queue policies require TLS and restrict EventBridge sends to the exact rule ARN and AWS account.
- [x] Lambda IAM has no wildcard allow/admin policy; secret and optional customer-managed KMS access are exact-resource and context-bound.
- [x] CloudWatch alarms cover Lambda errors/throttles/duration, queue age, both DLQs and failure to write to the EventBridge DLQ.
- [x] Local structural, reference, resource-type, IAM boundary and regression checks pass.
- [x] Package and locally verify the immutable Lambda artifact and its runtime dependencies.
- [ ] Run AWS `ValidateTemplate` and inspect a Staging-only change set after explicit external approval.
- [ ] Connect and test an approved alarm notification destination.
- [ ] Create resources with both gates disabled, then follow the staged activation/E2E runbook.

No AWS/Auth0/Netlify resource was created, no database migration was applied and Production was not modified or deployed.

## Auth0 Staging security-event pipeline gate — 2026-07-19

- [x] Staging-only EventBridge -> encrypted SQS -> Lambda -> controlled PostgreSQL function IaC is reviewable and repeatable.
- [x] Handler validates exact queue/account/region/partner source/issuer/time and fails closed on missing safe correlation.
- [x] Database inbox and session mutation are transactionally idempotent and store no raw token/payload.
- [x] SQS partial-batch retry, redrive policy and DLQ are configured; EventBridge retry/DLQ is configured independently.
- [x] Event database grant script permits only the reviewed ingest function and no direct table access.
- [x] Synthetic handler, isolation, duplicate, expiry, account-revoke and IaC boundary tests pass.
- [ ] Create the external Auth0/AWS Staging resources and Staging database role/migration after explicit approval.
- [ ] Run a real Auth0 Staging event -> SQS -> Lambda -> PostgreSQL -> old access-token rejection E2E.
- [x] Define operational alarms for queue age, Lambda failures and separate delivery/processing DLQ depth in IaC.
- [ ] Create the external alarm route and execute the alarm/DLQ runbook in isolated Staging.

Production remains blocked from this pipeline. No AWS/Auth0/Netlify resource or Production deployment was created by this milestone.

## Production API database-role acceptance — 2026-07-19

Accepted alternative criterion: Neon/PostgreSQL may retain `PUBLIC CONNECT` on the platform maintenance database `postgres`. This is a known platform/default behavior and is not a Production P0 blocker. Acceptance depends on proving that this connection creates **no additional path** to `neondb` business data, tenant data, controlled functions, credentials, or privileges.

- [x] `DATABASE_API_URL` explicitly names `neondb`; Production configuration targeting any other database fails closed.
- [x] API startup checks `current_database() = 'neondb'` before opening the listener.
- [x] `banke_api_production` is not a member of `neon_superuser` or any other role and has no administrative or `BYPASSRLS` attribute.
- [x] Direct privileges on all `public`/`app_private` tables and sequences are zero.
- [x] EXECUTE is limited to the four reviewed `app_private.api_*` functions; invalid Session/Workspace context fails closed.
- [x] The role cannot create schemas, permanent tables, roles, extensions, foreign servers, or user mappings and cannot disable RLS.
- [x] Connecting to `postgres` exposes no `app_private` schema and PostgreSQL provides no direct cross-database table path into `neondb`.
- [x] `dblink`/`postgres_fdw` cannot be installed or used by the API role to create a cross-database route.
- [x] Migrator, owner, Staging API, and Production API identities/credentials remain separate; credentials stay in ignored environment files or the deployment secret manager.
- [x] TLS certificate verification remains mandatory for Production.
- [ ] Before API deployment, monitor role connection count, statement timeouts, `temp_files`, `temp_bytes`, and unusually large/long temporary workloads.

Known low-risk limitation: PostgreSQL's inherited `PUBLIC TEMPORARY` capability may allow the role to create session-local temporary objects in a database it can connect to. It grants no persistent-schema, business-table, cross-tenant, or cross-database permission. Existing limits (`CONNECTION LIMIT 20`, 10-second statement timeout) reduce exposure; deployment monitoring and platform resource limits remain a P1 operations item, not a P0 authorization failure.

> 2026-07-19 Production database role: `banke_api_production` is isolated from the migrator and Staging roles, owns no objects, has no administrative/RLS-bypass capability, has zero direct table privileges, and can execute only four controlled functions. Production business data remains empty; API/frontend deployment is still blocked.

> 2026-07-18 Identity/Tenant boundary: PostgreSQL migrations 0004 through 0008 add OIDC principal mapping, revocable sessions, signed one-time tenant assertions, and controlled database functions. The runtime API role has zero business-table grants. Synthetic Local/Staging security tests are required to pass, but external Auth0 Staging PKCE and refresh-token lifecycle E2E remains a P0 release gate. Production remains untouched.

## Sprint 3 Identity release gates

- [x] RS256 access-token verification checks issuer, audience, expiration, not-before, key ID, and JWKS rotation behavior.
- [x] Unknown JWKS key ID fails closed.
- [x] Tenant context is resolved from verified issuer/subject plus live database membership, not a token workspace claim.
- [x] Direct business-table access and forged custom GUC access are denied to the runtime API role.
- [x] Session logout, suspension, membership removal, context replay, and simulated refresh-reuse revocation are covered by automated tests.
- [x] Create the isolated Auth0 Staging tenant and configure Authorization Code + PKCE with rotating refresh tokens and reuse detection.
- [x] Complete real Auth0 Staging browser acceptance for PKCE login, refresh rotation/replay, token-family revocation, session-claim binding and provider logout.
- [x] Prove in Staging PostgreSQL that user suspension, membership removal, compromised/revoked sessions and refreshed access tokens cannot bypass live authorization.
- [ ] Deliver Auth0 refresh-reuse/account-disable events to a public isolated Staging endpoint and automatically revoke/compromise the matching local PostgreSQL session.
- [ ] Approve Identity Provider operations/runbook before any frontend cutover or Production deployment.

> 2026-07-17 Frontend isolation: Local/Staging/Production builds now have separate backend configuration, storage/session namespaces, cache prefixes, and PWA identities. Desktop Staging smoke verification passed; real phone/tablet/desktop E2E remains required and is tracked in `docs/STAGING_E2E_CHECKLIST.md`. Production was not deployed.

> 2026-07-17 Staging 證據：隔離 Apps Script 後端的核心 API、revision conflict、session 撤銷、私人備份、實際還原及還原後 readiness 已通過。尚未建立獨立 Staging 前端，也未完成真實手機／平板 E2E，因此本清單仍未全部通過，禁止正式發布。

任何一項未通過都不得發布。

## 本機閘門

- [x] `pnpm release:check` 完整通過（2026-07-20 Project Cleanup）。
- [x] 13 組 P0/state/cleanup 回歸全部通過（2026-07-17）。
- [ ] `dist/` 僅包含發布白名單檔案，且與來源逐檔一致。
- [ ] 老闆／員工本機 smoke 無登入遮罩、白畫面或 console error。
- [ ] CHANGELOG、README、API、Database、Backlog、ADR 與 Runbook 已同步。

## Apps Script 線上閘門

- [x] Staging `createOperationalBackup()` 回傳 `ok: true`（2026-07-17）。
- [x] Staging Drive 備份資料夾與檔案為「受限制／只有自己」（2026-07-17）。
- [x] Staging `verifyLatestOperationalBackup()` checksum、workspace、revision 正確（2026-07-17）。
- [x] Staging `runReleaseReadinessCheck()` 回傳 `ok: true`（2026-07-17）。
- [x] Staging 備份建立時間未超過 24 小時（2026-07-17）。
- [x] Staging 實際 restore、session 撤銷及 restore 後 readiness 通過（2026-07-17）。
- [ ] 已記錄前一個 Apps Script 部署版本與 Netlify deploy，能立即回滾。

## 發布後

- [ ] 老闆既有 PIN 登入成功。
- [ ] 測試員工既有 PIN／首次啟用流程成功。
- [ ] 員工只看到本人資料。
- [ ] 排假儲存、打卡、老闆讀取與 revision 正常。
- [ ] 登出後 session 失效。
- [ ] 發布後沒有新的錯誤率、同步衝突或權限異常。
# Sprint 23 — unified revision synchronization

- [x] Authenticated `GET /v1/bootstrap/revision` is the only foreground decision read.
- [x] The deterministic revision includes role-visible bootstrap and Time-Off state.
- [x] Unchanged revision avoids the full bootstrap request, state replacement, render, and Time-Off refresh.
- [x] Changed revision uses the existing validated bootstrap event/render path.
- [x] The accepted 15-second interval, debounce, cooldown, single timer, one in-flight promise, hidden/offline stop, and Session handling are preserved.
- [x] Time-Off foreground refresh occurs once on a changed bootstrap and preserves unsent forms.
- [x] Google Sheets and Production modes do not install PostgreSQL synchronization behavior.
- [x] No database schema, migration, Auth0, Production, Google Sheets, Apps Script, Render, or Netlify configuration was changed.
- [x] API/client/controller/Time-Off focused regression is added without weakening existing checks.
- [ ] Windows signed-in cross-device approval/shift/clock/hour convergence passes within 20 seconds.
- [ ] iPhone Safari/PWA Sprint 23 convergence passes; status is **PENDING USER VERIFICATION**.
- [ ] Android Chrome/PWA Sprint 23 convergence passes; status is **PENDING USER VERIFICATION**.
- [ ] iPad Safari/PWA Sprint 23 convergence passes; status is **PENDING USER VERIFICATION**.

---
## Sprint 26 — Notification Center Staging activation

- [x] `0014_notification_center` checksum matches `c966d0ee7ac3b09cfaffdb8ef8e92a126db411c5fa4ffcf719709dcf0d83c2bc`.
- [x] Controlled apply/down/reapply and duplicate-up behavior pass on Neon Staging; `0009`/`0010` remain unapplied.
- [x] Additive `0015_notification_command_validation` fixes the real PostgreSQL validation incompatibility without rewriting `0014`.
- [x] Notification table, four indexes, constraints, forced RLS, tenant policy, outbox trigger, and four SECURITY DEFINER functions are present.
- [x] API Role has zero direct table access and exactly the reviewed controlled-function whitelist; PUBLIC table/function grants are zero.
- [x] Synthetic Workspace A/B, recipient privacy, cross-tenant read/write rejection, idempotency, SQL injection, ordering, read state, and revision tests pass and fixtures are removed.
- [x] Render Staging `/v1/readiness` returns HTTP 200 after final reapply.
- [ ] Add the new Draft origin to Auth0 Staging and Render CORS.
- [ ] Complete Windows and iPhone notification badge/navigation/cross-client acceptance; status is **PENDING USER VERIFICATION**.
- [x] No Production deployment, Production database operation, Production Auth0 change, Google Sheets change, or Apps Script change occurred.
