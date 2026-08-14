# Production ACL Remediation Authorization Plan

## Dedicated Production ACL pre-check runner

The Repository provides `pnpm run db:acl:production-precheck` as the only reviewed pre-check entry point. It reuses the committed `0001`-`0008` structural baseline, ACL semantic model, exact-ledger comparator and dedicated-reader identity/TLS guards. One `pg.Client` performs at most one connection attempt with retry 0 and one `READ ONLY` transaction; the runner never issues `REVOKE`, `GRANT`, `ALTER`, Migration or business-row queries.

The same connection must prove identity/TLS verify-full, exact `0001`-`0008` ledger/checksums, default-ACL owner/grantee classification, role membership, runtime-principal inventory, current-object ACL differences against the committed baseline, operator discovery or approved-operator validation, and an exact safe remediation target. Missing, ambiguous, unexpected or non-attributable facts produce `BLOCKED`; no mutation stage may start.

When `BANK_PRODUCTION_ACL_OPERATOR_ROLE` is absent, the runner enters `OPERATOR_DISCOVERY`. It evaluates only the reviewed candidates `neondb_owner`, `cloud_admin`, `banke_api_production` and `banke_production_readonly`, including LOGIN and dangerous attributes, INHERIT, membership counts, SET/ADMIN/INHERIT paths, unrelated effective paths, and existing ability to act for both the exact default-ACL owner and application-object owner. The only discovery results are `ELIGIBLE_OPERATOR_CANDIDATE`, `NO_ELIGIBLE_OPERATOR`, and `INSUFFICIENT_EVIDENCE`. A unique candidate is not approval: the overall pre-check remains `BLOCKED` with Owner approval required until the exact role is supplied in a separately authorized validation event.

Success and failure outputs use separate sanitized JSON/SHA-256 contracts. They preserve only reviewed candidate role labels, categories, counts, booleans, allowlisted object keys and fingerprints; raw OID, unknown principal identity, ACL text, connection data and CA content are prohibited. Both modes are read-only and mutation is impossible by query allowlist and `READ ONLY` transaction.

Required future process-only inputs are `DATABASE_READONLY_URL`, `BANK_PRODUCTION_CA_BUNDLE`, `BANK_PRODUCTION_DATABASE_NAME`, `BANK_PRODUCTION_READONLY_ROLE`, `BANK_ENV`, `BANK_PRODUCTION_PARITY_CONFIRMATION`, `BANK_PRODUCTION_EVIDENCE_COMMIT_SHA`, `BANK_PRODUCTION_OBJECT_OWNER_ROLE`, `BANK_PRODUCTION_PLATFORM_ROLE`, `BANK_PRODUCTION_RUNTIME_ROLES` and `BANK_PRODUCTION_ACL_PLAN_SHA256`. `BANK_PRODUCTION_ACL_OPERATOR_ROLE` is optional: omit it for discovery; supply it only after explicit Owner approval for exact-operator validation. Values must remain process-only and must never be committed.

## 結論

本文件是 Repository/local-only 的修復與授權契約，不是 Production 授權，也不是執行腳本。Sprint 編號維持封頂於 65；本次 Production connections = **0**，Production mutations = **NONE**。

Phase 2O 已證明 Production 在 `public` schema 存在 11 筆不屬於核准 `0001`–`0008` baseline 的 explicit `pg_default_acl` facts：relation 8 種權限、sequence 3 種權限，全部 `grant option=true`；baseline 的 explicit default privileges 為 0。這是已證明的 ACL semantic drift。owner-relation、target principal 分類與 runtime impact 仍未證明，所以目前不得執行任何 ACL mutation。

決策為 **READY_FOR_ONE_BOUNDED_CONDITIONAL_AUTHORIZATION**：未來可由 Owner 用「一份授權」涵蓋固定三階段（最多三個 connection attempts、每階段一次、retry=0）。第一階段任何 pre-check 不通過時，後續 mutation 與 post-check 都不得執行。這代表修復流程已可一次授權處理，但不保證 pre-check 一定允許 mutation。

## 1. 真正修復目標

### 1.1 Future-object default ACL

唯一已證明的 default-ACL target 是：

- schema：`public`
- relation：`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`
- sequence：`USAGE, SELECT, UPDATE`
- verified target principal：目前仍須在未來 pre-check 以 catalog OID 關係分類；不得從聊天、文件或 raw name 猜測
- end state：該 verified owner/target 組合在 `public` 的上述 explicit default ACL facts 為 0，與 committed `0001`–`0008` baseline 相同

### 1.2 已存在物件的 materialized ACL

`ALTER DEFAULT PRIVILEGES` 只影響未來建立的物件，不能修復已存在 relation/sequence 上已具現化的 ACL。因此同一 pre-check 必須比較目前 application object ACL 與 committed semantic baseline；若發現同一 verified target 的差異，只能對精確 application-object allowlist 逐項撤銷 baseline 不存在的權限。

