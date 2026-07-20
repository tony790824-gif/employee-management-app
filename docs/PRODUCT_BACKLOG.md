# 班客邦 Product Backlog

## 2026-07-20 — PostgreSQL Production Integration boundary

- **Completed:** one strict, reusable browser transport factory for the existing Node/PostgreSQL API; build/service-worker inclusion; environment fail-closed defaults; focused transport and isolation tests.
- **Not activated:** Staging and Production remain on Google Sheets and have no committed PostgreSQL API URL. No database, deployment, Auth0, Apps Script, Google Sheets, or Draft Preview change occurred.
- **Completion:** 80% (previously 79%). The increase reflects a tested cutover boundary, not a live Production integration.
- **Next unique priority:** deploy the existing Node API to an isolated Staging endpoint, complete the missing read/bootstrap surface, and run a reversible boss/employee cutover rehearsal. Do not switch Production during that Sprint.

## 2026-07-20 — Project cleanup review completed

- **完成：** tracked source／依賴／測試入口／文件引用／migration rollback 去重盤點，補齊 Auth0 Staging initiation 回歸與人工 Staging 工具語法檢查。
- **未刪除：** 沒有檔案或套件符合「無引用且可證明不影響 runtime、migration、rollback 或 Runbook」的刪除標準。
- **技術債：** 跨層 helper 重複、過長的串行 test command、歷史 ADR `0011` 編號衝突與舊 PWA global-script coupling；需各自獨立驗收，本次不處理。
- **優先順序不變：** 下一個唯一 P0 仍是經外部明確核准後，對 AWS Staging 執行 CloudFormation `ValidateTemplate` 與 disabled-gate change-set review；本次不建立資源或開始該工作。
- **完成度：79%，維持不變。** 清理工作降低維護風險，但未增加 Production 功能或外部 E2E 證據。

## 2026-07-20 — Lambda artifact packaging completed locally

- **Completed:** deterministic Node.js 22 ZIP, frozen production dependency install with a project-local cache, explicit AWS SDK and PostgreSQL dependencies, SHA256 checksum, CycloneDX 1.5 SBOM and isolated local Handler invocation.
- **Verified:** two clean builds produce identical ZIP bytes and checksum; no symlink, pnpm store metadata, `.env`, key or certificate file enters the Artifact.
- **Not performed:** no Artifact upload, AWS control-plane validation, change set, resource creation or deployment occurred.
- **Next single priority:** after explicit external approval, run AWS CloudFormation `ValidateTemplate` and inspect a Staging-only change set with the EventBridge rule and Lambda consumer still disabled.

## 2026-07-20 — AWS Staging infrastructure preparation completed locally

- **Completed:** hardened Staging CloudFormation, fixed deterministic queue naming, separate EventBridge/processing DLQs, default-disabled ingress/consumer, immutable artifact version, TLS/source-account restrictions, optional exact KMS decrypt boundary, CloudWatch alarms and repeatable local validation.
- **Not created:** no AWS, Auth0, Netlify or database resource was created or modified; no Production deployment occurred.
- **Remaining P0:** build/review the Lambda artifact, then—only after explicit approval—run AWS template/change-set validation and create the isolated Staging stack with both gates disabled before controlled activation/E2E.
- **Next single priority:** prepare a deterministic, dependency-complete, secret-free Lambda artifact with checksum/SBOM and local invocation proof. Do not create AWS resources in that work item.

## 2026-07-19 — Auth0 Staging security-event pipeline 程式與 IaC 已準備

- **完成：** EventBridge partner bus／rule、加密 SQS／DLQ、Lambda partial-batch consumer、嚴格 Staging 來源與時間驗證、PostgreSQL security-event inbox、Session compromise/revoke、transactional idempotency、least-privilege event role gate 與合成安全測試。
- **未建立資源：** 本 Milestone 沒有建立 AWS、Auth0 或 Netlify 資源，沒有套用 migration `0009`，也沒有部署 Lambda。
- **仍是 P0：** 在明確外部核准後建立隔離 Staging 資源，驗證真實 Auth0 event -> EventBridge -> SQS -> Lambda -> PostgreSQL -> 舊 Access Token 即時拒絕，並完成告警／DLQ 操作演練。
- **Production：** 未連接、未修改、未部署；不得把 Staging event role、queue、secret 或 event source 重用於 Production。
- **下一個唯一最高優先：** 外部資源建立前的部署包與 runbook 最終審核；待使用者核准後再分一步建立 Staging Auth0 partner event source，不能自行開始。

