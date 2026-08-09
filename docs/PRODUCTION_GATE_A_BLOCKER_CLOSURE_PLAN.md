# Sprint 42 — Production Gate A Blocker Closure Plan

日期：2026-08-09

狀態：**COMPLETE AS FAIL-CLOSED PLAN / GATE A DEFER / PRODUCTION NO-GO**

Production Readiness：**70% / NOT READY**

本計畫把現有 Production（正式環境）阻擋轉成可逐項驗證的執行清單。它不授權購買、升級、建立資源、修改平台設定、Deploy（部署）、Migration（資料庫遷移）、資料庫寫入、DNS 變更、Secret（秘密資訊）操作或流量切換。沒有直接、目前且已授權的證據時，一律維持 `PARTIAL`、`BLOCKED`、`NOT_CONFIGURED` 或 `UNKNOWN`。

## 1. 判定層級

Production Provisioning 的阻擋分成三層，避免把後續 Gate 誤當成 Gate A 已可執行：

1. **Gate A decision blockers（Gate A 決策阻擋）**：完整成本邊界、Neon 帳戶用量、必要營運成本、owner 預算與隔離架構接受度。
2. **Gate A execution prerequisites（Gate A 執行前置）**：Auth0 當下報價、付款／取消風險、Tenant 所有權與復原、Production 命名及獨立 Tenant/SPA/API 的單一步驟授權。
3. **Downstream Gates B–G / Release blockers（後續建置與發布阻擋）**：Neon recovery/schema、Render、Netlify、DNS/TLS、監控、Secrets、Migration、Web Push、裝置與回滾。這些不因 Gate A 未來獲准而自動獲准。

## 2. Blocker inventory（阻擋清單）