禁止 `REVOKE ... ON ALL TABLES/SEQUENCES`，也禁止碰觸 Extension/platform/unreviewed objects。沒有 exact object-level diff 就不得做 existing-object mutation。

## 2. owner-relation 未證明時的禁止事項

以下任一 proof 尚未 PASS 時，mutation stage 必須是 `NOT_STARTED`：

- exact `pg_default_acl.defaclrole` owner 未證明
- explicit ACL grantee 仍是 unclassified、ambiguous 或 `PUBLIC`
- grantee 是核准 runtime、reader 或 operator role
- grantee 可透過 membership 影響核准 runtime role
- application/runtime principal inventory 不完整
- approved ACL operator 未精確識別，或必須透過新增 role membership／ownership 才能操作
- current object-level ACL impact 未完整列舉

不得用 Phase 2O 的 0/65 owner coverage 推定 raw identity，不得持久化 raw principal name/OID，也不得藉由 `ALTER ROLE`、`GRANT role` 或 `ALTER OWNER` 繞過 owner proof。

## 3. Runtime impact / affected principals proof

未來 pre-check 在 dedicated read-only transaction 中只查 reviewed catalog metadata，並產生 sanitized counts、categories、fingerprints 與 booleans：

1. 精確辨識 default ACL owner、grantee、grantor 的 OID relationship；不輸出 name/OID。
2. 將 grantee 與核准 runtime API、push worker、dedicated reader、operator、object owner 和 platform-managed role inventory 比對。
3. 展開 `pg_auth_members` 可達路徑；任何 INHERIT/SET/ADMIN 有效路徑或未分類角色都 STOP。
4. 列舉 `public` application relations/sequences 上該 grantee 的 current ACL，與 committed baseline 的 object set/fingerprint 比對。
5. 確認 target privilege 不被任何核准 runtime role直接或間接使用；證據不完整即 `ACTIVE_RUNTIME_DEPENDENCY_UNKNOWN` 並 STOP。
6. 不讀 business rows、不執行 Function、不把 raw identity 或 ACL text 寫入 Evidence。

## 4. Production pre-check

所有條件必須同時 PASS：

1. Owner 授權綁定 exact clean Commit 與本 plan SHA-256。
2. database identity、dedicated reader identity、role boundary、PostgreSQL 18、TLS verify-full 與 temporary CA PASS。
3. ledger 必須精確為 `0001`–`0008`，checksums PASS，unexpected Migration = 0；`0010` 不得存在。
4. 第 2、3 節的 owner/grantee/runtime/object-impact proof 全部 PASS。
5. mutation operator 必須是授權中明列的最小 ACL operator，且能合法對 exact default owner 操作；不得臨時提高權限。
6. transaction、advisory lock、`lock_timeout`、`statement_timeout`、sanitized Evidence/schema/hash 已準備完成。

Pre-check 產生不可變 decision hash。Mutation stage 必須核對同一事件、同一 Commit、同一 plan hash 與 `decision=PASS`；任何 mismatch 都停止。

## 5. 最小 Production mutation scope

Mutation 只允許在一個 transaction 內執行以下四類，且 identifiers 必須由已驗證 catalog OID 在記憶體中解析並安全 quote：

1. 對 verified default owner、`public`、verified target 撤銷 relation 的 8 種 explicit default privileges。
2. 對同組 owner/schema/target 撤銷 sequence 的 3 種 explicit default privileges。
3. 只對 exact allowlisted application relations 撤銷 semantic baseline 已證明不存在的 current-object privilege differences。
4. 只對 exact allowlisted application sequences 撤銷 semantic baseline 已證明不存在的 current-object privilege differences。

SQL 形狀固定為：

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE <verified_default_owner> IN SCHEMA public
  REVOKE <exact_relation_privilege_list> ON TABLES FROM <verified_target>;

ALTER DEFAULT PRIVILEGES FOR ROLE <verified_default_owner> IN SCHEMA public
  REVOKE <exact_sequence_privilege_list> ON SEQUENCES FROM <verified_target>;

