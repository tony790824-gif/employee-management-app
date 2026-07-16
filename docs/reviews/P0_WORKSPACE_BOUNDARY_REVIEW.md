# P0 Workspace Boundary — Architecture Review

日期：2026-07-15  
範圍：只建立工作區資料所有權邊界，不新增排班、出勤或薪資功能。

## 角色審查

- **A／CTO**：目前最危險的是公司歸屬只存在於人的理解，系統無法驗證。接受伺服器產生的 immutable workspace ID 作為過渡止血。
- **B／Senior Frontend Engineer**：前端只能核對 workspace，不能選擇或改寫 workspace；否則 UI 參數會變成授權來源。
- **C／Backend Architect**：session 必須帶 workspace ID，而且授權時要和伺服器權威資料比對。只在登入回應增加欄位而不綁 session 沒有安全價值。
- **D／Database Architect**：Sheet snapshot 與 Script Properties 必須雙重保存並偵測 mismatch。不同時應 fail closed，不可猜哪一份正確。
- **E／Security Engineer**：禁止 client supplied workspace；舊 session 缺 workspace ID 必須失效。這能防錯誤資料歸屬，但不是 row-level tenant isolation。
- **F／QA Lead**：必須測試舊資料升級、竄改 snapshot workspace、竄改 session workspace、老闆 save 嘗試改 workspace、員工投影保留正確 workspace。
- **G／Product Manager**：使用者不需要看到新的設定步驟。安全升級應無感，避免增加 50 歲以上老闆的操作負擔。
- **H／DevOps Engineer**：前端與 Apps Script protocol 有同步變更，必須協調部署；只部署其中一端會讓舊 session 失效或登入失敗。
- **I／Code Reviewer**：接受小步修改現有後端，不接受在本 Sprint 同時建立假多租戶路由或讓使用者輸入任意 Apps Script URL。

## 結論

所有角色同意方案 3 是現有 Google Sheets 過渡架構內最小且可驗證的 P0 修復。所有角色也同意：它只保護單一工作區部署，不代表多公司 SaaS 已完成，產品仍不可正式上線。

## 實作前風險清單

1. 舊資料沒有 workspace 欄位。
2. 舊 session 沒有 workspace ID。
3. client save 可能刪除 workspace。
4. client save 可能注入另一個 workspace。
5. Script Property 與 Sheet 可能不一致。
6. 員工投影可能漏掉 workspace。
7. 登入回應可能沒有 workspace ID。
8. session restore 可能接受不同 workspace 回應。
9. 登出不應因 workspace mismatch 失去本機清除能力。
10. 測試環境 UUID 格式與 Apps Script 不同。

## Security／Performance／UX Gate

- Security：fail closed、server-generated ID、session binding、client mutation rejection、legacy session invalidation。
- Performance：每次授權只讀一個 Script Property 與快照中的一個欄位，不新增額外 Sheet query。
- UX：不新增設定畫面；舊資料在首次成功登入自動遷移；發生 mismatch 時顯示可處理的錯誤而非無限載入。

## 完成後自我 Code Review

### 10 個改善項目

1. workspace 由隱含 Sheet 邊界改為明確 ID。
2. ID 改由 server 產生，不信任 client。
3. Script Property 與 snapshot 雙重核對。
4. session record 加入 workspace ID。
5. 每次授權核對 session workspace。
6. boss save 強制保留 stored workspace。
7. first-login initial data 忽略 client workspace。
8. employee projection 帶入最小 workspace identity。
9. 前端 session restore 核對 response workspace。
10. state store schema 正規化 workspace 欄位。

### 10 個可能 Bug 與處理

1. 舊資料缺 workspace：成功登入時遷移並測試。
2. 舊 session 缺 workspace：fail closed 並撤銷。
3. client save 改 workspace：server overwrite 並測試。
4. first login 注入 workspace：忽略並測試。
5. session record 被改 workspace：撤銷並測試。
6. snapshot 被改 workspace：回傳 `WORKSPACE_MISMATCH`。
7. 員工 projection 缺 workspace：已補上並測試。
8. 前端 response workspace 不一致：清 session 並停止同步。
9. UUID stub 不符合正式格式：改為雜湊 UUID 後截取固定 32 hex。
10. 舊授權測試重設資料誤刪 workspace：測試 fixture 已保留權威 workspace。

### 5 個安全性檢查

1. client supplied tenant：已拒絕。
2. 跨 workspace token replay：已拒絕。
3. workspace mismatch 自動覆蓋：已改為 fail closed。
4. credential 泄漏：本次沒有新增 credential 回傳。
5. session revoke：不合法 workspace session 立即刪除。

### 5 個效能檢查

1. 未新增額外 Sheet round trip。
2. 每次授權只讀既有 Script Properties map 中的一筆權威 ID。
3. workspace 比對為固定長度字串比較。
4. 舊資料只在第一次成功登入多寫一次。
5. 沒有新增前端輪詢頻率或重繪。

### 5 個 UX 檢查

1. 不新增公司代碼輸入步驟。
2. 舊資料自動升級，正常使用者無感。
3. mismatch 使用明確中文錯誤。
4. 工作區失效會回登入頁，不會無限轉圈。
5. 老闆／員工本機預覽與既有分頁均完成瀏覽器回歸。

## 剩餘重大風險

- 同一 Apps Script 部署仍只能服務一家公司。
- 全量 JSON snapshot 仍有 stale-write 資料遺失風險。
- stored XSS 仍可能竊取目前瀏覽器內的短效 bearer token。
- 6 位 PIN 的 server-side 儲存仍是快速 SHA-256，缺少 slow salted hash。
- 缺 audit、正式備份還原與 CI release gate。
