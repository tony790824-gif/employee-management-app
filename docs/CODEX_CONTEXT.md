# Codex Context

## Sprint 52 current context - 2026-08-10

Sprint 52 created two independent loopback-only PostgreSQL 18.4 clusters. The upgrade path captured the `0001`-`0008` structural fingerprint before applying `0009`, `0011`-`0022`; the fresh path applied all 21 approved versions from empty. Both excluded `0010`.

The comparator checks actual normalized catalog rows, not only the ledger. Schemas, tables/views, columns and types, nullability/defaults, constraints, indexes, Functions/signatures, triggers, sequences, Extensions, RLS/policies, ownership and ACL all match. Missing, unexpected, mismatched and PUBLIC privilege drift counts are zero.

Both structural fingerprints are `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e`. Sanitized evidence SHA-256 is `0073aa972158e6ff65a999c083e94743f7881252e83dbadabb7c584a8483ae65`. Cleanup passed with zero residual disposable resources.

This does not establish current Production structural parity. Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production connection or mutation occurred. Next unique work is representative synthetic-data lock/runtime and disposable recovery rehearsal.

## Sprint 51 current context - 2026-08-10

Sprint 51 completed two independent, disposable PostgreSQL 18.4 upgrade rehearsals. The tool refused Production inputs, bound each temporary cluster to loopback, verified local identity, used exact Git-tracked filenames/checksums, rebuilt `0001`-`0008`, then applied only `0009` and `0011`-`0022` one version per transaction. `0010` was rejected.

Every version passed exact predecessor-ledger, precondition, postcondition, ledger and lock checks. `0018` and `0020` verified the required predecessor Functions. Forced SQL and postcondition failures rolled back without changing the baseline ledger or leaving `0009` objects. Automatic down execution remained blocked because every remediation is conditionally reversible.

Both final ledgers/catalogs were deterministic. Final catalog SHA-256: `a610a3d337fd623a8a055a084186b0985fffb75212569acb4f381d02c4f824fb`; deterministic evidence SHA-256: `c9063a0a55b251b4945db9a2c8f71ae08f42c4fcdf4aab18c275b9d81d318b66`; full sanitized evidence SHA-256: `0192da56bc53ac60f882463a231e1edcac74980477b40a3f65c67043e91eb359`.

This is empty disposable evidence, not Production data-volume, contention, recovery or compatibility evidence. Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production connection or mutation occurred. The next unique Sprint is a disposable representative synthetic-data lock/runtime and recovery rehearsal.

## Sprint 50 current context - 2026-08-10

Sprint 50 completed only the fail-closed Production Migration gap plan. The confirmed missing versions remain `0009` and `0011`-`0022`; strict order is mandatory and `0010` remains excluded. Production structural catalog was not evaluated and no new Production evidence was collected.

The authoritative plan is `docs/PRODUCTION_MIGRATION_GAP_REMEDIATION_PLAN.md`; the non-authorizing draft is `docs/PRODUCTION_MIGRATION_EXECUTION_RUNBOOK_DRAFT.md`. The inventory/validator records exact up/down hashes, dependencies, preconditions, DDL/lock risks, rollback conditions, recovery blockers and sanitized evidence fields.

Production execution is blocked by unsatisfied backup/Restore evidence, unknown Production structural/table-size/lock facts, unproven runtime compatibility, absent Gate A authorization and unsuitable generic tooling. `database/migrate.mjs` directory-scans all files and `up` has no per-version stop, so it must not be used against this gap without a separately reviewed exact-manifest executor.

Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production connection, SQL, Migration, repair, deploy or external platform action occurred. Next work is only an isolated non-Production `0001`-`0008` upgrade rehearsal under separate authorization.

## Sprint 49 current context - 2026-08-10

The authorized Production metadata-only run used the dedicated read-only identity. Identity/role boundary and TLS `verify-full` passed. The normalized expected baseline hash remains `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.

Migration Ledger parity failed closed: expected 21 entries; Production observed eight (`0001`-`0008`). Missing versions are `0009` and `0011`-`0022`; unexpected versions and checksum mismatches are NONE. The comparator deliberately did not enter structural catalog collection. Sanitized evidence hash is `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.

Sprint 49 evidence scope is complete, but Production schema parity remains BLOCKED. Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production mutation, Migration, repair, deploy or credential change occurred. Preserve existing excluded untracked files. Next work can only be a separately scoped Repository-only Migration gap remediation plan; do not execute it automatically.

## Sprint 48 current context - 2026-08-10

The expected schema side is now materialized from the approved Git source. A local disposable PostgreSQL 18 cluster created two independent empty databases; both applied exactly 21 Migrations (`0001`-`0009`, `0011`-`0022`), excluded `0010`, produced matching ledgers and byte-identical normalized catalogs.

The committed artifact is `database/production-expected-catalog-baseline.json`; its SHA-256 is `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`. The materializer refuses Production input variables and verifies loopback/database/role/Temp-directory/PostgreSQL-major identity before any Migration.

Production comparison was not executed. Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Preserve `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and the untracked `0010_commission_rules` files. The next unique Sprint is a separately authorized metadata-only Production comparison using only the dedicated read-only role.

## Sprint 47 current context - 2026-08-10

`docs/PRODUCTION_SCHEMA_PARITY_REPORT.md` records the fail-closed outcome. Git history proves `0010` was never tracked/renamed/deleted and committed records consistently classify it as unapproved and intentionally excluded; expected ledger entries are the 21 tracked Migrations only.

The repository inventory/query validator passes, but the expected catalog baseline has not been materialized. The current execution environment also lacks the dedicated Production read-only URL and role. No Production connection or SQL was attempted; historical ledger `0001`-`0008` cannot establish current parity. All structural difference counts remain UNKNOWN/BLOCKED.

Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Preserve `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and the untracked `0010_commission_rules` files. Next work is only a separately authorized disposable non-Production expected-catalog baseline Sprint.

## Sprint 46 current context - 2026-08-09

