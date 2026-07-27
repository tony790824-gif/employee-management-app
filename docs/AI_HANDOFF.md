# AI Handoff

## 2026-07-27 handoff — time-off workflow Phase 1

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`.
- Completed additive Staging migration `0013_time_off_requests`, controlled read/command API, role grants, tests, and rollback/reapply rehearsal.
- Accepted API surface: `GET /v1/time-off-requests`; `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- Live Staging E2E passed employee own request access, manager review, employee review denial, approved coworker scheduled-leave visibility, pending visibility denial, private reason containment, minimal approved ad-hoc coverage, idempotent replay, duplicate-review rejection, Workspace isolation, and direct-table denial.
- The migration checksum is `f6f059b83f5a0ce0cbd172bbff479d8b9b9bb74cd4b0a2a1adc373d52fb4fcd2`. Migrations `0009` and the unrelated untracked `0010` remain outside this work.
- No Production, frontend, Auth0, Google Sheets, Apps Script, payroll, attendance, employee, or shift change was made.
- Current completion is **87%**. The request workflow is backend-ready in Staging but not user-facing.
- No feature-specific Draft Preview or iPhone UI acceptance exists yet.
- Next and only Sprint: **「前端排休／請假 UI 與老闆審核接線」**, using only the accepted route and commands above; include employee quota/status and same-store overview, manager pending/processed review, confirmed approve/reject actions, mobile privacy display, a new non-Production Draft, and iPhone acceptance.

## Historical handoff snapshot — 2026-07-25

更新日期：2026-07-25
產品程式基準：本文件所在 Commit（本輪驗收起始 Commit：`b47eceec6356fc0b1c70e4784ef4ba29a4fe9b63`）

## 最近完成的 Sprint

**Staging PWA Cache／Service Worker 首次載入修正**

- 以同一 localhost origin 先安裝舊 PostgreSQL Staging Worker，再置換成 Google Sheets Staging，完整重現第一次載入仍顯示 `STAGING POSTGRES`。
- 證實舊 Worker 會以全域 Cache Storage 的 cache-first 命中未版本化 `environment-config.js`／Manifest，造成新 HTML 與舊環境資源混用。
- build 現在為環境設定與 Manifest 加入各 cache build 專屬版本 URL；Worker 僅讀取目前 cache；Staging activation 清除同 origin 的另一個 Staging 變體 cache。
- Worker 註冊使用 `updateViaCache: 'none'`，避免更新檢查受舊 HTTP cache 影響。
- 修正後第一次切回、重新整理、雙向 Staging 變體更新與離線 app-shell 回復均保持正確環境。
- 未修改或部署 Production；未修改資料庫、Migration、Auth0、Neon、Google Sheets 或 Apps Script。

## 測試與驗收結果

- 桌機瀏覽器老闆／員工 UI：PASS。
- Auth0 Staging PKCE、Session Claim、角色與 Workspace 範圍：PASS。
- PostgreSQL read/bootstrap 與 mutation persistence：PASS。
- Revision、Session、Membership、跨 Workspace 與直接資料表拒絕：PASS。
- 無網路、bounded timeout、重複操作與無靜默 backend fallback：PASS。
- Snapshot reconciliation 與測試資料恢復：PASS。
- Service Worker／Cache namespace 隔離及 Google Sheets Staging rollback：PASS。
- 舊 PostgreSQL Worker 控制下第一次載入 Google Sheets Staging：PASS。
- 重新整理、Worker 更新、Google Sheets／PostgreSQL 雙向切換與離線回復：PASS。
- 自動回歸：29／29 PASS；品質檢查：PASS。
- Browser Console JavaScript error：未發現。
- 真實手機／平板／macOS 矩陣：**尚未執行，不得視為 PASS**。

## 2026-07-24 裝置矩陣執行紀錄

- 品質檢查：PASS。
- 自動回歸：29／29 PASS。
- 敏感資訊掃描：追蹤檔 0 個疑似 Token／Private Key 命中。
- Windows Chrome 真瀏覽器：
  - 未登入首頁、STAGING 識別、登入按鈕、重新整理及 Console：已執行。
  - 390×844、360×800、768×1024、1280×800 輔助 viewport：無水平溢位；此結果不得代替真實行動裝置。
  - 首次開啟舊 `STAGING POSTGRES` 快取問題已完成自動重現與修正；相同舊 Worker 狀態下第一次載入即顯示 Google Sheets `STAGING`。
  - 未取得人工 Auth0 測試身分操作，因此登入後老闆／員工、Session、Membership 與 Workspace 流程尚未驗收。
- Windows Edge、iPhone Safari／PWA、Android Chrome／PWA、iPad Safari、Android Tablet Chrome、macOS Safari／Chrome：缺少可操作的指定真實裝置或瀏覽器，標記 `BLOCKED`。
- 本輪只修改 PWA build／Service Worker 與相關回歸測試；沒有資料庫、Migration、Deploy 或 Production 異動。

## 2026-07-25 裝置矩陣續驗紀錄

