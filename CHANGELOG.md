# Change Log

## 2026-07-19 — Production API role final acceptance

- Accepted Neon/PostgreSQL's platform maintenance-database behavior: `PUBLIC CONNECT` on `postgres` is not a P0 blocker when it creates no new path to `neondb` business data.
- Removed application provisioning logic that attempted to change platform-owned maintenance-database ACLs.
- Required the Production runtime URL to name `neondb` explicitly and added a fail-closed startup check against `current_database()` before the API listens.
- Expanded Production privilege verification to cover role attributes and membership, zero table/sequence access, the exact controlled-function allowlist, forbidden DDL, foreign-server/user-mapping creation, `dblink`/`postgres_fdw`, and the isolated `postgres` maintenance database.
- Recorded inherited `PUBLIC TEMPORARY` as a monitored low-risk platform limitation. No business data, Production API, frontend, Auth0, AWS, Netlify, Google Sheets, or Apps Script deployment was changed.

## 2026-07-19 — Production least-privilege API database role

- Added an independent Production role-grant confirmation gate so API credential provisioning never enables schema migrations.
- Created the dedicated `banke_api_production` role with `NOINHERIT`, no administrative/RLS-bypass attributes, no object ownership, no direct table/sequence privileges, and EXECUTE access to exactly four controlled `app_private` functions.
- Added repeatable privilege-boundary verification for direct business/app-private reads, schema/role creation, RLS changes, forged Workspace context, function allowlisting, role separation, and zero-data preservation.
- Stored the generated runtime credential only in the Git-ignored local `.env.production`; no secret, business data, frontend, API, or Production deployment was committed.

## 2026-07-19 — Production PostgreSQL target isolation guard

- Added an explicit `BANK_PRODUCTION_DATABASE_HOST` allowlist requirement for Production migration and runtime API configuration.
- Production direct migrator and pooled runtime URLs must target the same normalized Neon host and database before a connection can be opened.
- Added regression coverage for missing/mismatched Production hosts, cross-database runtime configuration, and the valid isolated Production shape.
- No Neon connection was opened, no migration was executed, and no Production data or frontend route was modified.

## 2026-07-19 — Auth0 Staging token lifecycle acceptance

- Added a Staging-only, memory-only Auth0 Authorization Code + PKCE S256 acceptance harness that never prints or stores token, authorization-code or session values.
- Passed real Auth0 Staging access-token validation, session-claim binding, refresh rotation, old refresh-token reuse rejection, token-family revocation and allowlisted provider logout.
- Extended live Staging PostgreSQL coverage to prove that a refreshed access token cannot bypass a suspended user or inactive Workspace A membership, while an independently active Workspace B membership remains usable.
- Production, Google Sheets, Apps Script and the database schema were not modified or deployed.
- Kept Production blocked until a public isolated Staging event path automatically maps Auth0 refresh-reuse/account-disable events to local PostgreSQL session revocation.

## 2026-07-18 — Sprint 3 OIDC and unforgeable tenant context foundation

- Added a read-only OIDC discovery/JWKS readiness check for the next Local/Auth0 connection step. It verifies exact issuer/JWKS metadata, Authorization Code, PKCE S256 and usable RS256 keys without requiring or printing any secret or token.
- Selected Auth0 as the single managed OIDC/OAuth 2.0 provider; added strict RS256 issuer/audience/time validation, same-origin JWKS caching, key rotation, unknown-key fail-closed behavior, timeout and RSA-key bounds.
- Rejected token `workspace_id`; the requested workspace is now re-authorized against live PostgreSQL user, workspace, membership, role and session state for every controlled call.
- Added migrations 0004–0008 for OIDC principal mapping, revocable local sessions, tenant-context keys/nonces and controlled SECURITY DEFINER query/command functions.
- Removed all runtime table/sequence privileges. The API role may execute only four exact controlled functions and cannot invoke tenant verification directly.
- Added 30-second HMAC-signed, single-use internal tenant assertions. Direct table access and forged custom GUC remain denied even with the runtime database credential.
- Live Staging tests cover two tenants, all six commands, assertion replay, member/user suspension, simulated refresh-family compromise, logout and least-privilege grants.
- Fixed Session `iat` second/millisecond precision and leave audit resource-ID operator precedence defects found on the real engine.
- Added a Staging-only Auth0 SPA entry point using Authorization Code + PKCE S256, exact Staging audience, memory-only token cache and isolated frontend configuration; Production, Google Sheets and Apps Script were not changed or deployed.
- Completed a real Auth0 Staging login acceptance: the namespaced access-token session claim was present, non-empty and matched the Auth0 ID-token `sid` without logging either value. Refresh rotation/reuse, logout and account-disable E2E remain pending.