Sprint 46 is complete as Repository-only planning. The authoritative plan is `docs/PRODUCTION_SCHEMA_PARITY_READONLY_PLAN.md`; expected inventory is `database/production-schema-parity.expected.json`; dry-run validator is `database/production-schema-parity-plan.mjs`; future manual query is `database/operator/production-schema-parity.readonly.sql`.

The tracked Repository has 21 Migration sources: `0001`-`0009` and `0011`-`0022`. Slot `0010` is `MISSING_TRACKED_SOURCE`; existing local untracked `0010_commission_rules` files remain excluded and must not be treated as evidence. Repository validation therefore correctly ends `BLOCKED` for actual parity while proving the catalog query plan is SELECT-only. No Production connection or SQL occurred.

Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Next work is only Migration `0010` governance/expected-ledger closure in Repository; do not connect to Production, execute a Migration, deploy or operate external resources.

## Sprint 45 current context - 2026-08-09

`bankeban.com` / `.com` is the only owner-selected Production domain quote candidate. Verisign `.com` RDAP returned 404 and Porkbun public search showed an ordinary non-Premium US$11.08 one-year registration renewing at US$11.08/year. Treat both availability and price as point-in-time evidence; nothing was purchased, reserved, added to cart, configured or deployed.

Production stays 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Next work is Sprint 46 Repository-only Production Schema Parity planning; no Production connection, SQL, Migration, DNS or resource operation is authorized.

## 2026-08-09 current authority - Sprint 44 domain and operations cost evidence

- Sprint 44 is COMPLETE as fail-closed read-only public evidence closure. It did not configure or close a Production capability gate.
- `docs/PRODUCTION_DOMAIN_OPERATIONS_COST_EVIDENCE.md` is the current Domain/DNS/TLS, monitoring/alerting/logging and backup/Restore cost-candidate authority.
- No approved Production domain/TLD exists; initial/renewal price remains UNKNOWN. Cloudflare DNS and Netlify-managed TLS are US$0 candidates only.
- Better Stack Free is a limited US$0 candidate; optional paid telemetry/responder rates are documented but not approved. Provider selection, named responder, retention and alert-delivery proof remain open.
- Neon six-hour PITR remains PARTIAL; no schedule/snapshot/isolated Restore exists. Snapshot/history unit rates are known but actual usage and drill cost remain UNKNOWN.
- Known fixed floor remains US$49/month and US$588/year plus variable/UNKNOWN items. Gate A remains DEFER, Production Provisioning remains NO-GO, readiness remains 70% / NOT READY.
- Preserve existing untracked `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt`, and `0010_commission_rules` files.
- No Production, billing, account/integration, alert/log, snapshot, branch, Restore, SQL, Migration, Deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 current authority - Sprint 43 Neon billing / usage evidence

- Sprint 43 is COMPLETE as authorized human read-only evidence closure. It did not operate Neon or close a Production capability gate.
- Current actual Neon organization plan: Free / US$0 fixed monthly plan fee; included per project are 0.5 GB storage, autoscaling to 2 CU, 100 compute hours and 10 branches.
- Current organization-wide usage since 2026-08-01: 10.77 CU-hours compute, 0.08 GB storage, 0 GB history and 0.3 GB network transfer. These values are not Production-only.
- Production 32.84 MB and Staging 46.01 MB are project-screen storage observations only, not billing GB-month.
- Production-only compute, billing storage, network transfer, snapshot storage and amount remain UNKNOWN. The US$15/month Neon example is not current actual cost.
- Gate A remains DEFER, Production Provisioning remains NO-GO, and Production readiness remains 70% / NOT READY.
- Preserve existing untracked `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt`, and `0010_commission_rules` files.
- No Production, billing, platform, database, Migration, Restore, Deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 current authority - Sprint 42 Gate A blocker closure

- Sprint 42 is COMPLETE as a Repository-only fail-closed blocker plan. It does not close an external Production gate.
- Current authority: `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md`; Gate A is DEFER, Production Provisioning is NO-GO, and Production readiness is 70% / NOT READY.
- The blocker order is: read-only cost/operations/schema evidence -> exact owner budget/authorization -> Gate A Auth0 only -> independently approved Gates B-G.
- Known fixed minimum remains US$49/month (US$588/year); Neon and other variable/unknown costs remain outside the exact total.
- Preserve the existing untracked `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt`, and `0010_commission_rules` files; do not include or alter them.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 current authority - Sprint 41 cost finalization

- Sprint 41 is COMPLETE as a fail-closed cost and Gate A decision package. Product completion is 98%; Production readiness is 70% / NOT READY.
- Gate A is DEFER and Production provisioning is NO-GO.
- Minimum fixed known cost is US$49/month (US$588/year); Recommended fixed known is US$67/month (US$804/year); Growth total is UNKNOWN.
- Neon actual account usage, recovery cost, domain, monitoring/on-call, logging/overage and tax are not zero and remain variable/UNKNOWN until direct evidence exists.
- The only next action is a human read-only Neon Billing/Usage review. No Production/billing/platform/database/Migration/deploy/DNS/Secret/traffic operation is authorized.

## 2026-08-09 Sprint 40 current state

- Sprint 40 is **COMPLETE AS NETLIFY BILLING / COST EVIDENCE CLOSURE**. Gate A remains DEFERRED; product completion remains 98%; Production readiness remains 70% / NOT READY.
- Owner evidence: Netlify Free / Credit-based / US$0 / 300 credits monthly; current period 274.6 used, 25.4 remaining, with 270 credits from 18 deploys. This is billing evidence, not Production Deploy or capacity PASS.
- Correct known fixed floor is US$49/month (US$588/year) plus Neon and unknowns. The Neon-example indicator is US$64/month (US$768/year) plus unknowns.
- Netlify paid-plan prices are future candidates only and must be rechecked in a separate upgrade Gate if stable Production usage proves Free insufficient.
- Next unique action is read-only Neon plan/usage/cost evidence. Preserve existing untracked `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and unapproved `0010_commission_rules` files.
- No Production or billing action occurred.

## 2026-08-09 Sprint 39 current state

- Sprint 39 is **COMPLETE AS PRODUCTION COST / FINAL GATE A PREPARATION**. Gate A remains DEFERRED; product completion remains 98%; Production readiness remains 70% / NOT READY.
- Known fixed planning floor is US$58/month (US$696/year) plus Neon actual usage and unknown items. The official Neon typical Launch example produces an indicative US$73/month (US$876/year) plus unknowns; never call it an exact minimum or total.
- Recommended small-business planning is US$87/month fixed plus Neon/unknowns; with the same Neon example it is about US$102/month, still not exact.
- Auth0 Essentials remains the future minimum-capacity candidate for a dedicated Production Tenant. Do not execute upgrade, billing or any Gate A-G mutation.
- Next unique step is read-only Netlify billing-model/plan/30-day-credit verification. Preserve all untracked `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and unapproved `0010_commission_rules` files.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 Sprint 38 current state

