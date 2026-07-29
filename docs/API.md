# API 文件（現況與目標）

## 2026-07-29 — Notification Center API

Migration `0014_notification_center` defines the database functions used by this API, but is not yet applied to Neon Staging or Production.

- `GET /v1/notifications` requires the existing bearer token, `X-Workspace-Id`, live Bankeban Session, active user, active Workspace, and active Membership. It returns at most 100 notifications for the authenticated recipient only, sorted unread first and then newest first.
- `notifications.mark-read` requires `notificationId` and `baseRevision`. It uses the existing idempotency and optimistic-revision boundary.
- `notifications.mark-all-read` accepts an empty command object and marks only the current recipient's unread notifications.
- Notification rows are never directly accessible to the API Role. It can execute only the reviewed controlled functions.
- The existing bootstrap revision includes the caller's notification count, unread count, revision total, and latest creation time. The existing Smart Polling, BroadcastChannel/storage, and Service Worker revision signal can therefore trigger `GET /v1/notifications` without a new transport.
- Notification payloads intentionally exclude leave reasons, email addresses, phone numbers, Session IDs, tokens, and credentials.
- Until additive Migration `0014` exists, bootstrap remains backward compatible and the notification read route returns an empty `available: false` result. Notification mutations fail with `503 NOTIFICATION_CENTER_UNAVAILABLE`; no existing Staging workflow is interrupted.

## 2026-07-29 — Bootstrap revision transport

- Authenticated `GET /v1/bootstrap` and `GET /v1/bootstrap/revision` responses include `X-Bootstrap-Revision`.
- The header is an unsigned decimal representation of the same non-negative safe-integer revision present in the JSON body. The browser rejects malformed or mismatched values.
- `Access-Control-Expose-Headers` exposes `X-Request-Id` and `X-Bootstrap-Revision` only to an already allowed origin.
- The header does not replace Session, Membership, Workspace, role, or response-body authorization. It is only a cache/synchronization validator.
- The browser checks `/bootstrap/revision` before downloading a full bootstrap. It fetches the full payload only when the deterministic server revision changes, then merges changed top-level sections.
- No Production endpoint, API command, database schema, or Migration was added or changed.

