# 班客邦

## PostgreSQL browser integration boundary — 2026-07-20

- 新增 `postgres-api-client.js`，提供正式 Node/PostgreSQL API 的嚴格瀏覽器傳輸邊界；包含 HTTPS／loopback 限制、Bearer 與 Workspace request scope、idempotency、大小限制、timeout、結構化錯誤及撤銷 Session 事件。
- `local`、`staging`、`production` build 都包含同一個受測 factory，但目前設定仍分別維持 `local_preview`／`google_sheets`，且 `postgresApiUrl` 為空；因此不會送出 PostgreSQL API request，也不會改變既有 Google Sheets 流程。
- 本次沒有資料庫異動、Production 部署或 Netlify Draft Preview 重新部署。正式切換仍須先完成隔離 Staging API 部署、完整 read/bootstrap surface 與 cutover rehearsal。

## Project cleanup status — 2026-07-20

- 完成正式來源、測試入口、依賴與文件引用盤點；未發現可安全刪除的正式來源或未使用套件。
- 完整測試鏈現包含自包含的 Auth0 Staging 啟動／PKCE 設定測試；人工 Staging 驗收腳本也納入語法檢查。
- 已知 helper 重複、ADR 歷史編號衝突及長串測試指令列為技術債，本次未跨安全邊界重構。
- 目前架構與模組責任請見 [Current Architecture](docs/ARCHITECTURE.md)。本次沒有改變架構、雲端資源、Production 或部署狀態。

## Isolated PostgreSQL Staging rehearsal — 2026-07-22

- `GET /v1/bootstrap` now renders the existing boss or employee UI from live, server-authorized PostgreSQL membership data without a Google Sheets fallback.
- `pnpm build:staging:postgres` creates the separate `dist-staging-postgres/` rehearsal bundle only when a credential-free HTTPS API URL and synthetic Staging workspace ID are provided through the build environment.
- The rehearsal uses separate PWA identity, cache, local/session storage, Auth0 session verification and logout handling. The normal Staging build and Production build remain on Google Sheets.
- A public Node API deployment was **not** created by this source-only step because no approved hosting resource or secret configuration is present. See [PostgreSQL migration runbook](docs/POSTGRESQL_MIGRATION.md) before live E2E.

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

> 2026-07-18 Sprint 3 Identity/Tenant foundation：PostgreSQL runtime role 已降為零 business-table 權限，只能執行四個受控函式；API 驗證 RS256 OIDC/JWKS 後，簽發 30 秒、單次使用的內部 context，資料庫再以 issuer/subject、user、workspace、membership、role 與可撤銷 session 建立 tenant boundary。偽造 token workspace、custom GUC、跨租戶、停權／移除、已撤銷 session 及 context replay 均在真實 Staging 被拒絕。Auth0 Staging 外部設定與真實 PKCE/refresh-reuse E2E 尚未完成，因此正式 Identity Provider 不可視為已接通，Production 未修改。

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

Google Sheets 過渡後端已停止接受員工全量 `save`。員工登入／讀取只回傳本人所需資料，排假、上班打卡、下班打卡分別由伺服器驗證身份後執行。老闆全量 snapshot 已加入 revision 衝突拒絕，PIN 也已採過渡期 server-side salted credential；但多租戶、正式 Identity Provider、正式資料庫與 command API 尚未完成，因此產品仍不可正式上線。

## 過渡期帳號初始化

部署新的 Apps Script／空白資料表前，必須在 Apps Script「專案設定 → 指令碼屬性」新增：

- 屬性：`SHIFT_APP_OWNER_PHONE`
- 值：第一位老闆的手機號碼（只填數字，例如 `0912345678`）

只有這支電話能建立空白雲端的第一組老闆 PIN。新增員工後，系統會顯示 8 碼一次性啟用碼；員工第一次登入輸入該碼並自行設定 6 位數 PIN，啟用碼隨即失效。既有已設定 PIN 的帳號可照常登入，並會在第一次成功登入時自動升級 credential。

第一次建立任何新 credential 時，後端會在 Apps Script Script Properties 自動建立 `SHIFT_APP_CREDENTIAL_PEPPER`。此密鑰不得放進 Sheet、前端或 Git，且必須受控備份；遺失或損壞會使既有 PIN 無法驗證。

這是 Google Sheets 過渡後端的 P0 止血，不是正式 authentication。正式版仍須完成正式 Identity Provider／記憶體困難密碼雜湊、refresh/device management、audit、密鑰輪替、備份演練與多租戶資料列隔離。

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
