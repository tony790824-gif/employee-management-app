# 班客邦 Release Checklist

## Sprint 27 — Standard Web Push

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
- [ ] Configure distinct Staging worker credential and VAPID secrets in Render.
- [ ] Complete real Windows Chrome delivery acceptance.
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
