# P0 Interface Stability Review

日期：2026-07-15  
功能：員工／老闆介面可靠載入，不再因 DOM observer 或 partial state 卡死。  
狀態：此單一 P0 功能完成；Sprint 1 尚未完成。

## 設計決策

採最小風險修復，不重寫畫面：員工版面只監聽 `body.class`；工時增強只監聽出勤 `tbody` 的直接列；啟動時先正規化既有 state。現有事件與功能保留。

## Architecture Review

- CTO：只修載入阻斷，不混入認證或版面重寫。
- Senior Frontend：移除廣域 subtree observer，使用最小觀察範圍與既有事件。
- Backend／Database：partial state 正規化是過渡措施，正式 schema migration 仍不可省略。
- Security：本次沒有放寬權限；Critical API 越權仍阻擋上線。
- QA：靜態防回歸加真實瀏覽器測試，避免只靠語法檢查。
- Product：員工能進入介面是基本可用性，修復優先於新增功能。
- DevOps：修復必須進入白名單 build 並可重複驗證。
- Code Reviewer：observer 的 target/options 必須由測試鎖定，避免日後退回監聽整棵 DOM。

## 自我審查

### 10 個可能改善

1. 抽出共用 state schema 模組。
2. 加入 schema version。
3. 加入 migration runner。
4. JSON parse 加入錯誤復原。
5. 啟動錯誤改為可理解的畫面。
6. 移除 production sample data。
7. 將全域 script 改為 ES modules。
8. 使用明確 render event 取代剩餘 observer。
9. 補 100 次角色／月份切換 E2E。
10. 補 mobile/tablet 視覺回歸。

### 10 個可能 Bug

1. 非物件 state：本次已正規化。
2. 缺少 array 欄位：本次已正規化。
3. array 欄位型別錯誤：本次已正規化。
4. map 欄位為 array：本次已正規化。
5. 封存員工含 null：本次已安全過濾。
6. 員工版面搬移節點自觸發：本次已修復。
7. 工時儲存格修改自觸發：本次已修復。
8. 無效 JSON 仍會白畫面：下一個 P0。
9. `localStorage.setItem` quota/security 例外未處理：後續 state 層。
10. 多個事件重複呼叫 update：目前冪等且測試通過，後續重構移除。

### 5 個安全問題

1. 登入前資料仍渲染。
2. 員工 API 仍回傳完整公司資料。
3. PIN 仍可暴力破解與重放。
4. 多處 stored XSS。
5. 無 tenant authorization。

以上均未因本次修復惡化，仍為後續 P0/P1，產品不可上線。

### 5 個效能問題

1. 兩個 observer 自我迴圈已修復。
2. 全量 JSON 同步仍存在。
3. 多次全量 render 仍存在。
4. 無大型資料分頁／虛擬化。
5. Service Worker fallback 過廣。

### 5 個 UX 問題

1. 無限轉圈已修復。
2. 390px 仍有橫向溢位。
3. 員工休假儲存按鈕目前位於第二分頁。
4. 老闆仍可能看到員工休假儲存區。
5. 錯誤仍使用阻塞式 alert。

## QA 證據

- 品質檢查：13 個前端腳本、1 個 Apps Script、22 個發布資產通過。
- 自動防回歸：observer 範圍與 state schema guard 通過。
- 員工預覽：31 天日曆、1 位預覽員工、無 console error。
- 連續選擇 4 天：留在排班表，剩餘額度由 8 變 4，無跳頁。
- 分頁切換：排班表 ↔ 我的出勤／收入，資料與選擇維持。
- 老闆預覽：面板恢復原位置、無 employee-mode、無 console error。
- 390px mobile：功能可載入、無 console error；橫向溢位列為已知問題。

## 回歸影響

沒有修改登入、雲端 API、排班、打卡、薪資公式或資料庫。發布白名單未變；`dist/` 建置成功。
