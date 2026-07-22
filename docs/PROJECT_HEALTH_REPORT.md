# 班客邦 Project Health Report

## 2026-07-22 — PostgreSQL UI bootstrap health update

- **Commercial readiness: 81% (previously 80%).** The controlled read/bootstrap path and isolated reversible frontend bundle are implemented and locally tested.
- **Confirmed safe:** normal Staging/Production remain on Google Sheets; no database migration, business data, public endpoint, Auth0 configuration, Production deployment or Draft Preview changed.
- **Remaining P0/P1:** create the approved isolated API host, apply `0011` and role grants in Staging, then prove live boss/employee reconciliation, rollback, timeout/weak-network and browser E2E.
- **Release verdict: No.** Source readiness is not equivalent to a deployed or accepted Staging cutover.

## 2026-07-20 — PostgreSQL Production Integration health update

- **Commercial readiness: 80% (previously 79%).** A tested browser transport boundary now exists for the formal PostgreSQL API, while every committed environment remains fail-closed and on the current data backend.
- **Confirmed safe:** no Production/PostgreSQL deployment, no schema/data change, no Netlify Draft Preview change, no client-selected tenant authority, and no secret or endpoint committed.
- **Remaining P0/P1:** deploy an isolated Staging Node API; complete read/bootstrap endpoints; prove Session/Membership authorization, data reconciliation, rollback, weak-network behavior and boss/employee E2E before any Production switch.
- **Release verdict:** No. The integration boundary is production-oriented, but the live API path and reversible cutover have not been accepted in Staging.

## 2026-07-20 — Project Cleanup & Technical Debt Review

- **範圍：** 正式來源、建置／測試入口、依賴、migration、文件引用與 Git 發布邊界；沒有變更 Architecture、Auth0、AWS、Production 或資料庫。
- **重複程式：** 前端管理 handler 已維持單一入口。跨層 `normalizedHost`、`stableJson`、`validDate` 與 SQL identifier quoting 仍有小型重複，但分布在 migration、runtime、security-event 等不同信任邊界，未經逐層契約測試前不宜合併。
- **Dead code：** 未發現可安全刪除的 tracked 正式來源。`staging-acceptance.mjs` 由 Runbook 使用；PostgreSQL Staging integration test 需要外部環境，刻意不放入無憑證的本機測試鏈；migration rollback 的相同 SQL 是歷史還原快照。
- **未使用依賴：** 未發現。`pg`、AWS Secrets Manager SDK 與 `fflate` 均有實際 runtime／Artifact packaging 引用。
- **低風險修正：** 將自包含的 Auth0 Staging initiation 測試加入完整測試鏈，並將該測試與人工 Staging acceptance 工具加入語法檢查，避免安全入口在一般品質檢查中漂移。
- **技術債：** ADR `0011` 歷史編號重複；package test command 過長；跨層 helper 重複；舊 PWA 仍依賴多個全域 script。這些不影響目前執行，但需在獨立、具回歸證據的重構 Sprint 處理。
- **商業上線完成度：79%（維持不變）。** 本次提升維護與驗證完整性，沒有完成新的 Production 能力，因此不提高百分比。
- **是否適合正式上線：No。** AWS Staging 真實資源／事件 E2E、前端正式 API cutover、跨裝置 E2E、observability 與 release operations 仍未完成。

> 本節是 2026-07-20 的最新現況。下方較早的百分比與未完成項目保留作歷史稽核，不應覆蓋本節。

## 2026-07-20 — Lambda artifact packaging

- Lambda Artifact is now reproducible from the committed pnpm lockfile with an explicit package-manager version, no install scripts and a project-local dependency cache.
- The ZIP includes exact `pg` and AWS Secrets Manager SDK versions, a deterministic manifest and CycloneDX 1.5 SBOM; generated ZIP, checksum and SBOM are local ignored outputs.
- Two independent builds produce byte-identical archives and SHA256 values. The packaged Handler and both direct runtime dependencies pass an isolated synthetic SQS invocation without cloud or database access.
- **Commercial readiness: 79% (previously 78%).** The increase covers build provenance, dependency completeness and local execution evidence only; no AWS validation, upload, resource creation or event E2E is counted.
- **Fit for Production: No.** AWS Staging control-plane validation, reviewed change set, artifact upload/version binding, alarms and real Staging event E2E remain incomplete.

## 2026-07-20 — AWS Staging infrastructure preparation

- CloudFormation now defaults both EventBridge ingress and Lambda consumption to disabled, requires an immutable Lambda artifact version and fixes the queue-name contract used by the handler.
- EventBridge delivery failures and Lambda processing failures have separate encrypted DLQs; SQS visibility timeout, TLS-only policy, exact source account/rule, optional KMS encryption-context restriction and CloudWatch alarms follow AWS operational guidance.
- IAM remains least privilege: no wildcard allow/admin action, direct database credential, Production identifier or resource creation occurred. Local checks validate references, resource-type allowlist, IAM boundaries and alarm/retry settings.
- **Commercial readiness: 78% (previously 77%).** The increase reflects deployment-safe, observable and locally repeatable IaC preparation only. It does not count AWS control-plane validation, Lambda packaging, resource creation or real event E2E as complete.
- **Fit for Production: No.** The isolated AWS Staging stack, alarm route and immutable Lambda artifact must still be created and accepted through a reviewed change set and real E2E; Production remains untouched.

## 2026-07-19 — Auth0 Staging security-event pipeline implementation