## 2026-07-18 — Sprint 3 Identity/Tenant 程式基礎已驗證

- **完成：** RS256 OIDC/JWKS 驗證、`kid` rotation/unknown-key fail closed、短效 access-token 時間邊界、namespaced provider session、可撤銷 local session、live membership recheck、簽章/短效/單次 tenant context、API role 零 table 權限、四個受控 database functions。
- **真實 Staging 證據：** 雙租戶正反向、偽造 workspace claim、偽造 custom GUC、direct SQL、context replay、停權／移除、compromised session、logout 及六個 command 全部符合預期。
- **外部阻擋：** 依 `docs/AUTH0_STAGING_SETUP.md` 建立獨立 Auth0 Staging tenant/API/browser app；完成 PKCE、refresh rotation/reuse、provider logout/disable event 到 local session revoke 的 E2E 前，不得稱正式 Identity Provider 已接通。
- **下一個唯一最高優先：** 完成 Auth0 Staging 外部設定與真實 token lifecycle E2E，不切換 Production 前端。
- **後續 P0/P1：** 完整 read/API surface、provider event adapter、context-key rotation runbook、rate limit/observability、frontend adapter/cutover rehearsal、真實跨裝置 E2E。

## 2026-07-18 — Managed Staging PostgreSQL 已驗收

- **完成：** 真實 PostgreSQL 18.4 Migration、checksum／transaction／advisory lock／重跑保護、非敏感 snapshot dry-run／apply／replay、雙租戶 FORCE RLS、複合外鍵、六個 Command API、資料對帳、Query Plan、官方 backup/restore 與還原後 RLS/API。
- **環境隔離：** Migration 使用 direct schema owner；API 使用 pooler 上的獨立 `NOINHERIT` 最小權限 role；Staging host 必須與 `BANK_STAGING_DATABASE_HOST` 完全符合。Production 與現行 Google Sheets 路徑未修改。
- **下一個唯一最高優先：** Sprint 3 在隔離 Staging 建立正式 Identity Provider／token lifecycle、workspace membership claim 驗證，以及不可由單獨 DB credential 偽造的 tenant context（簽章 context 或受信任連線代理），再進行剩餘 read endpoints、frontend adapter/cutover rehearsal。不得直接切換 Production。
- **仍未完成：** 正式 IAM、不可偽造的 DB tenant context、refresh/revoke/device management、全部讀取 API、前端 adapter、觀測性／告警、負載測試、PITR 證據、真實手機／平板／桌機 E2E 與 Production cutover review。

## 2026-07-18 — PostgreSQL 多租戶基礎狀態

- **程式面已完成：** versioned schema migrations、FORCE RLS tenant boundary、transactional migration runner、dry-run/idempotent snapshot importer、初版 Transaction/Command API、JWT verification boundary、idempotency/audit/outbox 與自動化結構／單元／API 邊界測試。
- **尚未驗收：** managed Staging PostgreSQL 實際執行、雙租戶 live RLS integration、import reconciliation、backup/restore 證據、load test、正式 Identity Provider、剩餘 read/command endpoints、frontend adapter/cutover 與跨裝置 E2E。
- **下一個唯一最高優先：** 建立隔離 Staging PostgreSQL，依 `docs/POSTGRESQL_MIGRATION.md` 執行 migration/import/RLS/restore rehearsal；不得切換 Production。

## P0 Staging 前端環境隔離（2026-07-17）

已完成 Local／Staging／Production 可重複建置、Staging 專用後端、畫面識別，以及 PWA cache／manifest／localStorage／session 隔離。Production 未部署。下一個唯一驗收工作是依 `docs/STAGING_E2E_CHECKLIST.md` 執行真實手機、平板與桌機人工 E2E；本項不改變下方正式資料庫長期 Backlog 的內容。

## P0 正式資料庫 Schema 與 API 規格設計（2026-07-17）

已完成正式關聯式資料庫設計 (`docs/schema.sql`) 與 OpenAPI 3.0 規格 (`docs/openapi.yaml`)。
- **資料庫**：支援多租戶隔離、Argon2id、稽核日誌與正規化業務模型。
- **API**：採用 Command 模式，定義了 Auth 與核心業務命令，解決了 Google Sheets 全量覆寫的架構性風險。

下一個最高優先的工作是 **「Sprint 2：建立實體資料庫環境與開發正式 Auth 服務」**。這包含建置 PostgreSQL 實例、開發 Login/Refresh/Logout API 並通過安全測試。

