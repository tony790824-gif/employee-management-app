# Sprint 0 Architecture & Quality Review

日期：2026-07-15  
範圍：治理、可重現建置、發布白名單、文件基線。  
結論：Sprint 0 可驗收；整體產品仍不可正式上線。

## Architecture Review

- **A／CTO**：先建立證據、版本控制與可重現建置，再處理商業邏輯；否則每次修正都無法可信回歸。
- **B／Senior Frontend Engineer**：現況是原生 JavaScript PWA，不是 Flutter。現在重寫 Flutter 會延後 P0 修復，因此採漸進式替換。
- **C／Backend Architect**：Google Apps Script 只能視為待遷移原型；Sprint 0 僅記錄現況，不宣稱 API 安全。
- **D／Database Architect**：單一試算表 A1 JSON 快照不具商業資料庫所需的交易、一致性與租戶隔離，必須在 Sprint 3 取代。
- **E／Security Engineer**：部署白名單可降低誤發布舊後端與備份的風險，但不解決認證與越權；安全閘門不可因此放行。
- **F／QA Lead**：語法檢查與建置不是功能測試。Sprint 1 起必須補單元、整合與瀏覽器回歸測試。
- **G／Product Manager**：Sprint 0 沒有新增使用者功能，但能降低資料遺失、修壞與部署錯誤造成的客服成本。
- **H／DevOps Engineer**：先使用零依賴 Node 腳本，避免套件供應鏈與環境差異；CI/CD 在測試基線成熟後導入。
- **I／Code Reviewer**：發布檔案必須白名單複製且建置可重複；文件需清楚區分「已有畫面」與「可商用完成」。

反對意見已收斂：不立即重寫 Flutter、不把 Google Sheets 當正式後端、不把建置成功當上線許可。採用「保留 PWA 外殼、先止血、再替換後端與資料模型」方案。

## 自我 Code Review

### 10 個可改善項目

1. 加入 HTML、CSS lint（Sprint 1）。
2. 檢查 Service Worker 資產與發布白名單一致（Sprint 1）。
3. 產生帶雜湊的 build manifest（Sprint 9）。
4. 加入測試覆蓋率門檻（Sprint 1）。
5. 加入依賴與祕密掃描（Sprint 7）。
6. 加入 SBOM（Sprint 9）。
7. 加入 CI 平台矩陣（Sprint 9）。
8. 加入版本與 release metadata（Sprint 9）。
9. 將封存 ZIP 移出工作目錄（待使用者確認保存位置；P2）。
10. 建立正式 deployment rollback 流程（Sprint 9）。

### 10 個可能 Bug 與處置

1. `npm` 不存在會使 verify 失敗：已改為只依賴 Node。
2. 舊 `dist` 殘檔可能混入：build 每次先重建目錄，已處理。
3. 遺漏資產仍建置：quality check 會拒絕，已處理。
4. JavaScript 語法錯誤進入發布包：quality check 會拒絕，已處理。
5. Apps Script 語法錯誤未被看見：quality check 會拒絕，已處理。
6. manifest JSON 損壞：quality check 會拒絕，已處理。
7. HTML 引用未發布檔案：quality check 會拒絕，已處理。
8. Firebase／Supabase 舊客戶端誤進正式包：白名單與禁止檢查，已處理。
9. 建置結果受執行次序影響：重複建置 SHA-256 比對通過，已驗證。
10. Service Worker 仍引用移除檔案：本 Sprint 已移除 Firebase 引用；完整一致性檢查列 Sprint 1。

### 5 個安全問題

1. 發布包可能誤帶後端原始碼或備份：白名單已降低風險。
2. 原有認證可被接管：未修，Sprint 2 P0。
3. 員工可取得或覆寫全公司資料：未修，Sprint 2–3 P0。
4. PIN 雜湊可重放且無 rate limit：未修，Sprint 2／7 P0。
5. DOM 以 `innerHTML` 渲染不可信資料：未修，Sprint 1／7 P0。

### 5 個效能問題

1. MutationObserver 自觸發迴圈：Sprint 1 P0。
2. 每次同步全量 JSON：Sprint 3。
3. Apps Script 鎖住整份資料：Sprint 3。
4. Service Worker 對所有 GET 採相同 fallback：Sprint 1。
5. 無分頁、虛擬化與大量資料測試：Sprint 5–6／8。

### 5 個 UX 問題

1. 員工預覽可能無限轉圈：Sprint 1 P0。
2. 登入遮罩後仍預先顯示敏感畫面：Sprint 1–2 P0。
3. 錯誤大量使用阻塞式 alert：Sprint 8。
4. 離線／弱網路狀態不清楚：Sprint 8。
5. 老闆與員工資訊架構仍混雜：Sprint 1／8。

## 驗證證據

- 13 個前端 JavaScript 語法檢查通過。
- 1 個 Apps Script 語法檢查通過。
- manifest 解析與 HTML 資產引用檢查通過。
- 22 個白名單資產成功輸出至 `dist/`。
- `dist/` 不含 ZIP、Apps Script、SQL、Firebase 或 Supabase 舊檔。
- 連續兩次建置的檔案 SHA-256 集合一致。

## 剩餘風險

Critical 認證、授權、資料一致性與前端無限迴圈均未在 Sprint 0 修復。Sprint 0 的成功只表示「後續可以受控開發」，不表示「產品可營運」。