- 已完成 Staging-only EventBridge/SQS/Lambda/PostgreSQL event consumer 程式、IaC、idempotency、retry/DLQ、least-privilege grant gate 與合成安全測試。
- 來源信任邊界採 Auth0 AWS partner source + AWS IAM/SigV4 service path，不暴露未簽章 HTTP webhook；應用層再驗證 exact queue/account/region/source/issuer/time/correlation。
- migration `0009` 與 event role 權限腳本僅準備，尚未套用；AWS/Auth0/Netlify 資源與真實 Staging event E2E 均未建立或執行。
- **商業上線完成度：77%。** 本次提高程式準備度，但不把未部署的安全控制視為完成；自動 provider-event revocation、Production API/前端部署、監控、跨裝置 E2E 仍是正式上線阻擋。
- **是否適合正式上線：No。** 必須先在隔離 Staging 建立外部資源並通過真實事件撤銷、重播、DLQ 與舊 Access Token 拒絕驗收。

## 2026-07-18 — Sprint 3 Identity 與不可偽造 Tenant Context

- 已建立 Auth0 OIDC/OAuth 2.0 的 server/database 基礎；Access Token 採 RS256、issuer/audience/exp/nbf/iat/session claim 驗證，同源 JWKS 有安全快取、輪替與未知 `kid` fail closed。
- Token 中的 workspace claim 會被拒絕；每次請求由資料庫重新確認 identity principal、內部 user、workspace、membership、role 與 local session。
- API database role 已從十張 business tables 的 DML 降為零 table/sequence 權限，只保留四個受控函式；自行 SET custom GUC、直接 SQL 或直接呼叫內部 verifier 均不能取得租戶資料。
- 30 秒簽章 tenant context 具 nonce replay protection；停權 user/member、移除 membership、compromised/revoked session 即使 Access Token 尚未過期仍會被拒絕。
- 真實 Staging 驗收發現並修正 Session 秒／毫秒精度與排假 SQL 運算優先序；migrations 0004–0008 均保留 checksum/version history。
- **商業上線完成度：72%（前次 69%）。** 上調來自關閉共用 DB credential + forged GUC 的已實作 API P0，但 Auth0 Staging 尚未接通，refresh-reuse provider event、完整 API、前端切換、監控與跨裝置 E2E 仍未驗收。
- **是否適合正式上線：No。** 目前只是 Local/Staging foundation；Google Sheets/Apps Script/Production 未修改。下一個 P0 是唯一外部步驟與真實 Auth0 token lifecycle E2E。

## 2026-07-18 — Managed Staging PostgreSQL 真實引擎驗收

- 隔離 Neon PostgreSQL 18.4 已通過 0001–0003 Migration、checksum、逐版 transaction、advisory lock 與重複執行保護；未連接或修改 Production。
- 非敏感 Snapshot 的 dry-run、apply、replay 與欄位／筆數對帳通過；過渡 credential 未匯入。
- 兩個合成 Workspace 已通過 FORCE RLS 正反向測試、無 Context 直連、跨租戶讀寫、複合外鍵與獨立最小權限 API role 測試。
- 六個已實作 Command API 流程在真實引擎通過；整合測試連續兩次通過，修正了休假測試前置狀態不具重複性的缺陷。
- 官方 PostgreSQL 18 `pg_dump`／`pg_restore` 已完成隔離還原；Migration／資料筆數一致、11 張表維持 FORCE RLS，還原後雙租戶 API 讀取正常。現有索引已被查詢計畫採用，未新增無證據索引。
- 安全稽核另確認：RLS 能阻擋無 Context 及已綁定 A 租戶後對 B 的查詢，但持有共用 API database credential 的攻擊者可偽造 custom GUC。正式切換前必須以正式 Identity Provider 搭配簽章 tenant context 或受信任連線代理封堵。
- **商業上線完成度：69%（前次 67%）。** 上調來自真實 managed engine、RLS、API、匯入與 DR 證據；因上述 DB credential 信任邊界尚未封堵，未上調至 70%。
- **是否適合正式上線：No。** 正式 Identity Provider、不可偽造 tenant context、token lifecycle、完整 read/API surface、frontend adapter、PITR/RPO/RTO、observability、load test、跨裝置 E2E 與 Production cutover review 尚未完成。

## 2026-07-18 — PostgreSQL 多租戶基礎

- 正式 PostgreSQL 程式基礎已建立：三個 versioned migrations，包含 constraints、indexes、FORCE RLS、audit/outbox、idempotency 與 snapshot import tracking。
- 獨立 Transaction/Command API 已實作 strict allowlists、verified JWT context、active membership check、tenant transaction 與 structured errors。既有 Production frontend／Google Sheets path 未變更。
- 自動測試涵蓋 migration structure/gates、legacy snapshot mapping、credential exclusion、tenant-scoped writes、JWT signature、CORS 與 1 MiB UTF-8 request limit。
- **商業上線完成度：67%（前次 63%）。** 增幅代表已有可執行 database/API 基礎，不代表完成 cutover。managed PostgreSQL、live RLS/import/restore、正式 Identity Provider、endpoint 完整度、frontend adapter、observability、load test 及真實裝置 E2E 仍是阻擋。
- **是否適合正式上線：No。** 此 workspace 沒有可用 PostgreSQL server，因此 migrations 尚未在真實 engine 執行。Production 未修改或部署。

## 2026-07-17 — Staging 前端環境隔離

- 已完成 Local／Staging／Production 前端設定與可重複建置；Staging 僅含 Staging Apps Script URL。
- Service Worker cache、PWA identity、localStorage 與 sessionStorage 已依環境隔離，Production 保留既有 storage key 相容性。
- 桌機 Staging 驗證通過：STAGING 識別清楚、實際後端 iframe 僅指向 Staging、Console 無 JavaScript Error。
- 既有 13 組回歸、環境隔離測試、品質檢查、資產建置與發布閘門通過。
- **整體商業上線完成度：63%（前次 62%）**。增加 1% 來自環境與發布安全性；真實手機／平板 E2E、正式 Identity／資料庫及正式發布仍未完成。
- **是否適合正式上線：No**。下一個 P0 是依人工清單完成真實跨裝置 Staging E2E；Production 未部署。

