# 班客邦

## Sprint 37 Production Provisioning Preflight (2026-08-09)

- Consolidated every Production blocker and classified it as safely automatable, user action, external limit, possible billing, approval required and/or missing evidence.
- Revalidated ADR 0022's one-gate provisioning order and established an explicit **NO-GO** authorization gate.
- No Production resource, configuration, database, Migration, deploy, DNS, Secret, purchase or traffic was operated. Product completion remains 98%; Production readiness remains 70% / NOT READY.
- The next single human step is read-only Auth0 plan/Tenant-capacity review; it does not authorize purchase or resource creation.

## Sprint 36 Production Resource Provisioning Plan (2026-08-09)

- Added a fail-closed, one-gate-at-a-time Production provisioning plan covering dedicated Auth0, Neon recovery/capacity, Render API/Push worker, Netlify frontend, DNS/TLS, Migration and traffic approval boundaries.
- Added an explicit Staging/Production isolation matrix, Secret handling rules, evidence requirements, dependency order and cross-layer rollback plan.
- No Production resource, configuration, database, Migration, deploy, DNS, traffic or Secret was operated. Product completion remains 98%; Production readiness remains 70% / NOT READY.
- The next single step is a human Gate A approve/reject decision for Auth0 Production tenant capacity and dedicated identity resources.

## Sprint 34 Production Read-only Access Provisioning (2026-08-08)

- Neon compatibility fix: the first authorized Production run stopped at its first mutation because a non-superuser cannot issue `ALTER ROLE ... NOSUPERUSER`. The corrected script fail-closes on dangerous attributes and mutates only Neon-compatible role properties; human re-run is pending and Neon evidence remains BLOCKED.
- Added fail-closed, least-privilege Production evidence provisioning controls and manual Neon role provision/verify/disable procedures. The database reader can inspect catalogs and `schema_migrations` only; it cannot read business tables, write, own objects, inherit roles, or execute application functions.
- Netlify, Render and Auth0 evidence now requires separately proven read-only authority before any request. The protected operator environment does not currently contain those credentials or `DATABASE_READONLY_URL`, so the evidence re-run is **BLOCKED / NOT PERFORMED**.
- Production readiness remains **70%** and release remains **NOT READY**. No Production platform, database, Migration, Auth0 setting, environment variable or traffic was changed. See [Production Read-only Access Provisioning](docs/PRODUCTION_READONLY_ACCESS.md).

## Sprint 33D Authorized Production Evidence Closure (2026-08-04)

- Added a GET-only Production evidence collector for Netlify, Render and Auth0 Management metadata, reusing the existing SELECT-only Neon and public platform validator boundaries.
- Every sanitized evidence record has a SHA-256 hash and the complete manifest is independently verifiable. Actual status is Repository PASS and external BLOCKED; Production readiness remains **70%** and release remains **NOT READY**.
- No Production system, database, Migration, Auth0, environment variable, resource, traffic or notification was modified. See [Production Evidence Report](docs/PRODUCTION_EVIDENCE_REPORT.md).

## Sprint 33C Production Platform Validation (2026-08-04)

- Added a fail-closed Production platform validator (`pnpm production:platform:validate`) with explicit Production/read-only confirmation, JSON/Markdown evidence, bounded GET/HEAD checks, SELECT-only schema metadata, and sensitive-output redaction.
- Repository scope is complete; Production readiness remains **70%** and release remains **NOT READY**. Netlify, Render, Neon, Auth0, DNS/TLS, monitoring and recovery evidence is `BLOCKED` or `NOT_CONFIGURED` until separately authorized access/configuration exists.
- No Production deployment, database operation, Migration, Auth0/platform change, or real notification occurred. See [Production Platform Validation Report](docs/PRODUCTION_PLATFORM_VALIDATION_REPORT.md).

## Sprint 33B Production Security & Operations Gate (2026-08-04)

- Repository/Staging-safe controls now include environment-derived Netlify security headers, authenticated bounded API rate limits, build identity and structured request telemetry, strictly read-only schema status inspection, public Auth0 Production discovery/JWKS validation, VAPID parity, bounded Staging capacity smoke, sensitive scan, and a non-deploying GitHub quality workflow.
- Product completion remains **98%**. Production readiness is reassessed at **70%**; release remains **NOT READY** because Production services/schema/Auth0 event delivery/recovery/device evidence require separately authorized external execution.
- `pnpm release:check` now includes the Production repository gate and tracked-file sensitive scan. See [Production Operations Runbook](docs/PRODUCTION_OPERATIONS_RUNBOOK.md) and [ADR 0020](docs/adr/0020-production-security-operations-gate.md).
- This Sprint does not deploy Production, apply a Migration, connect/write Production data, or modify Production Auth0, Google Sheets, or Apps Script.