## 2026-07-18 — Sprint 2 Managed Staging PostgreSQL validation

- Applied migrations 0001–0003 to an isolated Neon PostgreSQL 18.4 Staging database and verified checksums, per-migration transactions, advisory locking, and repeat execution protection.
- Imported a non-sensitive Google Sheets snapshot through dry-run, apply, and replay flows; reconciled employees, shifts, attendance, leave, payroll, and import metadata.
- Provisioned a separate pooled `NOINHERIT` API role with DML access only to the ten runtime tables; schema migration history and DDL remain inaccessible.
- Passed positive and negative FORCE RLS tests across two synthetic workspaces, including no-context direct SQL, A-context-to-B cross-tenant mutation, and composite foreign-key attempts.
- Passed all six implemented Command API flows and repeated the live test twice to prove idempotent execution.
- Added a staging-only, host-pinned PostgreSQL 18 `pg_dump`/`pg_restore` rehearsal. Restore reconciliation, 11 forced-RLS tables, and tenant-isolated API reads passed in `banke_restore_sprint2`.
- Query plans used the existing employee phone and workspace/date indexes; no speculative index was added.
- Fixed a repeatability defect in the live leave-selection test. Production, Google Sheets, Apps Script, and the frontend route were not changed or deployed.
- Confirmed a Production-blocking trust-boundary limitation: possession of the shared API database credential can forge the custom tenant GUC. Formal identity plus a signed/externally verified database context or trusted connection proxy is required before cutover.

## 2026-07-18 — Sprint 1 PostgreSQL multi-tenant foundation

- Added three transactional PostgreSQL migrations for tenant identity mapping, employees, shifts, leave selections, attendance, payroll adjustments, idempotency receipts, audit logs, outbox events, and snapshot-import ledger.
- Added FORCE RLS workspace isolation, composite tenant foreign keys, constraints, indexes, optimistic revisions, soft-delete metadata, and migration checksum/advisory-lock safety gates.
- Added a separate Node Command API with strict allowlists, RS256 JWT verification, active membership checks, per-request tenant transactions, exact CORS allowlisting, 1 MiB request limits, idempotent commands, audit, and outbox writes.
- Added a dry-run-first Apps Script/Google Sheets snapshot importer. Legacy credentials are never imported; memberships require formal identity reenrollment.
- Existing Google Sheets Production path was not changed or deployed. Live PostgreSQL execution remains a Staging acceptance gate because no PostgreSQL server is configured in this workspace.

## 2026-07-17 — Staging frontend isolation

- Added explicit Local, Staging, and Production frontend build profiles.
- Added a STAGING badge and Staging-only Apps Script endpoint.
- Isolated Service Worker caches, PWA identity, localStorage, and sessionStorage by environment.
- Added repeatable builds, isolation regression coverage, and a manual cross-device E2E checklist.
- Production was not deployed or modified during this Sprint.

## 2026-07-17 — Sprint 2: Database Schema and API Specification Design

### Added

- **正式資料庫 Schema (docs/schema.sql)**：完成 PostgreSQL 關聯式模型設計，包含多租戶隔離、Argon2id 身分驗證、業務資料正規化與稽核日誌。
- **正式 API 規格 (docs/openapi.yaml)**：完成基於 OpenAPI 3.0 的命令式 API 設計，涵蓋 JWT Auth 流程與核心業務命令。
- **身分驗證序列定義**：在 `docs/API.md` 中明確定義 Login、Refresh、Logout 的後端互動邏輯。

### Changed