| ID / 範圍 | CURRENT STATUS | REQUIRED ACTION | EXTERNAL / REPOSITORY | COST IMPACT | RISK | EVIDENCE REQUIRED | OWNER / HUMAN ACTION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GA-01 Cost / Billing | **PARTIAL** | 取得 Neon 完整 billing period 的 plan、CU-hours、storage/history/snapshot/network 與非敏感金額；確認 Domain、監控、DR 與稅的預算邊界；owner 接受「US$49 固定下限＋變動／未知」 | External evidence + Repository model | **UNKNOWN**；已知固定下限 US$49/月、US$588/年 | 未知成本被誤當零、超額或中斷 | 帳戶唯讀用量、供應商當下報價、owner 明確預算接受 | **YES**；只讀證據與決策，禁止購買 |
| AUTH-01 Auth0 Production capacity | **BLOCKED**；Free 只有 1 Tenant 且已由 Development 使用 | 購買前重查 Essentials entitlement／US$35 quote、billing cycle、取消／降級與 Tenant retention；提出單一 Gate A 授權 | External | **REQUIRED_PAID candidate：US$35/月**，購買前重查 | 共用 Tenant 破壞隔離；錯誤購買或不可逆設定 | 當下 plan/Tenant entitlement、owner/administrator recovery、stop/rollback 條件 | **YES**；Gate A 核准前不得升級 |
| AUTH-02 Tenant / SPA / API | **NOT_CONFIGURED** | Gate A 核准後才建立獨立 Production Tenant、SPA、API；驗證 RS256、PKCE、issuer/audience 與 exact allowlists | External + Repository validation | 包含於已核准 Auth0 plan；其他費用 **UNKNOWN** | Staging/Production 混用、錯誤 issuer、wildcard origin | Tenant environment、public metadata、client/API public設定、allowlist、無 Secret 證據 | **YES**；必須另行精確授權 |
| NEON-01 Neon Production Plan / capacity | **PARTIAL** | 先取得唯讀 billing/usage 與峰值/headroom；Gate B 才能決定 paid plan、autoscaling 與 retention | External; read-only evidence可先做 | Usage-based；精確值 **UNKNOWN** | 費用失控、冷啟動或容量不足 | 完整 billing period、CU/storage/history/network、接受門檻與告警 | **YES**；唯讀可先做，設定變更須 Gate B |
| NEON-02 Neon Backup / Restore / DR | **PARTIAL / BLOCKED** | 先決定 RPO/RTO、snapshot/retention 成本；Gate B 核准後建立隔離 snapshot/restore evidence，禁止 live restore | External + Runbook | Snapshot/history/branch/compute 與演練成本 **UNKNOWN** | 無可驗證復原、資料遺失或破壞正式 branch | Scheduled snapshot、獨立備份、隔離 restore、RPO/RTO、清理證據 | **YES**；resource/config/restore 需獨立授權 |
| NEON-03 Schema / Migration parity | **PARTIAL**；Production ledger 只證明 `0001`–`0008` | 先以已核准 reader 建立 schema diff／Migration manifest；Gate F 才可 apply exact checksums | Repository + External read-only metadata | Repository 分析 US$0；執行／停機成本 **UNKNOWN** | Schema 不相容、資料或 rollback 風險 | Current catalog/ledger、pending清單、checksums、相容／rollback或forward-fix、備份 PASS | **YES**；Migration 明確禁止至 Gate F |
| RENDER-01 Render Production API / Worker | **NOT_CONFIGURED** | Gates A/B 後才建立獨立 API 與 Push Worker；Auto Deploy 首次預設 OFF | External + Repository config | 已知規劃下限 **US$14/月**；頻寬／workspace／overage **UNKNOWN** | 使用 Staging credential、錯 DB、無 rollback | Service identity、runtime、commit、build/start、env presence、health/readiness、logs、CORS | **YES**；Gate C 獨立授權 |
| NETLIFY-01 Netlify Production Frontend | **NOT_CONFIGURED**；現有只有 Preview，當前帳戶 Free | Gates A–C 後才建立 immutable Production candidate；先採 deployment credit budget，不發布流量 | External + Repository artifact checks | 現行固定 **US$0**；容量／未來升級 **UNKNOWN** | Credits 耗盡暫停、錯環境資產、無 rollback | Commit/deploy ID、`dataBackend=postgres`、Production-only public config、headers/cache/deep routes、rollback artifact | **YES**；Gate D 獨立授權 |
| DNS-01 Domain / DNS / TLS | **UNKNOWN / NOT_CONFIGURED** | 購買前選 TLD/registrar並取得 initial/renewal quote；Gates A–D 後才變更 DNS/TLS | External | Domain **UNKNOWN**；DNS/TLS 可有 US$0 candidate 但未選定 | Domain 所有權、TLS/origin mismatch、流量誤切 | Registrar/TLD quote、owner、舊/新 record、TTL、certificate、HTTPS/HSTS、rollback | **YES**；購買與 Gate E 均需授權 |
| OPS-01 Monitoring / Alerting / Logging | **PARTIAL / BLOCKED** | 在零資源變更下先選最低 provider方案、SLO、threshold、retention、named responder；建立資源後驗證 alert delivery | Repository + External | Free tier candidate；on-call／長期 logs／overage **UNKNOWN** | 故障無告警、資料留存不足、無負責人 | Dashboard、alert route、測試事件、ack/escalation、retention與access evidence | **YES**；選型可先做，外部配置需相應 Gate |
| SEC-01 Secrets / Credentials | **PARTIAL / NOT_CONFIGURED** | 先完成變數名稱、owner、scope、rotation/rollback inventory；資源建立時才在平台 Secret store 產生／設定 | Repository + External | 通常包含於平台；KMS／管理工具 **UNKNOWN** | Secret 洩漏、role reuse、跨環境綁定 | Presence boolean、scope/expiry、public fingerprint；禁止輸出值 | **YES**；每個平台 Gate 內獨立處理 |
| PUSH-01 Production Web Push | **NOT_CONFIGURED** | Gate C 建立 Production-only VAPID pair、Push role/worker/env；Gate D 只嵌入 public key | External + Repository validation | Worker已列 Render下限；provider transport US$0 candidate；overage **UNKNOWN** | Staging key重用、錯 subscription、無配送／隱私外洩 | VAPID fingerprint parity、worker readiness、subscription/session/workspace isolation、404/410 cleanup、真機 evidence | **YES**；不得先建 key/worker |
| REL-01 Release / Rollback / Devices | **BLOCKED** | 各資源存在後完成 immutable candidate、public evidence、告警、isolated restore、Migration plan、Windows/Android/iPhone/iPad matrix與 rollback rehearsal | Repository + External + physical devices | 人工／平台演練成本 **UNKNOWN** | 無法安全回滾、裝置回歸、誤切流量 | Full Release Checklist、evidence hashes、device records、rollback times、owner Gate G | **YES**；Gate G 另行授權 |

