# Database 文件（現況與目標）

## Frontend integration boundary — 2026-07-20

This Sprint added no table, column, role, function, migration, seed or business data. The existing Production PostgreSQL schema and least-privilege role remain unchanged. The browser build now contains an inactive API client factory only; committed environment profiles do not contain a PostgreSQL API URL and do not switch the active Google Sheets data store.

Before any cutover, an isolated Staging API must prove database target validation, controlled-function-only access, live Session/Membership authorization, reconciliation and rollback. A browser-provided Workspace identifier remains request scope only and is never sufficient database authority.

## 2026-07-19 Auth0 Staging security-event inbox

Migration `0009_auth0_security_event_inbox` adds `app_private.security_event_inbox` and the single controlled `app_private.ingest_auth0_security_event(...)` function. The inbox stores bounded event metadata and a SHA-256 payload fingerprint, never a raw Auth0 payload or token. Its composite primary key `(environment, issuer, event_id)` and `ON CONFLICT DO NOTHING` make duplicate delivery idempotent. Inbox insertion and the matching `auth_sessions` state transition run in one transaction.

The migration is prepared only; it was not applied to Staging or Production in this milestone. `database/apply-security-event-role-grants.mjs` is Staging-only and fails closed unless the isolated `banke_event_staging` role already exists with non-administrative attributes. It grants only database connect, `app_private` schema usage and execution of the ingest function.

## 2026-07-19 Production database-role platform boundary

Production runtime configuration must explicitly target `neondb`. Before the HTTP listener opens, the API queries `current_database()` and stops safely unless the result is exactly `neondb`.

Neon/PostgreSQL retains `PUBLIC CONNECT` on the `postgres` maintenance database as a platform/default behavior. Bankeban does not modify that platform ACL and does not treat it as a P0 blocker. The security acceptance criterion is instead that this connection creates no route to `neondb` business data: the maintenance database has no Bankeban private schema, PostgreSQL has no native cross-database table query, the API role cannot install or use `dblink`/`postgres_fdw`, and it cannot grant itself additional database privileges.

`banke_api_production` remains a login-only, `NOINHERIT` role with no membership, object ownership, administrative capability, RLS bypass, direct table/sequence privilege, persistent DDL capability, foreign server, or user mapping. It may execute only the four reviewed `app_private.api_*` functions inside `neondb`, where live Session, user, Workspace, Membership, and role checks fail closed.

Inherited `PUBLIC TEMPORARY` is documented as a low-risk operational limitation rather than a P0 authorization defect. It does not grant persistent or tenant-data access. Production operations must retain the 20-connection limit and 10-second statement timeout and monitor temporary-file bytes/counts, connection saturation, and long-running statements before runtime deployment.

## 2026-07-19 Production API database role

Production now has a dedicated `banke_api_production` runtime login. It is separate from the migrator and Staging roles, owns no database object, has no administrative or RLS-bypass attribute, has zero direct table/sequence privileges, and may execute only the four controlled `app_private.api_*` entry points. The credential exists only in the Git-ignored local Production environment file pending deployment-secret configuration. Production business tables remain empty and no frontend/API deployment occurred.

## 2026-07-18 Identity/Tenant 安全邊界

Migrations `0004`–`0008` 新增 `app_private.identity_principals`、`auth_sessions`、`tenant_context_keys`、`tenant_context_nonces`，以及四個受控 `api_*` 函式。Runtime API role 對 public/app_private tables 與 sequences 皆無權限，只能執行精確授權的 session/list/command functions。

自訂 GUC 仍只在 SECURITY DEFINER transaction 內供現有 FORCE RLS 使用，但不再是授權來源。函式先驗證 API HMAC context、nonce、OIDC issuer/subject、internal user、workspace、membership、role 與 session，才設定 transaction-local GUC。API role 自行 SET GUC 無法直接查表，亦無權呼叫 verifier。

Context signing key 是高敏感 service secret：API environment/secret manager 與 migrator 安裝的 active DB key 必須一致；不得提交 Git。0006 修正 token `iat` 秒精度，0007 修正 leave audit resource ID，0008 綁定 provider session 的 issuer/subject/user。

## 2026-07-18 Managed Staging PostgreSQL 驗收

隔離 Neon PostgreSQL 18.4 已完成三階段 Migration、非敏感 Snapshot 匯入／重播、雙租戶 FORCE RLS、複合外鍵、最小權限 API role、Command API、Query Plan 及官方邏輯備份／還原。Migration role 使用 direct endpoint；API role 使用 pooler、`NOINHERIT`、20 連線上限與 10 秒 statement timeout，不能讀取 `schema_migrations` 或建立物件。Staging host 另以環境變數固定，避免誤標環境後連到其他專案。