- 更新 `docs/DATABASE.md` 與 `docs/API.md`，將其目標模型指向正式的 SQL 與 YAML 文件。

### Verified

- Schema 設計符合 ADR 0012 的多租戶與正規化原則。
- API 規格符合 Command API 原則，並解決了全量 snapshot 覆寫的風險。
- 整體商業上線完成度由 60% 提升至 62%。

## 2026-07-16 — Sprint 2: Formal Auth and Backend Migration Architecture Design

### Added

- **正式後端遷移設計 (ADR 0012)**：定義從 Google Sheets 遷移至正式關聯式資料庫 (PostgreSQL) 與身份驗證系統 (JWT + Refresh Token) 的架構規格。
- **身分驗證流程定義**：包含短效 Access Token、長效 Refresh Token、Argon2id 雜湊、登出撤銷、停權禁止與跨裝置登入規則。
- **角色與權限模型 (RBAC)**：明確定義老闆 (Full Access)、管理者 (Scoped) 與員工 (Personal + Team) 的資料讀寫邊界。
- **多租戶隔離原則**：規定所有業務資料表必須包含 `workspace_id`，並透過資料庫 RLS 或 API Repository 層級強制隔離。
- **遷移計畫**：定義從 A1 Snapshot 清洗、正規化到批次匯入新資料庫的五步驟流程。

### Verified

- 設計文件與既有 P0 止血 ADR (0001–0011) 保持一致，並符合 Project Constitution 工程原則。
- 整體商業上線完成度由 58% 提升至 60%。

## 2026-07-16 — Payroll accuracy and logout functionality

### Fixed

- **薪資計算口徑統一 (Bug 17)**：老闆端的「薪資試算」與「匯出 CSV」現在統一改用實際「出勤紀錄」作為核定依據，而非排班計畫，徹底解決老闆與員工看到數字不一致的問題。
- **打卡四捨五入修正 (Bug 21)**：移除打卡下班時強制的 0.5 小時最小值，避免誤觸打卡（少於 15 分鐘）產生錯誤工時。
- **新增登出按鈕 (Bug 24)**：在頂部控制列新增「登出」按鈕，並在點擊後完整清除本機敏感資料、session 與 Cloud 快取。

### Changed

- 老闆總覽 (Stats) 現在同時顯示「排班時數／工時」與「實際時數／支出」，方便管理計畫與預算的差異。
- 薪資匯出檔名由「薪資試算」改為「薪資實付」，反映資料來源的變更。

### Verified

- 通過 13 組 P0/state/cleanup 回歸測試。
- 本機 smoke test：老闆可看到計畫與實際對比，員工可正常登出且清除資料。
- 整體商業上線完成度提升至 58%。

## 2026-07-16 — UTC fix and Role UI improvements

### Fixed

- 修正 `app.js`、`access.js` 與 `employee-work.js` 的月份與日期計算，改用 `Intl.DateTimeFormat` 搭配 `Asia/Taipei` 時區，徹底解決 UTC 邊界造成每月 1 日顯示錯誤月份的 P0/P1 Bug。
- 修正 `employee-layout.css`，在員工模式下隱藏「出勤／請假」、「員工」與「薪資試算」等老闆專用頁籤，確保員工介面簡潔且符合權限最小化原則。
- 修正 `access.css` 中的 Bug 19，確保「儲存休假」面板在 `hidden` 屬性存在時能正確隱藏，避免在老闆模式下錯誤顯示。

### Verified

- 通過 13 組 P0/state/cleanup/schema 回歸測試。
- 完成老闆與員工模式下的介面驗收，確認頁籤隱藏邏輯正確。
- 整體商業上線完成度由 54% 提升至 56%。

## 2026-07-16 — P0 schema versioning and migration

### Fixed

- 建立正式 schema 版本化與遷移系統；Apps Script 與前端 state store 具備 `sync.schemaVersion` 及其遷移功能。
- `google-sheets-backend.gs` 的 `readData_` 與 `readDataStrict_` 現在會先通過 `migrate_` 正規化舊資料至最新版本，再進行形狀與值驗證。
- `state-store.js` 的 `normalize` 整合遷移邏輯，確保本機與雲端資料版本同步。
- 修正 `enhancements.js` 備份下載檔名使用 UTC 時間造成台灣每月 1 日凌晨日期錯誤的 Bug。