## P0 schema 版本化與遷移系統（2026-07-16）

已完成後端 `google-sheets-backend.gs` 與前端 `state-store.js` 的 `sync.schemaVersion` 版本號機制。讀取邊界 `migrate_` 現在會自動將缺少版本號的舊資料正規化至目前版本 1，為後續正式資料庫遷移奠定基礎。本次只提交來源、測試與文件，未部署 Apps Script。

最高優先的整體上線閘門仍是受控 staging Apps Script 部署與真實老闆／員工跨裝置 E2E；需求禁止發布，因此未執行。下一個可獨立處理的程式工作是正式身分服務、多租戶關聯式資料庫與 command API 的遷移設計 ADR。

## P0 受控 Staging 後端與復原演練（2026-07-17）

已完成隔離 Google Sheet、Apps Script 專案及 Web App 部署。線上驗收已覆蓋老闆／員工登入、員工管理、排班、排假、打卡、revision conflict、session 撤銷、私人備份、驗證、實際 restore 與 restore 後 readiness。Staging 已回復乾淨 revision 0，正式站未發布。

驗收中修正 Apps Script 在 lock 內執行 4096 次 HMAC 導致登入逾時的 P0 問題。新的 `hmac-sha256-v2` 維持每筆 salt、server-only pepper 與固定成本，既有 v1 登入後自動遷移。這只是 Google Sheets 過渡後端的可用性修正，不取代正式 Identity Provider。

**Staging 驗收紀錄所建議的下一項工作：P0 建立獨立 Staging 前端設定並完成真實手機、平板與桌機的角色 UI E2E。** 目前後端驗收工具繞過正式前端，尚不能證明瀏覽器設定、PWA cache、弱網與跨裝置操作已通過。

### 2026-07-17 合併狀態說明

origin/main 的資料庫／API 設計紀錄將「建立 PostgreSQL 與正式 Auth」列為下一項；本次 Staging 驗收紀錄則將「獨立 Staging 前端與跨裝置 E2E」列為下一項。兩項均為 P0 且尚未執行，本次只完整保留兩邊紀錄，不自行改變 Sprint 優先順序，等待產品負責人下一個指令。

## P0 request 大小與 snapshot 欄位值邊界（2026-07-16）

Apps Script `doPost` 現在會在解析 JSON 與執行 API 前，以 raw form body 的 UTF-8 bytes 檢查 1 MiB 上限；平台未提供非空 raw body 時才以解碼後 `payload` 作 fallback。A1 讀取、老闆儲存、初始化、備份與寫入前共用同一組現有欄位值驗證；錯誤不寫入也不推進 revision。舊缺欄、空薪資調整與原樣負數扣款維持相容，但新負數調整被拒絕。本次只提交來源、測試與文件，未部署 Apps Script。

本項自動測試已完成；受控 staging 部署、Apps Script 真實 transport 驗證與跨裝置 E2E 仍為最高的整體上線閥門。需求禁止正式發布，因此未執行。下一個可獨立處理的程式工作是建立帶版本 schema/migration 與後端 command API 遷移設計，不再擴大 A1 全量 snapshot。

## P0 老闆 save request 防 mass-assignment／漏欄清空（2026-07-16）

已在既有 `save` action 完成 top-level 欄位白名單、collection／map 基本形狀驗證及缺欄保留。未知欄位、錯誤形狀、array root 與只有 server-managed 欄位的空操作都回 `REQUEST_DATA_INVALID`，不寫入也不推進 revision；`workspace`、`sync`、`access` 仍完全由伺服器管理。明確傳送空集合仍可執行原本的刪除語意。本次只提交來源、測試與文件，未部署 Apps Script。

最高優先的整體上線閘門仍是受控 staging Apps Script 部署與真實老闆／員工跨裝置 E2E；需求禁止發布，因此未執行。下一個可獨立處理的程式工作是帶版本的欄位值 schema 與 request 大小限制，接著才是正式 IAM、多租戶關聯式資料庫與 command API 遷移。

## P0 snapshot 欄位形狀防覆寫（2026-07-16）

已完成 Google Sheet 主資料的 top-level collection／map、巢狀記錄及 revision 形狀驗證。格式錯誤時一般 API 與營運備份都會 fail closed，原始 A1 不被清理或寫回；缺少欄位的舊資料維持相容。本次只提交來源、測試與文件，未部署 Apps Script。