本次沒有新增或變更 Migration／資料表 schema。`banke_restore_sprint2` 只保留於隔離 Staging 作還原證據；Production 與 Google Sheets A1 snapshot 均未修改。

目前 RLS 的 tenant context 由受信任 API transaction 設定。無 Context 與已綁定 A 後查 B 均會被阻擋；但單獨取得共用 API database credential 的攻擊者仍可偽造 custom GUC。這是 Production 阻擋，下一個正式 Identity Sprint 必須加入簽章 context／受信任連線代理，不能把 database credential secrecy 當成唯一租戶邊界。

## 2026-07-18 可執行 PostgreSQL 基礎

可執行 schema 現已版本化於 [`database/migrations`](../database/migrations)，`docs/schema.sql` 僅保留歷史設計參考。新 schema 包含 workspace composite keys／foreign keys、FORCE RLS、business constraints/indexes、command idempotency receipts、audit、outbox 與 snapshot import ledger。指令、安全確認、rollback 限制及匯入行為請見 [`database/README.md`](../database/README.md) 與 [`POSTGRESQL_MIGRATION.md`](POSTGRESQL_MIGRATION.md)。

Google Sheets A1 snapshot 仍是 Production active data store。本 Sprint 沒有執行正式 PostgreSQL cutover。

## 2026-07-17 credential runtime 修正

新 credential 現為 `hmac-sha256-v2` object：獨立 128-bit salt、`iterations: 1`、64-hex HMAC hash。pepper 只存在 Apps Script Script Properties。既有 `iterated-hmac-sha256-v1`（1024–10000 次）仍可讀取，正確登入後自動遷移至 v2；未知 scheme 或錯誤 iteration fail closed。v2 是為避免 Apps Script 在全域 lock 內逾時的過渡方案，不是正式密碼資料庫；正式上線仍須 Identity Provider／專用 auth service。

> 2026-07-16 本 Sprint 沒有新增、刪除或改名 A1 snapshot 欄位；只對既有電話、credential 表示、員工時薪、薪資調整、日期與時間建立寫入前值驗證。舊資料缺欄、`payrollAdjustments` 缺少／`null`／空陣列維持相容；舊負數扣款可讀且可原樣保存，但不得新增或複製。

> 2026-07-16 本次未新增、修改或刪除 snapshot 欄位／資料表；只強化老闆 `save` 的寫入邊界。省略欄位會從既有雲端 snapshot 保留，client 明確傳送合法空集合才會清除該集合。

> 2026-07-16 專案整理未變更本機 state 或 Google Sheets snapshot schema；未啟用 Firebase／Supabase 草稿已移除。

## 2026-07-15 工作階段、限流與 credential 暫存

Apps Script Script Properties 新增兩類暫存記錄：

- `SHIFT_APP_WORKSPACE_ID`：伺服器產生的單一工作區 ID；必須與 Sheet snapshot 的 `workspace.id` 相同。
- `SHIFT_APP_SESSION_<sha256(token)>`：`role`、`employeeId`、`workspaceId`、`createdAt`、`expiresAt`。不保存原始 token；最多保留 100 個有效工作階段並清除過期記錄。
- `SHIFT_APP_AUTH_THROTTLE_<sha256(phone)>`：`count`、`firstAttemptAt`、`lockedUntil`。最多保留 200 筆並清除過期記錄。
- `SHIFT_APP_CREDENTIAL_PEPPER`：64 字元 server-only pepper。首次建立新 credential 時產生；不得寫入 Sheet、前端、Git 或一般日誌，必須納入受控密鑰備份與復原演練。
- `SHIFT_APP_RECOVERY_FOLDER_ID`：私人 Google Drive 復原資料夾 ID。
- `SHIFT_APP_LAST_BACKUP_FILE_ID`：最新已驗證復原包的 Drive 檔案 ID。
- `SHIFT_APP_RESTORE_CONFIRMATION`：管理員復原前手動設定的一次性確認值；讀取後立即刪除，不進入備份。

Sheet 新 credential 使用 `hmac-sha256-v2` object，包含每筆獨立 salt、固定成本 HMAC 與 hash。既有 `iterated-hmac-sha256-v1`、`access.bossPinHash`、`employees[].pinHash`、`employees[].activationCodeHash` 只作登入時相容遷移來源；成功驗證後會被 v2 取代。所有新舊 credential 都禁止回傳瀏覽器。這仍不符合正式商業資料庫標準：沒有 Argon2id／正式 Identity Provider、tenant、session table、audit、migration ledger 與企業級 PITR，正式上線前必須遷移。

