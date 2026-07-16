# P0 Optimistic Concurrency — Architecture Review

日期：2026-07-15

## A — CTO

採 compare-and-swap，優先保證「不遺失資料」。衝突必須可見且停止自動儲存；自動猜測合併薪資與出勤不可接受。

## B — Senior Frontend Engineer

檢查 10 項：base revision 傳送、新 revision 套用、連續本機變更 queue、衝突停止重試、衝突只提示一次、保留 attempted、保留 remote、成功後清舊備份、登出清敏感備份、新增員工／PIN 衝突不回滾。均已實作或測試。

## C — Backend Architect

Apps Script lock 與 revision 各自解決不同問題：lock 序列化同時寫入，revision 阻止已讀舊資料覆寫。缺 revision 的舊客戶端必須拒絕，不能為相容而降級安全。

## D — Database Architect

`sync.revision` 由 server 管理，client snapshot 不可指定下一版。所有 mutation 在同一 lock 內比較並遞增。正式資料庫仍應以 row revision、transaction 與 command API 取代全域版本。

## E — Security Engineer

檢查 revision 偽造、負數／小數、重播、跨 workspace、衝突回應 credential 洩漏、登出殘留與備份外洩。版本只接受安全整數；projection 不含 hash；workspace 仍驗證；敏感備份隨登出清除。

## F — QA Lead

至少 10 個風險案例：舊資料 revision 0、員工先排假、老闆 stale save、相同 base replay、缺 base、最新 save、員工打卡遞增、credential 保存、前端 conflict backup、成功後清 backup。後端與前端 VM 測試均通過。

## G — Product Manager

不增加日常操作。只有真正衝突時顯示清楚說明，避免老闆或員工發現資料莫名消失；這能直接降低客服與薪資爭議。

## H — DevOps Engineer

前端與 Apps Script 是 breaking coordinated deployment：必須先部署相容前端與後端同一版本，驗證後再切正式流量。Service Worker cache 已升至 v40。

## I — Code Reviewer

效能檢查：比較一個整數是 O(1)，沒有新增輪詢；仍受全量 JSON parse/stringify 與 Sheet A1 限制。UX 檢查：不自動清掉本機修改、可用既有備份按鈕匯出、停止重複提示。結論：本次 P0 可合併；正式 relational command API 仍是上線阻擋。