此項目的下一個程式工作「老闆 `save` request 白名單、形狀驗證與缺欄保留」已由上方 P0 項目完成；正式部署與跨裝置驗收仍未執行。

## 專案整理收尾（2026-07-16）

已完成現有前端管理事件、雲端設定來源、Service Worker fallback 與備份還原入口的去重整理；未啟用 Firebase／Supabase 草稿已移除。12 組回歸、25 個發布資產與本機老闆／員工 smoke 通過。本次未新增產品功能，也未變更 API／資料結構。

已修正線上營運備份遇到舊版空 `payrollAdjustments` 陣列時無法建立復原包的相容性問題；未知的非空陣列仍 fail closed。此修正只提交來源與測試，尚未部署 Apps Script。

已修正一般 APP API 將損壞 A1 JSON／非 object root 當成空資料的 P0 覆寫風險；現在回 `DATA_SOURCE_INVALID` 並保留原始資料。此修正同樣只提交來源、測試與文件，尚未部署 Apps Script。

下一個工作仍是正式環境的 Apps Script 部署版本、設定與真實老闆／員工跨裝置 E2E；未通過前不得發布。

## Sprint 2 進度（2026-07-15）

已完成的 P0 過渡封堵：8 小時短效 session、登入限流、session revoke、credential response sanitization、單一 workspace 綁定、stored XSS sink 清除、snapshot optimistic concurrency、salted PIN credential、私人 Drive 復原包與發布前雙重閘門。

Sprint 2 尚未完成：正式多租戶資料列隔離、正式 Identity Provider／記憶體困難密碼雜湊、refresh/device management、audit log、正式 session store、密鑰輪替與安全監控。因此 Sprint 2 不得標示完成。下一個 P0 工作項目是正式身分服務、多租戶關聯式資料庫與 command API 的遷移 ADR／schema；不新增排班或薪資功能。

原則：先止血與建立品質基線，再處理正式後端與核心流程，最後才做體驗與商業化。每個 Sprint 預設 2 週；未通過驗收不得進入下一 Sprint。

## Sprint 0 — 治理、可重現基線與品質閘門（P0）

**狀態：2026-07-15 已完成。產品仍不可上線；下一步為 Sprint 1。**

**目標**

- 將產品原則、健康報告、架構決策與驗證方式落地成專案檔案。
- 建立 Git、可重現 build/check、最小 smoke test 與文件骨架。

**要修改／新增的檔案**

- `PROJECT_CONSTITUTION.md`
- `README.md`
- `CHANGELOG.md`
- `docs/PROJECT_HEALTH_REPORT.md`
- `docs/PRODUCT_BACKLOG.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/adr/0001-product-platform.md`
- `package.json`
- `scripts/build.mjs`
- `scripts/quality-check.mjs`
- `.gitignore`

**預期成果**

- 任何工程師可在乾淨環境執行 build/check。
- 已知問題、正式架構方向、文件責任與發布閘門可追蹤。

**驗收標準**

- Git repository 有效。
- `npm run check` 與 `npm run build` 成功，輸出可部署靜態檔。
- 建置不可包含 ZIP、未使用 Firebase/Supabase 或敏感開發檔。
- README/API/Database/Change Log/ADR 均存在並與現況一致。

**可能風險**

- 目前程式耦合高，品質檢查只能先建立基線，不能代表功能正確。

## Sprint 1 — P0 前端止血與單一 State Schema

**進度：P0 介面載入穩定性、損壞 JSON 安全復原、登入前 DOM 隔離、員工雲端授權止血、UTC 月份、角色 UI 頁籤隔離及登出功能已完成；完整 schema migration 已具備基線。**

**目標**

- 修復員工頁卡死、partial state、壞資料白畫面、錯誤角色 UI 與 UTC 月份問題。

**要修改的檔案**

- `employee-layout.js`
- `boss-hours.js`
- `app.js`
- `access.js`
- `login.js`
- `access.css`
- `index.html`
- 新增 `src/state/*` 或等效模組
- `tests/*`

**預期成果**

- 老闆與員工本機流程穩定載入；資料結構只有一個入口與版本。

**驗收標準**

- 100 次切換角色／月份不會 hang、reload loop 或 console error。
- 空資料、舊版資料、缺欄位、無效 JSON 都能安全恢復並提示。
- 老闆不顯示員工儲存面板；員工只顯示允許的 tabs。
- Desktop、390px mobile、tablet smoke/E2E 通過。

**可能風險**

