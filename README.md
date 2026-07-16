# 班客邦

> 2026-07-16 專案整理收尾：員工／班次／出勤管理事件已集中至單一模組，未啟用 Firebase／Supabase 草稿已移除，Service Worker 資產失敗不再錯誤回傳 HTML。12 組回歸、25 個發布資產、本機老闆／員工 smoke 均通過；本次沒有變更 API 或資料結構。

> 2026-07-15 P0 營運復原更新：Google Sheets snapshot 與必要 Script Properties 現可建立私人 Google Drive 復原包，具 checksum、workspace 驗證、一次性復原確認、回滾與發布前 readiness gate。詳見 [ADR 0010](docs/adr/0010-operational-recovery.md) 與 [Runbook](docs/RUNBOOK.md)。

班客邦是員工排班、休假、出勤與薪資試算產品。目前仍處於 **P0 架構修復階段**，不可作正式商業營運或保存正式薪資資料。

## 目前技術型態

- 前端：HTML、CSS、Vanilla JavaScript PWA
- 現況同步：Google Apps Script + Google Sheets 單一 JSON snapshot
- 部署原型：Netlify 手動部署
- 非現況：專案不是 Flutter；Firebase/Supabase 檔案為未啟用的歷史方案

## 上線狀態

**No — 不適合正式上線。**

主要阻斷與修復順序請見：

- [Project Health Report](docs/PROJECT_HEALTH_REPORT.md)
- [Product Backlog](docs/PRODUCT_BACKLOG.md)
- [Sprint 0 Architecture & Quality Review](docs/reviews/SPRINT_0_REVIEW.md)
- [P0 Account Activation Review](docs/reviews/P0_ACCOUNT_ACTIVATION_REVIEW.md)
- [P0 Workspace Boundary Review](docs/reviews/P0_WORKSPACE_BOUNDARY_REVIEW.md)
- [P0 Credential Hardening Review](docs/reviews/P0_CREDENTIAL_HARDENING_REVIEW.md)
- [P0 Backup & Recovery Review](docs/reviews/P0_BACKUP_RECOVERY_REVIEW.md)
- [營運 Runbook](docs/RUNBOOK.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Account Activation ADR](docs/adr/0004-transitional-account-activation.md)
- [API 現況](docs/API.md)
- [Database 現況](docs/DATABASE.md)
- [平台 ADR](docs/adr/0001-product-platform.md)

## 本機品質檢查

需求：Node.js 20+。

```powershell
npm run check
npm test
npm run build
pnpm release:check
```

- `npm run check`：檢查 JavaScript／Apps Script 語法、manifest、HTML 資產引用與發布白名單。
- `npm test`：執行目前已建立的 P0 防回歸檢查，包括員工雲端欄位隔離、越權拒絕、本人排假／打卡、短效 session、工作區竄改、stored XSS 與 credential migration 防護。
- `npm run build`：建立乾淨的 `dist/` 靜態部署輸出，不包含 ZIP、後端原始碼或未啟用雲端設定。
- `pnpm release:check`：執行全部檢查、12 組回歸與 build，再逐檔驗證 `dist/` 白名單並確認後端維運文件；正式發布前仍須在 Apps Script 執行線上 readiness check。

本機預覽可用靜態 HTTP server 開啟 `local-preview.html`。員工介面無限更新與登入前敏感 DOM 曝露已修復；其餘 P0 問題仍列於健康報告。

主要本機資料統一由 `state-store.js` 讀寫。若偵測到損壞 JSON，APP 會隔離一份本機備份並使用安全資料繼續啟動；備份不會同步至 Google Sheets。

正式頁面採分階段啟動：登入前只載入設定、雲端驗證、登入與 PWA 必要程式；驗證成功後才載入管理畫面與公司資料。這是前端資料最小化，不等於正式後端 authorization。

Google Sheets 過渡後端已停止接受員工全量 `save`。員工登入／讀取只回傳本人所需資料，排假、上班打卡、下班打卡分別由伺服器驗證身份後執行。老闆全量 snapshot 已加入 revision 衝突拒絕，PIN 也已採過渡期 server-side salted credential；但多租戶、正式 Identity Provider、正式資料庫與 command API 尚未完成，因此產品仍不可正式上線。

## 過渡期帳號初始化

部署新的 Apps Script／空白資料表前，必須在 Apps Script「專案設定 → 指令碼屬性」新增：

- 屬性：`SHIFT_APP_OWNER_PHONE`
- 值：第一位老闆的手機號碼（只填數字，例如 `0912345678`）

只有這支電話能建立空白雲端的第一組老闆 PIN。新增員工後，系統會顯示 8 碼一次性啟用碼；員工第一次登入輸入該碼並自行設定 6 位數 PIN，啟用碼隨即失效。既有已設定 PIN 的帳號可照常登入，並會在第一次成功登入時自動升級 credential。

第一次建立任何新 credential 時，後端會在 Apps Script Script Properties 自動建立 `SHIFT_APP_CREDENTIAL_PEPPER`。此密鑰不得放進 Sheet、前端或 Git，且必須受控備份；遺失或損壞會使既有 PIN 無法驗證。

這是 Google Sheets 過渡後端的 P0 止血，不是正式 authentication。正式版仍須完成正式 Identity Provider／記憶體困難密碼雜湊、refresh/device management、audit、密鑰輪替、備份演練與多租戶資料列隔離。

## 過渡期備份與發布

備份與復原只可由 Apps Script 專案管理員執行，不會出現在 APP。每次發布前依 [Runbook](docs/RUNBOOK.md) 執行 `createOperationalBackup()`、`verifyLatestOperationalBackup()` 與 `runReleaseReadinessCheck()`；任何一項失敗都不得發布。私人復原包包含公司完整資料與 credential pepper，禁止分享。

## 開發規則

所有修改遵循 [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md)。未完成 Architecture Review、Build、Test、Security/Performance/UX Review 與文件更新，不得宣稱 Sprint 完成。

## 目錄

- `index.html`、`*.js`、`*.css`：目前 PWA 原型
- `management-actions.js`：老闆員工、班次與出勤異動的唯一前端管理入口
- `google-sheets-backend.gs`：現況 Apps Script 後端原型
- `docs/`：健康報告、Backlog、API、Database 與 ADR
- `scripts/`：零第三方依賴的品質檢查與建置
- `dist/`：建置產物，不納入版本控管
