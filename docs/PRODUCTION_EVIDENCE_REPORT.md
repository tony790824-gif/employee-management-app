# Production Evidence Report - Sprint 33D

## Sprint 49 authorized Production ledger evidence - 2026-08-10

- Evidence status: **BLOCKED AT MIGRATION LEDGER / COLLECTION COMPLETE**.
- Identity provenance: dedicated Production read-only identity **PASS**; role boundary **PASS**; TLS `verify-full` **PASS**.
- Expected ledger: 21 entries (`0001`-`0009`, `0011`-`0022`). Observed ledger: 8 entries (`0001`-`0008`).
- Missing: `0009`, `0011`-`0022`. Unexpected: NONE. Checksum mismatch: NONE.
- Structural catalog was not collected after the ledger mismatch; all structural sections remain NOT EVALUATED/BLOCKED.
- Expected baseline SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
- Sanitized evidence: `docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.json`; SHA-256 `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.
- Evidence contains only status/count/version/hash metadata; it excludes URL, hostname, user/password, endpoint/project identifiers, Token, Cookie and business data.
- No Production mutation, Migration, repair, grant/revoke, deploy or credential change occurred. Readiness stays 70% / NOT READY; Gate A DEFER; Provisioning NO-GO.

## Sprint 48 expected catalog evidence - 2026-08-10

The non-Production expected-side catalog artifact is **PASS** and hash/rebuild verified. It is prerequisite comparison evidence, not Production evidence. Current Production ledger/catalog evidence remains **BLOCKED / UNKNOWN**, Production readiness remains 70% / NOT READY, Gate A remains DEFER and Provisioning remains NO-GO. No Production resource was queried or modified.

## Sprint 47 schema parity evidence attempt - 2026-08-10

- Final status: **BLOCKED**. Repository and `0010` history are closed; current Production catalog evidence is not.
- Dedicated Production read-only URL/role were absent from the process and protected Production env file. Identity/read-only state was not queried, and privileged credentials were not substituted.
- `0010` is an intentional unapproved gap, not an expected ledger row. The 21 tracked Migration checksums pass.
- Historical Production ledger `0001`-`0008` is retained as historical evidence only. Current ledger, schema structure and exact missing/extra/mismatch counts are UNKNOWN.
- Full sanitized result and remediation-only next steps are in `docs/PRODUCTION_SCHEMA_PARITY_REPORT.md`.
- No Production request, SQL, write, Migration, resource/configuration change, deploy, DNS, Secret or traffic operation occurred. Readiness remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO.

## Sprint 46 Repository-only schema parity plan - 2026-08-09

- Evidence status: **BLOCKED / NOT COLLECTED**. No Production database connection or SQL execution was authorized or attempted.
- Repository expected range: `0001`-`0022`; 21 tracked sources/checksums verified locally. `0010` is explicitly `MISSING_TRACKED_SOURCE`, so the expected inventory and any future parity result fail closed.
- The future evidence contract is `docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.schema.json`; it permits only sanitized result metadata and forbids connection/host/project/endpoint identifiers and credentials.
- The future catalog query set is statically proven SELECT-only and restricted to `pg_catalog`, `information_schema` and `public.schema_migrations`. This proof is planning evidence only, not Production parity evidence.
- Production readiness remains **70% / NOT READY**; Gate A **DEFER**; Provisioning **NO-GO**.

## Sprint 45 domain availability and quote evidence - 2026-08-09

- Evidence source: Verisign `.com` RDAP and Porkbun public unauthenticated search/pricing.
- Candidate: `bankeban.com` / `.com`, owner-selected for quote evidence only.
- Availability: `AVAILABLE_AT_QUOTE_TIME`; RDAP returned HTTP 404 and the registrar displayed an ordinary non-Premium registration result.
- Quote: US$11.08 for a one-year registration; US$11.08/year renewal; USD. Recheck before any purchase.
- Status: domain price evidence **PASS**; ownership, purchase, DNS/TLS and rollback remain `NOT_CONFIGURED / BLOCKED`.
- No account, cart, purchase, payment, auto-renew, nameserver, DNS, Production, Deploy, Migration, SQL or Secret operation occurred.

The sanitized records remain `public.production.domain_operations_cost` (SHA-256 `cbc82d7e3636740a7a4048c77805d2329fbabd1385657bfab4317193e4a0f731`) and `public.production.cost_model` (SHA-256 `7127414604340ad029d74f9e571229b862f83785d7625fe82af39eee472974de`). The updated 24-entry manifest SHA-256 is `f5972ef8beb92c5fc01eca39c3b13a01c9e0a0098be705e0063c27892fca9c67`.

## Sprint 44 domain and operations public evidence - 2026-08-09

- Evidence source: official public Cloudflare Registrar/DNS, Netlify TLS, Better Stack pricing, Render notifications/logs/metrics and Neon pricing/snapshot documentation.
- Production domain/TLD: **NOT SELECTED**. Initial purchase and renewal prices remain **UNKNOWN**; no sample or promotional domain price is accepted as Bankeban evidence.
- DNS/TLS: Cloudflare authoritative DNS and Netlify-managed TLS are US$0 candidates. Neither is selected/configured Production evidence.
- Monitoring/alerting/logging: Better Stack Free is a US$0 candidate with 10 monitors/heartbeats, Slack/email alerts, 3 GB/3-day logs and 30 GB metrics. Paid Nano telemetry and Responder rates are recorded as optional; no account/integration/monitor/alert/log stream exists.
- Backup/Restore: six-hour PITR remains `PARTIAL`; no snapshot/schedule exists. Snapshot storage US$0.09/GB-month and paid history storage US$0.20/GB-month are official unit rates, while actual usage and isolated Restore cost remain `UNKNOWN`/`BLOCKED`.
- Known fixed floor: **US$49/month / US$588/year plus Domain, Neon/backup usage, operations overage and other UNKNOWN items**.
- Status: **PARTIAL EXTERNAL GATES / COMPLETE READ-ONLY PUBLIC EVIDENCE SCOPE**. Gate A remains **DEFER**, Production Provisioning remains **NO-GO**, and readiness remains **70% / NOT READY**.
- Purchase, billing, account/integration, alert/log configuration, snapshot, branch, Restore, SQL, Migration, DNS, Deploy, Secret and Production mutation: **NOT PERFORMED**.

The sanitized public record is `public.production.domain_operations_cost` with SHA-256 `74cf991c4cbf8d1e463e938e86a1462fc2f1724e442a401d803ac9d00d83451a`. The updated 24-entry manifest SHA-256 is `196a6657e359eb27dddb30c093cd799cf9a43c34578974d019b79bb58d020c85`. It stores only public non-account data and no account/project/branch/endpoint identifier, hostname, credential, invoice/payment data or personal information.

## Sprint 43 Neon billing / usage evidence - 2026-08-09

- Evidence source: **authorized human read-only Neon Console plan, usage and project-storage inspection**.
- Current actual organization plan / fixed fee: **Free / US$0 per month**.
- Free inclusions shown per project: **0.5 GB storage, autoscaling to 2 CU, 100 compute hours and 10 branches**.
- Current organization-wide usage since 2026-08-01: **10.77 CU-hours compute, 0.08 GB storage, 0 GB history and 0.3 GB network transfer**.
- Tooltip boundary: compute, storage, history and network values aggregate all projects in the current billing period; none is accepted as Production-only.
- Project-screen observations: **Production 32.84 MB; Staging 46.01 MB**. They were not converted to billing GB-month.
- Production-only compute, billing storage/GB-month, network transfer, snapshot storage GB-month and estimated/charged amount: **UNKNOWN**.
- Interpretation: current fixed plan fee is now evidenced as US$0, but future safe Production capacity/recovery and exact total cost remain `PARTIAL`/`UNKNOWN`. The prior US$15/month Neon value is only a public planning example.
- Status: **PARTIAL**. Gate A remains **DEFER**, Production Provisioning remains **NO-GO**, and readiness remains **70% / NOT READY**.
- Neon upgrade/configuration, billing action, SQL, Migration, snapshot, branch, Restore, Deploy, Secret and other Production mutations: **NOT PERFORMED**.

The sanitized record is `manual.neon.production.billing_usage` with SHA-256 `965f1a7ebe773584166fd7d0a716c93a279cd3fa743d1f37a85e6cc855e651f5`. It contains no organization, project, branch or endpoint identifier, hostname, connection string, credential, invoice/payment data or personal information. The updated 23-entry manifest SHA-256 is `0368482e169fd9c4d30b769f9af58c12f7a97e93da3bfb438ffa9dd610f30582`.

## Sprint 42 blocker-plan evidence boundary - 2026-08-09

- Repository plan and documentation consistency: **PASS**.
- New external Production evidence: **NONE**. Existing sanitized evidence records and SHA-256 manifest remain unchanged.
- Gate A decision blockers remain `PARTIAL`/`BLOCKED`; Production resources remain `NOT_CONFIGURED` as described in `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md`.
- Gate A remains **DEFER**, Production Provisioning remains **NO-GO**, and Production readiness remains **70% / NOT READY**.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## Sprint 41 public cost finalization evidence - 2026-08-09

- Evidence source: current official public Auth0, Neon, Render, Netlify, Cloudflare DNS, Netlify TLS and external monitoring pricing/capability pages plus existing sanitized owner evidence.
- Minimum fixed known: **US$49/month / US$588/year**. Recommended fixed known: **US$67/month / US$804/year**. Growth total: **UNKNOWN**.
- Neon: official unit rates and workload examples are verified, but the Production account's plan and complete-period billable usage are not. Neon remains `PARTIAL` for cost.
- Domain registration, monitoring/on-call selection, long-term logging, isolated Restore, platform overage and tax remain `UNKNOWN` or variable.
- Gate A: **DEFERRED**; Production readiness **70% / NOT READY**; Production provisioning **NO-GO**.
- Billing, purchase, upgrade, Production platform, database, Migration, deploy, DNS, Secret and traffic operations: **NOT PERFORMED**.

## Sprint 40 Netlify billing evidence - 2026-08-09

- Evidence source: **authorized human read-only Netlify Usage & billing inspection**.
- Current plan / billing: **Free / Credit-based / US$0 fixed / 300 credits per month**.
- Current period Jul 14-Aug 13: **274.6 credits used / 25.4 remaining** (about 91.5%).
- Breakdown: 270 credits / 18 deploys; about 4 credits / 20,188 web requests; about 0.6 credits / 30.7 MB bandwidth; compute 0; AI inference 0.
- Interpretation: deploy activity accounts for about 98.3% of current usage, so it cannot be treated as stable Production traffic. Account billing labels do not override the existing `NOT_CONFIGURED` Production deploy evidence.
- Capacity: **PARTIAL / UNRESOLVED**. `No overage charges` does not prove service continuity after credit exhaustion.
- Netlify plan/payment/configuration/deploy changes: **NOT PERFORMED**.
- Gate A: **DEFERRED**; Production readiness **70% / NOT READY**.

The sanitized record is `manual.netlify.production.billing_usage`; its SHA-256 is `e3b1d4408d322da2049ad29a4181505f9a59609623c1af1f5b421463e734de74`. The corrected `public.production.cost_model` SHA-256 is `7e3b78aa773f637c7f386edd0d57cdde6d7e2475b5e3440b51007e85fa0ac7b3`, and the updated 22-entry manifest SHA-256 is `48d3a08b4b673c34e58081fd09d131186337fd0bd30b5aa35b67ecaaff3495e7`. No account, email, payment, invoice, token, Secret or credential is retained.

## Sprint 39 public cost evidence - 2026-08-09 (historical baseline superseded by Sprint 40)

- Evidence source: official public Auth0, Neon, Render, Netlify and Cloudflare pricing/documentation plus the sanitized Sprint 38 Auth0 owner evidence.
- Known fixed planning floor: **US$58/month / US$696/year plus Neon usage and unknowns**.
- Indicative planning value using Neon's published typical Launch example: **US$73/month / US$876/year plus unknowns**; this is not a guaranteed minimum or exact total.
- Auth0 Essentials: US$35/month and 3 Tenants; Render Starter: US$7/month per API/worker service; Netlify Personal candidate: US$9/month. Account applicability, overages, tax and current Netlify billing model remain unverified.
- Neon, domain, monitoring/alerting, backup/restore, logging and overage totals remain `PARTIAL` or `UNKNOWN`; no unsupported number is promoted to PASS.
- Gate A: **DEFERRED / NOT AUTHORIZED**. Production readiness remains **70% / NOT READY**.
- Billing, purchase, upgrade, Production platform, database, Migration, deploy, DNS, Secret and traffic operations: **NOT PERFORMED**.

Sprint 40 replaced the unverified Netlify Personal assumption with owner-observed Free/Credit-based evidence. The current cost-model and manifest hashes are recorded in the Sprint 40 section above; the Sprint 39 figures are retained only as historical context.

## Sprint 38 Auth0 capacity and pricing evidence - 2026-08-09

- Evidence source: **authorized human read-only Auth0 Team subscription/capacity inspection**
- Current plan / charge: **Free / US$0**
- Current Tenant entitlement: **1**; existing Tenant is **Development**; additional Tenant creation is **BLOCKED / LIMIT REACHED**
- Independent Production Tenant/SPA/API: **NOT_CONFIGURED**
- Essentials: **US$35/month, 500 MAU, 3 Tenants, 10 Actions, 1,000 M2M Tokens**
- Professional: **US$240/month, 1,000 MAU, 12 Tenants, 15 Actions**
- Enterprise: **UNKNOWN / CONTACT SALES**
- Gate A execution: **DEFERRED / NOT AUTHORIZED**
- Billing, payment, upgrade, Tenant/Application/API creation and Auth0 configuration: **NOT PERFORMED**

The values are point-in-time owner evidence and may change. No account, payment, Tenant identifier, Secret, token, or screenshot is retained. The sanitized record is `manual.auth0.production.capacity_pricing`; its SHA-256 is `4171303caf1165cb0b6fbd4c1a3651252b653fe31c68110e74a298b037672aaa`, and the 20-entry manifest SHA-256 is `1806378026e1132ad7baab4312d4b44c76417bd7dc9814b14139bac7309973c1`.

This evidence closes the unknown plan/capacity fact only. It does not close the Production identity gate, raise readiness, or authorize a purchase/resource operation.

## Sprint 37 preflight evidence record - 2026-08-09

| Evidence gate | Status | Decision |
| --- | --- | --- |
| Sprint 36 artifact consistency | PASS (repository evidence only) | Plan, ADR, Readiness, Evidence, Operations, Checklist, Backlog and handoff agree. |
| Consolidated blocker inventory | PASS (classification only) | Every open platform/operations gate has an owner/action/evidence classification. |
| Production provisioning authorization | NO-GO | Required external resources, evidence and approvals are absent. |
| New external Production evidence | NONE | No platform request, database query, resource or configuration operation occurred. |
| Production readiness | 70% / NOT READY | No score change is permitted for planning or classification. |

No SHA-256 evidence entry was added because Sprint 37 collected no new external evidence. The existing sanitized manifest remains unchanged and authoritative.

## Sprint 36 planning record - 2026-08-09

| Evidence gate | Status | Decision |
| --- | --- | --- |
| Production resource inventory | PASS (repository + authorized Sprint 34/35 evidence) | Current resources and gaps are mapped without new platform access. |
| Provisioning architecture/order | PASS (plan only) | Gate A-G dependency, isolation, evidence and rollback requirements are documented. |
| Auth0/Render/Netlify resource existence | NOT_CONFIGURED | A plan does not create or prove these resources. |
| Neon schema/recovery/capacity closure | PARTIAL / BLOCKED | Existing evidence is preserved; no new database operation occurred. |
| Production deployment/Migration/traffic | NOT AUTHORIZED | No action was attempted. |

This planning record does not add an external evidence hash or raise readiness. The sanitized Sprint 35 hash manifest remains authoritative for the last collected platform evidence.

## Sprint 35 Auth0 Production tenant inventory - 2026-08-09

- Evidence source: **authorized human read-only Auth0 Team/Tenant inspection**
- Team/Tenant inventory access: **PASS** — one visible Tenant
- Development/Staging identity: **PASS / CONFIRMED** — Development environment, US-5, Staging SPA
- Independent non-Development Production Tenant: **NOT_CONFIGURED / NONE VISIBLE**
- Production SPA, issuer, API audience/signing algorithm: **NOT_CONFIGURED**
- Production callback/logout/web-origin/CORS allowlists: **NOT_CONFIGURED**
- Production connections/actions/protections/security-event stream: **NOT_CONFIGURED / NOT VERIFIABLE WITHOUT A PRODUCTION TENANT**
- Production/Staging Auth0 isolation: **PARTIAL** — Development/Staging identity is explicit; Production identity stack does not exist
- Tenant capacity: **BLOCKED / TEAM TENANT LIMIT REACHED**
- Tenant/Application/API creation, linking, configuration change, token generation, Client Secret access and secret rotation: **NOT PERFORMED**

The Development Tenant and Staging SPA are not Production evidence. No Tenant/Application/API identifier is retained in the sanitized record. It is stored as `manual.auth0.production.tenant_inventory`; record SHA-256 is `373db46f6f561ed9540d6219f2acb759c7a5780e40537216a827b37153f93243` and the 19-entry manifest SHA-256 is `be6832b30100e2ef567c4da6630c757dab9fdd11b8633349f82bf7a4e02d7f77`.

## Sprint 35 Render Production service inventory - 2026-08-09

- Evidence source: **authorized human read-only Render Console inspection**
- Render Project: **PASS / EXISTS**
- Render Environment label `Production`: **PASS / LABEL EXISTS, NOT SERVICE EVIDENCE**
- Existing Staging API identity: **PASS / CONFIRMED** — one deployed Node service in Singapore is explicitly the Staging API
- Independent Production API service: **NOT_CONFIGURED / NONE**
- Production public API URL: **NOT_CONFIGURED**
- Production runtime, region, branch, build/start commands and auto-deploy: **NOT_CONFIGURED / NOT ESTABLISHED**
- Production deploy metadata: **NOT_CONFIGURED / NONE**
- Production health/readiness/log monitoring: **BLOCKED / NO PRODUCTION SERVICE**
- Production/Staging service isolation: **PARTIAL** — Staging identity is explicit, but no independent Production service exists
- Service creation, deploy, restart, suspend, settings/environment change and secret access: **NOT PERFORMED**

The Render Environment name does not override the authoritative Staging Service identity. No Service/Owner/Deploy identifier is retained in the sanitized record. It is stored as `manual.render.production.service_inventory`; record SHA-256 is `f35ebc4668f46fd7ad179d0c6591653f1a2bf8f8092ac40398e4b70445773db4` and the 18-entry manifest SHA-256 is `38ef07d0a11c20ed7c256349ef22b78c33b4f0b66141863edd10a0d1c555ae35`.

## Sprint 35 Netlify Production deploy inventory - 2026-08-09

- Evidence source: **authorized human read-only Netlify Console inspection**
- Netlify project existence: **PASS / EXISTS**
- Deploy Preview history: **PASS / EXISTS AS NON-PRODUCTION EVIDENCE ONLY**
- Production Deploy: **NOT_CONFIGURED / NONE**
- Production status/context, Commit SHA and timestamp: **NOT_CONFIGURED / NONE**
- Production branch: **NOT_CONFIGURED / NOT ESTABLISHED**
- Production rollback evidence: **BLOCKED / NO PRODUCTION DEPLOY HISTORY**
- Production custom domain, DNS and TLS: **UNKNOWN / NOT EVIDENCED**
- Publish, deploy, retry, rollback, cache clear, domain/project/deploy/environment change: **NOT PERFORMED**

The Project and its Staging Deploy Previews do not constitute a Production frontend or deploy. No site/resource identifier is retained in the sanitized evidence record. The record is stored as `manual.netlify.production.deploy_inventory`; record SHA-256 is `8c5bc325b9fba5409946b9c23531863f7621f48cf60f85fe41a095b9c4ea19c2` and the 17-entry manifest SHA-256 is `8fdf83d47495b5d0f9f1e58558a70573f61ae16127ef059301cd290ffe0cca6d`.

## Sprint 35 Neon Monitoring / Capacity evidence - 2026-08-09

- Evidence source: **authorized human read-only Neon Console inspection**
- Observation period: **LAST DAY**
- Compute configuration evidence: **PASS** — primary compute, current state idle, autoscaling minimum `0.25 CU`, maximum `2 CU`, autosuspend `5 minutes`
- Monitoring availability: **PASS** — RAM, CPU, rows, deadlocks, cache hit rate, working set, PostgreSQL connections, pooler client/server connections and database-size metrics are available
- Usage evidence: **PARTIAL** — actual Production activity and populated metrics were observed, but exact utilization/peak/storage values were deliberately not inferred or retained
- Capacity adequacy / headroom / alert thresholds: **PARTIAL / NOT PROVEN**
- Production edit, SQL, write, Migration and deploy: **NOT PERFORMED**

The unredacted screenshot is not stored because it contains an endpoint hostname. The sanitized record is stored as `manual.neon.production.monitoring_capacity`; record SHA-256 is `9428ae884820af57da72f4bf2e6dd0ddaf7c4f2fd5b80f713abc5688d17d7fa9` and the 16-entry manifest SHA-256 is `c737312c4dcc704ca38f2f3ab9626e3b4cee2f537aadb5aacc01f24b364cf0f7`.

## Sprint 35 Neon Backup & Restore evidence - 2026-08-09

- Evidence source: **authorized human read-only Neon Console inspection**
- PITR / Restore from history capability: **PASS / AVAILABLE**
- History retention window: **PARTIAL / 6 HOURS OBSERVED**
- Scheduled snapshot: **NOT_CONFIGURED / NOT ENABLED**
- Snapshot inventory: **NOT_CONFIGURED / NONE**
- Isolated restore drill and measured RTO: **BLOCKED / NOT PERFORMED**
- Preview data, Restore, snapshot creation, branch creation, retention/configuration change and Production write: **NOT PERFORMED**
- Composite Backup/Restore/DR gate: **PARTIAL**, not PASS
- Production readiness: **70% / NOT READY**

PITR capability is now directly evidenced, but it does not prove an independent backup, scheduled snapshot, successful isolated restore, recovery correctness, or the documented RTO. The sanitized record is stored as `manual.neon.production.backup_restore`; record SHA-256 is `404135662618801cfb35e167b72ab1935113a26180f54d5135bb34ee30e15989` and the 15-entry manifest SHA-256 is `7a3eaeb656bac91de073b44109ee545ed8aa5adcef1369810d59fcb2d5049252`.

## Sprint 35 external evidence inventory - 2026-08-09

- Sprint status: **PARTIAL / HUMAN PLATFORM EVIDENCE REQUIRED**
- Production readiness: **70% / NOT READY**
- Repository baseline: `75fd5f0e445c00cc301a1115f7493c52b18ea856`; `main` and `origin/main` were `0/0` at inventory time.
- Safe validator result: Repository `PASS`; six `BLOCKED`; three `NOT_CONFIGURED`; no `FAIL` and no Production request or mutation.
- Safe evidence collector result: Repository `PASS`; all Netlify, Render and Auth0 Management records `BLOCKED` before network access because protected read-only authorization is absent.
- Protected process configuration contains no approved Production frontend/API origins, Auth0 public configuration, platform resource IDs/tokens, or `DATABASE_READONLY_URL`. Existing Owner, Migrator, API, Push and Staging credentials were not substituted.

| Gate | Status | Current evidence | Required closure |
|---|---|---|---|
| Repository isolation and evidence controls | PASS | Fail-closed validator/collector, security policy and no-deploy boundary executed locally | Preserve through final release gate |
| Neon dedicated reader and application ACLs | PASS | Sprint 34 human Provision/Verify proves exact reader, read-only defaults, zero business reads/writes, strict Bankeban Function ACLs and ledger `0001`-`0008` | Preserve the role; do not re-provision without a reviewed need |
| Neon current schema and Migration parity | PARTIAL | Production foundation ledger `0001`-`0008` is proven; repository has later application Migrations through `0022` while `0010` remains intentionally excluded | Read-only schema diff and an explicitly authorized future migration plan; no Migration in Sprint 35 |
| Neon capacity and usage | PARTIAL | Compute bounds/autosuspend, metric availability and recent activity are evidenced; exact utilization, peak headroom and acceptance thresholds are not | Define evidence-safe thresholds and compare measured utilization without changing Production |
| Neon backup/PITR | PARTIAL | PITR is available with a 6-hour history window; scheduled snapshots are disabled and no snapshot exists | Configure/verify independent backup coverage only under separate approval |
| Neon restore drill | BLOCKED | No isolated timed restore has been authorized or run | Separate approval for a non-Production restore target; never restore active Production in this Sprint |
| Netlify Production site/domain/deploy | NOT_CONFIGURED | Project exists and has Staging Deploy Previews, but it has never had a Production Deploy | Separate explicit Production deployment authorization; not part of Sprint 35 |
| Netlify rollback | BLOCKED | No Production deploy history exists from which rollback can be proven | Requires a future Production deploy plus separate rollback evidence |
| Netlify Production domain/DNS/TLS | UNKNOWN | No Production deploy or approved Production domain was evidenced | Identify the approved domain before read-only DNS/TLS validation |
| Render Production API service | NOT_CONFIGURED | Project/Environment exist, but the only Service is explicitly Staging; no independent Production API exists | Separate explicit service/deployment authorization; not part of Sprint 35 |
| Render Production runtime/build/start/autodeploy | NOT_CONFIGURED | No Production Service exists, so these properties are not established | Requires a future authorized Production Service |
| Render health/readiness/logs/monitoring | BLOCKED | No Production API origin or Service exists | Requires an independently authorized Production Service before read-only validation |
| Auth0 Production public metadata | NOT_CONFIGURED | Only the Development/Staging Tenant exists; no Production issuer, JWKS or audience exists | Requires a separately authorized Production Tenant/API |
| Auth0 Production Application/API/allowlists | NOT_CONFIGURED | Production SPA/API and callback/logout/web-origin/CORS lists do not exist | Requires separate resource-provisioning approval after resolving the Tenant limit |
| Auth0 Team tenant capacity | BLOCKED | Console reports the Team Tenant limit is reached | Owner plan/capacity decision required before any Production Tenant proposal |
| Production/Staging external isolation | PARTIAL | Repository isolation passes; external endpoints and Auth0 tenant separation remain unproved | Cross-platform read-only evidence for exact Production identities |

No Production deploy, Migration, database query/write, restore, DNS change, Auth0 change, environment-variable change, platform-resource change, traffic change or secret export occurred. The Sprint 34 Neon evidence hash manifest remains authoritative; this inventory does not replace it or fabricate new external evidence.

## Sprint 34 final human Neon evidence - 2026-08-09

- Executed by: **authorized human operator** against Commit `e58932032a788d6928c00457e3ffa661684ca580`
- Codex Production connection: **none**
- Provision: **PASS / COMMIT**
- Verify: **PASS / COMMIT**
- Neon Production read-only evidence: **PASS**
- Production database evidence: **PARTIAL** — the least-privilege reader, TLS transaction boundary, ACL classification and ledger `0001`-`0008` are proven; current application-schema parity through later Staging-only features, capacity, backup and restore are not proven.
- Overall Production evidence: **BLOCKED** by remaining Netlify, Render, Auth0, DNS/TLS, monitoring and recovery evidence.
- Production readiness: **70% / NOT READY**

The human operator confirmed `neondb`, `banke_production_readonly`, `transaction_read_only=on`, no dangerous role attributes, `NOINHERIT`, connection limit 3, bounded role timeouts, CONNECT/USAGE without CREATE, ledger SELECT, zero business-table SELECT, zero table writes and zero sequence writes. The ledger contains exactly the eight applied Production foundation Migrations `0001` through `0008`; no Migration was executed during this evidence closure.

Application Function evidence is **PASS**: all 11 expected Functions exist, all are owned by `neondb_owner`, application PUBLIC/reader EXECUTE is zero, and `banke_api_production` has exactly the four explicit approved entry points with no unapproved Function. The 37 `public.pgcrypto` Functions owned by `cloud_admin` remain `ACCEPTED_PLATFORM_INFORMATION`: their PUBLIC/reader effective EXECUTE is reported truthfully, but they are not Bankeban grants and were not revoked, altered, re-owned or dropped.

The sanitized human attestation is appended to `PRODUCTION_EVIDENCE_HASHES.json` as `manual.neon.production.readonly`; its record SHA-256 is `c5e59bded74a96d0829bf56087a49ef0f790d82f5e20b1f4c9f9a62ec85afb61` and the updated 14-entry manifest SHA-256 is `54d9a2f9a65461b1e7c6c20c050ff45007df9a6c543386aeef6045447f9ca8b1`. The original 13 Sprint 33D hashes and timestamp remain unchanged.

## Sprint 34 classified Function ACL evidence - 2026-08-09

- Read-only catalog diagnostic: **PASS / SAFE METADATA COLLECTED**
- Bankeban application set: **11 / owner `neondb_owner` / PUBLIC 0 / reader 0**
- Runtime application allowlist: **4 effective and 4 explicit / no unapproved application Function**
- Platform Extension set: **37 `public.pgcrypto` Functions / owner `cloud_admin` / inherited through PUBLIC**
- pgcrypto mutation: **NOT AUTHORIZED / NOT PERFORMED**
- Corrected Provision/Verify: **REPOSITORY PASS PENDING FULL GATES / HUMAN RE-RUN REQUIRED**
- Production evidence: **BLOCKED / NOT PASS**

The former global `function_execute_privilege_count = 37` is not represented as zero. It is now split into strict application metrics and truthful platform Extension information. Application PUBLIC or reader EXECUTE above zero, an owner mismatch, a missing/extra application Function, a non-approved runtime grant, or an unreviewed Extension tuple remains a hard failure. The reviewed pgcrypto PUBLIC ACL alone is an accepted managed-platform limitation because it provides no Bankeban Function or business-table access path.

## Sprint 34 diagnostic identity update - 2026-08-09

- Manual diagnostic result: **BLOCKED / CONFIRMATION TOKEN MISMATCH**
- Database/login/TLS supplied by operator: `neondb` / `banke_production_readonly` / required
- Metadata returned: **none**
- Provisioning or Production mutation: **not performed**
- Repository fix: confirmation token aligned and `current_user` plus `session_user` now independently fail closed against the exact reader login
- Production evidence: **BLOCKED / NOT PASS**

The failed condition was the script's old `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_ACL` literal versus the operator's intended `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER`; no Neon session-identity difference is established by this run. A new manual diagnostic is required before the Function owner blocker can be classified.

## Sprint 34 Function owner diagnostic update - 2026-08-09

- Human provision re-run: **BLOCKED / FAIL-CLOSED BEFORE TRANSACTION**
- Exact roles: `banke_production_readonly`, `neondb_owner`, and `banke_api_production`
- Blocker: at least one PUBLIC-executable Function in `public` or `app_private` is not owned by `neondb_owner`
- PUBLIC ACL mutation, corrected provisioning, and verification: **NOT PERFORMED**
- Business data, schema, Migration, and application runtime: **NOT MODIFIED BY THIS ATTEMPT**
- Repository response: **MANUAL READ-ONLY CATALOG DIAGNOSTIC ADDED**
- Neon Production evidence: **BLOCKED / NOT PASS**

Migrations 0001-0008 define 11 Bankeban Functions expected to be owned by `neondb_owner`; exactly four are approved runtime entry points. Migration 0001 also requests `pgcrypto`, so a Neon/platform-owned Extension Function is a plausible cause, but it is not treated as confirmed Production evidence. The manual diagnostic reads only `pg_catalog` metadata and must identify the exact schema, signature, owner, Extension relationship, PUBLIC/runtime/reader EXECUTE state before any revised provisioning is considered.

Historical requirement at that point was a global `function_execute_privilege_count = 0`. The completed catalog diagnostic later proved that metric mixed Bankeban Functions with the managed `public.pgcrypto` Extension. The current equivalent security gate requires Bankeban application PUBLIC/reader EXECUTE to be zero, runtime execution to be exactly the four explicit entry points, and the reviewed pgcrypto tuple to remain informational and unmodified. No Production status is promoted without the pending corrected human Provision/Verify run.

## Sprint 34 Function ACL verification update - 2026-08-08

- Production connection: **AUTHORIZED READ-ONLY VERIFY / TLS PASS**
- Database and role: **PASS** — `neondb` / `banke_production_readonly`
- Read-only role attributes, role defaults, CONNECT/schema boundaries and Migration ledger: **PASS**
- Business-table SELECT, table writes and sequence writes: **PASS / ZERO**
- Function execution: **BLOCKED** — 37 effective `EXECUTE` privileges remain through PostgreSQL's default `PUBLIC` Function ACL
- Migration ledger: **READABLE / 0001 THROUGH 0008**
- Business data, schema, Migration and application runtime: **NOT MODIFIED**
- Neon Production evidence: **BLOCKED / NOT PASS**

The direct evidence-role Function revoke completed, but PostgreSQL adds direct, membership and `PUBLIC` grants; a role-specific revoke is not a deny. Repository tests reproduce that ACL behavior. The corrected manual script now requires and preserves the existing runtime's exact four-function direct allowlist, and requires the approved object owner to own every currently PUBLIC-executable Function, before transactionally removing current/future `PUBLIC EXECUTE`. It rolls back unless PUBLIC and the reader reach zero and the runtime allowlist remains unchanged. No corrected script was run against Production during this repository update.

The Sprint 33D evidence timestamp and hash manifest below remain unchanged. This real verification result is not promoted to PASS and does not fabricate a new evidence hash.

## Sprint 34 Neon compatibility update - 2026-08-08

- Production connection: **AUTHORIZED READ-ONLY PREFLIGHT ATTEMPT**
- Provisioning result: **BLOCKED / SCRIPT COMPATIBILITY DEFECT**
- Failure: the first mutating statement attempted `ALTER ROLE ... NOSUPERUSER`, which Neon cannot authorize without a true PostgreSQL superuser.
- Subsequent grants/revokes/default privileges: **NOT EXECUTED** because `ON_ERROR_STOP` stopped at the first mutation.
- Business data, schema, Migration and evidence status: **UNCHANGED**
- Corrected script: **AUTOMATED TESTS PASS / PENDING HUMAN RE-RUN**
- Neon Production evidence: **BLOCKED / NOT PASS**

This attempt is operational evidence of a compatibility defect, not Neon schema evidence. It does not replace or regenerate the Sprint 33D evidence timestamp or hash manifest.

## Sprint 34 provisioning preflight - 2026-08-08 (historical)

- Repository least-privilege provisioning controls: **PASS**
- Neon Production read-only credential: **BLOCKED**
- Netlify dedicated read-only evidence identity: **BLOCKED**
- Render dedicated read-only evidence identity: **BLOCKED**
- Auth0 exact-scope read-only M2M token: **BLOCKED**
- Evidence re-run: **NOT PERFORMED**
- Production request, connection, mutation or secret export: **none**

The protected operator environment did not contain the required access. No external provider or database request was made. The evidence timestamp below and manifest SHA-256 `f1a48ff74795c58f2120cc323598b905caf20c89b3503c1828b5124030b179a1` remain the last actual Sprint 33D collection and were not regenerated or reclassified.

Date: 2026-08-04

Baseline: `80b4bd6d8e53c72e5101cd66b363a10dc5b20cb4`

Evidence timestamp: `2026-08-04T11:20:11.116Z`

Mode: **read-only / fail-closed**

Sprint status: **PARTIAL - EXTERNAL EVIDENCE BLOCKED**

Production readiness: **70% - NOT READY**

Production mutation: **none**

## Result

The repository evidence collector and its security tests pass. The Sprint 33D baseline lacked approved Production frontend/API origins, a distinct database reader and protected Netlify/Render/Auth0 Management authorization. Sprint 34 has since closed only the Neon reader item through human evidence; the other unavailable evidence remains `BLOCKED`. `NOT AUTHORIZED` is reserved for a supplied read-only credential that the provider explicitly rejects with HTTP 401/403.

No Production deploy, Migration, database connection/write, Auth0 change, environment-variable change, platform-resource change, traffic change, restore, user creation, or real notification occurred.

## Platform evidence

| Platform | Status | Evidence |
|---|---|---|
| Repository validation | PASS | Environment isolation, ignored real environment files, CI no-deploy policy, security-header source and validation variable names passed. |
| Netlify Production public endpoint | BLOCKED | No approved Production frontend origin is configured. Site/domain/deploy/rollback metadata was not guessed. |
| Netlify Production management | BLOCKED | No protected read-only authorization is available. No Netlify Management API request was sent. |
| Render Production public endpoint | BLOCKED | No approved Production API origin is configured. Health/readiness and runtime metadata were not guessed. |
| Render Production management | BLOCKED | No protected read-only authorization is available. No Render Management API request was sent. |
| Neon Production read-only access | PASS | Human Provision/Verify proved the dedicated reader, read-only boundary, ledger `0001`-`0008`, zero business reads/writes and strict application Function ACLs. Codex did not connect. |
| Production database feature parity / recovery | PARTIAL | Foundation metadata is proven, but current feature-schema parity, capacity, backup/PITR and isolated restore evidence remain open. |
| Auth0 Production public metadata | BLOCKED | Approved Production issuer/JWKS/audience are not configured. |
| Auth0 Production management | BLOCKED | No protected Management read-only authorization is available. Callback/logout/web-origin allowlists were not inferred from Staging. |
| DNS / TLS | BLOCKED | Approved Production frontend/API origins are required before DNS/TLS evidence can be collected. |
| Monitoring / operations | BLOCKED | Repository telemetry/runbooks exist; external uptime, alert routing and database monitoring evidence is unavailable. |
| Backup / restore / RPO / RTO | BLOCKED | Targets are documented, but an independent backup and timed isolated restore are not evidenced. |
| Environment isolation | BLOCKED externally | Repository boundary passes; complete Production endpoint/Auth0/platform evidence is unavailable. |

## Evidence hash manifest

Algorithm: **SHA-256**

| Evidence ID | SHA-256 |
|---|---|
| `public.repository.gate` | `f302af8daa43314d441eb5feb15ec5596f4fb00a5a89505e4144fb8794168bb3` |
| `public.frontend.site` | `7d0977ca1c3290284c0bd3881582c2cebeab0c405a0b630f1425ba096a0b268a` |
| `public.api.service` | `6bdca5fb64df85bdde79cf906a958ebda5920332342c4602898d510d11bdd6d7` |
| `public.database.schema` | `28fd42304e3b89605f9f15d6ce31cc61f07f998f31cbbd6502ac190e3867a886` |
| `public.auth0.public` | `882f917ecbc28ff473123e9f494e61d1bec10be0077a3fd2568a527bb7ca6c3b` |
| `public.auth0.management` | `01afb6f1fa1420453509d33869f00cb26a245269774b2fda2dc1964f3a5a6958` |
| `public.network.dns_tls` | `71a83fde927abc50b8950745d9af6b1ddb4c3d80197b21cdb81fdc2bc2fc3301` |
| `public.operations.monitoring` | `683c5cda6fdacb0db61e1af10f186796d99dc6a4c83706182a92f2de61995473` |
| `public.operations.recovery` | `dbd2c373eb5eac968f6e55de7799cdbdd32c9c66b44a338858826c12ffd5a649` |
| `public.environment.isolation` | `b613323c19e262a3dc79f192ef25a93096f08d0424adbcf5c7b78a4b22c73c3f` |
| `netlify.production` | `090cd819a4348d3b8ae64d5083677e066692c0c1af31e02c943ac5b5460c042c` |
| `render.production` | `5f6f5821d2e2e48c1203787e9dc891227c62b7fd253116b83adf468d3ef3c38e` |
| `auth0.production.management` | `30ae04418039235a87c6569dfacad0269f84f9c466c3eb1ad7026d095747132c` |
| `manual.neon.production.readonly` | `c5e59bded74a96d0829bf56087a49ef0f790d82f5e20b1f4c9f9a62ec85afb61` |

Manifest SHA-256: `54d9a2f9a65461b1e7c6c20c050ff45007df9a6c543386aeef6045447f9ca8b1`

The hashes cover canonical sanitized evidence records. They do not hash, store, export, or reveal access tokens, cookies, database URLs, private keys, raw resource IDs, environment values, or personal data.

## Required authorization to continue

1. Provision protected read-only Netlify, Render and Auth0 Management access plus the approved Production resource identifiers. Do not send values through chat or commit them.
2. Preserve the verified Neon reader and classified Function ACL boundary. Do not rerun provisioning or alter pgcrypto unless a separately reviewed database change requires new evidence.
3. Configure the approved credential-free Production frontend/API origins and public Auth0 metadata in the protected operator environment.
4. Re-run `pnpm production:evidence:collect`; retain `BLOCKED` until access is supplied and the evidence is directly verified. A supplied credential rejected with 401/403 must be recorded as `NOT AUTHORIZED`.