## 現況

### 瀏覽器本機狀態

前端以 `shift-app-data-v3` 保存目前資料。`state-store.js` 是唯一的主要讀寫與正規化入口：

- array：`employees`、`shifts`、`attendance`、`leaveHistory`、`removedEmployees`
- object map：`workspace`、`leaves`、`leaveRequests`、`access`、`payrollAdjustments`
- server-managed object：`sync.revision`，舊資料從 0 開始；client 不得指定下一版。
- 可讀取 v2／v1 並遷移至 v3。
- 無效 JSON、非 object root 會隔離至單一本機鍵值 `shift-app-data-corrupt-backup`。
- 隔離備份不在正式 state 內，因此不會由既有同步流程送到 Google Sheets。
- Google Sheets 模式登出時會刪除 v3、v2、v1 與損壞隔離備份；其他無關設定不會被刪除。

本機正規化只是防止 APP 白畫面，不等於正式 database migration 或資料完整性約束。
姓名、職稱、電話、班次備註、出勤類型與備註均視為 plain text；snapshot 不保存可執行 HTML，顯示端只使用 DOM 文字節點。正式資料庫 migration 仍須加入欄位長度、Unicode 與 enum/format constraints。
本機預覽不清除資料，以保留測試狀態；正式本機儲存模式目前不作為可上線方案。

### Google Sheets

Google Apps Script 取得 active spreadsheet，建立隱藏工作表 `_班表APP資料`：

- `A1`：整份應用資料的 JSON 字串。
- `A2`：最後同步時間文字。

