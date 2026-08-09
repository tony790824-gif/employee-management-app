# Sprint 45 — Production Domain/TLD Quote Evidence Closure

日期：2026-08-09

狀態：**COMPLETE AS READ-ONLY DOMAIN QUOTE EVIDENCE / GATE A DEFER / PRODUCTION NO-GO**

Production Readiness：**70% / NOT READY**

本文件只保存官方公開頁面的非敏感方案與價格摘要。沒有購買、預訂或把網域加入購物車，也沒有建立帳號或整合、設定告警、連接日誌、建立快照／分支、執行還原、修改 DNS、部署、Migration、SQL、Secret 或任何 Production 資源。公開價格與可用性必須在日後採購授權前重新確認。

## Sprint 45 owner-selected quote candidate

Owner 指定的唯一候選為 **`bankeban.com`**（`.com`）。Verisign `.com` RDAP 在 2026-08-09 回傳 HTTP 404，代表查詢當下沒有該名稱的 registry domain object；Porkbun 公開、未登入的搜尋頁同時顯示可註冊的普通 `At Cost` 結果。

| 欄位 | 唯讀證據 | 判定 |
| --- | --- | --- |
| Domain / TLD | `bankeban.com` / `.com` | `OWNER-SELECTED QUOTE CANDIDATE` |
| Registrar quote | Porkbun 公開搜尋 | `EVIDENCED` |
| Availability | Registry 無現有物件，registrar 顯示可註冊 | `AVAILABLE_AT_QUOTE_TIME` |
| Standard / Premium | 普通 `.com` At Cost 列，未標示 Premium | `STANDARD / NON-PREMIUM AT QUOTE TIME` |
| 首購 | **US$11.08 / 1 年** | `EVIDENCED PUBLIC QUOTE` |
| 續約 | **US$11.08 / 年** | `EVIDENCED PUBLIC QUOTE` |
| 費用邊界 | Porkbun 公開頁聲明非 Premium 單年價格含 ICANN 與其他 fees | `PUBLIC TERMS` |

來源：Verisign `.com` RDAP（`https://rdap.verisign.com/com/v1/domain/bankeban.com`）與 Porkbun 公開 pricing/search（`https://porkbun.com/products/domains`）。可用性與報價會變動，日後如獲購買授權，必須在付款前重新確認。

## 1. Domain / DNS / TLS

| 項目 | 目前證據 | 成本 | 判定 |
| --- | --- | --- | --- |
| Production domain / TLD | `bankeban.com` / `.com`，僅作報價候選 | 首購 US$11.08；續約 US$11.08/年 | `QUOTE EVIDENCE PASS / NOT PURCHASED` |
| Registrar 報價 | Porkbun 公開搜尋，普通非 Premium `.com` | USD、1 年 | `EVIDENCED / RECHECK BEFORE PURCHASE` |
| Authoritative DNS 候選 | Cloudflare Free／Pro／Business 不按 DNS query 收費 | US$0 candidate | `PARTIAL / NOT SELECTED` |
| Managed TLS 候選 | Netlify-managed HTTPS certificate 對所有 Netlify sites 免費並自動續期 | US$0 candidate | `PARTIAL / NOT CONFIGURED` |

Cloudflare Registrar 仍可作未來比較候選，且會鎖定 Cloudflare nameservers；這是營運限制，不是購買建議。本 Sprint 的精確 Bankeban 報價只採 Porkbun 當下公開結果，未把其他 registrar 的促銷價混入。

官方來源：