## 2026-07-17 — 資料庫 Schema 與 API 規格設計 (Sprint 2)

- 已完成正式資料庫 Schema ([docs/schema.sql](../docs/schema.sql)) 與 OpenAPI 規格 ([docs/openapi.yaml](../docs/openapi.yaml))。
- 詳細定義了多租戶（Workspace ID）隔離、Argon2id 雜湊、JWT/Refresh Token 流程與命令式 API。
- 解決了資料一致性、全量覆寫風險與身分驗證非標的問題。
- **功能實作估值：約 78%；整體商業上線完成度：62%（前次 60%）**。
- **是否適合正式上線：No**。設計已具備實作條件，但實體資料庫建置、API 開發與資料遷移尚未執行。

## 2026-07-16 — 正式 Auth 與後端遷移架構設計 (Sprint 2)

- 已完成 [ADR 0012](docs/adr/0012-formal-auth-and-backend-migration.md)，定義目標身份驗證系統（JWT + Refresh Token + Argon2id）與關聯式資料庫架構（PostgreSQL）。
- 定義了多租戶隔離原則（RLS/Workspace ID Filter）與 Google Sheets 的角色轉型計畫（SSOT 降級為 Export Target）。
- 建立後續三個 Sprint 的明確實作路徑，解決了 Google Sheets 擴充性與安全性的長遠阻礙。
- **功能實作估值：約 75%；整體商業上線完成度：60%（前次 58%）**。
- **是否適合正式上線：No**。雖然設計已定案，但正式後端實作、資料遷移與安全稽核仍未執行。

## 2026-07-16 — 薪資計算正確性與登出功能修正

- 已修正老闆與員工薪資計算口徑不一致的問題（Bug 17）。老闆端的「薪資試算」與「匯出 CSV」現在統一改用實際「出勤紀錄」作為核定依據，而非排班。
- 頂部總覽現同時顯示「預估排班成本」與「實際核定支出」，方便老闆對比計畫與現狀。
- 修正打卡下班的四捨五入邏輯（Bug 21），移除 0.5 小時強制最小值。現在低於 15 分鐘的誤觸打卡會正確計為 0 小時，不再自動產生 30 分鐘工資。
- 新增「登出」按鈕並確保登出時完整清除本機敏感資料、session 與快取（Bug 24），提升多帳號使用安全性。
- 本次修改已通過 13 組回歸測試與本機 smoke test。
- **功能實作估值：約 73%；整體商業上線完成度：58%（前次 56%）**。
- **是否適合正式上線：No**。

## 2026-07-16 — UTC 月份與角色 UI 修正

- 已修正 `app.js`、`access.js` 與 `employee-work.js` 的 initial month、allowed months 與 today's date 計算，一律改用 `Asia/Taipei` 時區以解決 UTC 邊界造成 1 日凌晨月份錯誤的 P0/P1 風險。
- 已修正 `employee-layout.css`，在員工模式下強制隱藏「出勤／請假」、「員工」與「薪資試算」等老闆專屬頁籤，完成 Sprint 1 的角色 UI 隔離驗收標準。
- 本次修改已通過 13 組回歸測試與本機 smoke test。
- **功能實作估值：約 71%；整體商業上線完成度：56%（前次 54%）**。
- **是否適合正式上線：No**。

## 2026-07-16 — P0 schema 版本化與遷移系統

- 已完成後端 `google-sheets-backend.gs` 與前端 `state-store.js` 的 `sync.schemaVersion` 版本號機制。
- 讀取邊界 `migrate_` 現在會自動將缺少版本號的舊資料正規化至目前版本 1，為後續正式資料庫遷移奠定基礎。
- 修正 `enhancements.js` 備份檔名 UTC 日期 Bug。
- **功能實作估值：約 69%；整體商業上線完成度：54%（前次 53%）**。
- **是否適合正式上線：No**。

## 2026-07-16 — request 大小與 A1 欄位值驗證

## 2026-07-17 受控 Staging 驗收

- 已建立與正式資料隔離的 Staging Google Sheet、Apps Script 專案與 Web App 部署；部署來源為 commit `7c9b687` 加上本次驗收中發現的 credential runtime 修正。
- 線上 API 驗收通過：老闆登入、員工新增與首次啟用、員工登入、排班、排假、上下班打卡、老闆同步、revision conflict、登出後 session invalidation。
- `createOperationalBackup`、`verifyLatestOperationalBackup`、`runReleaseReadinessCheck`、實際 restore 與 restore 後 readiness 均通過；Staging 最後回復為乾淨 revision 0，且 restore 會撤銷所有舊 session。
- Staging 實測找到 P0 效能問題：Apps Script 在全域 ScriptLock 內執行 4096 次 HMAC 會讓登入逾時並阻塞所有請求。新 credential 改為有 salt、server-only pepper、domain separation 的固定成本 `hmac-sha256-v2`；舊 v1 credential 仍可驗證並在成功登入後遷移。
- 限制：此次 UI 並未建立獨立的 Staging 前端設定，線上驗收是直接呼叫隔離後端；實際 8 小時 TTL 未等待，已驗證登出與還原撤銷，TTL 邏輯由自動測試覆蓋。真實手機／平板跨裝置 UI E2E 仍未完成。
- **此段原始估值：功能實作約 70%；商業上線完成度 55%（以 commit `7c9b687` 的 53% 基線計算）**。這是 Staging 驗收當時的歷史估值，不覆蓋 origin/main 後續完成資料庫／API 設計後記錄的 62%。最新整體文件估值仍為 62%，且受控後端驗收與 DR 演練已有實證；正式 IAM、多租戶關聯式資料庫實作、Staging 前端、真實裝置 E2E、監控與 CI/CD 仍是上線阻擋。
- **是否適合正式上線：No**。