- 目前多個 script 依賴全域變數，移除重複 handler 可能影響既有按鈕。

### 已完成的緊急授權止血

- 員工全量 `save` 已由 Apps Script 拒絕。
- 員工登入／pull 已縮成本人資料投影。
- 本人排假、上班與下班改成明確命令，員工 ID 由伺服器身份決定。
- 此修復不取代 Sprint 2 的正式 session/workspace，也不取代 Sprint 3 的 relational action API。

### 已完成的首次帳號啟用止血

- 空白雲端只能由 Script Property `SHIFT_APP_OWNER_PHONE` 登記的電話建立第一組老闆 PIN。
- 新員工與 PIN 重設改用 8 碼一次性啟用碼；員工仍自行選擇 PIN，成功後啟用碼立即失效。
- 舊資料中未設 PIN 且沒有啟用碼的員工不再允許第一位訪客直接認領，須由老闆重設 PIN 產生新碼。
- 老闆新增／重設員工會等待 Google Sheets 寫入成功後才顯示成功，避免重新載入中斷同步。
- 此流程已有過渡期 session、rate limit 與 salted credential；仍缺正式 Identity Provider、refresh/device management、audit、密鑰輪替與復原演練，必須在 Sprint 2 完成。

## Sprint 2 — Auth、Session、Workspace 與威脅模型（P0）

**進度：正式身份驗證與後端遷移架構設計 (ADR 0012) 已完成；正式資料庫 Schema 與 Auth 服務實作尚未開始。**

**目標**

- 決定正式身分驗證／多租戶方案並建立可測的後端骨架。

**要修改的檔案**

- `docs/adr/0012-formal-auth-and-backend-migration.md` (已完成)
- `docs/SECURITY.md`
- `docs/API.md`
- `docs/DATABASE.md`
- 新增 backend/auth/workspace migrations 與測試
- `login.js`（改接正式 session）

**預期成果**

- 每家公司有 workspace；老闆、管理員、員工權限明確。
- 正式採用 JWT + Refresh Token 與 PostgreSQL 架構。

**驗收標準**

- OWASP threat model 審核完成。
- 員工無法列舉／讀取／修改其他員工資料。
- 暴力登入、replay、過期 token、撤銷 session 測試通過。

**可能風險**

- 後端供應商與成本尚未正式決策；需先完成 ADR 與預算評估。

## Sprint 3 — 正式資料模型、Action API 與遷移（P0/P1）

**目標**

- 以 relational schema 取代 Sheet A1 全量 JSON，建立 revision、transaction、audit 與 migration。

**要修改的檔案**

- `docs/DATABASE.md`
- `docs/API.md`
- database migrations
- backend employee/shift/leave/attendance/payroll endpoints
- `google-sheets-cloud.js`（降為 export adapter）
- 資料遷移與 rollback scripts

**預期成果**

- 核心資料正規化；API 以 scoped command/query 操作，不接受全量 snapshot。

**驗收標準**

- 外鍵、unique phone per workspace、index、soft delete、audit、revision 完整。
- stale write 回 409，不會靜默覆寫。
- migration dry-run、rollback、資料筆數／checksum 驗證通過。

**可能風險**

- 現有 Google Sheet 資料可能結構不完整或超過單格限制，需要資料清洗。

## Sprint 4 — 員工與權限生命週期（P1）

**目標**

- 完成邀請、啟用、停用、PIN reset、裝置/session、3 天保留與自動刪除。

**要修改的檔案**

- 員工管理 UI/modules
- auth/workspace API
- scheduled jobs
- notification adapter
- API/DB/README/Change Log

**預期成果**

- 老闆可安全管理員工；員工能在清楚流程完成啟用與恢復帳號。

**驗收標準**

- 電話正規化與唯一性完整。
- 停用立即撤銷 session；3 天後由 server job 刪除，期間可恢復。
- 所有操作有 audit log。

**可能風險**

- 簡訊成本、電話 ownership 與隱私法規需產品決策；可先用邀請連結＋一次性碼。

## Sprint 5 — 排班、休假與衝突引擎（P1）

**目標**

- 完成班次 CRUD/發布、休假草稿/儲存、額度與衝突規則。

**要修改的檔案**

- 排班／休假 UI modules
- shift/leave APIs、migrations、policy tests
- calendar components
- API/DB/README/Change Log

**預期成果**

- 老闆與員工看到同一份版本化班表；所有衝突可解釋、可稽核。

**驗收標準**

