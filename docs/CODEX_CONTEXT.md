# Codex Context

更新日期：2026-07-24
產品程式基準：本文件所在 Commit（上一個驗收 Commit：`701169468407df9a9965e9b9e325ecef1d120326`）

## 目前有效狀態

- 專案整體完成度：**86%**。
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
- Google Sheets／PostgreSQL Staging 共用 Draft origin 的 PWA 更新邊界已補強：環境設定與 Manifest 使用各 build 專屬版本 URL，Service Worker 僅從目前 cache 讀取，Staging activation 會淘汰同 origin 的另一個 Staging 變體 cache。

## 2026-07-24 PWA Cache／Service Worker 修正結果

- 根因已在同一 localhost origin 重現：舊 PostgreSQL Worker 對未版本化的 `environment-config.js`／Manifest 使用全域 Cache Storage 的 cache-first 命中，導致新版 Google Sheets HTML 與舊環境資源混用。
- 修正後，以仍受舊 PostgreSQL Worker 控制的瀏覽器第一次切回 Google Sheets Staging，即直接顯示 `STAGING`；不需要人工重新整理才能恢復。
- 同 origin 的 Google Sheets → PostgreSQL → Google Sheets 雙向更新、重新整理、Worker 更新與停止伺服器後的離線 app-shell 回復均維持正確環境識別。
- 品質檢查通過；29／29 自動回歸通過；Staging build 產生版本化環境設定與 Manifest，且 cache cleanup 不會觸及 Local 或 Production prefix。
- 本輪未修改資料庫、Migration、Production、Auth0、Neon、Google Sheets、Apps Script 或正式資料，也未部署 Production。
- 真實裝置、PWA 安裝、Safari lifecycle、人工 Auth0 老闆／員工登入後流程仍須由下一個裝置矩陣 Sprint 驗收。

## 下一個唯一最高優先 Sprint

**完成 Staging 真實裝置人工矩陣**

在指定真實手機、平板與桌面瀏覽器補齊登入後核心流程、PWA 安裝、觸控、可及性、Session／Membership 失效、跨 Workspace，並以既有安裝與乾淨瀏覽器複驗已修正的 Service Worker 首次載入行為。不得藉此新增功能、套用 Migration、切換資料來源或推進 Production。

執行規格以 [`docs/NEXT_SPRINT.md`](NEXT_SPRINT.md) 為準。

## 已知風險

- Safari 的 Service Worker 更新、Cache 失效、返回前景與安裝後版本切換尚缺真實裝置證據。
- Windows Chrome 的同 origin 舊快取缺陷已完成自動重現與修正；仍需以固定 Draft 的乾淨與既有安裝狀態完成人工驗收，才能取得真實裝置證據。
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