### Verified

- 新增 v0 資料自動遷移至 v1、非法版本拒絕、`ensureSync_` 與 `bumpRevision_` 保留版本號，以及前端 state 遷移回歸測試。
- 全部 14 組回歸測試通過。整體商業上線完成度由 53% 調整為 54%。

## 2026-07-17 — P0 controlled Staging acceptance

### Fixed

- 修正 Apps Script 在全域 lock 內為每次登入執行 4096 次 HMAC，導致請求逾時並阻塞其他操作的 P0 問題。
- 新建 credential 改為版本化 `hmac-sha256-v2`：每筆獨立 salt、server-only pepper、domain separation 與固定成本；既有 `iterated-hmac-sha256-v1` 在成功登入後自動遷移。
- malformed scheme／iterations 維持 fail closed；未知帳號仍執行相同 v2 verifier 路徑。

### Staging verification

- 建立與正式資料隔離的 Staging Google Sheet、Apps Script 專案及 Web App 部署；正式站未發布。
- 線上驗收通過老闆／員工登入、員工管理、排班、排假、打卡、revision conflict、老闆同步與 session 撤銷。
- 私人備份、checksum 驗證、readiness、實際 restore、restore 後 readiness 皆通過；Staging 已回復乾淨 revision 0。
- 品質檢查、13 組既有 P0/state/cleanup 回歸與 25 個發布資產 build 通過；origin/main 另新增的 migration 測試由完整發布閘門一併驗證。

## 2026-07-16 — P0 request size and snapshot value schema

### Fixed

- Apps Script `doPost` 在 JSON parse 與 API 前以 UTF-8 bytes 限制 1 MiB raw request body；超限回 `REQUEST_PAYLOAD_TOO_LARGE` 並保留前端 `requestId`。
- A1 snapshot 現共用電話、credential 表示、員工時薪、薪資調整、日期與時間值驗證；老闆儲存錯誤回 `REQUEST_DATA_INVALID`，最後寫入防線錯誤回 `DATA_WRITE_INVALID`。
- 前端登入不再將 PIN 的非數字字元自動刪除後接受；電話、6 位純數字 PIN 與既有 8 碼大寫英數啟用碼在雲端登入前已檢查。
- 舊資料缺欄、空薪資調整與原樣舊負數扣款維持相容；新建或複製負數調整被拒絕。
- Service Worker cache 升至 v44，確保已安裝 PWA 在未來受控發布後取得新登入驗證邏輯。

### Verified

- 新增 request 小於／等於／超過 1 MiB、多位元 UTF-8、電話／PIN／啟用碼、金額、日期／時間、舊資料、空薪資調整、負數舊資料及失敗不寫入測試。
- 13 組 P0/state/cleanup 回歸、品質檢查與 25 檔 build 全部通過。本次未新增 A1 欄位，也未部署正式版本；整體商業上線完成度由 52% 調整為 53%。

## 2026-07-16 — P0 boss save request boundary

### Fixed

- 老闆 `save` 新增 top-level 欄位白名單與 collection／map 基本形狀驗證；未知欄位、錯誤形狀、array root 與空操作回 `REQUEST_DATA_INVALID`。
- 合併改以伺服器既有 snapshot 為底，只覆寫 request 明確傳送的可變欄位，避免漏傳 `employees`、`shifts`、`leaves` 等欄位時靜默清空資料。
- `workspace`、`sync`、`access` 維持 server-managed；明確合法空集合仍保留原本刪除語意。

### Verified

- 擴充既有 P0 concurrency 測試，涵蓋未知欄位、錯誤集合、舊 payroll array、array root、空操作、server 欄位竄改、部分儲存保留與明確清空。
- 本次未新增 API action、畫面或資料 schema，且未部署正式版本；整體商業上線完成度維持 52%。

## 2026-07-16 — P0 cloud snapshot shape guard

### Fixed