- [Cloudflare Registrar registration](https://developers.cloudflare.com/registrar/get-started/register-domain/)
- [Cloudflare Registrar renewal](https://developers.cloudflare.com/registrar/account-options/renew-domains/)
- [Cloudflare DNS FAQ](https://developers.cloudflare.com/dns/faq/)
- [Netlify HTTPS / SSL](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/)

## 2. Monitoring / Alerting / Logging

### 最低可行候選（尚未核准或配置）

Bankeban 至少需要四個外部檢查面：Frontend HTTPS、API readiness、Push Worker heartbeat／queue freshness，以及資料庫／供應商狀態；同時保留平台內部 metrics 與結構化 logs。告警需有一位具名 responder（負責人），以 email 為最低路徑，Slack 可作第二路徑。實際 responder 人工成本仍為 **UNKNOWN**。

| 能力 | 官方公開候選 | 已知價格／限制 | 判定 |
| --- | --- | --- | --- |
| External monitoring + basic alerting | Better Stack Free | US$0；10 monitors/heartbeats、1 status page、Slack/email alerts | `PARTIAL / NOT CONFIGURED` |
| Error monitoring | Better Stack Free | US$0；每月 100,000 exceptions；公開頁面列 90-day error retention | `PARTIAL / NOT CONFIGURED` |
| Logs | Better Stack Free | US$0；3 GB/月、保留 3 天 | `PARTIAL / NOT CONFIGURED` |
| Metrics | Better Stack Free | US$0；30 GB included | `PARTIAL / NOT CONFIGURED` |
| Paid telemetry candidate | Better Stack Nano | US$30/月，或年繳折算 US$25/月；40 GB logs/traces/metrics，logs 30 天 | `OPTIONAL_PAID / NOT APPROVED` |
| Telemetry overage | Better Stack public rates | ingestion US$0.10/GB；retention US$0.05/GB-month；query boost US$0.001/GB scanned | `USAGE_BASED` |
| Paid responder candidate | Better Stack Responder | US$34/月，或年繳折算 US$29/月 | `OPTIONAL_PAID / NOT APPROVED` |
| Render service events | Render email／Slack | 可涵蓋 deploy/build failure、unhealthy/healthy；Production Service 尚不存在 | `PARTIAL / COST NOT SEPARATELY ESTABLISHED` |
| Render service logs | Render dashboard | Hobby 7 天、Pro 14 天、Scale/Enterprise 30 天；每個 instance 最多 6,000 app log lines/min | `PARTIAL / PRODUCTION PLAN UNKNOWN` |
| Render service metrics | Render dashboard | CPU、memory、HTTP 等依 service/plan 提供；Production Service 尚不存在 | `PARTIAL` |
| Neon database metrics/logs | Current Free console + public pricing | 人工已證明 metrics 可見；Production-only headroom與保留仍未接受。Launch 公開為 3-day UI metrics/logs | `PARTIAL` |

Free tier 只能作技術候選，不能直接當作已核准的 Production capacity、資料處理協議、留存或告警交付證據。尚未建立 monitor、integration、log stream、account 或 alert；也沒有傳送任何 Production logs。

官方來源：

- [Better Stack pricing](https://betterstack.com/pricing)
- [Render notifications](https://render.com/docs/notifications)
- [Render logs](https://render.com/docs/logging)
- [Render service metrics](https://render.com/docs/service-metrics)
- [Neon pricing](https://neon.com/pricing)

## 3. Backup / Snapshot / Isolated Restore

| 能力 | 目前實際證據 | 官方候選成本／限制 | 判定 |
| --- | --- | --- | --- |
| PITR / Restore history | Production Console 已證明可用，歷史窗 6 小時 | Neon Free US$0 包含最長 6 小時 time travel/restore | `PARTIAL`；不符合已訂 15-minute RPO 的完整 DR 證據 |
| Manual snapshot | 目前沒有 snapshot | Free 公開含 1 個 manual snapshot；實際建立數為 0 | `NOT_CONFIGURED` |
| Scheduled snapshot | 目前未啟用，Console 要求 upgrade | 付費方案提供 schedule；目前未購買 | `NOT_CONFIGURED / PAID PLAN REQUIRED` |
| Snapshot storage | 實際 GB-month **UNKNOWN** | 公開單價 US$0.09/GB-month | `USAGE_BASED / UNKNOWN TOTAL` |
| Paid restore history | 未選 paid plan | Launch 最長 7 天；history storage US$0.20/GB-month | `CANDIDATE / UNKNOWN TOTAL` |
| Isolated Restore drill | 未執行、未建立 branch | branch/compute/storage、操作工時與清理成本 **UNKNOWN** | `BLOCKED / APPROVAL REQUIRED` |

Snapshot 單價不等於完整備份／DR 成本。隔離還原仍必須證明 migration ledger、RLS、Function/Grant、Workspace isolation、API-role denial、核心 bootstrap/Command，以及 RPO 15 分鐘與 RTO 60 分鐘；在此證據完成前 Backup/Restore/DR Gate 不能標為 PASS。

官方來源：

- [Neon pricing](https://neon.com/pricing)
- [Neon snapshots and restore](https://neon.com/docs/ai/ai-database-versioning)

## 4. Cost model impact

| 類別 | Current / candidate cost | Cost status |
| --- | --- | --- |
| Existing known fixed floor | US$49/月；US$588/年 | `KNOWN FIXED` |
| Domain initial purchase | US$11.08 / one year | `bankeban.com`, Porkbun public quote; not purchased |
| Domain renewal | US$11.08/year | Current public quote; recheck before purchase |
| DNS | US$0 candidate | Not selected/configured |
| TLS | US$0 candidate | Not configured |
| Monitoring / basic alerting / short logs | US$0 Better Stack Free candidate | Not approved/configured; capacity and data handling not accepted |
| Paid telemetry option | +US$30/month, or +US$300/year with annual billing | Optional; not authorized |
| Paid responder option | +US$34/month, or +US$348/year with annual billing | Optional; not authorized; human responder cost separate |
| Snapshot storage | US$0.09/GB-month | Usage amount UNKNOWN |
| Restore-history storage | US$0.20/GB-month on paid plans | Usage amount UNKNOWN |
| Isolated Restore | UNKNOWN | Branch/compute/storage/labor not evidenced |

因此更新後最低安全 Production 只能表達為：

- **US$49/month known fixed + Domain + Neon/backup usage + operations overage + other UNKNOWN items**。
- **US$599.08/year current known planning floor + Neon/backup usage + operations overage + other UNKNOWN items**；其中 US$11.08 是可變動且尚未購買的當下網域報價。

不得把候選 Free tiers 相加後宣稱精確總價，也不得把 US$0 候選視為 Gate PASS。

## 5. Gate decision and remaining evidence

- Sprint 44 Repository/public evidence scope：**COMPLETE**。
- Production Readiness：**70% / NOT READY**（不因文件完成而提高）。
- Gate A：**DEFER**。
- Production Provisioning：**NO-GO**。
- Domain/DNS/TLS：網域報價證據 `PASS`；購買、所有權、DNS/TLS 與 rollback 仍 `NOT_CONFIGURED / BLOCKED`。
- Monitoring/Alerting/Logging：`PARTIAL`，缺 owner 選型、資料處理審查、具名 responder、實際 alert delivery 與容量/留存接受。
- Backup/Restore/DR：`PARTIAL / BLOCKED`，缺 schedule/snapshot、15-minute RPO、isolated Restore與60-minute RTO證據。
- Production mutation：**NONE**。

下一個唯一建議 Sprint：**Sprint 46 — Production Schema Parity Read-only Plan**。只規劃使用既有 Production read-only role 取得 catalog／Migration ledger 差異，不執行 SQL、Migration 或任何 Production mutation。
