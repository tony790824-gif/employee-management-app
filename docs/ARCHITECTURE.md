# 班客邦 Current Architecture

## PostgreSQL frontend integration status — 2026-07-20

The active product path remains `PWA -> Apps Script -> Google Sheets`. A browser transport factory for the formal `Node API -> Auth0 -> PostgreSQL controlled functions` path is now packaged and tested, but is deliberately inert: `dataBackend` remains `local_preview` or `google_sheets`, and `postgresApiUrl` is empty in every committed environment profile.

The factory is a strangler-boundary preparation, not a cutover. It centralizes HTTPS-only transport, bearer/session failure handling, Workspace request scope, idempotency, byte limits and timeouts without giving the client authority over tenant membership. The server and database must continue to derive authorization from verified subject, active Session and live Membership.

Activation remains blocked until an isolated Staging Node API is deployed, the complete read/bootstrap surface is available, migration reconciliation/rollback is rehearsed, and boss/employee E2E proves no fallback or cache contamination. Production and the existing Netlify Draft Preview were not deployed or modified.

更新日期：2026-07-20  
文件性質：目前實作盤點；本文件不變更既有架構決策，決策仍以 `docs/adr/` 為準。

## 執行路徑

1. **現行過渡產品路徑**：Vanilla JavaScript PWA → 環境專屬前端設定 → Google Apps Script → Google Sheets A1 snapshot。此路徑仍維持相容，未因本次整理而部署或切換。
2. **正式後端遷移路徑**：Node.js HTTP API → Auth0 OIDC/JWKS 驗證 → PostgreSQL 受控 Function → FORCE RLS 多租戶資料表。Production schema 與最小權限 database role 已建立，但前端尚未切換。
3. **安全事件路徑（尚未建立雲端資源）**：Auth0 partner event → EventBridge → SQS/DLQ → Lambda → PostgreSQL security event inbox → session revoke/compromise。程式、IaC、可重現 Artifact 與本機測試已存在；真實 AWS Staging stack 與 E2E 尚未完成。

## 模組責任

- `index.html`、根目錄 `*.js`／`*.css`：過渡 PWA 與角色介面。
- `state-store.js`：前端 snapshot 的單一正規化與本機持久化入口。
- `management-actions.js`：老闆端員工、班次、出勤異動的共用入口。
- `google-sheets-backend.gs`：過渡 Apps Script command/session/snapshot 邊界。
- `config/`、`scripts/build.mjs`：Local／Staging／Production 靜態建置隔離。
- `server/`：正式 OIDC、tenant context 與 Transaction/Command API。
- `database/`：版本化 migration、角色權限、snapshot importer 與驗證工具。
- `security-events/`、`infrastructure/aws/`：Staging 安全事件 consumer 與 IaC。
- `tests/`：前端 P0、Apps Script、PostgreSQL、OIDC、事件與 Artifact 防回歸測試。

## 依賴與重複盤點

- Runtime dependencies `pg`、`@aws-sdk/client-secrets-manager` 與 dev dependency `fflate` 均有實際引用；本次未發現可安全移除的套件。
- 未發現未被建置白名單、Runbook、package script 或 runtime loader 引用的正式來源檔。
- `0006_session_token_boundary.up.sql` 與 `0008_session_subject_binding.down.sql` 內容相同是刻意的 migration rollback 快照，不是可刪除的重複檔。
- `normalizedHost`、`stableJson`、`validDate`、grant-script quoting 等小型 helper 在不同信任邊界重複。立即合併會同時影響 migration、runtime、security event 與驗收工具；列為受控重構技術債，不在清理 Sprint 改動。
- `docs/adr/0011-frontend-management-consolidation.md` 與 `docs/adr/0011-request-and-snapshot-validation.md` 存在歷史編號重複。ADR 路徑已被歷史文件引用，本次不重新編號；後續新增 ADR 必須使用未占用號碼。

## 不變條件

- 不擴大 Google Sheets 成為正式 primary database。
- 不以 client workspace claim 或可自行設定的 custom GUC 作唯一授權來源。
- 不讓 runtime API role 直接讀寫業務表。
- Local、Staging、Production 的設定、storage、session、PWA cache 與 credentials 必須隔離。
- 未完成真實 Staging／跨裝置／營運閘門前，不得把本機測試標示為 Production 驗收。