- Google Sheet 主資料除了 JSON root 以外，現在也會驗證陣列、object map、巢狀記錄與 `sync.revision` 的基本形狀。
- 任一已知欄位形狀錯誤時回 `DATA_SOURCE_INVALID`，停止登入、同步、清理與寫回，保留 A1 原始內容供人工救援。
- 營運備份使用相同的欄位形狀規則，無法安全解讀時回 `BACKUP_SOURCE_INVALID`；缺少欄位的舊資料仍可讀取，空的舊版 `payrollAdjustments` 仍可無損轉換。

### Verified

- 既有營運復原測試新增 11 種欄位損壞、備份拒絕、舊資料相容與 A1 不變的回歸案例。
- 本次未變更畫面、API action、正式資料 schema 或線上部署。
- 重新依功能、測試、權限、資料庫、跨裝置與部署準備度評估：功能實作估值仍約 67%，整體商業上線完成度由 67% 修正為 52%。

## 2026-07-16 — P0 cloud data corruption guard

### Fixed

- 一般 APP API 讀取 Google Sheet 主資料時，無效 JSON、`null`、array 或其他非 object root 不再被當成空白公司資料。
- 主資料損壞時改以 `DATA_SOURCE_INVALID` fail closed，保留原始 A1 內容並停止登入、同步與寫入，避免下一次操作覆蓋可供人工救援的資料。

### Verified

- 沿用既有營運復原測試，新增一般 API 損壞 JSON、錯誤根節點、錯誤碼與原始內容不變的回歸案例。
- 本次未變更前端、API action、資料 schema 或正式部署；產品完成率維持 67%。

## 2026-07-16 — P0 legacy payroll backup compatibility

### Fixed

- 營運備份可把舊資料中缺少、`null` 或空陣列形式的 `payrollAdjustments` 無損正規化為目前的 object map，再建立與驗證復原包。
- 非空陣列或其他無法證明可無損轉換的格式仍回傳 `BACKUP_SOURCE_INVALID`，不覆蓋最後成功備份指標，也不暗中改寫主要工作表。

### Verified

- 新增舊格式成功備份、readiness 一致讀取、未知資料拒絕與最後成功備份指標保護測試。
- 本次只修改 Apps Script 營運備份讀取邊界；APP 畫面、一般 API 與資料庫 schema 未變，且未發布正式版本。

## 2026-07-16 — Project cleanup acceptance

### Fixed

- 修正 720px 以下老闆與員工月曆被員工姓名撐開、造成手機橫向捲動的問題。
- Service Worker cache 升至 v43，確保已安裝裝置取得手機版修正。

### Verified

- 新增月曆縮欄防回歸檢查；品質檢查、12 組回歸、build 與 release gate 全數通過。
- 桌機及 390×844 老闆／員工角色實測通過；員工管理權限未洩漏，瀏覽器無 console warning/error。
- 本次未變更 API、Database schema 或產品功能；完整證據見 [Project Cleanup Acceptance](docs/reviews/PROJECT_CLEANUP_ACCEPTANCE.md)。

## 2026-07-16 — Project cleanup closure and stable baseline

### 整理

- 以 `management-actions.js` 統一員工、班次與出勤的事件綁定與老闆雲端提交流程，移除重複的 `fallback-actions.js`。
- 移除未啟用的 Firebase／Supabase 草稿與規則檔，避免部署、維護與安全稽核誤判。
- Google Sheets Web App URL 只由 `google-sheets-config.js` 管理；缺少設定時明確停止連線。
- Service Worker 只讓頁面導覽回退至 app shell，JS／CSS 失敗不再收到 HTML。
- 匯入備份與薪資調整改用同一老闆儲存入口，在重新載入前等待雲端確認並保留必要回滾／衝突資料。
- 專案忽略本機 pnpm cache 與整理前 ZIP，不將機器產物納入版本基準。

### 驗證

- 品質檢查通過：16 個前端腳本、1 個 Apps Script、25 個發布資產。
- 12 組 P0/state/cleanup 回歸全部通過；`dist/` 25 個檔案與來源白名單逐檔一致。
- 老闆預覽的新增班次／新增員工可取消；員工預覽可連續選取 4 天休假並切換出勤分頁；瀏覽器無 console warning/error。
- 本次沒有變更 API request/response 或資料 schema；線上發布仍須執行 Apps Script 備份與 readiness gate。

