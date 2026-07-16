# P0 Boss Save Request Boundary — Architecture Review

日期：2026-07-16

## A — CTO

本次不建立第二套 API，而是在既有 `save` 邊界先封堵 mass-assignment、錯誤資料形狀與漏欄清空。這是過渡期資料安全修復，不代表全量 snapshot 架構可正式上線。

## B — Senior Frontend Engineer

檢查 10 項：完整 snapshot 相容、部分 request 相容、漏欄保留、明確空集合刪除、server-managed 欄位忽略、revision 契約不變、前端 payload 不變、conflict backup 不變、錯誤碼可辨識、無畫面回歸。現有前端不需建立新流程。

## C — Backend Architect

request 先通過 revision compare-and-swap，再做 allowlist／形狀驗證；合併以 stored snapshot 為底，只套用明確可變欄位。下一階段仍須以 command API 取代 boss snapshot save。

## D — Database Architect

省略欄位與明確空集合現在有不同語意，可避免部分 payload 誤刪資料。這沒有增加資料表或 migration；單一 Sheet A1 仍缺 transaction、foreign key、row revision 與正式 migration ledger。

## E — Security Engineer

已檢查未知 top-level 欄位、array root、錯誤 collection／map、client 竄改 workspace／sync／access、空操作與失敗時不寫入。仍缺完整欄位值 schema、request size limit、多租戶列級授權、正式 IAM 與 audit log。

## F — QA Lead

回歸涵蓋正常完整 save、stale/replay、未知欄位、集合形狀錯誤、舊 payroll array、array root、server-only 空操作、部分 save 保留、明確清空與後續員工打卡 revision。需在 staging Apps Script 再做真實跨裝置 E2E；本次禁止部署，故未執行。

## G — Product Manager

此修復沒有增加操作步驟，但可降低員工、班次與休假無故消失所造成的客服與薪資爭議。它是資料可信度必要條件，不是可銷售的新功能。

## H — DevOps Engineer

來源、測試與文件可提交；不得將「本機測試通過」等同線上後端已更新。正式切換前要部署到受控 staging、執行 readiness、備份、跨裝置驗收與回滾演練。

## I — Code Reviewer

本次沿用既有 validator、revision 與 credential merge，未複製同步流程。已修正自我審查發現的空 request 無意義推進 revision。結論：作為 Google Sheets 過渡防護可合併；正式商業架構仍須遷移至版本化 command API 與關聯式資料庫。