REVOKE <baseline_proven_difference> ON <exact_allowlisted_object> FROM <verified_target>;
```

這些是 future-only reviewed templates，不可直接複製執行。實際 runner 必須拒絕 free-form SQL、`GRANT`、role/membership/owner change、Migration、business DDL/DML 與任何非 allowlist object。

## 6. 安全邊界與連線預算

一份 future authorization envelope 最多包含：

| Stage | Credential | Attempts | Transaction | Scope |
|---|---|---:|---|---|
| PRECHECK | dedicated Production read-only | 1 | READ ONLY | identity/TLS/ledger/catalog/ACL/runtime-impact metadata |
| CONDITIONAL_MUTATION | exact approved ACL operator | 1 | single read-write ACL-only transaction | 僅第 5 節 allowlist |
| INDEPENDENT_POSTCHECK | dedicated Production read-only | 1 | READ ONLY | fresh semantic/non-ACL/ledger verification |

總 connection attempts 上限 3；每階段 retry=0。Pre-check BLOCKED 時總數應停在 1，且 mutation/post-check 不應開始。不得使用 Owner/Admin/Migrator/API/Push/Staging credential 作替代；ACL operator 必須是單獨審查的精確角色，而非泛稱 Owner/Admin。

## 7. Stop conditions

任一條件立即 fail closed：

- authorization、Commit、plan hash、target identity 或 TLS mismatch
- ledger/checksum drift、unexpected Migration 或 `0010`
- owner/grantee unclassified、ambiguous、PUBLIC 或 runtime/reader/operator match
- membership path 擴大權限，或 runtime principal inventory 不完整
- active runtime dependency 存在或無法排除
- application object allowlist、ACL diff 或 concurrent schema/ACL drift
- operator identity/capability 不符，或需要 role/ownership change
- pre-check Evidence/hash 不完整
- advisory lock、lock timeout 或 statement timeout 失敗
- SQL 超出四類 allowlist
- in-transaction postcondition 失敗
- independent post-check Evidence/schema/hash/provenance 失敗

## 8. Rollback / forward-fix strategy

- commit 前：任一錯誤直接 `ROLLBACK`；PostgreSQL ACL/default-ACL changes 與 transaction 一起回滾。
- commit 後：預設 **forward-fix only**。不自動重新 `GRANT`，因為 drift privilege 不應被無條件恢復。
- mutation 前保存的只能是 sanitized semantic facts、counts、fingerprints 與 exact object allowlist；不得保存 raw identities/credentials。
- 若 post-check 或 runtime smoke gate 失敗，保持 traffic drained，依 incident runbook 停止；任何 exact pre-state regrant 都需要新的 emergency authorization，不在本 authorization envelope 內。

## 9. Post-remediation Evidence

獨立 dedicated reader 必須重新取得並 hash：

- identity / TLS / exact `0001`–`0008` ledger / role boundary
- non-ACL structural comparison
- ACL semantic model version、observed/expected fingerprint
- default ACL count、current-object ACL differences、unclassified-principal count
- schema validation、sanitization、source Commit、plan hash、timestamps、connection-attempt counts
- mutation stage 的 transaction outcome、exact allowlist count、rollback/commit enum

Evidence 禁止包含 raw principal、OID、ACL text、URL、hostname、credential、business rows 或 Secret。

## 10. Gate PASS 規則

`ACL_SEMANTIC=PASS` 只在以下全部成立時：

- independent post-check PASS
- ACL model version 相同
- semantic differences = 0
- observed fingerprint 等於 committed `0001`–`0008` ACL baseline
- unclassified principals = 0
- unexpected explicit default ACL facts = 0
- role boundary PASS
- sanitized Evidence schema/hash/provenance PASS

`STRUCTURAL_STARTING_BASELINE=PASS` 只在 fresh live event 同時證明：

- `STRUCTURAL_NON_ACL=PASS`
- `ACL_SEMANTIC=PASS`
- exact `0001`–`0008` ledger
- combined Evidence schema/hash/provenance PASS

`FRESH_LEDGER_AND_CHECKSUM` 不因 ACL 修復解除。Production 仍缺 `0009` 與 `0011`–`0022`，所以該 Gate 必須獨立維持 BLOCKED，直到另行授權、套用並驗證 Migration。

## 11. 下一次最小 Production 授權文字範圍

未來 Owner 授權必須明列：

- exact clean Commit 與 `production-acl-remediation-plan.expected.json` SHA-256
- 一份 conditional authorization envelope，最多三個 connections、每階段一次、retry=0
- Stage 1/3 僅 dedicated read-only、TLS verify-full、READ ONLY、catalog metadata、無 business rows
- Stage 2 僅 exact approved ACL operator、單一 transaction、四類 mutation allowlist
- 允許 Neon wake/compute/network/I/O/cache、短暫 catalog/ACL locks 與 audit/monitoring logs
- 允許本機 sanitized Evidence JSON/SHA 寫入與 process-only credential/temporary CA cleanup
- 明確排除 Migration、schema/data DDL/DML、GRANT、role/membership/ownership change、Restore、Deploy、traffic、Auth0/Render/Netlify/DNS/Billing mutation
- pre-check 任一不通過即消耗授權並停止，不得 retry 或另開 connection

本次沒有授權上述操作。

## 12. 上線仍存真正 blockers

即使未來 ACL remediation 成功，APP 仍不可上線。至少仍有：

- final Production Migration ledger/checksum：缺 `0009`、`0011`–`0022`；`0010` 永久排除
- Production Migration authorization、event-time restore point、RPO ≤15 minutes 與 execution/maintenance/traffic gates
- 獨立 Production Auth0 stack、Render API/worker、Netlify Production deploy、domain/DNS/TLS
- Production secrets/environment isolation、monitoring/alerting/logging、backup/restore/DR ownership與 launch/rollback evidence
- Gate A DEFER、Production Provisioning NO-GO、22-Gate 其餘 non-PASS items

因此本 plan 完成後 Gate matrix 仍為 **9 PASS / 13 non-PASS**，Production Readiness 仍為 **70% / NOT READY**。