## 2026-07-15 — P0 Backup, restore and release gate

### 營運修正

- 新增管理員專用 `createOperationalBackup()`、`verifyLatestOperationalBackup()`、`restoreLatestOperationalBackup()` 與 `runReleaseReadinessCheck()`；未接入 Web App API。
- 私人 Google Drive 復原包同時保存 snapshot 與必要 Script Properties，並具格式版本、checksum、workspace、revision、來源與時間驗證。
- 復原需一次性確認值；非空目標先建立 safety backup，跨 workspace 拒絕，成功後撤銷所有舊 session，失敗自動回滾。
- 自我審查修正空白新資料表無法災難復原，以及非私人 Drive 項目驗證失敗後殘留的問題。
- 自我安全審查移除 Apps Script execution log 中的一次性復原確認值，改採固定欄位白名單摘要。
- 回滾寫入本身失敗時改回傳 `RESTORE_ROLLBACK_FAILED` 與 safety backup 檔案 ID，避免維運人員誤判為已安全回復。
- 新增本機 `pnpm release:check`，逐檔驗證 25 個發布資產且禁止後端復原識別字進入前端。

### 驗證與文件

- 新增正常、篡改、公開分享、錯誤確認、過期／錯來源、跨 workspace、pepper 損壞、空白目標、日誌脫敏、自動 rollback 與 rollback failure 邊界測試；總計 11 組 P0/state 測試。
- 新增 ADR 0010、Architecture Review、營運 Runbook 與 Release Checklist，並同步 README、API、Database、Health Report 與 Backlog。

## 2026-07-15 — P0 PIN credential hardening

### 安全修正

- Google Sheets 當時不再為新帳號保存快速、無 salt 的 PIN／啟用碼 SHA-256，改為每筆獨立 salt、4096 次 HMAC-SHA256 與 Apps Script server-only pepper；此歷史 v1 方案已由 2026-07-17 的 v2 runtime 修正取代。
- 舊 `bossPinHash`、`pinHash`、`activationCodeHash` 在正確登入／啟用時自動升級，不要求使用者重設 PIN。
- 相同 PIN 會產生不同 salt/hash；未知電話與錯誤電話執行 dummy KDF，credential 比對採固定流程。
- malformed prehash、credential 或 pepper 一律 fail closed；review 發現的 pepper 靜默輪替風險已修正為 `CREDENTIAL_CONFIG_INVALID`。
- 老闆／員工 projection 與移除員工封存資料會移除新舊所有 credential 欄位。

### 驗證與文件

- 新增 credential migration、salt 唯一性、pepper 隔離、錯誤 PIN、首次啟用、篡改與設定損壞回歸測試。
- 全部十組 P0/state 測試、語法／資產檢查與 production build 通過。
- 新增 [ADR 0009](docs/adr/0009-salted-pin-credentials.md) 與 [Architecture Review](docs/reviews/P0_CREDENTIAL_HARDENING_REVIEW.md)，同步更新 README、API、Database、Health Report 與 Product Backlog。

## 2026-07-15 — P0 Snapshot optimistic concurrency

### Data integrity

- 新增 server-managed `sync.revision`；舊資料安全遷移為 revision 0。
- 老闆全量儲存必須提交 `baseRevision`，過期、缺少或重播均拒絕。
- 員工排假、打卡、首次啟用及成功老闆儲存會推進全域 revision。
- 衝突時不覆蓋任何伺服器資料，並回傳最新安全 projection。

### Fixed

- 前端衝突後停止自動重試，保留 attempted/remote 衝突備份並提示匯出。
- 新增員工與重設 PIN 遇到衝突時不再回滾抹掉待備份修改。
- 登出會清除完整衝突備份；後續成功儲存會清除過期備份。
- Service Worker cache 升至 v40。

### Verified

- 新增舊資料遷移、stale save、replay、missing revision、員工 action、credential 保存及前端衝突保全測試。