## 2026-07-16 request 大小與 A1 欄位值驗證

- `doPost` 現在以 UTF-8 byte 數拒絕超過 1 MiB 的 request，且在 JSON parse、API、lock、Sheet 讀寫前立即停止；錯誤沿用 `{ ok, error, code }` 並保留 `requestId`。
- A1 讀取、老闆 `save`、第一次初始化、備份與寫入前現共用電話、credential 表示、薪資／金額、日期／時間值驗證。非法儲存不寫入、不部分 merge、不推進 revision。
- 舊資料缺欄、空薪資調整及原樣舊負數扣款維持相容；新負數或複製扣款被拒絕。現行啟用碼是既有 8 碼大寫英數，與「純數字」新描述不一致；本次保留正式使用中規格，列為技術債。
- 13 組 P0/state/cleanup 回歸、品質檢查與 25 檔 build 通過。未部署 Apps Script，未作 staging/actual-device E2E，因此仍不適合正式上線。
- **功能實作估值：約 68%；整體商業上線完成度：53%（前次 52%）**。上調 1 個百分點是因為又封堵一組 P0 傳輸／資料完整性風險並有自動證據；正式 IAM、多租戶關聯式資料庫、staging、跨裝置 E2E、負載／DR 仍大幅限制總完成度。

## 2026-07-16 老闆 save request 邊界防護

- 已封堵老闆 `save` 的 top-level mass-assignment 與漏欄清空：未知欄位、錯誤 collection／map 形狀、array root、只有 server-managed 欄位的空操作會以 `REQUEST_DATA_INVALID` 拒絕且不寫入。
- 合併改以伺服器既有 snapshot 為底；漏傳員工、班次、休假等欄位會保留原值，明確空集合仍保留既有刪除語意。`workspace`、`sync`、`access` 仍不可由 client 覆寫。
- 本次沒有新增 action、畫面或資料 schema，也未部署 Apps Script。功能實作估值維持約 67%，整體商業上線完成度維持 **52%**；正式 IAM、多租戶資料庫、完整值 schema、size limit、staging 與跨裝置 E2E 仍是上線阻擋。

## 2026-07-16 完成度校正與 snapshot 欄位形狀防護

- Apps Script 現在會在任何登入、同步、清理或寫回前，驗證主資料已知陣列、object map、巢狀記錄與 `sync.revision` 的基本形狀；錯誤時回 `DATA_SOURCE_INVALID` 並保留 A1 原文。
- 缺少欄位的舊 snapshot 維持向後相容，空的舊版 `payrollAdjustments` 仍可無損轉換；本次沒有變更畫面、API action、資料 schema 或正式部署。
- **功能實作估值：約 67%；整體商業上線完成度：52%（前次回報 67%）**。前次百分比過度偏重已存在的畫面與功能檔案，未充分扣除正式 IAM、多租戶資料庫、request/schema 完整驗證、跨裝置 E2E、實際裝置與部署演練尚未完成；因此本次依使用者指定的綜合標準向下校正。
- **是否適合正式上線：No**。目前仍是 Google Sheets／Apps Script 過渡後端，沒有正式多租戶關聯式資料庫、正式身分服務、完整 audit／PITR、staging 驗收與真實跨裝置 E2E。

## 2026-07-16 雲端主資料損壞防覆寫

- 修正一般 Apps Script API 將損壞 JSON／非 object root 當成空公司資料的 P0 風險；現在回 `DATA_SOURCE_INVALID` 並保留原始 A1。
- 既有空白新資料表初始化、一般 API action、前端與 snapshot schema 均未改變；針對讀取邊界的品質檢查與回歸測試通過。
- 這是資料安全止血，不是新產品功能；本段當時沿用的 67% 是功能實作估值，已由上方依商業上線標準校正為 52%。

## 2026-07-16 整理功能驗收

- 完成桌機與 390×844 手機尺寸的老闆／員工驗收；發現並修正月曆姓名撐開七欄造成的水平溢位。
- 加入 CSS 防回歸檢查並更新 PWA cache；品質檢查、12 組回歸、build 與 release gate 通過。
- 權限、API 與資料 schema 未變；整體完成率、Health Score 與「不可正式上線」判定維持不變。

## 2026-07-16 專案整理收尾

- 合併員工、班次、出勤的重複事件處理與老闆資料提交入口；移除 `fallback-actions.js`。
- 移除未啟用 Firebase／Supabase 草稿檔，Google Sheets API URL 改為唯一設定來源。
- 修正 Service Worker 對非導覽資產錯誤回傳 app shell，以及匯入／薪資調整未等待雲端確認的回歸風險。
- 品質檢查、12 組回歸、25 檔 build／release gate 與老闆／員工本機 smoke 通過，瀏覽器無 warning/error。
- 本次沒有提升正式後端、資料庫或 IAM 完成度；整體完成率與上線判定維持不變，正式 Apps Script readiness 與跨裝置 E2E 仍未執行。

## 2026-07-15 本 Sprint 更新

- **當時功能實作估值：67%**（前次 65%；2026-07-16 依商業上線標準校正為 52%）
- **Project Health Score：69 / 100**（前次 66）
- **是否適合正式上線：No**
- 已封堵：無限 PIN 線上猜測、PIN hash 長期重播、未驗證 session restore、登出／刪除員工未撤銷、credential hashes 回傳瀏覽器。
- 已封堵：建立明確單一 workspace ID，綁定資料、session 與回應；client 無法指定或修改，mismatch 會停止同步。
- 已封堵：authenticated scripts 不再將雲端文字資料交給 HTML 解析器，並以自動測試禁止 stored XSS sink 回歸。
- 已封堵：老闆 snapshot 必須通過 revision compare-and-swap；stale、missing 與 replay save 不再覆蓋員工 action。
- 已封堵：新 PIN／啟用碼不再把快速、無 salt SHA-256 直接存入 Sheet；改為每筆 salt、server-only pepper 與反覆 HMAC，舊 credential 在成功驗證時自動遷移。
- 已封堵：可建立私人 Drive 復原包並驗證／回滾 Sheet＋必要 Script Properties；發布前具本機與 Apps Script 雙重閘門。
- 仍屬 P0：這不是正式多租戶資料列隔離、正式 Identity Provider 或自動 PITR；老闆仍傳整份 JSON，且無正式 audit、CI/CD、不可變備份與定期 restore drill。
- 下一個最高優先：完成正式身分服務、多租戶關聯式資料庫與 command API 的可遷移設計，停止繼續擴大 Google Sheets primary database。

