# API 文件（現況與目標）

> 2026-07-16 專案整理未變更任何 API action、request 或 response schema；Google Sheets Web App URL 現只由 `google-sheets-config.js` 提供。主資料不是有效 JSON object 時會以 `DATA_SOURCE_INVALID` 停止全部一般 API 操作。

## 2026-07-15 現行驗證契約

- `bossLogin`／`employeeLogin`：送出 `phone` 與 `pinHash`；員工首次啟用另送 `activationHash`。
- `pinHash`／`activationHash` 是前端產生的 64 字元 SHA-256 prehash，只可出現在登入／首次啟用 request。伺服器不會直接保存它，而會使用每筆 salt、server-only pepper 與反覆 HMAC 包裝成版本化 credential。
- 登入成功：回傳 `sessionToken`、`sessionExpiresAt`、`workspaceId`、`role` 與授權範圍內的 `data`。
- `pull`、`save`、`employeeSaveLeave`、`employeeClockIn`、`employeeClockOut`、`logout`：只送 `sessionToken`，不得再送 PIN hash 當憑證。老闆 `save` 另須送出目前 snapshot 的 `baseRevision`。
- 工作階段有效 8 小時；`logout` 冪等。
- 同一電話 15 分鐘內第 5 次登入失敗後鎖定 15 分鐘，錯誤為 `AUTH_RATE_LIMITED` 並附 `retryAfterSeconds`。
- 無效、過期、撤銷的 token 回傳 `SESSION_INVALID`。
- session、Script Property 與資料快照的工作區不一致時拒絕存取；登入回傳 `WORKSPACE_MISMATCH`，前端停止同步並清除 session。
- boss data 只回傳 `access.bossConfigured`；員工只回傳 `credentialState`，不回傳任何 credential hash。
- 舊版快速 hash 在正確登入／啟用時自動升級；API request/response schema 不變，不會要求使用者重設 PIN。
- 所有 projection 帶 server-managed `sync.revision`；任何 mutation 成功後回傳更大的 revision。
- `save.baseRevision` 缺少時回 `REVISION_REQUIRED`；與伺服器不一致或重播時回 `REVISION_CONFLICT`，資料不寫入並附最新安全 boss projection。

成功登入範例：

```json
{
  "ok": true,
  "role": "employee",
  "employeeId": "uuid",
  "workspaceId": "ws_0123456789abcdef0123456789abcdef",
  "sessionToken": "opaque-256-bit-token",
  "sessionExpiresAt": 1784116800000,
  "data": {}
}
```

## 狀態

目前 API 為 Google Apps Script 過渡後端。它已有短效 server session 與明確單一工作區邊界，但仍不符合正式多租戶、正式 IAM 與關聯式資料庫標準。Endpoint 由 `google-sheets-config.js` 指定，前端透過隱藏 iframe/form POST `payload`。

前端已使用 `state-store.js` 安全解析本機主要 state；Apps Script 讀取邊界也會拒絕損壞 JSON 與非 object root。這仍**沒有完成欄位級 schema validation、正式 authorization 或關聯式 transaction**。

前端在 API 登入成功前不載入管理功能。Google Sheets 回傳成功後才寫入本機 state 並啟動 APP；員工登入若缺少 `employeeId` 會拒絕進入。員工已採 action-level authorization，session 與資料已綁定 server workspace；正式版仍須遷移到多租戶資料列授權與正式資料庫。

所有姓名、職稱、電話、班次備註、出勤類型與備註欄位的輸出契約都是 plain text，不是 HTML。前端不得將 API 資料交給 `innerHTML` 等 HTML parsing sink；若未來需要富文字，必須另訂 API schema、sanitization 與 CSP。

### 現況 Request

```json
{
  "requestId": "uuid",
  "request": {
    "action": "bossLogin | employeeLogin | pull | save | employeeSaveLeave | employeeClockIn | employeeClockOut",
    "phone": "digits",
    "pinHash": "sha256-hex",
    "activationHash": "employee first activation only, sha256-hex",
    "initialData": {},
    "data": {},
    "baseRevision": 12,
    "month": "YYYY-MM",
    "dates": ["YYYY-MM-DD"]
  }
}
```

### 現況 Response

```json
{
  "ok": true,
  "role": "boss | employee",
  "employeeId": "optional",
  "data": {}
}
```

錯誤回應已增加過渡期 domain code：`{ "ok": false, "error": "message", "code": "..." }`。目前啟用流程使用 `OWNER_NOT_CONFIGURED`、`BOSS_NOT_AUTHORIZED`、`ACTIVATION_REQUIRED`、`ACTIVATION_INVALID`、`ACTIVATION_NOT_CONFIGURED`；Apps Script credential pepper 格式損壞時回 `CREDENTIAL_CONFIG_INVALID`；主資料不是有效 JSON object 時回 `DATA_SOURCE_INVALID`，且不寫回 Sheet。其餘錯誤暫用 `REQUEST_FAILED`。HTTP status 與完整 error catalog 仍待正式 API。