## 2026-07-15 — P0 Stored XSS containment

### Security

- 姓名、職稱、電話、班次備註、出勤類型與備註改以 DOM 純文字節點渲染。
- 移除 authenticated scripts 的 HTML parsing sinks 與動態行內事件處理器。
- 新增惡意 `img`／`svg`／`script` payload 與 source sink 防回歸測試。

### Changed

- 新增共用 `dom-safety.js`，並保證先於管理功能載入。
- Service Worker cache 升至 v39，發布白名單加入安全 DOM 模組。

### Verified

- 8 組 P0/state test suites、語法／資產檢查與 production build 全部通過；25 個資產輸出至 `dist/`。

## 2026-07-15 — P0 明確單一工作區邊界

### Security

- Apps Script 伺服器產生不可變 `workspaceId`，並同時保存在 Script Properties 與資料快照。
- 每個工作階段綁定工作區；資料、session 或回應的工作區不一致時 fail closed。
- 老闆全量儲存無法修改或刪除工作區 ID；瀏覽器只核對伺服器回傳值。
- 舊資料會在第一次成功登入時補上工作區 ID；舊版未綁工作區的 session 失效。

### Fixed

- 補上工作區欄位的 state 正規化與員工資料投影。
- 修正既有員工授權測試重設資料時誤刪新 schema 欄位的回歸問題。
- Service Worker cache 升至 v38。

### Verified

- 新增舊資料升級、client workspace 注入、session workspace 竄改、snapshot mismatch 與員工投影測試。
- `pnpm verify` 全部通過，24 個資產輸出至 `dist/`。
- 老闆／員工本機預覽正常，無 console warning/error。

## 2026-07-15 — P0 短效工作階段與登入限流

### Security

- 新增 8 小時伺服器工作階段；Apps Script 只保存 token hash。
- 同一電話 15 分鐘內第 5 次登入失敗後鎖定 15 分鐘。
- PIN hash 僅用於登入，不再保存於 `sessionStorage` 或重送至一般 API。
- 過期、登出與員工移除會撤銷工作階段。
- 老闆／員工回應移除 `bossPinHash`、`pinHash`、`activationCodeHash`，只提供登入狀態。

### Fixed

- 恢復登入前會先向伺服器驗證，不再信任本機 session flag。
- 遠端 pull 不再觸發自動 save。
- 工作階段失效會清除本機敏感快取並返回登入頁。
- 弱網登出最多等待 3 秒。

### Verified

- 新增暴力嘗試、到期、偽造、重播、撤銷、角色越權及員工移除測試。
- `pnpm verify` 通過，24 個資產輸出至 `dist/`。

本專案採日期＋Sprint 記錄；正式版本策略將在 release pipeline 建立後改為 Semantic Versioning。

## 2026-07-15 — P0 首次帳號認領止血

### Security

- 空白 Google Sheets 雲端只允許 Script Property `SHIFT_APP_OWNER_PHONE` 指定的電話建立第一組老闆 PIN。
- 未設定 PIN 的員工不再因知道電話號碼就能直接認領帳號。
- 新增員工與重設 PIN 改用 8 碼安全亂數一次性啟用碼；後端只保存 SHA-256 hash，成功啟用後立即刪除。
- 員工 projection 同時移除 `pinHash` 與 `activationCodeHash`。

### Fixed

- 編輯員工保留既有 credential，不再意外清除 PIN。
- 員工電話新增／編輯採相同正規化規則，阻止不同格式建立同一電話。
- 雲端儲存改為 latest-state queue，不再在儲存中靜默丟棄下一次變更。
- 新增員工會等待雲端寫入完成才顯示啟用碼與重新載入；失敗會回復本機變更。

### Verified

- 老闆未設定、電話不符、正確初始化與既有帳號相容測試。
- 員工缺碼、錯碼、正確啟用、啟用碼重播、舊資料未配置與敏感欄位隔離測試。
- 老闆／員工本機預覽、全部既有 P0 回歸、語法檢查與正式 build 通過。

## 2026-07-15 — P0 員工雲端授權止血

### Added