- Sprint 38 is **COMPLETE AS AUTH0 CAPACITY EVIDENCE / GATE A PREPARATION**. Gate A execution is DEFERRED; product completion remains 98%; Production readiness remains 70% / NOT READY.
- Owner-observed Auth0 evidence: Free costs US$0 and permits one Tenant; the existing Tenant is Development and the limit is reached. Essentials is quoted at US$35/month with three Tenants; Professional at US$240/month with twelve Tenants.
- Dedicated Production Tenant remains mandatory. Essentials is the preferred future minimum-capacity architecture; same-Tenant Production is rejected. Prices are point-in-time evidence, not a guarantee.
- No purchase, plan/payment change, Tenant/SPA/API creation, Auth0 mutation, Production resource, database, Migration, deploy, DNS, Secret or traffic operation occurred.
- Next unique work: consolidate the total Production cost envelope and prepare an exact, separately authorized Gate A execution decision. Do not execute Gate A or start Gates B-G.

## 2026-08-09 Sprint 37 current state

- Sprint 37 is **COMPLETE AS READ-ONLY PREFLIGHT / NO-GO**. Product completion remains 98%; Production readiness remains 70% / NOT READY.
- The consolidated blocker inventory and labels (`AUTOMATABLE`, `USER_ACTION`, `EXTERNAL_LIMIT`, `BILLING_REQUIRED`, `APPROVAL_REQUIRED`, `EVIDENCE_MISSING`) are in `docs/PRODUCTION_PROVISIONING_PREFLIGHT_REPORT.md`.
- Sprint 36, ADR 0022, Evidence, Readiness, Operations, Release Checklist and Backlog are consistent. No external PASS was inferred.
- No Production resource, configuration, database, Migration, deploy, DNS, Secret, deletion, purchase or traffic operation occurred.
- The only next human action is a read-only Auth0 plan/Tenant-capacity inspection and approve/reject decision for a future Gate A proposal. Do not create a Tenant/SPA/API yet.

## 2026-08-09 Sprint 36 current state

- Sprint 36 is **COMPLETE AS PLAN / PROVISIONING NOT AUTHORIZED**. Product completion remains 98%; Production readiness remains 70% / NOT READY.
- `docs/PRODUCTION_RESOURCE_PROVISIONING_PLAN.md` is the authoritative Gate A-G order, isolation matrix, Secret boundary, evidence contract and rollback plan. ADR 0022 records the decision.
- Current external truth is unchanged: Auth0 Production identity, Render Production API and Netlify Production deploy are NOT_CONFIGURED; Neon schema/recovery/capacity evidence remains PARTIAL; DNS/TLS and practical rollback evidence remain open.
- No Production resource, environment variable, database, Migration, deploy, DNS, traffic, Auth0 setting or Secret was accessed or changed.
- The only next action is a human approve/reject decision for Gate A: resolve Auth0 tenant capacity and authorize a dedicated Production Tenant/SPA/API. Do not start Gate B or any other gate in parallel.

## 2026-08-09 Sprint 35 current state

- Sprint 35 is **PARTIAL / HUMAN PLATFORM EVIDENCE REQUIRED**. Repository and configuration inventory is complete; no external platform request was made with unproven authority.
- Production readiness remains **70% / NOT READY**. Product completion remains 98%.
- Sprint 34 Neon reader and Bankeban Function ACL evidence remains PASS. Production database evidence remains PARTIAL: ledger `0001`-`0008` and PITR availability are proven, but later schema parity, capacity, independent/scheduled backup and isolated restore are not.
- Sprint 35 human Backup & Restore inspection proves PITR availability and a six-hour history window. Scheduled snapshots are disabled, no snapshot exists, and no restore was run; the composite recovery gate therefore remains PARTIAL and the restore drill remains BLOCKED.
- Sprint 35 human Monitoring inspection proves 0.25-2 CU autoscaling, 5-minute autosuspend and availability of RAM/CPU/rows/deadlock/cache/working-set/PostgreSQL/pooler/database-size metrics over the last day. Exact utilization and headroom were not inferred; capacity acceptance remains PARTIAL.
- Sprint 35 human Netlify inspection proves the Project and non-Production Deploy Preview history exist. The Project has never had a Production Deploy, so Production frontend/deploy/branch are NOT_CONFIGURED, rollback is BLOCKED and domain/DNS/TLS are UNKNOWN.
- Sprint 35 human Render inspection proves the Project and Production-named Environment exist, but its only Service is explicitly Staging. Independent Production API/service/runtime/deploy metadata are NOT_CONFIGURED; health/readiness/log evidence is BLOCKED.
- Sprint 35 human Auth0 inspection proves only the Development Tenant/Staging SPA exists. Production Tenant/SPA/API/issuer/audience/allowlists are NOT_CONFIGURED, isolation is PARTIAL, and the Team Tenant limit blocks provisioning.
- Netlify Production site/domain and Render Production API are NOT_CONFIGURED; Auth0 Production public metadata is NOT_CONFIGURED. Their management evidence, DNS/TLS, monitoring and recovery remain BLOCKED; capacity/rollback are UNKNOWN.
- Current protected process environment has no approved Production public origins, platform viewer credentials/resource IDs or `DATABASE_READONLY_URL`. Never substitute Owner, Migrator, API, Push or Staging credentials.
- No additional safe read-only platform inventory is currently available. The next single human action is an explicit approve/reject decision for a separate Production Resource Provisioning Plan Sprint; it does not authorize any resource, deploy, Migration, traffic or secret change.

