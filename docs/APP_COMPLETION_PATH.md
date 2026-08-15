# Bankeban APP Completion Path

本文件是目前唯一的快速上線路徑。它取代以微型 Closure Phase 反覆收集同類證據的做法，但不取代真正的資料安全控制，也不構成 Production 操作授權。

## Tooling decision

| 分類 | 工具 | 決定 |
|---|---|---|
| KEEP | `database/production-migration-event.mjs`、exact manifest、checksum、`0009` → `0011`–`0022` allowlist、逐版 transaction | 這條路徑已在 disposable PostgreSQL 18.4 演練；切換工具會增加 ledger 與 migration-history 轉換風險。 |
| KEEP | `database/rehearse-production-migration-upgrade.mjs`、non-ACL structural pre/post check、Release Gate | 保留作為 Migration event 前後的必要安全驗證。 |
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
7. 每版獨立 transaction，完成後 fresh ledger/checksum/non-ACL structural verification。
8. API、Auth、workspace isolation、核心 UI 與 push smoke tests。
9. event-specific restore/forward-fix 路徑與當班 owner。

## Finite completion phases

| Phase | 完成條件 | 現況 |
|---|---|---|
| A — Freeze path | Migration 工具與必要 Gates 收斂，不再新增證據 runner | COMPLETE |
| B — Event preflight | 一次 read-only ledger/checksum、restore point、writes drained、operator/TLS/manifest PASS | NEXT |
| C — Migration event | 精確 13 版成功，fresh ledger/checksum/non-ACL structural post-check PASS | PENDING AUTHORIZATION |
| D — Minimum platform | Production-isolated Auth0、Netlify API/frontend/scheduled push secrets 與設定完成 | PENDING OWNER ACTION |
| E — Launch verification | Auth/workspace/API/PWA/push smoke、rollback ready，Owner 明確 Traffic GO | PENDING |
| F — Post-launch operations | 監控/告警、備份改善與 ACL hardening 依實際風險排程 | POST-LAUNCH |

從現在到家人可正式使用，剩四個主要階段（B–E）。Phase F 不阻塞低流量首次上線，但既有 PITR/restore 能力與 event restore point 仍不可省略。

## Next single action

Owner 只需授權一次合併的 Migration event：同一事件先做 B 的 read-only preflight，PASS 後立即執行 C；任何 Gate 不符即停止。不得再先建立新的 parser、Phase 或 Sprint。