基準日期：2026-07-15  
稽核範圍：專案根目錄全部原始碼、PWA 設定、Google Apps Script、Firebase/Supabase 殘留設定、本機老闆與員工預覽流程。  
稽核原則：以正式商業產品、多人公司、多裝置同步、勞務與薪資敏感資料的標準評估。

## 結論摘要

- **整體商業上線完成率：60%**（功能實作估值約 75%）
- **Project Health Score：78 / 100**
- **正式上線：No**
- **目前型態：** 單頁 PWA（HTML/CSS/Vanilla JavaScript）＋ Google Apps Script；不是 Flutter 專案。
- **最大阻斷：** 雖然已完成正式後端設計 (ADR 0012)，但實作尚未開始。目前仍依賴單一 JSON 覆寫式同步，缺乏多租戶物理隔離與正式身分服務，且缺少 CI/CD、正式資料庫監控與完整 E2E。

### 分項完成度

| 項目 | 完成度 | 說明 |
|---|---:|---|
| 畫面與基本操作 | 72% | 已完成基礎介面與登出功能；待 API 遷移後重構數據流 |
| 排班／休假／出勤 | 52% | 待遷移至 Command API 與關聯式資料庫以強化一致性 |
| 薪資 | 45% | 已解決試算矛盾；待加入正式鎖帳與版本化機制 |
| 登入與權限 | 65% | 正式 Auth 設計 (ADR 0012) 已定案；待開發正式 IAM 模組 |
| 雲端同步 | 55% | 正式遷移計畫已定案；現況仍是 JSON snapshot |
| 資料庫 | 40% | 正式 Schema 設計已完成；待執行實體建置與遷移 |
| QA／自動化 | 48% | 已有穩定回歸測試；待加入後端 Integration 與 E2E |
| DevOps／營運 | 40% | 遷移至 PostgreSQL 與雲端代管計畫已定案 |
| 文件與治理 | 75% | 已完成 Sprint 2 核心架構 ADR 與實作順序計畫 |



## 1. 已完成功能

下列功能「已有程式或畫面」，不代表已達正式上線品質：

- 暖色系、繁體中文、基本響應式的管理介面。
- 老闆／員工登入畫面、電話號碼＋6 位 PIN、PIN 顯示切換。
- 老闆新增、編輯、移除、3 天保留、還原員工的介面與本機資料邏輯。
- 員工月休額度、月份日曆、當月與次月限制、休假草稿與儲存按鈕。
- 新增班次、重疊班次與休假衝突的基本提示。
- 員工上下班打卡、老闆調整實際工時、員工本月收入顯示。
- 出勤、薪資試算、薪資加扣項目、CSV 匯出、列印。
- Google Apps Script Web App 端點與 Google Sheets 同步原型。
- PWA manifest、Service Worker、安裝提示與本機角色預覽入口。
- 未啟用 Firebase／Supabase 概念驗證檔已於 2026-07-16 移除；現況只保留 Google Sheets 過渡後端。

## 2. 未完成功能

- 穩定可用的員工介面與登入後導覽。
- 多公司／多門市 workspace 與嚴格租戶隔離。
- 正式帳號註冊、邀請、重設 PIN、裝置/session 管理、撤銷與登出。
- 後端權限模型：員工只能讀寫自己的班表、休假、出勤與薪資可見資料。
- 班次編輯、刪除、發布、草稿、版本與衝突處理。
- 正式休假規則、額度結轉、跨月、部分天、鎖定與稽核。
- 出勤異常、休息時間、跨日班、加班、國定假日、遲到早退與補登流程。
- 以「核定實際工時」為唯一口徑的薪資計算、結算與鎖帳。
- 通知、邀請連結、推播／Email／簡訊策略。
- 自動 3 天刪除排程、資料匯出與法規保存政策。
- 可靠離線佇列、弱網路重試、冪等操作、衝突解決。
- 正式資料庫 migration、索引、外鍵、transaction、audit log、備份與還原演練。
- 測試、CI/CD、staging、監控、告警、錯誤追蹤、版本與回滾。
- 商業所需的方案／計費／用量限制／客服與營運後台。
- Flutter 專案、Android/iOS 原生建置與商店上架流程（目前不存在）。

## 3. Bug 清單

### Critical / P0