## 2026-08-09 Sprint 34 final state

- Sprint 34 is **COMPLETE**. An authorized human ran the corrected Production Neon Provision and Verify at Commit `e58932032a788d6928c00457e3ffa661684ca580`; both committed successfully. Codex did not connect to Production.
- Neon read-only evidence is **PASS**. Production database evidence is **PARTIAL**: the safe reader, ACLs and Production ledger `0001`-`0008` are proven, while current feature-schema parity and recovery remain open.
- Bankeban application Function ACLs pass strictly; 37 `public.pgcrypto` / `cloud_admin` Functions remain `ACCEPTED_PLATFORM_INFORMATION`, not a fabricated global-zero result.
- Production readiness remains **70% / NOT READY**. Remaining external platform, monitoring, recovery, cutover and device evidence must be closed separately. Do not start Sprint 35 automatically.

## 2026-08-09 Sprint 34 classified Production Function evidence

- Actual catalog evidence: 11 `app_private` Bankeban Functions owned by `neondb_owner`, application PUBLIC/reader zero, exactly four explicit runtime grants; 37 remaining effective reader Functions are only `public.pgcrypto` Extension members owned by `cloud_admin` through PUBLIC.
- Current security model is classified: application ACLs are strict release blockers; the reviewed pgcrypto tuple is reported as platform information and is never modified. Any other Function/Extension classification fails closed.
- Repository correction is pending human Provision/Verify. Production evidence remains BLOCKED, readiness 70%, release NOT READY; no Production mutation occurred in this repository work.

## 2026-08-09 Sprint 34 diagnostic identity correction

- The no-metadata diagnostic stop was caused by `_FUNCTION_OWNER` versus stale `_FUNCTION_ACL` confirmation literals, not established Neon role rewriting.
- The fail-closed target gate now separately verifies `neondb`, exact role variables and existence, plus `current_user = session_user = banke_production_readonly`. A role-switched or privileged session is rejected.
- No Production state was changed. Evidence remains BLOCKED, readiness 70%, release NOT READY pending the corrected manual diagnostic.

## 2026-08-09 Sprint 34 Function owner blocker

- The exact-role human provision re-run stopped fail-closed before `BEGIN`: a PUBLIC-executable Function in `public` or `app_private` has an owner other than `neondb_owner`. Verification and manual ACL changes were not performed.
- Migrations 0001-0008 define 11 expected Bankeban Functions; the only four runtime entry points are `api_establish_session`, `api_logout_session`, `api_list_employees`, and `api_execute_command`. Their expected owner is `neondb_owner`.
- Historical note: Migration 0001 requested `pgcrypto`; the later read-only catalog diagnostic confirmed the owner mismatch was the reviewed `public.pgcrypto` Extension set owned by `cloud_admin`. The current gate therefore requires application PUBLIC/reader EXECUTE to remain zero, exactly four explicit runtime application grants, and the Extension tuple to match the reviewed platform set without mutation.
- Production evidence remains BLOCKED, Production readiness 70%, release NOT READY. No Production connection or mutation was made by this repository update.

## 2026-08-08 Sprint 34 Function ACL incident

- The Neon-compatible provisioning completed, and the reader passed TLS/database/role/default/ledger/table/write/sequence checks but reported 37 effective Function `EXECUTE` privileges inherited from PostgreSQL's default `PUBLIC` ACL.
- A direct role revoke cannot negate `PUBLIC`. The repository correction requires `banke_api_production` to retain exactly four explicit 0001-0008 entry-point grants, then transactionally removes current/future PUBLIC Function execution and verifies reader zero/runtime four before commit.
- No Production action occurred during this correction. Neon evidence remains BLOCKED, Production readiness remains 70%, and release remains NOT READY pending human re-provision and verification.

## 2026-08-08 Sprint 34 Neon role-attribute compatibility incident

- The first authorized Production provisioning attempt connected with TLS and stopped at the first mutation: Neon cannot authorize `ALTER ROLE ... NOSUPERUSER` without a true PostgreSQL superuser.
- No later grants/revokes/default privileges and no business data/schema/Migration changes occurred. The corrected script uses catalog fail-closed checks instead of dangerous-attribute mutation.
- Neon evidence remains BLOCKED and the corrected script is pending human re-run. Production readiness remains 70%; release NOT READY.

## 2026-08-08 current state - Sprint 34

- Repository support for least-privilege Production evidence access is complete; external provisioning and evidence re-run are BLOCKED. Product completion remains 98%, Production readiness 70%, release NOT READY.
- The evidence role may read only PostgreSQL catalogs and `public.schema_migrations`; direct business-data reads, all writes, sequence writes, application-function execution, ownership, inheritance and privileged attributes are denied.
- Evidence commands use process-only secrets and do not auto-load `.env.production`. Netlify/Render access requires proven read-only authority and Auth0 requires the exact approved read scopes.
- One authorized Production TLS connection performed catalog preflight reads and failed before its first mutation. No deployment, database write, Migration, Auth0/platform change or new evidence hash occurred. Continue the same Sprint with the corrected human re-run in `docs/PRODUCTION_READONLY_ACCESS.md`.

## 2026-08-04 current state — Sprint 33D

- Repository evidence collection is complete; Sprint remains PARTIAL because external Production evidence is BLOCKED. Product completion 98%, Production readiness 70%, release NOT READY.
- `production:evidence:collect` only uses GET against exact Netlify/Render/Auth0 Management hosts and reuses the existing public validator/SELECT-only Neon boundary. It stores no secret values or raw resource IDs.
- Actual safe run created 13 SHA-256 evidence records and manifest `f1a48ff74795c58f2120cc323598b905caf20c89b3503c1828b5124030b179a1` without any Production network/database operation.
- Next unique work is Sprint 34 read-only access provisioning and evidence re-run under separate authorization; never substitute privileged credentials.