### 現行授權範圍

| Action | 老闆 | 員工 | 伺服器限制 |
|---|---|---|---|
| `bossLogin` | 是 | 不適用 | 第一次初始化須符合 Script Property `SHIFT_APP_OWNER_PHONE`；之後比對既有憑證 |
| `employeeLogin` | 否 | 是 | 第一次登入須以一次性啟用碼設定 PIN；啟用碼成功後立即銷毀；只回本人 projection |
| `pull` | 全量 | 本人 projection | 角色由憑證解析 |
| `save` | 是 | **拒絕** | 老闆仍是全量 snapshot；必須 compare-and-swap `baseRevision` |
| `employeeSaveLeave` | 否 | 本人 | 伺服器衍生員工 ID；只允許本月／下月、有效日期與額度內 |
| `employeeClockIn` | 否 | 本人 | 伺服器時間與 UUID；拒絕重複未下班紀錄 |
| `employeeClockOut` | 否 | 本人 | 只關閉本人的進行中紀錄 |

員工 projection 只包含：本人基本資料（移除 `pinHash`、`pinCredential`、`activationCodeHash`、`activationCredential`）、本人班次、本人出勤、本人休假與本人休假歷史。`access`、`removedEmployees`、`payrollAdjustments` 與其他員工資料不回傳。

## 已知 Critical 問題

- ~~`phone + pinHash` 被當長期 bearer credential。~~ **2026-07-15 已改為只在登入使用，成功後採 8 小時 session、revoke 與 rate limit；正式 refresh/device management 仍未完成。**
- ~~Sheet 保存快速、無 salt 的 PIN hash。~~ **2026-07-15 已改為過渡期 server-side salted credential 並支援登入時舊資料遷移；正式 Identity Provider 與記憶體困難密碼雜湊仍未完成。**
- 首次帳號搶先認領：**2026-07-15 已止血**；這不是正式 session/auth 的替代品。
- `employeeLogin/pull` 全公司資料外洩：**2026-07-15 已止血**，目前只回本人 projection。
- 員工以 `save` 覆寫公司資料：**2026-07-15 已止血**，目前伺服器拒絕員工全量儲存。
- 老闆 `save` 仍接受整份 snapshot，但 stale／replay 已由全域 revision 拒絕。
- 主資料無效 JSON／非 object root 已 fail closed；仍無正式 tenant row isolation、欄位級 schema validation、size limit、command idempotency 或 row revision。
- Apps Script origin hard-code 單一 Netlify domain。

## 目標 API 原則

- `/v1` 版本化 API；workspace 從 server session 解析，不相信 client 傳入的權限。
- Short-lived access session + refresh/revoke/device management。
- Scoped query：員工只能取得本人資料。
- Command API：例如 `create-shift`、`save-leave-selection`、`clock-in`、`clock-out`、`approve-hours`，禁止全量 snapshot save。
- Mutation 具 idempotency key 與 resource revision；衝突回 409。
- JSON schema validation、field allowlist、request size limit、structured error。
- Structured logging、request ID、latency/error metrics、audit event。

正式 endpoint、schema 與 error catalog 將在 Sprint 2–3 ADR 後定案。

## 管理員維運函式（非 Web API）

以下函式只允許 Apps Script 專案管理員在編輯器中手動執行，刻意不接入 `api()`、`doGet()`、`doPost()`，APP、老闆與員工都不能呼叫：

| 函式 | 用途 | 成功條件 |
|---|---|---|
| `createOperationalBackup()` | 建立私人 Google Drive 復原包 | 來源 JSON、workspace、revision、credential pepper 與 Drive 私人權限全部有效 |
| `verifyLatestOperationalBackup()` | 驗證最新復原包 | 格式、checksum、來源、workspace、snapshot 與允許的 Script Properties 均有效 |
| `restoreLatestOperationalBackup()` | 復原 Sheet 與必要 Script Properties | 一次性確認值正確；非空目標先有 safety backup；寫入後再次驗證 |
| `runReleaseReadinessCheck()` | 線上發布門檻 | 最新備份未超過 24 小時，且與目前 Sheet 的來源、workspace、revision、內容一致 |

維運函式只輸出不含 PIN、session token 或 pepper 的摘要到 Apps Script execution log。詳細程序、錯誤代碼與災難復原步驟見 `docs/RUNBOOK.md`。