## Time-off request API — Staging backend phase (2026-07-27)

Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`. Overall completion: **87%**. Migration `0013_time_off_requests` is applied only to Neon Staging; Production and pending migrations `0009`／`0010` were not changed or applied. Production, Auth0, Google Sheets, and Apps Script were not modified.

The existing authenticated PostgreSQL boundary now supports two explicit request kinds without introducing a second transport:

- `schedule-leave-requests.submit`
- `schedule-leave-requests.cancel`
- `leave-requests.submit`
- `leave-requests.cancel`
- `time-off-requests.approve`
- `time-off-requests.reject`

All mutations use `POST /v1/commands/{commandName}`, `X-Workspace-Id`, `Idempotency-Key`, verified Auth0 access token, a live Bankeban Session, and live Membership authorization. Employee submit/cancel operations are self-only; review operations are boss/manager-only. Replaying the same idempotency key returns the existing result, while reviewing an already processed request is rejected.

`GET /v1/time-off-requests` is the controlled read surface. It returns:

- the caller's own full request/status data;
- pending and processed request data, including private reasons, only to an authorized boss/manager;
- approved scheduled-leave coworker name/date data for the same Workspace;
- approved ad-hoc leave coverage as date/count only, without another employee's reason.

`GET /v1/bootstrap/revision` is the authenticated lightweight synchronization surface. It returns only the caller's authorized Workspace ID and a deterministic safe-integer revision. The revision covers both the role-visible bootstrap and role-visible Time-Off result. The browser uses it to decide whether a full `GET /v1/bootstrap` is necessary; it is not an authorization source and does not replace live Session/Membership checks.

The browser-provided Workspace ID remains untrusted request scope. The server and database functions resolve identity, Session, Membership, role, and Workspace again. No runtime role received direct table access.

This phase completed only the data model and controlled API. The frontend, feature-specific Draft Preview, and iPhone UI acceptance remain incomplete. The next and only Sprint is **「前端排休／請假 UI 與老闆審核接線」**.

## Browser PostgreSQL API transport boundary — 2026-07-20 (historical)

`postgres-api-client.js` is the single reviewed browser transport factory for the existing formal API. It exposes unauthenticated `health`/`readiness`, authenticated Session establishment/logout and employee listing, plus the six existing command names. It sends a bearer token, a requested `X-Workspace-Id`, a random request ID and command idempotency key; the Workspace header is never an authorization source and must be re-authorized against live server-side Membership.

Safety controls include HTTPS-only remote URLs (HTTP only on loopback), rejection of embedded credentials/query/fragment, 1 MiB request and 2 MiB response limits, 15-second abort timeout, `credentials: omit`, `cache: no-store`, redirect rejection, structured errors and a non-sensitive invalid-session browser event on 401/403.

At that date this transport was not activated and committed `postgresApiUrl` values were empty. Later isolated `STAGING POSTGRES` API/Draft rehearsals activated the boundary only in Staging. Production still uses its unchanged approved path and no Production endpoint is inferred by the browser client.

## Internal Auth0 Staging security-event consumer — 2026-07-19

This is not a browser/public HTTP API. Auth0 Staging events enter through an AWS partner EventBridge source and an exact SQS queue; Lambda consumes SQS records and calls only `app_private.ingest_auth0_security_event(...)`. The trusted envelope fields are validated before any database call. Failures use SQS partial batch responses, while application logs include only bounded result codes and an irreversible message fingerprint.

See [Auth0 Staging security event pipeline](AUTH0_SECURITY_EVENT_PIPELINE.md). External resources and live Staging E2E remain pending explicit approval.

## 2026-07-18 PostgreSQL 過渡 API 實作

已實作且隔離的過渡 API 定義於 [openapi-postgres.yaml](openapi-postgres.yaml)。目前提供 health/readiness、老闆／管理員員工清單，以及新增員工、新增班次、取代單月排假、員工上下班打卡、核定出勤工時等 Transaction/Command API。每個 mutation 必須提供 `Idempotency-Key`；tenant context 只來自已驗證 RS256 JWT，且會在同一交易內重新確認 active workspace membership。

此為 2026-07-18 歷史狀態：當時實作不包含 login/refresh/logout；後續已完成 Auth0 Staging PKCE／refresh 與本機可撤銷 Session 邊界。Production route 仍未因這些 Staging 驗收而切換。

2026-07-18 Managed Staging 實測已通過：新增員工、建立班次、取代單月排假、上下班打卡、核定工時與員工清單；兩個 Workspace 的正向讀取、跨租戶讀寫拒絕及無 tenant context 拒絕均通過。API 使用獨立最小權限 role，不可讀 Migration ledger 或執行 DDL。當時尚未接上的 Auth0 Staging Identity 與隔離前端 rehearsal 已由後續 Sprint 驗收；這不代表 Production cutover。

歷史風險（已由後續 Identity/Tenant migrations 與受控 Function 邊界解決）：當時 tenant context 只由 backend 以 transaction-local custom GUC 設定，單獨取得共用 API database credential 可能偽造 GUC。現在 custom GUC 不是授權來源；受控函式會重新驗證簽章 context、Session、Membership、Workspace 與角色，runtime role 亦無直接查表權限。Production 仍須通過獨立發布閘門才可切換。

> 2026-07-16 `doPost` 傳輸層上限為 1 MiB（1,048,576 UTF-8 bytes）；超限在 JSON 解析、schema 驗證與資料寫入前回 `REQUEST_PAYLOAD_TOO_LARGE`。A1 snapshot 及老闆 `save.data` 現對現有電話、credential 表示、薪資／金額、日期／時間執行嚴格值驗證。API action 與成功 response schema 未變，本次未部署 Apps Script。

> 2026-07-16 老闆 `save.data` 現在只接受既有 snapshot 欄位；未知欄位、array root、錯誤 collection／map 形狀或沒有任何可變欄位時回 `REQUEST_DATA_INVALID`。省略可變欄位代表保留伺服器既有值，明確空集合才代表清除。API action 與成功 response schema 未變，本次未部署 Apps Script。

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
- `save.data` 的允許欄位為 `workspace`、`sync`、`employees`、`shifts`、`attendance`、`leaves`、`leaveRequests`、`leaveHistory`、`removedEmployees`、`access`、`payrollAdjustments`。其中 `workspace`、`sync`、`access` 只為現有完整 projection 相容，伺服器會忽略 client 值並保留 server 值；至少須明確傳送一個可變欄位。
- 前端原始 PIN 只接受 6 位純數字；電話送往後端前正規化為 8–15 位數字。現行一次性啟用碼為既有 8 碼大寫英數字母表，不是純數字；為避免既有尚未啟用帳號失效，本 Sprint 保留正式使用中的規格。

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

`doPost` 優先以 Apps Script `e.postData.contents` 的 UTF-8 byte 長度作 1 MiB 上限，因此量到的是 URL-encoded form transport body，可能比解碼後 JSON 更大，屬保守拒絕。只在 Apps Script 未提供非空 raw body 時，才 fallback 計算已解碼 `payload` 的 UTF-8 bytes；該 fallback 無法完全還原傳輸層大小，是平台 API 限制。

前端已使用 `state-store.js` 安全解析本機主要 state；Apps Script 讀取邊界會拒絕損壞 JSON、非 object root、錯誤的 top-level collection／map 形狀、無效 revision，以及本 Sprint 要求的電話、credential 表示、薪資／金額、日期／時間值；老闆 `save` 另有 top-level request allowlist 與 1 MiB transport boundary。這仍**不是帶 schema version 的 migration system、正式 authorization 或關聯式 transaction**。

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

錯誤回應已增加過渡期 domain code：`{ "ok": false, "error": "message", "code": "..." }`。目前啟用流程使用 `OWNER_NOT_CONFIGURED`、`BOSS_NOT_AUTHORIZED`、`ACTIVATION_REQUIRED`、`ACTIVATION_INVALID`、`ACTIVATION_NOT_CONFIGURED`；Apps Script credential pepper 格式損壞時回 `CREDENTIAL_CONFIG_INVALID`；傳輸層超過 1 MiB 回 `REQUEST_PAYLOAD_TOO_LARGE`；主資料值／形狀錯誤回 `DATA_SOURCE_INVALID`，老闆新儲存值錯誤回 `REQUEST_DATA_INVALID`，寫入前最後防線錯誤回 `DATA_WRITE_INVALID`。這些失敗都不寫回 Sheet。HTTP status 與完整 error catalog 仍待正式 API。

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

- ~~`phone + pinHash` 被當長期 bearer credential。~~ **2026-07-15 已改為只在登入使用，成功後採 8 小時 session、revoke 與 rate limit；後續 Auth0 Staging refresh rotation／reuse 驗收與本機 Session 撤銷邊界亦已完成。Production 啟用仍受發布閘門管控。**
- ~~Sheet 保存快速、無 salt 的 PIN hash。~~ **2026-07-15 已改為過渡期 server-side salted credential 並支援登入時舊資料遷移；後續 Staging 已使用 Auth0 正式 OIDC 邊界，Google Sheets credential 僅保留為未切換 Production 的歷史相容路徑。**
- 首次帳號搶先認領：**2026-07-15 已止血**；這不是正式 session/auth 的替代品。
- `employeeLogin/pull` 全公司資料外洩：**2026-07-15 已止血**，目前只回本人 projection。
- 員工以 `save` 覆寫公司資料：**2026-07-15 已止血**，目前伺服器拒絕員工全量儲存。
- 老闆 `save` 仍以 snapshot 為主，但 stale／replay 已由全域 revision 拒絕，未知 top-level 欄位與錯誤 collection／map 形狀會 fail closed；漏傳可變欄位不再清空既有資料。
- 主資料無效 JSON／非 object root 已 fail closed，且現有關鍵值與 1 MiB transport 已受防護；仍無正式 tenant row isolation、帶版本完整 schema/migration、command idempotency 或 row revision。
- Apps Script origin hard-code 單一 Netlify domain。

## 目標 API 原則

- `/v1` 版本化 API；workspace 從 server session 解析，不相信 client 傳入的權限。
- Short-lived access session + refresh/revoke/device management。
- Scoped query：員工只能取得本人資料。
- Command API：例如 `create-shift`、`save-leave-selection`、`clock-in`、`clock-out`、`approve-hours`，禁止全量 snapshot save。
- Mutation 具 idempotency key 與 resource revision；衝突回 409。
- 帶版本 JSON schema/migration、完整 field constraint、HTTP status 與 structured error catalog。
- Structured logging、request ID、latency/error metrics、audit event。

正式 endpoint、schema 與 error catalog 將在 Sprint 2–3 ADR 後定案。

## 正式 API 設計（Sprint 3 安全邊界）

詳細的 OpenAPI 規格請參閱：[docs/openapi.yaml](openapi.yaml)

### 身份驗證流程 (Auth Flow)

1. **登入**：未來 Staging frontend 使用 Auth0 Authorization Code + PKCE；程式基礎已完成，外部 Auth0 tenant 尚未接通。
2. **Access**：Client 帶 `Authorization: Bearer <RS256 access token>` 與不可信任的 `X-Workspace-Id` request。API 驗證 issuer/audience/time/JWKS/session claim；任何 token `workspace_id` 會被拒絕。
3. **Tenant authorization**：API 簽發短效、單次 internal context。PostgreSQL 以 issuer/subject 對應 active user，再即時確認 workspace、membership、role 與 local session；client 不能決定真正 tenant context。
4. **Refresh**：由 Auth0 rotation/reuse detection 管理，token 不儲存在本資料庫；外部 Staging event 到 local-session revoke 尚待 E2E。
5. **Logout**：`POST /v1/auth/logout` 撤銷 local session，舊 Access Token 後續被資料庫拒絕；provider logout 尚待 Auth0 Staging 驗收。

現行 PostgreSQL API 實作另見 `docs/openapi-postgres.yaml`。Google Sheets 過渡登入流程未移除或切換。

### 命令與查詢 (Command & Query)

- **Command**: 使用明確的語意化 API (如 `/employees/{id}/clock-in`)。
- **Revision**: 每個寫入操作必須帶入 `revision` 以防止併發衝突。
- **Response**: 統一回傳格式與錯誤代碼，詳見 OpenAPI 文件。

## 管理員維運函式（非 Web API）

以下函式只允許 Apps Script 專案管理員在編輯器中手動執行，刻意不接入 `api()`、`doGet()`、`doPost()`，APP、老闆與員工都不能呼叫：

| 函式 | 用途 | 成功條件 |
|---|---|---|
| `createOperationalBackup()` | 建立私人 Google Drive 復原包 | 來源 JSON、workspace、revision、credential pepper 與 Drive 私人權限全部有效 |
| `verifyLatestOperationalBackup()` | 驗證最新復原包 | 格式、checksum、來源、workspace、snapshot 與允許的 Script Properties 均有效 |
| `restoreLatestOperationalBackup()` | 復原 Sheet 與必要 Script Properties | 一次性確認值正確；非空目標先有 safety backup；寫入後再次驗證 |
| `runReleaseReadinessCheck()` | 線上發布門檻 | 最新備份未超過 24 小時，且與目前 Sheet 的來源、workspace、revision、內容一致 |

維運函式只輸出不含 PIN、session token 或 pepper 的摘要到 Apps Script execution log。詳細程序、錯誤代碼與災難復原步驟見 `docs/RUNBOOK.md`。
