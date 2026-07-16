# ADR 0011 — 前端管理事件與老闆儲存入口整併

## 狀態

Accepted — 2026-07-16

## 背景

`app.js`、`fallback-actions.js` 與增強模組重複處理員工、班次、出勤及資料儲存。事件執行順序依賴 script 載入與攔截，容易重複寫入、漏存或在雲端確認前重新載入。

## 方案比較

1. 保留各模組 handler，再以事件攔截決定勝出者：修改小，但持續依賴載入順序，無法可靠測試。
2. 建立單一 `management-actions.js`，共用 `shiftBossData.persist()`：變更集中，可測試、可回滾，且不改 UI/API/schema。
3. 立即改寫成框架與完整 module bundler：長期較乾淨，但超出本次整理範圍，回歸風險最高。

## 決策

採用方案 2。`management-actions.js` 是員工、班次與出勤異動的唯一事件入口；備份還原與薪資調整也透過同一老闆提交 API。衝突資料保留，非衝突失敗回滾本機畫面。

## 影響

- 不變更畫面、Apps Script action 或資料 schema。
- 任何新的老闆資料異動必須使用共用提交入口，不得新增平行 handler。
- `project-cleanup.test.mjs` 防止舊模組或重複事件重新進入正式建置。

## 回滾

使用整理前 ZIP 或 Git 基準回復全部前端檔案；不得只恢復 `fallback-actions.js`，否則會重新產生雙重 handler。