1. ~~`employee-layout.js` 與 `boss-hours.js` 的 MutationObserver 自我觸發，造成員工預覽逾時。~~ **2026-07-15 已修復並完成瀏覽器回歸測試。**
2. ~~Google Apps Script 的 `employeeLogin`／`pull` 將整份公司資料回傳給員工。~~ **2026-07-15 已改成本人資料投影，並移除 PIN hash、access、封存與薪資調整。**
3. ~~員工 `save` 可覆寫非本人資料。~~ **2026-07-15 已由伺服器拒絕員工全量 save，排假與打卡改為 server-derived identity 的明確命令。**
4. ~~第一個知道員工電話的人可自行認領 PIN；空白雲端的第一個呼叫者也可認領老闆帳號。~~ **2026-07-15 已止血：老闆第一次初始化須符合 Apps Script 預登記電話；員工以 8 碼一次性啟用碼設定第一組 PIN。**
5. ~~資料、session 與回應沒有 workspace 邊界。~~ **2026-07-15 已建立 server-generated 單一 workspace 綁定；同一部署仍無法服務多家公司，正式 row-level tenant isolation 尚未完成。**
6. ~~全量 JSON snapshot 以最後寫入者覆蓋；多裝置同時操作會靜默遺失資料。~~ **2026-07-15 已加入 server revision／compare-and-swap；衝突會拒絕且保留本機修改。全量 snapshot 架構仍待取代。**
6a. ~~Google Sheet A1 損壞或根節點錯誤時，一般 API 會當成空資料繼續執行，可能覆蓋救援來源。~~ **2026-07-16 已改為 `DATA_SOURCE_INVALID` fail closed 並保留 A1；同日補上 collection／map 形狀、老闆 `save` allowlist／漏欄保留、1 MiB request 邊界與本 Sprint 指定的關鍵值驗證。帶版本的完整 schema/migration 仍待 Sprint 3。**

### High / P1

7. ~~登入前 `app.js` 已讀取並渲染 localStorage 公司資料；登入只是視覺遮罩。~~ **2026-07-15 已改為驗證成功後才載入管理程式，未登入 DOM 不再包含公司資料；本機儲存與正式授權風險仍待 Auth Sprint。**
8. ~~本機預覽或舊資料缺少完整 schema，造成 `data.shifts.filter`、`attendance.filter` 出錯。~~ **2026-07-15 已加入啟動 schema 正規化。**
9. ~~多個模組直接 `JSON.parse(localStorage)`，一筆壞資料可讓整個 APP 白畫面。~~ **2026-07-15 已建立共用 state store、損壞隔離、舊版遷移與安全復原。**
10. ~~編輯員工會重建 record 且漏掉既有 `pinHash`，造成 PIN 被意外清除。~~ **已保留既有 credential 欄位。**
11. ~~電話重複檢查用原字串，登入卻會移除非數字；格式不同的同一電話可建立重複員工。~~ **新增／編輯時已正規化並比對；正式資料庫 unique constraint 仍未建立。**
12. ~~多處以 `innerHTML` 插入姓名、職稱、備註等使用者資料，存在 stored XSS。~~ **2026-07-15 已改為 DOM 純文字渲染，並建立 sink 掃描與惡意 payload 防回歸測試。**
13. ~~6 位 PIN 只做無 salt 的 SHA-256，且 hash 直接保存。~~ **2026-07-15 已改為過渡期 server-side salted credential、server-only pepper 與登入時舊資料遷移；6 位 PIN 低熵與非正式 Identity Provider 仍是上線阻擋。**
14. 沒有登入 rate limit、鎖定、session expiry、refresh、revoke、device list。
15. ~~`google-sheets-cloud.js` 正在儲存時會直接丟棄後續 `push`，沒有 dirty queue。~~ **已改為 latest-state queue，並加入 revision conflict 防護。**
16. 員工端不做 15 秒 pull；老闆更新後員工不會自動同步。
17. ~~老闆薪資與統計使用排班工時，員工收入與工時調整使用出勤工時，數字互相矛盾。~~ **2026-07-16 已統一改用出勤紀錄核定。**
18. ~~`Service Worker` 對任何 GET 失敗都回 `index.html`，JS/CSS 可能收到 HTML。~~ **2026-07-16 已限制只有導覽請求可回退 app shell。**

### Medium / P2

19. ~~老闆模式的休假儲存面板 `hidden`，但 CSS `.leave-save-panel{display:flex}` 仍讓它顯示。~~ **2026-07-16 已修正為屬性優先。**
20. 班表文字表示可點選編輯，但沒有班次編輯／刪除操作。
21. ~~上下班時間差一律至少算 0.5 小時，即使誤觸立即下班也會產生薪資工時。~~ **2026-07-16 已移除強制最小值。**
22. ~~月份以 `toISOString()` 取 UTC，台灣每月 1 日凌晨可能顯示前一個月。~~ **2026-07-16 已改用本地時區計算。**
23. 3 天永久刪除只在載入或 API 呼叫時清理，不是準時排程。
24. ~~登出只清 session flag，不清本機敏感資料，也沒有明顯登出按鈕。~~ **2026-07-16 已新增登出按鈕並執行完整清除。**
25. CSV 未處理逗號、換行、引號與試算表公式注入。

26. ~~全域 scripts 依載入順序互相攔截事件，`app.js` 與 `fallback-actions.js` 有重複 handler。~~ **2026-07-16 已集中至 `management-actions.js` 並加入回歸測試。**

### Low / P3

27. ~~Service Worker 快取未使用 Firebase 檔案。~~ **Sprint 0 已移除；版本自動化仍待 Sprint 9。**
28. PWA 只有 SVG icon，iOS／Android 安裝圖示與 maskable 相容性不足。
29. 整理前 ZIP 已由 `.gitignore` 排除；正式異地備份與不可變版本歷史仍待 DevOps Sprint。
30. ~~Firebase/Supabase 檔案未使用，會誤導維護與安全稽核。~~ **2026-07-16 已移除。**

## 4. 技術負債

- 12 個全域 script 共享 DOM、localStorage 與全域變數，沒有模組邊界與型別。
- `app.js`、`fallback-actions.js` 重複表單與資料寫入邏輯，靠 capture/`stopImmediatePropagation` 決定誰生效。
- 主要 state 的 `read/write/normalize` 已集中至 `state-store.js`；`hash/money/month` 等規則仍分散。
- 以 `location.reload()` 當狀態同步機制，無中央 state store。
- Monkey-patch `localStorage.setItem` 觸發雲端同步，第三方或未來模組容易失效。
- CSS 壓成單行，缺設計 token／元件規格／可維護命名。
- 已建立本機 Git repository，但尚無正式 branch、tag、remote 與 release history；仍保留大量手工 ZIP。
- 已有零依賴 package scripts、語法檢查、P0 防回歸測試與 build；formatter、完整 linter、E2E、coverage、CI 仍未建立。
- README、Backlog、API、Database、Change Log、ADR 與 Constitution 已建立，仍需隨每個 Sprint 持續維護。