- 沿用既有 Draft `https://6a63614eb402881cdc7fd7f2--inspiring-sunshine-9eab99.netlify.app/`；未重建 Site、未建立新 Draft、未部署 Production。
- Windows Chrome：
  - 真實瀏覽器第一次載入及重新整理均為 Google Sheets `STAGING`，沒有 `STAGING POSTGRES`，版本化 Manifest 正確，Console error 0。
  - Auth0 Staging allowlist 完成後，真實 PKCE 回呼、Access Token Session Claim 與 Auth0 `sid` 一致性均通過。
  - 重新整理後 Staging 驗證頁因 `cacheLocation: memory` 回到登入按鈕；再次登入可沿用 Auth0 Provider Session 且重新驗證 Claim。完整老闆／員工產品 UI、PWA 安裝及登出仍缺人工證據。
- Windows Edge：
  - 真實 Edge 引擎以隔離設定檔完成第一次載入及第二次載入；均顯示 `STAGING`、未顯示 `STAGING POSTGRES`，版本化 Manifest、Service Worker、Cache Storage 及 Script Cache 均有證據。
  - 互動式 Auth0、PWA 安裝、Narrator、高對比與完整核心流程仍為 `BLOCKED`。
- Draft 公開資產確認 `dataBackend=google_sheets`、未含 PostgreSQL Endpoint；PWA id／start URL 與 Staging cache identity 正確。
- 品質檢查 PASS；29／29 自動回歸 PASS。iPhone、Android、iPad、Android Tablet、macOS Safari／Chrome 因無指定真實裝置，維持 `BLOCKED`，不得視為 PASS。
- 沒有程式、資料庫、Migration、Production、Google Sheets 或 Apps Script 異動；僅更新本輪驗收文件。

## Git 與環境唯讀健康檢查摘要

以下為交接時已提供的唯讀確認，不包含 Secret 或憑證：

- 本輪開始時 GitHub `main` 已同步，驗收基準 HEAD 為 `701169468407df9a9965e9b9e325ecef1d120326`。
- 文件中的最新專案完成度為 86%，唯一下一優先工作為真實裝置矩陣驗收。
- Render Staging 可連線；受保護驗收操作需要合法授權。
- Netlify 固定 Draft 目前為 Google Sheets `STAGING`。
- 未發現明確程式 P0 技術債；掃描到的 `TODO` 僅存在於治理規範文字，不代表未完成程式。
- 架構成熟度約 85%，Production 準備度約 75%。

## 架構成熟度與 Production 準備度

- 專案整體完成度：**86%**。
- 架構成熟度：約 **85%**；身分、租戶、資料、環境與回滾邊界已建立並有 Staging 證據。
- Production 準備度：約 **75%**；尚缺裝置矩陣、監控／告警、CI/CD、發布操作與最終 release candidate 驗收。
- Production 判定：**不可上線**。最近 Sprint 未修改或部署 Production。
- Migration `0009`／`0010` 未套用，不得在裝置矩陣 Sprint 中執行。

## 已知 BLOCKED 項目

- 真實 iPhone、Android、iPad、Android Tablet 與 macOS 瀏覽器需要人工裝置／瀏覽器操作，不能用 viewport 模擬冒充通過。
- Windows Chrome 已完成真實 PKCE 與首次／重新載入，但完整老闆／員工產品 UI、PWA 安裝與登出仍需人工驗收。
- Windows Edge 已完成真實引擎首次／第二次載入與 PWA 儲存建立；互動式 Auth0、PWA 安裝、Narrator、高對比及完整核心流程仍需人工驗收。
- Render Staging 的受保護 API 驗收需要合法 Auth0 Staging 測試身分與有效 Membership；不得略過或偽造授權。
- 固定 Draft 目前已回滾為 Google Sheets `STAGING`。若本次矩陣需要重驗 PostgreSQL，必須先依既有可回復 runbook 取得明確核准並建立隔離 Draft，不得直接切換 Production。
- Safari Service Worker／Cache、PWA 安裝、背景／前景與動態字級尚缺真實裝置證據。
- Production observability、CI/CD、發布後監測與正式 release approval 尚未完成。

目前沒有已知 P0 程式阻擋；上述項目是驗收／營運閘門，未完成前仍禁止 Production 發布。

## 下一個 Sprint 的開始條件

1. 本機 `main` 與 `origin/main` 同步，並記錄要驗收的確切 Commit 與 Draft URL。
2. 準備 [`docs/NEXT_SPRINT.md`](NEXT_SPRINT.md) 列出的八種真實裝置／瀏覽器；缺少的項目必須標記 `BLOCKED`，不得以模擬器替代。
3. 使用合成的 Auth0 Staging 老闆、員工與第二 Workspace 身分；不得把密碼、Token 或個資寫入文件／Log。
4. 驗收前確認 Draft 顯示 `STAGING`、所有請求只指向核准的 Staging 服務、Render readiness 正常且 Production 未被存取。
5. 建立可重複的乾淨基線與 rollback 條件，記錄 Service Worker、Cache、storage、Session namespace 與初始 Snapshot revision。
6. 確認不需要 Migration；`0009`／`0010` 保持 pending。
7. 準備逐裝置截圖、Network／Console 摘要與 PASS／FAIL／BLOCKED 記錄，但不得包含 Secret、Token、Session ID 或真實個資。

未滿足開始條件時，只能回報 `BLOCKED`，不得修改 Production、套用 Migration 或自行開始其他 Sprint。