## 2026-08-04 current state — Sprint 33C

- Repository Production platform validation is complete; Sprint status is PARTIAL because external evidence is blocked/not configured. Product completion remains 98%, Production readiness 70%, release NOT READY.
- `production:platform:validate` is fail-closed, explicit Production/read-only, GET/HEAD-only for public endpoints, and SELECT-only for a distinct read-only PostgreSQL role. It emits sanitized JSON or Markdown and never converts missing evidence into PASS.
- Current protected local configuration has no approved Production frontend/API public origins, no Production Auth0 public set, and no distinct `DATABASE_READONLY_URL`; Owner/Migrator/API credentials must not be substituted.
- Production, Database, Migration, Auth0, Netlify/Render/Neon settings, traffic, Google Sheets, Apps Script and real notifications were not changed.
- Next unique work is Sprint 33D Authorized Production Evidence Closure under explicit read-only access only.

## 2026-08-04 current state — Sprint 33B

- Repository-side Production Security & Operations Gate is implemented; product completion remains 98%, Production readiness is 70%, and release remains NOT READY.
- Security headers are generated per frontend profile. Production permits only its Google Sheets transport; PostgreSQL Staging permits only its Render/Auth0 origins.
- The Node API has bounded authenticated per-Session limits, non-sensitive build identity, and normalized request telemetry. Existing JWT/Session/Membership/Workspace/RLS boundaries are unchanged.
- `db:status:readonly`, `auth:readiness:production`, `capacity:smoke:staging`, `vapid:parity`, `security:scan`, and `production:gate` are fail-closed operator gates. None authorizes a mutation.
- GitHub quality CI has read-only contents permission and no deploy/database secret path.
- External blockers remain: Production services/schema apply, Production Auth0 security-event delivery, RPO/RTO recovery proof, monitoring/capacity acceptance, and physical-device gates. Follow `docs/PRODUCTION_OPERATIONS_RUNBOOK.md` and request explicit authority one gate at a time.

## 2026-08-03 current state — Sprint 32 Announcement Center

- Announcement Center is implemented only on the PostgreSQL path and reuses the existing transactional outbox, Notification Center, Web Push delivery, badge, bootstrap revision, and Service Worker navigation.
- Staging-only Migration `0022_announcement_center` (`e5056c193598a4dcabcee961ce924caf428ca1207d059ed4448ae85dc9cfc8d3`) adds `announcement` and `announcement_read`, forced RLS, tenant-safe foreign keys, soft delete, audience filtering, and controlled CRUD/read functions. Neon Staging apply/rollback/reapply passed; `0009`/`0010` remain pending.
- REST uses `GET/POST /v1/announcements`, `GET/PUT/DELETE /v1/announcements/{id}`, and `POST /v1/announcements/{id}/read`. Browser mutations retain bearer identity, live App Session, Workspace Membership, Idempotency-Key, optimistic revision, and request-size limits.
- `ANNOUNCEMENT_CREATED` is projected to matching live Workspace members through the existing notification/delivery tables. Announcement read state also marks the matching Notification Center row read so both badges remain consistent.
- Synthetic Neon Staging E2E passes Manager CRUD, employee read/mutation denial, `ALL`/`MANAGER`/`EMPLOYEE`, Workspace A/B isolation, soft delete, notification/badge consistency, idempotency, and API Role direct-table denial. All fixtures were removed.
- Overall assessed completion is **98%**. Windows/Android/iPhone/iPad installed-PWA acceptance is **PENDING USER VERIFICATION**. Production, Production database/Auth0, Google Sheets, Apps Script, and Production deployment are unchanged.

## 2026-08-02 current state — Sprint 31 Real Event Notifications

- The final Windows PWA regression fix reconciles existing PWA subscription metadata/session binding on authenticated bootstrap, before events can be queued. Staging-only `0021_push_delivery_fallback` (`7ec470b263bda1c0677432f1a0f5cb255cefcd25fdf4e256ea6b7fb35f3105f4`) adds Browser fallback only after a selected PWA returns 404/410 and is revoked. Synthetic real-engine E2E passes; Windows PWA delivery remains **PENDING USER VERIFICATION**.
- Sprint 31 final duplicate-delivery hardening uses Staging-only `0020_push_subscription_priority` (`5accdcf763ef5bac72139d9cd8a5dc0d1ae49f70a3306467918f8154edc5733f`). `push.register` stores display-derived `pwa`/`browser` mode; event delivery sends to all active PWA subscriptions and uses Browser subscriptions only when the Workspace/User has no active PWA. It does not use User Agent as the priority signal or add device fingerprinting.
- Neon Staging apply, checksum, least privilege, Browser fallback, Windows/Android/iOS PWA priority, Notification Center single-row behavior, Workspace isolation, deduplication, Badge, and notificationclick regression pass. Real Windows duplicate-notification revalidation remains **PENDING USER VERIFICATION**.
- Sprint 31 code, automated gates, Neon Staging apply/down/reapply, least-privilege checks, and synthetic Workspace A/B E2E are complete. Physical Windows/iPhone/iPad/Android delivery remains **PENDING USER VERIFICATION**; assessed completion is **97%**.
- `0019_real_event_notifications` checksum: `34ea99054d2e4484884ff0f8f89a4348dd0a8bed9fcaf8b57aceef03664b05d6`. It is applied only to Neon Staging; `0009`/`0010` and Production remain untouched.
- The existing outbox trigger is the only business-event notification engine. Supported real events are employee clock-in/out to active managers, leave submission to active managers, leave approval/rejection to the applicant, and schedule creation/direct leave update to the affected employee.
- A centralized resolver uses live Workspace, Membership, role, employee mapping, actor self-exclusion, and recipient preferences. Client-provided recipient/role data is never authoritative.
- `notification_preferences` provides `clockEvents`, `leaveEvents`, and `shiftEvents`; defaults preserve existing behavior. API Role access remains controlled-function-only with zero direct notification/preference table privilege.
- Existing Notification Center, unread badge, Smart Polling, Service Worker, durable Push queue/worker, 404/410 cleanup, test notifications, and destination allowlist remain authoritative.
- `shifts.update`, `shifts.delete`, and an announcement module do not exist; Sprint 31 does not fabricate them. Real-device delivery evidence is the only next gate.
- Sprint 31 notification-click hotfix: the Service Worker now distinguishes an installed standalone PWA from an ordinary same-Origin Browser tab, focuses the PWA without reload, and routes clock/schedule/time-off events through an exact same-scope destination allowlist. The Staging PostgreSQL cache version is `banke-staging-postgres-v10`; Windows installed-PWA revalidation remains **PENDING USER VERIFICATION**.