## 5. 架構問題

目前資料流：`DOM -> 多個全域 JS -> localStorage 全量 snapshot -> iframe/form -> Apps Script -> Sheet A1 JSON`。

- UI、business logic、authorization、persistence 混在瀏覽器端。
- Google Sheets 被當主資料庫，而不是報表／匯出整合。
- 已為三個員工 mutation 建立過渡 command boundary；老闆與其餘 domain 仍缺完整 action API。
- 已有過渡期單一 workspace identity 與全域 optimistic revision；仍沒有多租戶資料列模型、row revision、event 或 idempotency key。
- 沒有資料 schema version 與 migration runner。
- 沒有 server-side scheduled jobs、audit、notification、session service。
- Supabase relational schema 仍把核心資料塞進 `jsonb app_data`，未解決正規化與權限問題。

### 建議目標架構

1. 保留 PWA 作短期前端，但逐步模組化；是否 Flutter 另做 ADR，不直接重寫。
2. 建立多租戶 workspace，所有資料列含 `workspace_id`。
3. 使用正式 relational database（建議 PostgreSQL 類型；供應商經 ADR 選定）。
4. API 改為 action/command 與 scoped query，不允許客戶端全量覆寫 snapshot。
5. 正式 auth/session、伺服器端 authorization、audit log、rate limit、revision conflict。
6. Google Sheets 降為匯出／報表整合，不作 primary database。

## 6. 安全性問題

- Authentication：首次認領已用預登記 owner phone 與一次性啟用碼止血；PIN 已加入每筆 salt、server-only pepper 與反覆 KDF，但仍是低熵 6 位數、非記憶體困難雜湊，且無 MFA／正式恢復流程。
- Authorization：員工可取得全公司資料並覆寫非本人 domain。
- Tenant isolation：不存在。
- XSS：多處 stored `innerHTML`；無 CSP。
- Session：hash 為 bearer credential；無期限、撤銷、rotation、裝置管理。
- Rate limit/replay：不存在。
- Secrets/config：端點與雲端設定 hard-code；雖 Firebase public config 不是 secret，但環境沒有分離。
- CSRF：Apps Script POST 沒有 anti-CSRF 或真正 session 綁定；目前靠 hash 權限。
- Logging/audit：沒有登入、權限失敗、資料變更、刪除的不可竄改紀錄。
- Privacy：薪資與電話仍可能留在 localStorage；Google Sheets 模式登出會清除主要敏感快取，credential 已不回傳或寫入前端 state，但其他本機模式與裝置遺失政策仍未完成。
- Backup/DR：已具私人 Drive、checksum、workspace 驗證、rollback 與發布 readiness 的過渡復原流程；31 個本機 ZIP 仍不是正式備份，且仍缺不可變／獨立加密備份、PITR、保留政策與定期演練。

## 7. UI/UX 問題

- 員工介面已能穩定載入；但休假儲存按鈕位於第二頁、錯誤狀態與弱網體驗仍不符合正式產品要求。
- ~~登入畫面後方仍有完整公司資料，只是用 overlay 遮住。~~ **2026-07-15 已完成登入前資料與管理畫面隔離。**
- 老闆看到員工專用「儲存休假」面板。
- 員工的休假儲存按鈕被搬到第二頁，與「選完立即儲存」心智模型不一致。
- 重要操作大量使用原生 `alert/confirm/prompt`，錯誤不可追蹤且行動裝置體驗差。
- 登入沒有 loading/disabled，容易重複點擊與重複請求。
- 沒有明顯登出、切換帳號、忘記 PIN、支援入口。
- 月份鎖定主要靠透明度與攔截，缺清楚原因與可用月份提示。
- 日曆用色彩表達狀態，缺完整文字／ARIA；tabs 也缺 `aria-selected` 與鍵盤規格。
- 手機 topbar 控制過密，50 歲以上與低數位熟悉度使用者容易迷失。
- 無 tablet、深色模式、動態字級、觸控尺寸與 Apple HIG 驗證。

## 8. 效能問題

- ~~員工模式 MutationObserver 無限迴圈造成 CPU 100%、主執行緒阻塞。~~ **2026-07-15 已修復並加入防回歸檢查。**
- ~~`boss-hours.js` 監聽整個 body subtree，每次 render 都全表掃描與 DOM 改寫。~~ **2026-07-15 已縮小監聽範圍並加入防回歸檢查。**
- 每次小改動都序列化、保存並同步整份資料，資料量成長後成本線性上升。
- 15 秒全量 pull，差異用整份 `JSON.stringify` 比對並 `location.reload()`。
- 多處完整重建表格／日曆，沒有 keyed update、memoization 或 pagination。
- Apps Script 每次 request 取得全域 lock，所有使用者互相阻塞。
- Sheet 單一儲存格有內容大小限制，實際資料量很快撞限。
- 無壓縮 build、bundle analysis、Core Web Vitals、memory/frame profiling。

## 9. 資料庫問題

- Google Sheet `_班表APP資料!A1` 儲存整份 JSON；沒有 table、index、foreign key、unique constraint。
- Apps Script lock＋全域 revision 已阻止 stale snapshot overwrite；仍沒有 relational transaction boundary。
- 已拒絕損壞 JSON／非 object root 與本 Sprint 指定的非法關鍵值；仍沒有帶版本完整 schema、migration、row revision、soft delete policy、audit log。
- 已加入不可由 client 修改的單一 `workspace.id`；仍沒有正式關聯式 `workspace_id` 外鍵與多租戶資料列隔離。
- 電話沒有 canonical unique index。
- 員工、班次、出勤、休假、薪資缺 referential integrity。
- 3 天刪除沒有 server scheduler 與 legal retention 設計。
- 已有私人 Drive 過渡復原包與手動 rollback；仍沒有不可變／獨立加密備份、PITR、定期 restore drill 與正式 RPO/RTO。
- Supabase SQL 只是未使用草稿，且核心資料仍在單一 JSONB。

