# Database 文件（現況與目標）

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

Sheet 新 credential 使用 `iterated-hmac-sha256-v1` object，包含每筆獨立 salt、4096 次迭代與 hash。舊 `access.bossPinHash`、`employees[].pinHash`、`employees[].activationCodeHash` 只作登入時相容遷移來源；成功驗證後會被新欄位取代。所有新舊 credential 都禁止回傳瀏覽器。這仍不符合正式商業資料庫標準：沒有 Argon2id／正式 Identity Provider、tenant、session table、audit、migration ledger 與 backup drill，正式上線前必須遷移。

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

一般 API 讀取 A1 時要求根節點為有效 JSON object；無效 JSON、`null`、array 或 primitive 會回 `DATA_SOURCE_INVALID`，不執行登入、同步或寫回。空白 A1 仍視為尚未初始化的新資料表。這是資料覆寫防護，不是完整 schema validation。

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
