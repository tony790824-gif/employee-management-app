# Codex Context

更新日期：2026-07-24
產品程式基準 Commit：`24e82a9886b95aa8077cf86fe2e1426458dd6cbc`

## 目前有效狀態

- 專案整體完成度：**85%**。
- 架構成熟度：約 **85%**。
- Production 準備度：約 **75%**。
- 正式上線判定：**No**；尚缺真實裝置矩陣、Production 監控／CI/CD 與最終發布驗收。
- 固定 Netlify Draft 已由 `STAGING POSTGRES` 回滾為 Google Sheets `STAGING`，目前不是 PostgreSQL 切換候選版本。
- Production 前端、API、Auth0、PostgreSQL 與資料均未因最近的 Staging 驗收而修改或部署。
- Migration `0009`／`0010` 尚未套用，且不屬於下一個 Sprint。

## 已完成的主要架構與驗收

- Local／Staging／Production 前端設定、PWA identity、Service Worker、Cache、localStorage 與 Session namespace 已隔離。
- Auth0 Staging 已完成 Authorization Code + PKCE S256、RS256、OIDC Discovery、JWKS、namespaced Session Claim 與 Token Lifecycle 驗收。
- PostgreSQL 已建立 Workspace、Membership、Session、角色、FORCE RLS、最小權限 API Role 與受控 Function 邊界。
- Render Staging Node API 與 Neon Staging 已完成 readiness、最小權限與 `0011_ui_bootstrap` 驗收。
- 老闆／員工 read/bootstrap、角色資料範圍、Session／Membership 即時檢查及跨 Workspace 拒絕已在隔離 Staging 通過。
- 固定 Draft 曾完成可回復的桌機瀏覽器 PostgreSQL 資料層切換；排假、打卡、老闆核定工時、員工／班次命令接線、資料對帳、弱網／逾時與 rollback 均有驗收證據。
- rollback 後已確認 Draft 回到 Google Sheets `STAGING`、正常 Staging cache namespace，且瀏覽器 Console 無 JavaScript error。

## 2026-07-24 裝置矩陣自動驗收進度

- `main`、`origin/main` 與基準 Commit `24e82a9886b95aa8077cf86fe2e1426458dd6cbc` 已確認一致。
- 既有品質檢查通過；29 組自動回歸測試全部通過；追蹤檔敏感資訊掃描未發現 Token／Private Key 類型內容。
- Windows Chrome 真瀏覽器已完成未登入首頁、重新整理、Console 與響應式基礎檢查；390×844、360×800、768×1024、1280×800 輔助 viewport 均無水平溢位，登入按鈕可操作。
- 輔助 viewport 只能作為版面預檢，不能取代 iPhone、Android、iPad、Android Tablet 或 macOS 的真實裝置 PASS。
- Windows Chrome 首次開啟固定 Draft 時曾載入舊的 `STAGING POSTGRES` Service Worker 畫面；重新整理後切回正確的 Google Sheets `STAGING`，Console 無 error／warning。此首次載入的舊快取風險尚未完成真機矩陣驗收，不能視為已修正。
- 因缺少人工 Auth0 測試登入及指定真實裝置，老闆／員工登入後核心流程、PWA 安裝、觸控、Session 失效、角色與跨 Workspace 實機證據仍為 `BLOCKED`。
- 本輪未修改程式碼、資料庫、Migration、Build、Deploy、Production、Auth0、Neon 或正式資料。

## 下一個唯一最高優先 Sprint

**完成 Staging 真實裝置人工矩陣與舊 Service Worker 首次載入驗收**

延續同一驗收範圍，在指定真實手機、平板與桌面瀏覽器補齊登入後核心流程、PWA 安裝、觸控、可及性、Session／Membership 失效、跨 Workspace 與舊 Service Worker 首次載入證據。不得藉此新增功能、套用 Migration、切換資料來源或推進 Production。

執行規格以 [`docs/NEXT_SPRINT.md`](NEXT_SPRINT.md) 為準。

## 已知風險

- Safari 的 Service Worker 更新、Cache 失效、返回前景與安裝後版本切換尚缺真實裝置證據。
- Windows Chrome 曾在首次開啟固定 Draft 時呈現舊 `STAGING POSTGRES` 快取，重新整理後才恢復 Google Sheets `STAGING`；需以乾淨與既有安裝兩種真機狀態確認更新／回滾行為。
- 真實觸控、鍵盤遮擋、動態字級、旋轉與不同尺寸的響應式畫面尚未完成矩陣驗收。
- Google Sheets 與 PostgreSQL 過渡資料層並存，環境設定或快取污染可能造成錯誤後端或靜默 fallback。
- Production 監控、告警、CI/CD、發布 runbook 與發布後觀測尚未完成。
- Render Staging 可連線，但受保護操作仍需要合法的 Staging 授權；不得繞過授權取得驗收結果。

## 穩定範圍：禁止任意修改或重新分析

除非有可重現缺陷、正式安全發現或使用者明確改變範圍，下列項目視為已驗收基線：

- 已確認的 Production Architecture 與環境隔離原則。
- Auth0 Staging PKCE、OIDC／JWKS、RS256、Session Claim 與 Token Lifecycle 邊界。
- PostgreSQL Workspace／Membership／Session／RLS／受控 Function／最小權限 API Role 邊界。
- Neon Staging `0011_ui_bootstrap`、Render readiness 與既有 tenant context key 的同步結果；不得重新產生 key。
- 桌機瀏覽器可回復的 PostgreSQL cutover、資料對帳與 Google Sheets Staging rollback 證據。
- Google Sheets／Apps Script 過渡路徑及已驗收核心老闆／員工功能。
- Local／Staging／Production 的 PWA、Cache、storage 與 Session namespace 分離。
- 既有發布閘門、敏感資訊保護與「Production 未經明確核准不得修改／部署」規則。

真實裝置驗收若發現缺陷，只記錄證據並依停止條件中止；不得在同一驗收 Sprint 擴大重構穩定範圍。