## 2026-08-01 current state — Sprint 30 Offline First

- Sprint 30 implementation and automated acceptance are complete; real-device offline recovery
  remains **PENDING USER VERIFICATION**. Overall assessed completion is **96%**.
- `STAGING POSTGRES` now keeps a bounded, versioned, environment- and user-scoped offline cache
  for bootstrap, employees, shifts, time-off requests, and notifications.
- The existing Command API remains authoritative. Supported offline writes are attendance clock
  in/out, monthly leave replacement, schedule/time-off submissions and cancellations, and the
  existing `shifts.create` Command. There is no fabricated `shifts.update` or `shifts.delete` path.
- Queued writes receive one idempotency key at enqueue time, use bounded exponential backoff,
  drain sequentially after `online`, and stop safely on a bootstrap-revision conflict instead of
  overwriting newer server data.
- Auth0 tokens, cookies, raw Session IDs, email addresses, and secrets are never stored in the
  offline store. A SHA-256 session binding scopes the cache, and logout/account switching clears it.
- A cold start while fully offline still requires the existing Auth0/App Session trust boundary;
  offline mode does not bypass authentication. This limitation is intentional and security-critical.
- Production, Production database/Migration/Auth0, Google Sheets, Apps Script, and Production
  deployment remain untouched.

## 2026-07-30 current state — Sprint 29 Web Push release gate

- Sprint 29 status is **PARTIAL / PENDING USER VERIFICATION**; assessed completion stays at
  **95%**.
- Sprint 28 Android installed-PWA background delivery remains accepted and is not being redone.
- The existing standard Web Push/VAPID/Service Worker architecture remains unchanged.
- Minimal hardening covers desktop-style iPadOS recognition, Home Screen-only Apple activation,
  synchronous Push-lock recovery, de-duplication, controlled disable/re-subscribe,
  account-switch isolation, same-origin notification click, and badge/read-state consistency.
- Windows Edge, iPhone Home Screen PWA, and iPad Home Screen PWA may be marked PASS only from
  owner-supplied physical-device evidence using
  `docs/SPRINT_29_WEB_PUSH_RELEASE_GATE.md`.
- Never add Firebase, APNs, email, SMS, a second Service Worker, or a second notification state
  store. Do not alter accepted Session, Membership, Workspace, RLS, or provider allowlist
  boundaries.
- Production, Production database/Migration/Auth0, Google Sheets, Apps Script, and Production
  deployment remain untouched.

## 2026-07-30 current state — Sprint 28 FCM transport hardening

- Sprint 28 status: **COMPLETE**. Current assessed completion is **95%** (previously 94%).
- Implementation baseline: `d19765f9bf8be3f8812f783f03b081aaf5678c75`.
- ADR 0017 remains authoritative: Chrome and Android use standard Web Push through an `fcm.googleapis.com` Push Subscription endpoint, VAPID, `web-push`, and the existing Service Worker.
- No Firebase SDK, Firebase project, FCM registration token, second notification store, or second Service Worker exists.
- Synthetic Neon Staging verifies registration, same-endpoint update, controlled removal, re-subscription, 404/410 endpoint revocation, Workspace A/B isolation, Session/Membership checks, and API/worker least privilege.
- Browser automation verifies background system-notification rendering, same-origin click-to-focus/open, subscription-change signaling, foreground Notification Center refresh, and unread badge behavior.
- Windows Chrome has prior owner evidence for standard Web Push system delivery. After 20:22 (Asia/Taipei), the owner verified the latest `STAGING POSTGRES` installed Android PWA: Push showed enabled, the test notification was sent from that same Android device, and the Android system background notification arrived after returning to the Home screen.
- Next recommended work: Sprint 29 — remaining Web Push real-device release gate for Windows Edge and iPhone/iPad Home Screen PWA. Do not infer those device results from Android or automation.
- Production, Production database, Production Auth0, Google Sheets, and Apps Script remain unchanged.

## 2026-07-29 current state — Sprint 27 Standard Web Push

- Current assessed completion: **94%**.
- Source baseline: `91013831b3e4ed2ffcc436e6afbf0d30f42eae5b`.
- Standard Web Push extends the existing Notification Center; it is not a second source of truth.
- `0016_web_push_subscriptions` passed Neon Staging apply/down/reapply with checksum `31816e7e710a2b806dac0aed34329a268201b37456105a2b45f147d74ee0a476`.
- Edge re-registration exposed a strict-provider gap: Microsoft WNS uses the
  `notify.windows.com` host family, which was absent from the `0016` endpoint policy.
  Additive Staging-only Migration `0018_edge_web_push_provider_allowlist` and the Node
  validator now keep register/unregister/test on the same anchored official-provider
  allowlist. Final Edge verification remains pending; Production is unchanged.