## Sprint 32 Announcement Center (2026-08-03)

- Announcement Center extends the existing PostgreSQL Notification Center; it does not create a second notification store, badge, push queue, or Service Worker.
- Staging-only Migration `0022_announcement_center` adds Workspace-scoped `announcement` and `announcement_read` tables with forced RLS, soft delete, audience rules (`ALL`, `MANAGER`, `EMPLOYEE`), controlled functions, and zero direct API Role table access.
- The authenticated REST surface is `GET/POST /v1/announcements`, `GET/PUT/DELETE /v1/announcements/{id}`, and the idempotent read marker `POST /v1/announcements/{id}/read`.
- Publishing creates `ANNOUNCEMENT_CREATED` through the existing transactional outbox. The existing Notification Center, Web Push queue/worker, badge, revision sync, and safe navigation open `/announcements/{id}`.
- Neon Staging apply/rollback/reapply, checksum, Manager CRUD, employee audience, Workspace A/B isolation, notification/badge integration, soft delete, and API least privilege pass. Windows/Android/iPhone/iPad PWA acceptance remains **PENDING USER VERIFICATION**. Overall assessed completion is **98%**.
- Production, Production database/Auth0, Google Sheets, Apps Script, and Production deployment remain unchanged. See [Sprint 32 review](docs/reviews/SPRINT_32_ANNOUNCEMENT_CENTER_REVIEW.md).

## Sprint 31 real event notifications (2026-08-02)

- The final duplicate-delivery fix adds Staging-only Migration `0020_push_subscription_priority`: registration records display-derived `clientMode`, and delivery sends to active PWA subscriptions while treating Browser subscriptions as fallback only when no active PWA exists for that Workspace/User. Notification Center remains one row per event.
- Sprint 31 implementation and automated/Staging database acceptance are complete; physical-device delivery remains **PENDING USER VERIFICATION**. Overall assessed completion is **97%**.
- Additive Staging-only Migration `0019_real_event_notifications` extends the existing transactional outbox projection for employee clock-in/out, leave requests/results, and affected-employee schedule updates.
- Recipients are resolved server-side from live Workspace Membership and role. Actors never receive their own manager notification, cross-Workspace delivery fails closed, and notification preferences cover clock, leave, and shift events.
- Notification Center remains the durable source of truth. Existing Web Push queue/worker, Smart Polling, Service Worker, badge, read state, and test-notification flow are reused without a second delivery architecture.
- Production, Production database/Auth0, Google Sheets, Apps Script, and Production deployment remain unchanged. See [Sprint 31 review](docs/reviews/SPRINT_31_REAL_EVENT_NOTIFICATIONS_REVIEW.md).

## Sprint 29 Web Push release gate (2026-07-30)

- Sprint 29 is **PARTIAL / PENDING USER VERIFICATION**. Overall completion remains **95%**.
- The existing Notification Center, VAPID, standard Web Push, Service Worker, Session, and
  Workspace boundaries remain authoritative; no Firebase SDK/project or second Push path was
  introduced.
- Automated coverage now includes iPadOS desktop-UA recognition, Home Screen-only Apple Push,
  denied/unsupported activation lock recovery, subscription de-duplication, controlled disable
  and account-switch recovery, notification-click same-origin behavior, and badge/read-state
  consistency.
- Windows Edge, iPhone Home Screen PWA, and iPad Home Screen PWA remain real-device
  **PENDING USER VERIFICATION**. Follow
  [the Sprint 29 checklist](docs/SPRINT_29_WEB_PUSH_RELEASE_GATE.md).
- Production, Production database, Production Auth0, Google Sheets, Apps Script, and
  Production deployment remain unchanged.

## Sprint 28 FCM standard Web Push transport acceptance (2026-07-30)

