# AI Handoff

更新日期：2026-07-22
產品程式基準 Commit：`682f86b0d9f51f8a1aa145aea4a074cb7300788c`

## 最近完成的 Sprint

**可回復的 Staging 瀏覽器 PostgreSQL 資料層切換與回滾驗收**

- 固定 Netlify Draft 以隔離的 `STAGING POSTGRES` bundle 連接 Render／Neon Staging。
- 真實 Auth0 Staging 老闆與員工 Session 載入角色範圍內的 PostgreSQL bootstrap。
- 員工排假、上下班打卡與老闆核定工時完成實際持久化驗收；暫時測試值已恢復。
- 員工／班次命令接線與命令後 authoritative bootstrap refresh 通過聚焦回歸。
- Workspace B 身分無法進入 Workspace A Draft；Session、Membership、角色、直接查表及跨租戶邊界維持 fail closed。
- 無網路與 15 秒 bounded timeout 顯示明確錯誤，未靜默 fallback 至 Google Sheets；重複 mutation 由 idempotency 保護。
- Snapshot 員工、排假、出勤與 revision 完成對帳。
- 固定 Draft 最後回滾至 Google Sheets `STAGING`，PostgreSQL rehearsal 未推進 Production。

## 測試與驗收結果

- 桌機瀏覽器老闆／員工 UI：PASS。
- Auth0 Staging PKCE、Session Claim、角色與 Workspace 範圍：PASS。
- PostgreSQL read/bootstrap 與 mutation persistence：PASS。
- Revision、Session、Membership、跨 Workspace 與直接資料表拒絕：PASS。
- 無網路、bounded timeout、重複操作與無靜默 backend fallback：PASS。
- Snapshot reconciliation 與測試資料恢復：PASS。
- Service Worker／Cache namespace 隔離及 Google Sheets Staging rollback：PASS。
- Browser Console JavaScript error：未發現。
- 真實手機／平板／macOS 矩陣：**尚未執行，不得視為 PASS**。

## Cloud Shell 唯讀健康檢查摘要

以下為交接時已提供的唯讀確認，不包含 Secret 或憑證：

- GitHub `main` 已同步，HEAD 為 `682f86b0d9f51f8a1aa145aea4a074cb7300788c`。
- 文件中的最新專案完成度為 85%，唯一下一優先工作為真實裝置矩陣驗收。
- Render Staging 可連線；受保護驗收操作需要合法授權。
- Netlify 固定 Draft 目前為 Google Sheets `STAGING`。
- 未發現明確程式 P0 技術債；掃描到的 `TODO` 僅存在於治理規範文字，不代表未完成程式。
- 架構成熟度約 85%，Production 準備度約 75%。

## 架構成熟度與 Production 準備度

- 專案整體完成度：**85%**。
- 架構成熟度：約 **85%**；身分、租戶、資料、環境與回滾邊界已建立並有 Staging 證據。
- Production 準備度：約 **75%**；尚缺裝置矩陣、監控／告警、CI/CD、發布操作與最終 release candidate 驗收。
- Production 判定：**不可上線**。最近 Sprint 未修改或部署 Production。
- Migration `0009`／`0010` 未套用，不得在裝置矩陣 Sprint 中執行。

## 已知 BLOCKED 項目

- 真實 iPhone、Android、iPad、Android Tablet、Windows 與 macOS 瀏覽器需要人工裝置／瀏覽器操作，不能用 viewport 模擬冒充通過。
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