- API/worker Role separation, forced RLS, bounded delivery/retry, endpoint cleanup, Service Worker events, and device UI are implemented.
- Live synthetic Neon Staging E2E passes registration, queue projection, idempotency, rate limiting, revoked-Membership rejection, payload privacy, direct-table denial, and Workspace A/B isolation.
- The isolated Render Staging worker is enabled with a distinct least-privilege credential and protected VAPID settings; readiness is HTTP 200. The non-Production Draft is `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app/`.
- Windows and iPhone Home Screen PWA delivery remain **PENDING USER VERIFICATION**.
- Windows clean-profile evidence confirmed registration and system delivery work. A later test-button failure was `429 PUSH_RATE_LIMITED` after three successful tests in ten minutes; the generic authorization message is fixed without weakening the limit. Windows re-verification remains pending on the replacement Draft.
- Production, Production database, Production Auth0, Google Sheets, and Apps Script remain unchanged.
- Historical Sprint 27 gate: before Sprint 28 approval, only the exact Draft origin could be added to the existing Staging Auth0/Render allowlists.

## 2026-07-29 current state — Sprint 25 Notification Center Foundation

- Current assessed completion: **92%** after local automated acceptance.
- Historical Sprint 25 state: `0014_notification_center` existed in Git but was not yet applied. Sprint 26 later applied it only to Neon Staging.
- Notifications are Workspace- and recipient-scoped, projected transactionally from existing outbox events, and contain no leave reason, contact data, token, Session ID, or credential.
- The API exposes only `GET /v1/notifications`, `notifications.mark-read`, and `notifications.mark-all-read` through existing live Session/Membership/Workspace authorization and least-privilege controlled functions.
- The frontend provides a safe notification dialog, unread badge, read/unread controls, and deterministic ordering only in PostgreSQL mode. Google Sheets mode is unchanged.
- Recipient notification state is part of the deterministic bootstrap revision. Existing Smart Polling, BroadcastChannel/storage, and Service Worker revision signals refresh it; do not add a second sync controller.
- Firebase Push, APNs, email, and SMS are not implemented.
- Because GitHub main may feed the isolated Staging service before `0014` is applied, undefined notification functions are treated as a disabled optional capability: existing bootstrap continues, list returns `available: false`, and mutations fail closed with 503.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, and Netlify were not modified or deployed.
- That database/API acceptance completed in Sprint 26. The remaining work is real-device notification UI acceptance on the non-Production Draft.

## 2026-07-29 current state — Sprint 24 Real-time Sync v2

- Current assessed completion: **91%** after automated acceptance; real-device evidence remains **PENDING USER VERIFICATION**.
- PostgreSQL Staging retains one synchronization controller and the deterministic server revision. Smart polling uses 2 seconds while recently active, 20 seconds while idle, and 60 seconds while backgrounded.
- `visibilitychange`, `pageshow`, focus, user activity, and offline/online recovery all reuse the same debounce, cooldown, timer, and in-flight request protection.
- `BroadcastChannel`, an environment-scoped `storage` event, and the Service Worker distribute revision-only signals between tabs and controlled PWA clients. No token, Session ID, personal data, or bootstrap payload is broadcast or cached.
- `GET /v1/bootstrap` and `GET /v1/bootstrap/revision` expose `X-Bootstrap-Revision`. The browser validates the header against the JSON body and fails closed on a mismatch.
- An unchanged revision performs no full bootstrap request, state write, or render. A changed revision fetches one full bootstrap, calculates changed top-level sections, merges only those sections, and only notifies affected UI listeners.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, and Netlify were not modified or deployed.
- Next and only work: execute the Sprint 24 real-device smart-polling checklist in `docs/NEXT_SPRINT.md`. Windows, iPhone, Android, and iPad must not be marked PASS without owner evidence.

## 2026-07-28 current state — Sprint 23 synchronization hardening

- Current assessed completion: **90%**, with Sprint 23 real-device evidence still pending.
- The existing PostgreSQL foreground controller now checks authenticated `GET /v1/bootstrap/revision` before fetching the full bootstrap.
- The deterministic revision covers both the role-visible bootstrap and role-visible time-off request result. Leave approval/rejection, scheduled leave, shifts, attendance, approved hours, and other accepted command results therefore converge through one revision boundary.
- An unchanged revision causes no full bootstrap request, state write, render, or Time-Off refresh. A changed revision follows the existing validated bootstrap event path and preserves unsent Time-Off forms.
- The accepted 15-second polling interval, 250 ms debounce, 1-second cooldown, one timer, one in-flight promise, offline/hidden suspension, Session handling, and Google Sheets isolation remain unchanged.
- No database schema, migration, Production, Auth0, Google Sheets, Apps Script, Render, or Netlify configuration was changed.
- Windows, iPhone, Android, and iPad Sprint 23 cross-device synchronization are **PENDING USER VERIFICATION**. Do not infer real-device PASS from automated tests.
- Next and only work: execute the real-device checklist in `docs/NEXT_SPRINT.md`; do not start another feature Sprint first.

## 2026-07-28 current state — Sprint 22 foreground polling

- Current assessed completion: **89%**.
- PostgreSQL Staging uses the single Sprint 21 synchronization controller plus a centralized 15-second foreground polling constant.
- Polling requires a connected authenticated Session, `document.visibilityState === 'visible'`, and an online browser. Hidden/offline/logout/Session-clear/page unload stop all scheduled cycles; visible/pageshow/focus/online safely resume.
- One polling timeout, the existing 250 ms debounce/1-second cooldown, and one shared in-flight promise prevent duplicate or overlapping bootstrap requests.
- The deterministic server revision remains authoritative. Unchanged data does not replace state or rerender; changed data follows the existing bootstrap/UI path. Time-off refresh still preserves unsent forms.
- Automated regression and quality gates cover lifecycle, retry, failure retention, warning suppression, Google Sheets isolation, and Production isolation.
- Windows and iPhone Safari/PWA foreground polling acceptance is **PENDING USER VERIFICATION**. Do not infer real-device PASS from fake-timer tests.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, and Netlify architecture were not modified or deployed.
- Next and only work: complete the exact real-device acceptance in `docs/NEXT_SPRINT.md`; do not start Sprint 23 first.

## 2026-07-28 current state — Sprint 21 foreground synchronization