- Sprint 28 is **COMPLETE**. The implementation baseline is commit `d19765f9bf8be3f8812f783f03b081aaf5678c75`.
- Automated and synthetic Staging coverage remains green for standard Web Push through the browser-created `fcm.googleapis.com` endpoint, subscription lifecycle, 404/410 cleanup, Service Worker delivery, Notification Center refresh, and Workspace/Session isolation.
- After 20:22 (Asia/Taipei), the owner verified the latest `STAGING POSTGRES` installed Android PWA: Push showed enabled, a test notification was sent from that same Android device, and an Android system notification arrived after returning to the Home screen.
- Current assessed completion is **95%**. Production, Production database, Production Auth0, Google Sheets, Apps Script, and Production deployment remain unchanged.
- The next recommended Sprint is the remaining Web Push real-device release gate for Windows Edge and iPhone/iPad Home Screen PWA; it must remain Staging-only.

## Standard Web Push delivery (Sprint 27, 2026-07-29)

- Notification Center remains the source of truth; standard Web Push is a best-effort background delivery channel.
- Migration `0016_web_push_subscriptions` is applied only to Neon Staging after a successful apply/down/reapply rehearsal. Production is unchanged.
- The PostgreSQL API supports `GET /v1/push/status` and the idempotent Commands `push.register`, `push.unregister`, and `push.test`.
- Push subscriptions are Workspace/User/Session scoped. The API Role has no direct table access, and the separate worker Role design is limited to two delivery functions.
- A live Neon Staging synthetic E2E validates registration, queue projection, idempotency, rate limiting, revoked-Membership rejection, direct-table denial, and Workspace A/B isolation; all fixtures are removed after the test.
- The Service Worker handles `push`, `notificationclick`, and `pushsubscriptionchange`. The UI requests permission only after a user action and explains the iPhone/iPad Home Screen PWA requirement.
- Explicit PostgreSQL logout first attempts the existing controlled `push.unregister` flow for the current device; live Session authorization still blocks delivery if browser cleanup cannot complete.
- VAPID private material and `DATABASE_PUSH_URL` are server-side secrets. Only `BANK_WEB_PUSH_PUBLIC_KEY` may enter a Staging PostgreSQL frontend build.
- Programming, Neon Staging Migration, the isolated Render worker activation, and a non-Production `STAGING POSTGRES` Draft are complete. Windows/iPhone PWA background delivery remains **PENDING USER VERIFICATION**; the new Draft origin must first be added to the existing Staging Auth0 and Render allowlists.

## Notification Center Foundation (Sprint 25, 2026-07-29)

- Historical Sprint 25 state: additive Migration `0014_notification_center` was committed but had not yet been applied. Sprint 26 Staging acceptance is recorded below.
- Existing transactional outbox events create only the minimum notification content needed for schedule and time-off updates. Leave reasons, email addresses, phone numbers, tokens, and credentials are never copied into notifications.
- The existing PostgreSQL Command API now supports `notifications.mark-read` and `notifications.mark-all-read`; `GET /v1/notifications` returns only the live Session user's notifications.
- The frontend adds a notification dialog, unread badge, read/unread controls, and unread-first/newest-first ordering. It uses safe DOM construction and keeps Google Sheets mode unchanged.
- The existing deterministic bootstrap revision includes the current recipient's notification revision. Smart Polling, cross-tab events, and the existing Service Worker revision signal therefore refresh notifications without a second synchronization controller or push service.
- Firebase Push, APNs, email, and SMS are explicitly out of scope.
- Historical Sprint 25 completion was **92%**. The current Sprint 26 completion is **93%**, pending real-device UI acceptance.

## PostgreSQL foreground polling synchronization (Sprint 22, 2026-07-28)

- The existing Sprint 21 synchronization controller now runs one authenticated, visible-page PostgreSQL refresh every 15 seconds. It does not introduce WebSocket, SSE, a second controller, or a new API.
- Polling stops while hidden, offline, logged out, Session-cleared, or unloading, and resumes after a valid foreground/online signal. A single timeout and the existing shared in-flight promise prevent duplicate timers and overlapping requests.
- The existing server revision remains authoritative. Unchanged revisions do not replace state or rerender; changed revisions use the existing bootstrap render path. Time-off reads continue to preserve unsent forms.
- Continuous network failures retain the current screen and emit only one safe warning per failure streak; a later successful cycle resets recovery state.
- Google Sheets and Production paths install no PostgreSQL polling listeners. No Production deploy, database operation, migration, Auth0, Google Sheets, Apps Script, Render, or Netlify architecture change occurred.
- Automated checks pass. Windows and iPhone Safari/PWA “stay in foreground while another Session approves” acceptance remains **PENDING USER VERIFICATION**.
- Current assessed completion: **89%**. The only next step is the documented Sprint 22 signed-in real-device acceptance.