`NEON-ROLE-ACL` 已由 Sprint 34 direct evidence 證明為 `PASS`，不是目前 blocker；必須保留 reader、API、migrator、Push、owner 的角色隔離。Repository Build／Test PASS 也不能取代上述外部證據。

## 3. Zero-resource closure（不建立 Production Resource 即可先完成）

以下可在 Gate A 仍為 DEFER 時依序完成，但每一步仍只可讀或修改 Repository 文件：

1. Neon Production `Billing → Usage` 唯讀證據與成本公式代入。
2. 選定候選 TLD／registrar，取得 initial／renewal／tax quote；不購買 Domain。
3. 選定 monitoring／alerting／logging 的最低安全方案、留存、接收人、SLO 與成本；不建立 integration。
4. 定義 backup/snapshot/restore policy、RPO/RTO、隔離演練預算與清理方式；不建立 snapshot/branch。
5. 以既有 Production reader 執行另行授權的 catalog-only schema parity；不執行 Migration。
6. 建立 Secret name/scope/owner/rotation/rollback inventory；不產生或讀取 Secret 值。
7. 整合上列證據並由 owner 接受 exact fixed-plus-variable budget envelope。
8. 重新查看 Auth0 當下 quote／entitlement／billing terms，準備只能涵蓋 Gate A 的 APPROVE／DEFER 決策。

## 4. Gate A approval required（必須先取得 Gate A 授權）

下列任何動作在 Gate A 明確核准前均禁止：Auth0 upgrade/payment、Production Tenant/SPA/API 建立、Production credential/connection 建立，以及任何為該資源產生的外部設定變更。Gate A 核准也只涵蓋 Auth0 Gate A 的 exact action，不授權 Neon、Render、Netlify、DNS、Migration、restore、deploy 或 traffic。

Gates B–G 仍須各自停下並取得新的明確授權：

- **Gate B:** Neon recovery/capacity configuration與隔離 restore。
- **Gate C:** Render Production API/Push Worker與 protected variables。
- **Gate D:** Netlify immutable Production candidate，無 traffic。
- **Gate E:** Domain/DNS/TLS與 exact origins。
- **Operations closure:** monitoring/alerts/logging/backup evidence。
- **Gate F:** exact Production Migration manifest/checksums/apply/rollback或forward-fix。
- **Gate G:** owner go/no-go與可逆 traffic cutover。

## 5. Sprint 43+ 建議解除路線

1. **Sprint 43 — Neon Production Billing / Usage Evidence Closure（唯讀）**：取得 plan、完整期間用量與非敏感金額，更新 Minimum/Recommended 的公式；無設定或 SQL。
2. **Sprint 44 — Domain and Operations Cost Evidence Closure（唯讀／規劃）**：TLD/registrar quote、monitoring/alerting/logging選型、RPO/RTO與DR預算；不購買／不建立 integration。
3. **Sprint 45 — Production Schema Parity Read-only Plan**：只用現有 reader/catalog evidence 建立 `0001`–`0022` 差異與 Gate F manifest；不 Migration。
4. **Sprint 46 — Final Gate A Owner Decision Package**：用完成的成本、復原、營運與schema證據提出 `APPROVE` 或 `DEFER`。只有 owner 的 exact 授權可開始 Gate A execution。
5. **Gate A execution Sprint（僅於核准後）**：只處理 Auth0；完成並停下。其後 Gates B–G 仍逐一另行授權。

若任何先行 evidence 改變架構、成本或安全假設，立即停止並更新計畫，不得跳過順序。

## 6. Sprint 42 gate decision

- Sprint 42 repository plan：**COMPLETE**。
- Gate A：**DEFER**。
- Production Provisioning：**NO-GO**。
- Production Readiness：**70% / NOT READY**。
- 已知固定最低成本：**US$49/月、US$588/年**。
- Neon US$15/月只可形成 **約 US$64/月、US$768/年＋UNKNOWN** 的規劃範例，不是精確總價。
- 新增 external PASS：**NONE**。
- Production／billing／platform mutation：**NONE**。

只有 blocker 實際解除且有 direct evidence 時，Readiness 或 Gate 狀態才可改變。文件完成本身不構成 `GO` 或 `CONDITIONAL GO`。
