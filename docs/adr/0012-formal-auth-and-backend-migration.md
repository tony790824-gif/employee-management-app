# ADR 0012 — 正式身份驗證與後端遷移架構設計

日期：2026-07-16  
狀態：Accepted (Design)

## 背景

目前產品使用 Google Sheets 作為主要資料庫，並以單一 JSON snapshot 進行覆寫式同步。雖然已透過 Apps Script 建立了過渡期 session、salted PIN 以及 revision 衝突檢核，但仍存在以下核心架構限制：
1. **擴充性不足**：Google Sheets 單一儲存格有容量限制，且多人併發效能差。
2. **多租戶隔離薄弱**：目前採「一部署一公司」模式，無法安全地以單一服務支援多個獨立組織（Workspace）。
3. **身分驗證非標**：Apps Script session 非主流 IAM 方案，缺乏完善的裝置管理、Refresh Token 機制與安全稽核。
4. **資料模型不穩定**：全量 snapshot 同步容易造成資料遺失，且缺乏關聯式資料庫的完整性約束（FK, Unique）。

## 方案選擇

### 1. 正式身份驗證 (Auth / IAM)
- **選擇：JWT + Refresh Token 模式**
  - **Access Token (短效)**：15–60 分鐘，JWT 格式，包含 `uid`, `role`, `workspace_id`。
  - **Refresh Token (長效)**：7–30 天，儲存於後端資料庫或專用 IAM 服務，支援滑動窗口（Sliding Window）。
  - **加密算法**：伺服器端使用 Argon2id 進行 PIN/密碼雜湊，取代現有的 HMAC-SHA256。
  - **登出機制**：撤銷 Refresh Token，前端清除 Access Token。
  - **停權處理**：後端在每次 Refresh 或敏感 API 呼叫時檢查帳號狀態。
  - **跨裝置**：支援多個 active session，未來可列出裝置列表。

### 2. 正式後端與資料庫
- **選擇：PostgreSQL (Relational Database)**
  - **多租戶隔離**：所有業務資料表（Shifts, Attendance, Payroll）必須包含 `workspace_id` 欄位。使用 Row-Level Security (RLS) 或 Repository 層級的強制過濾。
  - **正規化模型**：
    - `organizations` / `workspaces`：組織與工作區。
    - `users`：身份帳號（電話、帳號狀態）。
    - `workspace_members`：使用者在工作區的角色（Boss, Manager, Employee）。
    - `shifts` / `attendance_records` / `leaves`：業務核心資料。
- **選擇：Command API**
  - 放棄全量 `save`。
  - 建立明確的 Mutation Commands（如 `CreateShift`, `UpdateAttendance`, `ApproveLeave`）。
  - 使用 `revision` 或 `updated_at` 實現樂觀鎖（Optimistic Concurrency）。

### 3. Google Sheets 角色轉變
- **選擇：降級為匯出與離線整合層**
  - 資料庫（PostgreSQL）為唯一的 Single Source of Truth (SSOT)。
  - 定期或觸發式同步：將 DB 資料彙整後推送到 Google Sheets 供老闆作報表與手動調整。
  - 原本的 A1 snapshot 改為由後端產出的快照備份。

## 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|---|---|---|---|
| **繼續優化 Apps Script** | 成本低、現有程式修改少 | 無法解決 RDBMS 核心需求、擴充性瓶頸、安全工具鏈少 | 拒絕 (不可上線) |
| **Firebase / Supabase** | 開發快、內建 Auth 與 RLS | 容易造成 Vendor Lock-in (若未妥善封裝) | 接受 (作為後端服務供應商候選) |
| **自建 Node/Go + PostgreSQL** | 控制權最高、成本最透明 | 維運成本 (DevOps) 較高、開發時間較長 | 接受 (適合中長期正式版) |

## 遷移步驟 (Migration Path)

1. **環境建立**：部署正式資料庫與 Auth 服務。
2. **Schema 定位**：建立正式關聯式 Table。
3. **資料清洗與導入**：
   - 讀取既有 A1 Snapshot。
   - 解析並正規化資料。
   - 批次寫入新資料庫。
4. **雙寫期 (選用)**：短暫讓舊 API 同時更新 A1 與新 DB 以驗證一致性。
5. **切換 (Cutover)**：前端改接新 API，Google Sheets 改為 Read-only 或轉為匯出目標。

## 風險評估

- **資安風險**：遷移過程需確保 credentials (PIN hashes) 安全轉換，Argon2id 運算較耗時需考量效能。
- **一致性風險**：若在雙寫期發生衝突，需具備明確的 SSOT 仲裁邏輯。
- **維運風險**：不再是「免費」的 Google 生態系，將產生雲端資料庫與託管費用。

## 驗收標準 (Definition of Done)

- [ ] 完成正式資料庫 Schema 設計 (SQL Script)。
- [ ] 完成 Auth 流程序列圖 (Login, Refresh, Revoke)。
- [ ] 完成 Command API 規格文件 (OpenAPI/Swagger)。
- [ ] 資料隔離原則通過 Security Review (RLS 或 Middleware)。
- [ ] 具備可重跑、可回滾的遷移指令碼。

## 後續實作順序

1. **Sprint 2 (Next)**：建立資料庫 Schema 與正式 Auth 服務。
2. **Sprint 3**：開發 Command API 並建立遷移 Adapter。
3. **Sprint 4**：執行初次資料遷移與前端 API 切換。