## 10. API 問題

- API 已由四個 action 增加三個員工明確命令，但仍沒有版本、正式資源模型與標準錯誤碼。
- 主資料讀取已有根節點防護，老闆 `save` 已有 top-level 白名單、collection／map 形狀、關鍵值與 1 MiB request 限制；request/response 仍沒有帶版本完整 schema、HTTP status 與 command idempotency。
- 已有全域 snapshot revision 與 conflict response；仍沒有 command idempotency key、row ETag 與 HTTP 409 transport。
- ~~沒有正式 session token，直接重播 `phone + pinHash`。~~ **已改為 8 小時 server session；正式 refresh/device management 仍未完成。**
- ~~沒有 rate limit、lockout。~~ **已加入每電話失敗限流與暫時鎖定；仍缺 IP/device risk 與 request signing。**
- ~~員工回應未做 field-level filtering。~~ **已完成本人 projection。**
- 員工 `save` 已關閉；老闆 `save` 的 top-level mass-assignment、錯誤集合形狀與漏欄清空已封堵，但全量 snapshot 架構仍應改成 command API。
- 沒有 observability：request ID、structured log、latency、error rate、health endpoint。
- Apps Script origin hard-code Netlify 網址；換 custom domain 會中斷。

## 11. 優先修復順序

### P0：停止資料外洩與無法使用

1. ~~修復員工介面無限迴圈。~~ **已完成。**
2. ~~建立主要 state 的集中正規化、舊版遷移與 corruption recovery。~~ **已完成第一階段；欄位級驗證與正式逐版 migration 留待後續。**
3. ~~登入前不載入公司資料；Google Sheets 模式登出清除本機敏感快取。~~ **已完成前端隔離；正式 server session/revoke 仍列於 P0。**
4. ~~凍結員工 Google Sheets 全量 `save`；員工只允許本人 action。~~ **已完成過渡期止血；老闆 snapshot 與正式 API 待後續。**
5. ~~阻止空白雲端與未啟用員工遭第一位訪客搶先認領。~~ **已完成過渡期止血；Apps Script 部署仍須設定 `SHIFT_APP_OWNER_PHONE`。**
6. ~~建立資料、session 與回應的明確單一 workspace 邊界。~~ **已完成過渡止血；正式多租戶資料列模型留在 Sprint 3。**
7. ~~建立短效 session、撤銷、rate limit、replay 防護與過渡期 salted credential。~~ **已完成過渡止血；refresh/device management、正式 Identity Provider、密鑰輪替與正式 session store 仍未完成。**
8. 決定正式 primary database 與 Identity Provider；Google Sheets 改為 export integration。
9. 修正 Service Worker 與部署 cache/version drift。
10. 建立 Git、build/check、最小 smoke/E2E 測試與 staging。

### P1：核心營運正確性

- 統一實際工時與薪資口徑、加班／休息／跨日／鎖帳。
- 修復 PIN 遺失、電話正規化與唯一性、stored XSS。
- 班次編輯／刪除／發布與 revision conflict。
- Audit log、3 天刪除排程、企業級不可變備份與定期還原演練。
- 員工即時／近即時同步、離線 outbox、API validation。

### P2：可靠性與體驗

- 修復休假按鈕位置、老闆錯誤面板、loading/error/retry/double-submit。
- 登出／切換帳號／忘記 PIN／裝置管理。
- 響應式、可及性、時區、打卡精度、CSV 安全、PWA icons/cache。
- 監控、錯誤追蹤、客服診斷資訊與營運後台。

### P3：維護與商業化

- 清理 Firebase/Supabase 殘留與 31 份 ZIP。
- 模組化、format/lint/type safety、設計系統。
- 計費、方案、用量限制、通知、分析、管理報表。
- 評估 Flutter／原生 App 的商業 ROI，再決定是否遷移。

## 12. 是否適合正式上線

**No。**

主要原因不是功能數量，而是：

1. 員工介面卡死已修復，但正式登入、弱網與跨裝置端到端驗收仍未完成。
2. 員工跨資料讀寫、PIN hash 重播與無 workspace 邊界已完成過渡止血，但 Google Apps Script session 仍不是正式 IAM。
3. 目前只保護「一個部署＝一家公司」，沒有資料列級多租戶隔離，不能以同一部署安全服務多家公司。
4. 驗證與 session 不符合商業系統最低安全標準。
5. 全量 snapshot 同步會在多人操作時遺失資料。
6. Google Sheets 單一儲存格無法承擔排班／出勤／薪資正式主資料庫。
7. 已有 P0 自動回歸、過渡備份與回滾，但仍沒有 CI、監控、不可變備份、定期演練、稽核與完整 E2E。

在 P0 與 P1 完成、通過安全與資料遷移演練、至少一輪封閉 beta 後，才可重新評估上線。

## 13. 剩餘工作量估算

以 1 個資深全端工程師＋兼任 QA/DevOps、需求範圍不再擴張計算：達到可控 beta 約還需 **8–10 個 Sprint、80–120 個人天／640–960 小時，日曆時間 16–24 週**；達到可收費正式營運約還需 **14–18 個 Sprint、140–200 個人天／1,120–1,600 小時，日曆時間 28–40 週**。若由 3–4 人小隊平行開發可縮短日曆時間，但安全、資料遷移、實際裝置驗收與 beta 觀察期不能省略。
