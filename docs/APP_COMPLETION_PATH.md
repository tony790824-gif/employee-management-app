# Bankeban APP Completion Path

本文件是目前唯一的快速上線路徑。它取代以微型 Closure Phase 反覆收集同類證據的做法，但不取代真正的資料安全控制，也不構成 Production 操作授權。

## Tooling decision

| 分類 | 工具 | 決定 |
|---|---|---|
| KEEP | `database/production-migration-event.mjs`、exact manifest、checksum、`0009` → `0011`–`0022` allowlist、逐版 transaction | 這條路徑已在 disposable PostgreSQL 18.4 演練；切換工具會增加 ledger 與 migration-history 轉換風險。 |
| KEEP, NON-BLOCKING | `database/rehearse-production-migration-upgrade.mjs`、既有 non-ACL structural comparator | 保留供 disposable rehearsal、debug 與 audit；baseline/catalog 欄位集合不相容時不得阻塞 Production。Production DB Gate 改由 APP 必要 contract 與最小 read-only smoke 判定。 |
| SIMPLIFY | `pnpm db:status:readonly` | 只做一個 `READ ONLY` transaction，讀取 identity 與 `schema_migrations(version,name,checksum)`；不再順帶做全 catalog/ACL 掃描。 |
| KEEP, NON-BLOCKING | ACL/default-ACL/semantic evidence 工具與歷史 Evidence | 保留稽核歷史，但 ACL owner split 不阻止 approved migration sequence；不得再作為 Migration event 的循環前置依賴。 |
| DELETE | 臨時 `production-migration-state-result` parser、temporary runner 與重複 tests | 未提交的重複鏈已移除；狀態查詢回到既有 `db:status:readonly`。 |
| REPLACE LATER | 未來的新 Migration authoring | Production 穩定後再評估 `node-pg-migrate`；本次不改寫既有 SQL migration、ledger 或 checksum。 |

目前 Migration runtime 繼續使用既有 `pg`（node-postgres，MIT）與 PostgreSQL transaction。`node-pg-migrate`（MIT）適合未來新 migration，且支援 PostgreSQL、transaction、advisory lock 與 grouped SQL loader；但現在引入會改變 ledger/loader/transaction 預設，無法縮短這次上線。`dbmate`（MIT）雖輕量，但 ledger 預設只保存 version，不符合目前 name + SHA-256 contract。Flyway Community 與 Liquibase Community 需要額外 Java/CLI 與 ledger 導入；Liquibase 5 又採 FSL，因此都不在快速路徑。

## Nine retained safety gates

1. event-specific restore point 存在且可辨識。
2. exact database、operator、direct endpoint identity。
3. client-side TLS certificate and hostname verification；server `pg_stat_ssl` 只可作 session TLS 旁證，不再單獨阻塞 client `verify-full` 判定。
4. fresh ledger/name/checksum 與起點一致。
5. exact sequence `0009`, `0011`–`0022`；`0010` 永久排除。
6. 任一 preflight/migration/post-check 失敗立即停止，不自動 retry。
7. 每版獨立 transaction；完成後以 fresh ledger/checksum、APP 必要 DB contract 與最小 read-only smoke 驗證，不以 structural fingerprint 阻塞。
8. API、Auth、workspace isolation、核心 UI 與 push smoke tests。
9. event-specific restore/forward-fix 路徑與當班 owner。

## Finite completion phases

| Phase | 完成條件 | 現況 |
|---|---|---|
| A — Freeze path | Migration 工具與必要 Gates 收斂，不再新增證據 runner | COMPLETE |
| B — Event preflight | read-only ledger/checksum、restore boundary、identity/TLS/manifest PASS | COMPLETE |
| C — Migration event | Production ledger 已包含 `0001`–`0009`、`0011`–`0022` 且 checksum PASS；`0010` 永久排除 | SKIPPED / ALREADY APPLIED |
| D — Minimum platform | Production-isolated Auth0、Netlify API/frontend/scheduled push secrets 與設定完成 | PENDING OWNER ACTION |
| E — Launch verification | Auth/workspace/API/PWA/push smoke、rollback ready，Owner 明確 Traffic GO | PENDING |
| F — Post-launch operations | 監控/告警、備份改善與 ACL hardening 依實際風險排程 | POST-LAUNCH |

Production 必要 schemas/tables/columns、indexes/constraints 與 APP runtime function signatures 已由 dedicated read-only contract check 驗證；核心查詢 contract 與唯讀連線正常。`Production Database = READY`。從現在到家人可正式使用，剩兩個主要階段（D–E）。Phase F 不阻塞低流量首次上線。

## Next single action

直接進入 Phase D：在既有免費 Netlify Production candidate 注入獨立 Production secrets，完成 Auth0 isolation、Functions API 與 scheduled push 設定；不得重跑 Migration，也不得再建立新的 DB parser、comparator、Phase 或 Sprint。
