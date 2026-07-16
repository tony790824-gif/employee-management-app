# Project Cleanup Acceptance — 2026-07-16

## 驗收範圍

只驗收既有專案整理成果：管理事件去重、發布資產、角色隔離、錯誤處理與桌機／手機介面；不新增功能，不變更 API 或資料 schema。

## 驗收結果

| 檢查項目 | 結果 | 證據 |
|---|---|---|
| 符合原需求 | 通過 | 員工、班次與出勤各只有一個表單處理入口，既有操作流程未改變 |
| 正常操作 | 通過 | 老闆可開啟新增班次／員工對話框並取消；員工可切換月班表與本人出勤 |
| 重複程式碼 | 通過 | `fallback-actions.js` 已移除；三個管理表單 handler 均只有一份 |
| 既有功能回歸 | 通過 | 品質檢查、12 組回歸、build 與 release gate 全數通過 |
| 手機版 | 修正後通過 | 390×844 驗收發現老闆與員工月曆橫向溢位，改為可縮小的七欄 grid 後重新驗證無水平捲動 |
| 權限 | 通過 | 老闆保留管理入口；員工看不到員工管理、薪資試算與其他老闆功能 |
| 錯誤處理 | 通過（本機範圍） | 既有 session、衝突、備份、損壞資料與授權拒絕測試均通過；線上 Apps Script 弱網仍須 staging E2E |
| 安全性 | 未發現新增 Critical/High | production source 未發現 `innerHTML`、`outerHTML`、`insertAdjacentHTML` 或 `eval`；正式 IAM／多租戶隔離仍是既有上線阻擋 |

## 修正內容

- 手機寬度下將 `#schedule .calendar-grid` 固定為七個 `minmax(0, 1fr)` 欄位。
- 允許 `.calendar-day` 縮小，避免姓名的最小內容寬度撐開頁面。
- 新增 CSS 防回歸斷言，避免日後移除手機縮欄規則。
- Service Worker cache 更新至 `staff-schedule-v43`，確保已安裝裝置取得修正。

## Architecture Review

- **A（CTO）：** 接受最小 CSS 修補；沒有改動資料流、API 或商業規則。
- **B（Frontend）：** 使用 grid min-size 修正根因，沒有以隱藏 overflow 掩蓋內容。
- **C（Backend）：** 後端與 action contract 未變，不需 migration。
- **D（Database）：** schema 未變，沒有資料風險。
- **E（Security）：** 角色隔離與 XSS sink 測試通過；正式 IAM 風險未因此消失。
- **F（QA）：** 桌機、390×844 老闆／員工與自動回歸均通過。
- **G（Product）：** 修正手機可用性，不增加流程或客服負擔。
- **H（DevOps）：** cache 版本已更新，build 白名單與 release gate 通過。
- **I（Reviewer）：** 修正範圍單一，並以測試鎖住關鍵規則，接受提交。

## 結論與剩餘風險

本次整理可以驗收並作為新的本機穩定基準。產品整體仍不適合正式上線：尚未以正式 Apps Script 部署執行 readiness、真實老闆／員工跨裝置 E2E、弱網與離線同步驗收，也尚未完成正式 IAM、多租戶資料列隔離與 primary database 遷移。