- 員工本人休假、上班打卡、下班打卡的明確 Apps Script 命令。
- 員工欄位級回應投影與 P0 授權防回歸測試。
- Action-level authorization 架構決策與 A–I Review。

### Security

- 員工帳號呼叫全量 `save` 現在會被伺服器拒絕。
- 員工登入／pull 不再取得其他員工、老闆 access、PIN hash、封存員工或薪資調整資料。
- 員工 ID 由伺服器驗證結果決定，忽略客戶端偽造身份。

### Changed

- 員工排假與打卡先由雲端確認成功，再更新本機畫面。
- 正式環境 session 失效時不再靜默退回本機儲存。
- PWA cache 更新至 v35。

### Verified

- 錯誤 PIN、員工全量覆寫、跨員工資料、超額／錯月份休假、重複打卡均有拒絕測試。
- 老闆既有儲存、員工本人排假與打卡、登入前隔離、state recovery、介面穩定與 build 全數通過。
- 本機員工預覽實測 31 天日曆、3 天休假儲存與上班打卡通過。

## 2026-07-15 — Sprint 1／P0 登入前資料隔離

### Added

- 驗證成功後才依序載入管理功能的 authenticated bootstrap。
- 登入前資料隔離防回歸測試與 ADR。

### Changed

- 未登入時隱藏管理 shell，且不執行 `app.js` 與角色／薪資／出勤模組。
- 登入期間停用欄位與按鈕，避免重複送出。
- session 恢復會驗證角色與員工 ID 一致性；損壞 session 會安全清除。
- Google Sheets 模式登出或管理程式載入失敗時，清除已渲染資料與本機敏感 state。
- PWA cache 更新至 v34。

### Verified

- 未登入：管理 shell 隱藏、公司資料列數為 0、`app.js` 未載入。
- 老闆／員工本機預覽與員工連續選取 8 天休假通過，無 console warning/error。
- 品質檢查、三組 P0 回歸測試與正式 build 通過。

## 2026-07-15 — Sprint 1／P0 損壞資料安全復原

### Added

- `state-store.js`：主要本機 state 的安全解析、正規化、v2/v1 遷移與單一損壞備份。
- State store 測試：空資料、partial state、損壞 JSON、primitive、array、null、舊版復原、備份失敗與大量資料。
- 修正空字串狀態被誤判為「沒有資料」而載入範例員工的邊界問題。

### Changed

- `app/access/employee-work/boss-hours/fallback-actions/login/enhancements` 改用共用 state store。
- PWA cache 更新至 v33。

### Verified

- 10,000 位員工資料、連續 100 次讀寫無資料遺失。
- 老闆與員工瀏覽器預覽、員工休假選取與儲存流程無 console error。

## 2026-07-15 — Sprint 1／P0 介面載入穩定性

### Fixed

- 員工版面不再監聽並搬移同一批子節點，排除無限 MutationObserver 迴圈。
- 老闆工時增強只監聽出勤表的直接列，避免修改儲存格時自我觸發。
- 舊資料或本機預覽缺少 `shifts/attendance` 等欄位時，啟動流程會補齊完整 state schema。
- PWA cache 更新至 v32，確保已安裝裝置取得本次修復。

### Verified

- 員工與老闆本機預覽可穩定載入且無 console error。
- 員工連續點選 4 天休假不跳頁；排班與我的出勤分頁可往返。
- 390px 手機煙霧測試可操作，但發現既有橫向溢位，已列後續 UX 修復。

## 2026-07-15 — Sprint 0（完成）

### Added

- Project Health Report 與 Product Backlog。
- PROJECT_CONSTITUTION、README、API、Database 與平台 ADR 文件。
- 零第三方依賴的 quality check 與 static build 基線。
- 本機 Git 版本控制基線與 Sprint 0 架構／品質審查紀錄。

### Changed

- Service Worker 發布資產清單不再包含未啟用 Firebase 檔案。
- 驗證入口改為只依賴 Node，不再假設環境一定提供 npm。

### Known Risks

- 員工介面 MutationObserver 無限更新尚待 Sprint 1 修復。
- 現況 Google Sheets API 仍有 Critical 越權與全量覆寫風險，不可上線。