一般 API 讀取 A1 時要求根節點為有效 JSON object，並檢查已知 array、object map、巢狀記錄及 `sync.revision` 的基本形狀；錯誤會回 `DATA_SOURCE_INVALID`，不執行登入、同步、清理或寫回。老闆寫入另要求 top-level 欄位白名單與相同形狀，錯誤回 `REQUEST_DATA_INVALID`；合併以既有 snapshot 為底，只有 request 明確帶入的可變欄位會被取代。電話只接受 8–15 位數字；credential 物件與舊 64-hex prehash 必須符合現行表示；`employees[].rate` 與新的 `payrollAdjustments[].amount` 必須為 safe integer 且非負；日期只接受 `YYYY-MM-DD`、班次時間只接受 `HH:mm`、timestamp 只接受精確 UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`。寫入 A1 前會再驗證一次。空白 A1 仍視為尚未初始化的新資料表，缺少欄位的舊資料維持向後相容。這是過渡期資料覆寫防護，仍不是帶 schema version 的 migration system。

資料大致包含：

- `workspace`（`id` 由伺服器管理，client save 不得修改）
- `access`
- `employees`
- `shifts`
- `attendance`
- `leaves`
- `leaveRequests`
- `leaveHistory`
- `removedEmployees`
- `payrollAdjustments`

過渡期 credential 欄位：

- `access.bossPhone`／`access.bossPinCredential`：老闆電話與版本化 credential。
- `employees[].pinCredential`：員工完成啟用後的版本化 credential。
- `employees[].activationCredential`：尚未啟用或重設 PIN 時的一次性啟用 credential；成功啟用後刪除。
- `access.bossPinHash`、`employees[].pinHash`、`employees[].activationCodeHash`：舊版 64 字元 prehash；只在正確登入／啟用後自動升級並刪除。
- Apps Script Script Property `SHIFT_APP_OWNER_PHONE`：只用於空白雲端第一次建立老闆帳號，不寫入工作表。
- Apps Script Script Property `SHIFT_APP_CREDENTIAL_PEPPER`：KDF server secret，不寫入工作表；遺失或損壞會讓既有 PIN 無法驗證，後端會 fail closed 而不會自動輪替。

明文啟用碼只在老闆建立／重設員工時顯示一次，不保存至工作表；若遺失必須由老闆重設。移除員工的封存紀錄不保存任何新舊 PIN／啟用 credential。

這不是 relational database，沒有 index、foreign key、unique constraint、正式 transaction、row revision、migration、audit 或企業級 backup；目前只有 snapshot 全域 revision與下述過渡復原包。

### 過渡期營運復原包

管理員可把目前 Sheet snapshot 與必要 Script Properties 寫入私人 Google Drive JSON 檔。復原包格式為 `banke-recovery-v1`，包含來源 Spreadsheet ID、workspace ID、revision、建立時間、原因、snapshot、允許的 operational properties 與 SHA-256 checksum。

- property allowlist 只有 `SHIFT_APP_WORKSPACE_ID`、`SHIFT_APP_OWNER_PHONE`、`SHIFT_APP_CREDENTIAL_PEPPER`。
- session、登入限流與復原確認值不得進入復原包；成功復原會撤銷既有 session 與 throttle。
- Drive 資料夾與檔案必須維持 `PRIVATE`；建立時若不是私人項目會立即丟棄並 fail closed。
- 非空目標復原前會建立 safety backup；復原後驗證失敗會回滾操作前 snapshot 與 Script Properties。
- 備份讀取邊界只會把舊資料中缺少、`null` 或空陣列形式的 `payrollAdjustments` 視為空 object map；非空陣列或其他未知格式會以 `BACKUP_SOURCE_INVALID` 停止，避免靜默遺失薪資資料。
- 這是 Google Sheets 過渡期災難復原，不是不可變備份、跨區複寫或 PITR。正式上線仍需定義 RPO/RTO、保留政策、自動化與 restore drill。

### P0 員工寫入邊界

- 員工已不能提交整份 snapshot。
- `employeeSaveLeave` 只修改 `leaves[serverEmployeeId-month]`。
- `employeeClockIn/employeeClockOut` 只新增或完成 `attendance` 中伺服器身份對應的紀錄。
- 員工讀取是本人 projection；雲端 A1 仍保留完整資料，但不再把其他員工欄位送到員工瀏覽器。
- Apps Script lock 序列化寫入；全域 `sync.revision` compare-and-swap 阻止老闆 stale snapshot 覆蓋員工剛完成的 action。

## 資料風險

- 單一儲存格容量限制。
- 老闆仍傳全量 snapshot；版本衝突會拒絕並保留本機 attempted/remote 備份，不再 last-write-wins。
- 一個公司與一組老闆 access，沒有 tenant isolation。
- 雲端資料仍沒有 schema version 或欄位級 server-side validation；目前只在讀取邊界拒絕損壞 JSON／非 object root，前端仍會在下載後正規化舊欄位。
- 3 天刪除只在讀寫時觸發，沒有 scheduler。

## 目標模型（待 ADR 定案）

建議 PostgreSQL 類型 primary database，至少包含：

- `workspaces`
- `workspace_members`
- `employees`
- `employee_credentials`／external identity mapping
- `shifts`
- `leave_policies`
- `leave_selections`
- `attendance_events`
- `attendance_records`
- `payroll_periods`
- `payroll_adjustments`
- `sessions`
- `audit_logs`
- `outbox_events`

所有 business table 必須含 `workspace_id`；電話以 canonical format 並在 workspace 內 unique。金額使用 integer minor unit 或 fixed decimal。所有 mutation 具 transaction、revision 與 audit。

## Migration Gate

正式遷移必須具：

1. Sheet snapshot 備份與 checksum。
2. Schema validation／資料清洗報告。
3. Dry-run、筆數與關聯驗證。
4. 可重跑 idempotent import。
5. Cutover window、read-only period、rollback。
6. Restore drill、RPO/RTO 與資料保留政策。

Google Sheets 在目標架構中只作匯出、報表或客戶整合，不作 primary database。

## 正式資料庫設計 (Sprint 2)

詳細的 PostgreSQL Schema 定義請參閱：[docs/schema.sql](schema.sql)

### 核心 Table
- `organizations` / `workspaces`: 多租戶根節點。
- `users` / `user_credentials`: 統一身份驗證與 Argon2id 安全雜湊。
- `workspace_members`: 連結使用者、工作區與角色。
- `employees` / `shifts` / `attendance_records` / `leaves`: 業務核心資料列，均含 `workspace_id` 物理隔離。
- `audit_logs`: 不可竄改的操作稽核紀錄。

### 遷移策略
從 Google Sheets A1 Snapshot 遷移至 PostgreSQL 的流程：
1. **解析 (Parse)**: 使用 `state-store.js` 的正規化邏輯解析 A1 JSON。
2. **對應 (Map)**: 將 `employees`、`shifts` 等陣列對應至新 Table。
3. **注入 (Inject)**: 為所有資料列注入 `workspace_id` 與 UUID。
4. **驗證 (Verify)**: 檢查外鍵約束與資料完整性。