## PostgreSQL foreground synchronization (Sprint 21, 2026-07-28)

- PostgreSQL boss and employee views now perform a safe bootstrap refresh when the page becomes visible, the browser/PWA returns through `pageshow`, or the window regains focus.
- Foreground signals are debounced and share one in-flight request. The server-issued bootstrap revision is compared before state replacement, so unchanged data does not rebuild the UI.
- Time-off request lists refresh through their existing read API and preserve unsent employee forms. A failed refresh keeps the current screen and can retry on the next foreground event.
- The server revision is derived from the role-visible bootstrap payload; commands that change visible data therefore produce a new revision without a client-generated revision.
- Google Sheets mode has no PostgreSQL foreground listeners. Production, Auth0, migrations, databases, Google Sheets, and Apps Script were not modified or deployed.
- Automated checks pass; signed-in Windows and iPhone foreground acceptance requires the new isolated Draft allowlists and remains **PENDING USER VERIFICATION**.
- Current assessed completion: **88%**. The next unique priority is **Staging foreground-sync real-device acceptance and release decision**.

## Time-off request workflow (Staging backend phase, 2026-07-27)

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`; overall completion: **87%**.
- Migration `0013_time_off_requests` is applied only to Neon Staging. Production and the pending `0009`／`0010` migrations were not changed or applied.
- Fixed monthly scheduled leave and ad-hoc leave are now separate PostgreSQL request kinds in the Staging backend.
- Scheduled leave keeps the existing eight-day monthly quota and becomes authoritative only after boss/manager approval. Ad-hoc leave does not consume that quota.
- The existing Command API now supports `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`; the controlled read route is `GET /v1/time-off-requests`.
- These APIs retain live Session, Membership, Workspace, idempotency, audit, outbox, RLS, and least-privilege function boundaries.
- Coworkers can read only approved scheduled-leave names/dates; ad-hoc reasons remain visible only to the applicant and authorized manager.
- Existing `leave_selections` rows are not automatically converted. Production, Google Sheets, Apps Script, Auth0, and the frontend UI were not changed in this phase.
- This phase completed only the data model and Command/read API. The frontend UI, a feature-specific non-Production Draft Preview, and iPhone UI acceptance are not complete.
- The next and only Sprint is **「前端排休／請假 UI 與老闆審核接線」**.
- See [ADR 0015](docs/adr/0015-time-off-request-workflow.md), [API documentation](docs/API.md), and [database documentation](docs/DATABASE.md).

## PostgreSQL browser integration boundary — 2026-07-20 (historical)

- 新增 `postgres-api-client.js`，提供正式 Node/PostgreSQL API 的嚴格瀏覽器傳輸邊界；包含 HTTPS／loopback 限制、Bearer 與 Workspace request scope、idempotency、大小限制、timeout、結構化錯誤及撤銷 Session 事件。
- 當時 `local`、`staging`、`production` build 都包含同一個受測 factory，但設定仍分別維持 `local_preview`／`google_sheets`，且 `postgresApiUrl` 為空。此狀態已由後續隔離的 `STAGING POSTGRES` API／Draft 驗收取代；Production 仍未切換。
- 當時沒有資料庫異動、Production 部署或 Netlify Draft Preview 重新部署。後續已完成隔離 Staging API、read/bootstrap 與可回復 cutover rehearsal；這段保留為歷史脈絡。

## Project cleanup status — 2026-07-20

- 完成正式來源、測試入口、依賴與文件引用盤點；未發現可安全刪除的正式來源或未使用套件。
- 完整測試鏈現包含自包含的 Auth0 Staging 啟動／PKCE 設定測試；人工 Staging 驗收腳本也納入語法檢查。
- 已知 helper 重複、ADR 歷史編號衝突及長串測試指令列為技術債，本次未跨安全邊界重構。
- 目前架構與模組責任請見 [Current Architecture](docs/ARCHITECTURE.md)。本次沒有改變架構、雲端資源、Production 或部署狀態。

## Isolated PostgreSQL Staging rehearsal — 2026-07-22

- `GET /v1/bootstrap` now renders the existing boss or employee UI from live, server-authorized PostgreSQL membership data without a Google Sheets fallback.
- `pnpm build:staging:postgres` creates the separate `dist-staging-postgres/` rehearsal bundle only when a credential-free HTTPS API URL and synthetic Staging workspace ID are provided through the build environment.
- The rehearsal uses separate PWA identity, cache, local/session storage, Auth0 session verification and logout handling. The normal Staging build and Production build remain on Google Sheets.
- At this source-only step, a public Node API deployment was **not** created. A later isolated Render Staging deployment and reversible browser rehearsal superseded that limitation; Production remains unchanged. See [PostgreSQL migration runbook](docs/POSTGRESQL_MIGRATION.md) before any future Production work.

## Frontend environments

- `pnpm build:local` creates `dist-local/` for local preview.
- `pnpm build:staging` creates `dist-staging/` and connects only to the controlled Staging Apps Script backend.
- `pnpm build` creates `dist/` Production release assets but does not deploy them.

See [Staging frontend environment](docs/STAGING_FRONTEND.md) and [cross-device E2E checklist](docs/STAGING_E2E_CHECKLIST.md).

## PostgreSQL transition foundation

The formal multi-tenant database and Transaction/Command API now live in `database/` and `server/`. They are an isolated migration path and are **not** connected to the current Production frontend.

- [Database commands and safety gates](database/README.md)
- [Current implementation architecture](docs/ARCHITECTURE.md)
- [Migration rehearsal runbook](docs/POSTGRESQL_MIGRATION.md)
- [Implemented transition API](docs/openapi-postgres.yaml)
- [ADR 0013](docs/adr/0013-postgresql-transaction-command-api.md)
- [ADR 0014](docs/adr/0014-oidc-signed-tenant-context.md)
- [Identity threat model](docs/THREAT_MODEL_IDENTITY_TENANT.md)
- [Auth0 Staging connection gate](docs/AUTH0_STAGING_SETUP.md)
- [Auth0 Staging security-event pipeline](docs/AUTH0_SECURITY_EVENT_PIPELINE.md)
- [AWS Staging infrastructure preparation](docs/AWS_STAGING_INFRASTRUCTURE.md)
- [Lambda artifact packaging](docs/LAMBDA_ARTIFACT_PACKAGING.md)

Run database commands only with an explicitly configured PostgreSQL environment. Never commit `.env` files or database/JWT secrets.

> 2026-07-18 Managed Staging PostgreSQL 驗收：Neon PostgreSQL 18.4 的隔離 Staging 已完成三階段 Migration、checksum／transaction／advisory-lock／重複執行、非敏感 snapshot dry-run／apply／replay、雙 Workspace FORCE RLS 正反向、Command API、查詢計畫及官方 `pg_dump`／`pg_restore` 還原演練。Migration 採 direct owner endpoint，API 採 pooler + `NOINHERIT` 最小權限角色，並以固定 Staging host 防止環境誤標。Production、Google Sheets 與現行前端均未切換或部署。

> 2026-07-18 Sprint 3 Identity/Tenant foundation（歷史狀態）：PostgreSQL runtime role 已降為零 business-table 權限，只能執行四個受控函式；API 驗證 RS256 OIDC/JWKS 後，簽發 30 秒、單次使用的內部 context，資料庫再以 issuer/subject、user、workspace、membership、role 與可撤銷 session 建立 tenant boundary。偽造 token workspace、custom GUC、跨租戶、停權／移除、已撤銷 session 及 context replay 均在真實 Staging 被拒絕。當時尚未完成的 Auth0 Staging PKCE／refresh-reuse E2E 已於後續 Sprint 驗收；Production 仍未修改。

> 2026-07-17 P0 Staging 驗收：已建立與正式資料隔離的 Google Sheet、Apps Script 專案及 Web App 部署，完成老闆／員工登入、員工管理、排班、排假、打卡、revision conflict、session 撤銷及備份還原演練。Staging 實測發現 Apps Script 在全域 lock 內執行 4096 次 HMAC 會逾時，已改為有版本、固定成本的 `hmac-sha256-v2` 過渡 credential；既有 v1 成功登入後自動遷移。正式站未發布，產品仍不可正式上線。

> 2026-07-16 P0 request/value schema 更新：Apps Script `doPost` 以 UTF-8 byte 數限制 1 MiB，超限在 JSON 解析與資料寫入前拒絕；A1 snapshot 現驗證電話、過渡 credential 表示、薪資／金額、日期與時間。舊資料缺欄、空薪資調整及原樣舊扣款維持相容；新負數調整會被拒絕。本次未部署 Apps Script。

> 2026-07-16 P0 儲存邊界更新：老闆 `save` 只接受既有 snapshot 欄位與正確 collection／map 形狀；漏傳欄位會保留雲端既有值，明確空集合仍可刪除，未知或錯誤欄位以 `REQUEST_DATA_INVALID` 拒絕。本次未部署 Apps Script。

> 2026-07-16 驗收補充：修正老闆／員工月曆在手機寬度下的橫向溢位，加入防回歸檢查；桌機、390×844 雙角色與完整 release gate 均通過。詳見 [Project Cleanup Acceptance](docs/reviews/PROJECT_CLEANUP_ACCEPTANCE.md)。

> 2026-07-16 專案整理收尾：員工／班次／出勤管理事件已集中至單一模組，未啟用 Firebase／Supabase 草稿已移除，Service Worker 資產失敗不再錯誤回傳 HTML。12 組回歸、25 個發布資產、本機老闆／員工 smoke 均通過；本次沒有變更 API 或資料結構。

> 2026-07-15 P0 營運復原更新：Google Sheets snapshot 與必要 Script Properties 現可建立私人 Google Drive 復原包，具 checksum、workspace 驗證、一次性復原確認、回滾與發布前 readiness gate。詳見 [ADR 0010](docs/adr/0010-operational-recovery.md) 與 [Runbook](docs/RUNBOOK.md)。

班客邦是員工排班、休假、出勤與薪資試算產品。目前仍處於 **P0 架構修復階段**，不可作正式商業營運或保存正式薪資資料。

## 目前技術型態

- 前端：HTML、CSS、Vanilla JavaScript PWA
- 現況同步：Google Apps Script + Google Sheets 單一 JSON snapshot
- 部署原型：Netlify 手動部署
- 非現況：專案不是 Flutter；Firebase/Supabase 檔案為未啟用的歷史方案

## 上線狀態

**No — 不適合正式上線。**

主要阻斷與修復順序請見：

- [Project Health Report](docs/PROJECT_HEALTH_REPORT.md)
- [Product Backlog](docs/PRODUCT_BACKLOG.md)
- [Sprint 0 Architecture & Quality Review](docs/reviews/SPRINT_0_REVIEW.md)
- [P0 Account Activation Review](docs/reviews/P0_ACCOUNT_ACTIVATION_REVIEW.md)
- [P0 Workspace Boundary Review](docs/reviews/P0_WORKSPACE_BOUNDARY_REVIEW.md)
- [P0 Credential Hardening Review](docs/reviews/P0_CREDENTIAL_HARDENING_REVIEW.md)
- [P0 Backup & Recovery Review](docs/reviews/P0_BACKUP_RECOVERY_REVIEW.md)
- [P0 Boss Save Request Review](docs/reviews/P0_BOSS_SAVE_REQUEST_REVIEW.md)
- [P0 Request & Snapshot Schema Review](docs/reviews/P0_SCHEMA_BOUNDARY_REVIEW.md)
- [P0 Controlled Staging Review](docs/reviews/P0_STAGING_READINESS_REVIEW.md)
- [營運 Runbook](docs/RUNBOOK.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Account Activation ADR](docs/adr/0004-transitional-account-activation.md)
- [API 現況](docs/API.md)
- [Database 現況](docs/DATABASE.md)
- [平台 ADR](docs/adr/0001-product-platform.md)

## 本機品質檢查

需求：Node.js 20+。

```powershell
npm run check
npm test
npm run build
pnpm release:check
```

- `npm run check`：檢查 JavaScript／Apps Script 語法、manifest、HTML 資產引用與發布白名單。
- `npm test`：執行目前已建立的 26 組前端 P0、Apps Script、PostgreSQL、OIDC、Auth0 Staging、安全事件、IaC 與 Lambda Artifact 防回歸檢查。
- `npm run build`：建立乾淨的 `dist/` 靜態部署輸出，不包含 ZIP、後端原始碼或未啟用雲端設定。
- `pnpm release:check`：執行全部品質檢查、26 組回歸與 build，再逐檔驗證 `dist/` 白名單並確認後端維運文件；正式發布前仍須在 Apps Script 執行線上 readiness check。

本機預覽可用靜態 HTTP server 開啟 `local-preview.html`。員工介面無限更新與登入前敏感 DOM 曝露已修復；其餘 P0 問題仍列於健康報告。

主要本機資料統一由 `state-store.js` 讀寫。若偵測到損壞 JSON，APP 會隔離一份本機備份並使用安全資料繼續啟動；備份不會同步至 Google Sheets。

Google Sheet 主資料與本機復原策略不同：A1 若不是有效 JSON object，或已知 snapshot 欄位的陣列、object map、巢狀記錄、`sync.revision` 形狀不正確，Apps Script 會回傳 `DATA_SOURCE_INVALID` 並停止操作，不會把損壞資料正規化成空公司後寫回。此時必須保留 A1 原文並依 Runbook 復原，禁止清空後重試。

正式頁面採分階段啟動：登入前只載入設定、雲端驗證、登入與 PWA 必要程式；驗證成功後才載入管理畫面與公司資料。這是前端資料最小化，不等於正式後端 authorization。

Google Sheets 過渡後端已停止接受員工全量 `save`。員工登入／讀取只回傳本人所需資料，排假、上班打卡、下班打卡分別由伺服器驗證身份後執行。老闆全量 snapshot 已加入 revision 衝突拒絕，PIN 也已採過渡期 server-side salted credential。此段原先記錄的多租戶、Identity Provider、PostgreSQL 與 Command API 缺口已由後續 Staging 基礎補齊；產品仍因前端排休／請假 UI、真機驗收與 Production 發布閘門未完成而不可正式上線。

## 過渡期帳號初始化

部署新的 Apps Script／空白資料表前，必須在 Apps Script「專案設定 → 指令碼屬性」新增：

- 屬性：`SHIFT_APP_OWNER_PHONE`
- 值：第一位老闆的手機號碼（只填數字，例如 `0912345678`）

只有這支電話能建立空白雲端的第一組老闆 PIN。新增員工後，系統會顯示 8 碼一次性啟用碼；員工第一次登入輸入該碼並自行設定 6 位數 PIN，啟用碼隨即失效。既有已設定 PIN 的帳號可照常登入，並會在第一次成功登入時自動升級 credential。

第一次建立任何新 credential 時，後端會在 Apps Script Script Properties 自動建立 `SHIFT_APP_CREDENTIAL_PEPPER`。此密鑰不得放進 Sheet、前端或 Git，且必須受控備份；遺失或損壞會使既有 PIN 無法驗證。

這段是 Google Sheets 過渡後端的歷史 P0 止血紀錄，不代表目前 Staging Identity 狀態。後續已完成 Auth0 Staging PKCE／refresh、可撤銷 Session、多租戶資料列隔離與受控 Command API；Production 身分服務啟用、監控、備份演練與正式發布閘門仍須另行驗收。

## 過渡期備份與發布

備份與復原只可由 Apps Script 專案管理員執行，不會出現在 APP。每次發布前依 [Runbook](docs/RUNBOOK.md) 執行 `createOperationalBackup()`、`verifyLatestOperationalBackup()` 與 `runReleaseReadinessCheck()`；任何一項失敗都不得發布。私人復原包包含公司完整資料與 credential pepper，禁止分享。

## 開發規則

所有修改遵循 [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md)。未完成 Architecture Review、Build、Test、Security/Performance/UX Review 與文件更新，不得宣稱 Sprint 完成。

## 目錄

- `index.html`、`*.js`、`*.css`：目前 PWA 原型
- `management-actions.js`：老闆員工、班次與出勤異動的唯一前端管理入口
- `google-sheets-backend.gs`：現況 Apps Script 後端原型
- `docs/`：健康報告、Backlog、API、Database 與 ADR
- `scripts/`：零第三方依賴的品質檢查與建置
- `dist/`：建置產物，不納入版本控管
## Notification Center Staging activation (Sprint 26, 2026-07-29)

- Neon Staging now has immutable Migration `0014_notification_center` with its reviewed checksum, plus additive `0015_notification_command_validation`, which fixes a PostgreSQL-engine incompatibility discovered during real read-state E2E without rewriting `0014`.
- Controlled apply, rollback, and reapply completed in Staging. Forced RLS, recipient scope, API Role zero-table access, controlled-function grants, Workspace A/B isolation, notification creation, read state, ordering, idempotency, and bootstrap revision passed.
- Synthetic test Workspaces, identities, Sessions, and business rows were cleaned after each run. Production, Auth0, Google Sheets, Apps Script, and Production data were not modified or deployed.
- Current assessed completion: **93%**. Real Windows/iPhone notification UI acceptance remains pending on the new non-Production Draft.