- Starting source baseline: `e0e0111a3c8d411d0075c176cb5a6a0fbaf798b5`; overall assessed completion: **88%**.
- PostgreSQL views refresh bootstrap safely on visible `visibilitychange`, `pageshow`, and focus, with debounce, cooldown deduplication, one in-flight request, and stale result rejection.
- The server returns a deterministic revision of the role-visible bootstrap payload. The browser replaces state and rerenders only when that revision changes.
- Time-off foreground reads preserve unsent employee forms and do not rerender unchanged data.
- Automated build, check, full regression, release gate, environment isolation, sensitive-information scan, and production dependency audit pass.
- Production, migrations, databases, Auth0, Google Sheets, and Apps Script were not modified or deployed.
- Signed-in Windows acceptance and iPhone Safari/PWA acceptance remain **PENDING USER VERIFICATION** on the new isolated Draft.
- Next and only Sprint: **Staging foreground-sync real-device acceptance and release decision**.
- Do not include `.codex/`, `.netlify/`, generated `dist-staging-postgres/`, or the unrelated untracked `0010_commission_rules` migration files.

## 2026-07-27 current state — time-off workflow Phase 1

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`.
- Overall completion: **87%**.
- `0013_time_off_requests` is applied only to Neon Staging and has passed down/up rollback rehearsal with checksum `f6f059b83f5a0ce0cbd172bbff479d8b9b9bb74cd4b0a2a1adc373d52fb4fcd2`.
- Formal schema and controlled APIs now separate fixed scheduled leave from ad-hoc leave. The accepted surface is `GET /v1/time-off-requests` plus `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- Employee self-service and manager review authorization, reason privacy, same-store approved schedule visibility, idempotency, RLS, and Workspace isolation passed.
- Legacy `leave_selections` is unchanged and was not auto-classified. Production, Auth0, Google Sheets, Apps Script, payroll, attendance, employee management, shift behavior, and frontend UI were not changed.
- The frontend feature, feature-specific Draft, and iPhone UI acceptance are **not complete**. The next and only Sprint is **「前端排休／請假 UI 與老闆審核接線」**: employee “我的排休／我要請假”, quota/status, approved same-store overview, manager pending/processed queues, confirmed review actions, mobile privacy presentation, a new non-Production Draft, and iPhone acceptance.
- Do not add a parallel API, do not convert old leaves by assumption, do not apply `0013` to Production, and do not include the unrelated untracked `0010_commission_rules` files.

## Historical context — 2026-07-25 (superseded by the current state above)

更新日期：2026-07-25
產品程式基準：本文件所在 Commit（本輪驗收起始 Commit：`b47eceec6356fc0b1c70e4784ef4ba29a4fe9b63`）

### Historical status snapshot

- 當時專案整體完成度：**86%**（不再是目前完成度）。
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

## 2026-07-25 Staging 裝置矩陣續驗

- 核准的 Google Sheets `STAGING` Draft 為 `https://6a63614eb402881cdc7fd7f2--inspiring-sunshine-9eab99.netlify.app/`；本輪未建立新 Draft，也未部署 Production。
- Windows Chrome 真瀏覽器第一次載入及重新整理均直接顯示 `STAGING`，未再出現 `STAGING POSTGRES`；Manifest 使用 `banke-staging-v1`，Console JavaScript error 為 0。
- Auth0 Staging allowlist 完成後，真實 Authorization Code + PKCE 回呼成功，Session Claim 存在且與 Auth0 Session ID 一致；重新整理後重新發起登入可沿用 Auth0 Provider Session 完成驗證。前端採記憶體 Token Cache，重新整理後登入按鈕回到未驗證狀態屬既有 Staging 驗證頁設計，並未宣稱為完整產品 Session UI。
- Windows Edge 真實引擎的隔離設定檔完成第一次載入與第二次載入；兩次均顯示 `STAGING`、未出現 `STAGING POSTGRES`，且已建立 Staging Service Worker／Cache Storage／Script Cache。互動式 Auth0、安裝 PWA 與可及性仍需人工操作。
- 公開 Draft 資產唯讀檢查確認資料層為 `google_sheets`、沒有 PostgreSQL API Endpoint；Manifest id／start URL 為 `./?app=banke-staging`，Service Worker 使用 Staging cache、`skipWaiting()`／`clients.claim()`，且未使用跨 cache 的全域 `caches.match()`。
- 品質檢查 PASS；29／29 自動回歸 PASS。iPhone、Android、iPad、Android Tablet 與 macOS 真實瀏覽器仍缺裝置證據，維持 `BLOCKED`；因此專案完成度維持 86%。
- 本輪未修改資料庫、Migration、Production、Google Sheets、Apps Script 或產品功能；隔離 Edge 測試設定檔已清除。

## Historical next priority at that time

**補齊 Staging 真實裝置人工矩陣**

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
## 2026-07-29 current state — Sprint 26 Notification Center Staging activation

- Current assessed completion: **93%** after real Neon Staging database/API acceptance; Windows and iPhone notification UI acceptance remains pending.
- Migration `0014_notification_center` is applied only to Neon Staging with checksum `c966d0ee7ac3b09cfaffdb8ef8e92a126db411c5fa4ffcf719709dcf0d83c2bc`.
- Real PostgreSQL testing found that `jsonb_object_length()` is unavailable. Immutable `0014` was preserved; additive `0015_notification_command_validation` replaces only the controlled notification Command function with equivalent exact-key validation.
- Controlled apply/down/reapply, duplicate-up protection, ledger order, forced RLS, indexes, constraints, trigger, controlled functions, PUBLIC revocation, and API Role grants passed.
- Fully synthetic Workspace A/B boss/employee E2E passed notification generation, approve/reject delivery, unread/read state, sorting, idempotency, revision refresh, private-reason exclusion, SQL-injection rejection, cross-Workspace denial, and zero direct table access. Fixtures were removed afterward.
- Render Staging readiness remained HTTP 200. Production, Production database, Auth0, Google Sheets, Apps Script, and Production deployment were not modified.
- Next and only work: complete real Windows/iPhone notification badge, navigation, Smart Polling, cross-client, logout, and mobile acceptance on the new non-Production Draft; do not add external push channels.
