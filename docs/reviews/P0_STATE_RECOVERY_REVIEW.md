# P0 State Recovery Review

日期：2026-07-15  
功能：本機主要資料損壞時安全復原，不再造成整個 APP 白畫面。  
狀態：此單一 P0 功能完成；Sprint 1 尚未完成。

## Architecture Review

- CTO：集中修復主要 state，不重寫 UI 或後端。
- Senior Frontend：單一 `state-store.js` 優於七份重複 `try/catch`。
- Backend Architect：不改 API contract，避免同時引入後端回歸。
- Database Architect：正規化只作容錯，不冒充正式 migration。
- Security Engineer：損壞原文只保留一份本機隔離備份，不進入同步 state。
- QA Lead：有效、缺欄位、舊版、壞 JSON、primitive、null、儲存失敗及大量資料均需測試。
- Product Manager：復原提示必須明確，不能靜默刪除資料。
- DevOps：新增檔必須加入發布白名單與 Service Worker cache。
- Code Reviewer：所有正式模組必須透過同一 state store，禁止重新出現直接 parse 主 state。

## 自我審查

### 10 個可改善項目

1. 加入明確 schema version 欄位。
2. 建立逐版本 migration functions。
3. 將 production sample data 移出正式啟動流程。
4. 隔離備份增加受控匯出／刪除流程。
5. 將 alert 改為非阻塞、可操作的復原提示。
6. 處理 localStorage 整體不可用情況。
7. 對每個 entity 做欄位級 validation。
8. 加入資料 checksum／revision。
9. 將其他 session/config JSON 納入安全解析。
10. 加入真實瀏覽器 corruption E2E fixture。

### 10 個可能 Bug 與結果

1. 壞 JSON：已隔離並復原。
2. root 是字串：已視為損壞。
3. root 是 array：已視為損壞。
4. root 是 null：已視為損壞。
5. 缺少 array 欄位：已補齊。
6. map 欄位型別錯誤：已補齊。
7. v3 壞但 v2 可讀：已遷移 v2。
8. 多版都壞而覆蓋最新備份：已限制只隔離第一個最高優先版本。
9. 隔離備份寫入失敗：仍可建立安全 state 並回報未保存備份。
10. 大量重複讀寫遺失未知欄位：測試確認保留未知欄位與 10,000 筆資料。
11. 空字串曾被誤判為「無資料」並回填範例員工：已改為損壞資料並加入回歸測試。

### 5 個安全問題

1. 隔離備份可能含敏感資料，只保留本機單份且不進入同步。
2. 登入前 DOM 資料曝露仍是下一個 P0。
3. PIN hash/replay 問題未處理。
4. 員工 API 越權未處理。
5. stored XSS 未處理。

### 5 個效能問題

1. 每次 read 仍會 JSON.parse 全量 snapshot。
2. 每次 write 仍會 JSON.stringify 全量 snapshot。
3. 10,000 筆／100 次測試約 314ms，但真實低階手機仍需量測。
4. Google Sheets 仍全量傳輸。
5. 多模組仍可能重複 read。

### 5 個 UX 問題

1. 損壞復原目前以 alert 提示。
2. 沒有直接下載損壞備份的入口。
3. 沒有說明哪些資料被復原。
4. localStorage 完全不可用時尚無離線降級畫面。
5. 手機橫向溢位仍存在。

## QA 證據

- 14 個前端腳本、1 個 Apps Script、23 個發布資產通過。
- 無儲存資料、空字串、partial state、v2 遷移、壞 JSON、字串、陣列、null、備份寫入失敗通過。
- 10,000 位員工、連續 100 次讀寫無資料遺失，測試約 314ms。
- 員工預覽：31 天、無 console error。
- 老闆預覽：面板與角色正確、無 console error。
- 員工選擇並儲存休假：成功、無 console error。

## 未改動範圍

沒有改登入規則、PIN、Google Sheets API、排班規則、工時計算、薪資公式或雲端資料格式。