- 班次新增／編輯／刪除／發布與當月／次月休假流程通過。
- 重疊、休假、跨日、時區、重複點擊、離線重送不產生重複資料。
- 500 員工、12 個月資料的效能測試達標。

**可能風險**

- 「員工可直接決定休假」可能與不同企業制度衝突；應支援公司 policy，而非 hard-code。

## Sprint 6 — 出勤與薪資正確性（P1）

**目標**

- 建立打卡、工時核定、加班／休息／跨日與薪資鎖帳的唯一口徑。

**要修改的檔案**

- attendance/payroll UI modules
- timekeeping/payroll services、APIs、migrations
- calculation tests
- API/DB/README/Change Log

**預期成果**

- 員工收入、老闆出勤與薪資報表數字一致、可追溯。

**驗收標準**

- 所有金額以整數最小貨幣單位／decimal 計算，不用浮點累積。
- 時區、跨日、休息、加班、補登、核定、鎖帳與重新開帳測試通過。
- 薪資報表可重算且有版本與 audit。

**可能風險**

- 台灣勞動法規與各公司規則需由法律／薪酬專家確認；產品應標示「試算」直到合規驗證完成。

## Sprint 7 — Security & Privacy Hardening（P0/P1）

**目標**

- 完成 XSS/CSP/CSRF、資料最小化、加密、audit、rate limit 與安全測試。

**要修改的檔案**

- 所有 render/input modules
- server security middleware/policies
- CSP/hosting headers
- `docs/SECURITY.md`
- security tests

**預期成果**

- OWASP Top 10 基線通過；敏感資料不落地到不必要的 localStorage。

**驗收標準**

- SAST、dependency audit、XSS payload、越權、CSRF、replay、rate-limit 測試通過。
- Security review 沒有 open Critical/High。

**可能風險**

- 既有 PWA 離線需求與敏感資料最小化衝突，需加密離線 store 或縮減離線範圍。

## Sprint 8 — UX、Accessibility、PWA 與弱網路（P2）

**目標**

- 讓第一次使用者、50 歲以上、手機／平板使用者都能完成核心任務。

**要修改的檔案**

- 全部 UI/CSS/components
- manifest/service worker/offline outbox
- UX copy與 accessibility tests
- README/Change Log

**預期成果**

- 明確 loading/error/retry、安裝、登出、忘記 PIN、弱網路與離線狀態。

**驗收標準**

- WCAG 2.2 AA 核心流程、鍵盤、螢幕閱讀器與動態字級測試通過。
- 320/390/768/1024px、iOS Safari、Android Chrome 測試通過。
- Service Worker 只對 navigation 做 app-shell fallback；版本可更新與回滾。

**可能風險**

- PWA 在 iOS 的背景同步與安裝限制需清楚提示，不能承諾自動建立桌面捷徑。

## Sprint 9 — Observability、CI/CD、DR 與 Beta Release（P1/P2）

**目標**

- 建立 staging/production、監控告警、備份還原、release gate 與封閉 beta。

**要修改的檔案**

- CI/CD workflows
- hosting/environment configs
- monitoring/logging/alerting configs
- runbooks、README、Change Log、release checklist

**預期成果**

- 每次發布可追蹤、可回滾；故障可被發現並在 runbook 內處理。

**驗收標準**

- CI 包含 lint/test/build/security/E2E。
- staging 與 production 資料、金鑰、網域分離。
- 備份 restore drill 達成定義的 RPO/RTO。
- 封閉 beta 兩週無 Critical、High error rate 達標後才可 release candidate。

**可能風險**

- 監控、簡訊、資料庫與錯誤追蹤會產生固定營運成本，需納入定價。

## Sprint 10 — 商業化與平台決策（P3）

**目標**

- 完成方案、計費、用量限制、客服流程與 Flutter/原生 App ADR。

**要修改的檔案**

- billing/entitlement/admin modules
- pricing/metrics documents
- `docs/adr/0003-pwa-vs-flutter.md`
- Roadmap/README/Change Log

**預期成果**

- 免費／付費界線與單位經濟清楚；是否投資 Flutter 有數據依據。

**驗收標準**

- entitlement server-side enforce。
- 收入、雲端成本、客服成本、轉換與留存 metrics 可觀測。
- Flutter 決策包含成本、風險、共用 API、遷移與商店維運計畫。

**可能風險**

- 太早建立多雲讓產品複雜度與客服成本暴增；正式版應由平台統一 primary cloud，客戶只選方案，不選底層資料庫。
