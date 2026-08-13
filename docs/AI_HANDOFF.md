# AI Handoff

## Sprint 65 current state - 2026-08-13

- One dedicated Production read-only connection was manually executed under explicit Owner authority; that authority is consumed and no second connection is allowed.
- Sanitized source evidence hash: `2b438c87081aa152a1cc7d53782e3e4d1b17bdf6693ae8c4497179cb0c8146ba`; Sprint 65 analysis evidence hash is maintained by its companion SHA-256 file.
- PASS: `TARGET_IDENTITY`, `TLS_VERIFY_FULL`, `ZERO_UNEXPECTED_MIGRATIONS`; the dedicated reader boundary also passed but does not close the separate Migration-operator `ROLE_BOUNDARY` Gate.
- BLOCKED: `FRESH_LEDGER_AND_CHECKSUM` because 13 expected versions are missing; `STRUCTURAL_STARTING_BASELINE` because collection stopped before catalog queries. Do not call this a structural mismatch.
- Sanitized ledger: count 8/range `0001`-`0008`; missing `0009`, `0011`-`0022`; unexpected NONE; checksum mismatch NONE.
- Gate count: 9 PASS / 13 non-PASS. Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Migration Technical Readiness NO-GO; authorization NOT_GRANTED.
- Next work should be Repository-only current-baseline/final-parity separation. Never reuse the consumed connection authority.

## Sprint 64 current state - 2026-08-13

- The authorized event-time read-only attempt stopped before connection: the dedicated reader URL, expected database identity, expected reader role and CA input were absent from the current protected process.
- No substitute Owner/Admin/Migrator/API/Push/Staging credential was used. No Production connection, SQL, catalog read, Migration or mutation occurred.
- All five read-only targets remain BLOCKED. `ROLE_BOUNDARY` was not evaluated because it is a Migration-operator Gate; `EVIDENCE_FRESHNESS` was not evaluated because it also requires the event-specific restore point.
- Sanitized evidence: `PRODUCTION_MIGRATION_EVENT_TIME_READONLY_EVIDENCE.json`; its companion SHA-256 record must verify before use.
- Gate count remains 6 PASS / 16 non-PASS. Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Technical Readiness NO-GO; authorization NOT_GRANTED.

## Sprint 63 current state - 2026-08-13

- Authoritative Migration Gate is schema v4: 6 PASS / 16 non-PASS. Only `RUNTIME_COMPATIBILITY` and `IMMUTABLE_EXECUTION_ARTIFACT` changed.
- Runtime compatibility is fail-closed: all PostgreSQL application runtimes stay drained at `0008`-`0021`; current API/worker/frontend may resume only after `0022` ledger/catalog PASS. Production versions and mixed-runtime operation are not claimed.
- Exact manifest has 21 versions/42 files, a 13-version upgrade subset, excludes `0010`, and hashes to `769fcc39a0a9aa0a8e18355e31dcd859018295cdb7f4940f75a30ce244217cbf`.
- `REPOSITORY_COMMIT_IDENTITY`, event authorization and all Production evidence/configuration/mutation Gates remain non-PASS. Production 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Technical Readiness NO-GO; authorization NOT_GRANTED.
- No Production connection, SQL, Migration, Restore, deploy, external configuration, billing action or mutation occurred.

## Sprint 62 current state - 2026-08-12

- `database/production-migration-final-readiness.expected.json` schema v3 is authoritative for all 22 Gates and their closure metadata.
- Gate count remains 4 PASS / 18 non-PASS. Primary categories: Repository 2, read-only Production 5, external configuration 3, Production mutation 3, commercial-only 0, human authorization 3, dependency-blocked 2.
- Phase 1 may close immutable-artifact/runtime-compatibility work and, under separate dedicated-reader authority, target/TLS/ledger/unexpected-version/structural-baseline evidence. Phase 2 needs external configuration; Phase 3 needs exact mutation and event authority.
- Inventory remains expected 21, historical Production 8, missing `0009`, `0011`-`0022`, unexpected/checksum mismatch NONE; `0010` is excluded.
- Recovery inheritance is limited to PITR, isolated Restore and RTO PASS. RPO is NOT_PROVEN and the event-specific restore point is BLOCKED.
- Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Migration Technical Readiness NO-GO; authorization NOT_GRANTED; Sprint 62 Production mutation NONE.

## Sprint 61 current state - 2026-08-12

- Repository Migration inventory/checksums/order: PASS for 21 tracked versions; `0010` remains unapproved and excluded.
- Fresh disposable PostgreSQL 18.4 upgrade/fresh-install parity: PASS, fingerprint `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e`, evidence `7e921df8aade0b1b4fd676877d908aff6de1a3eb7f2aac82970759080b65167d`.
- Updated 22-Gate disposable success-path simulation: PASS, evidence `d811ce03f26d358e229cd86c0f4aad80c00b4b09f4531cea4bccd92f6c6c1c6a`, zero residual resources.
- Actual Production Migration Technical Readiness: NO-GO with 18 non-PASS Gates; authorization NOT_GRANTED.
- Sprint 61 process had no dedicated Production read-only inputs. Do not substitute Owner/Admin/Migrator/API/Push/Staging credentials; event-time identity/TLS/ledger/catalog remains BLOCKED.
- Isolated Restore PASS; RTO 112.335 seconds PASS; RPO NOT_PROVEN; pre-Migration restore point BLOCKED; rollback strategy PARTIAL with all 13 versions conditionally reversible only.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production connection, SQL, Migration, Restore, deploy, resource or billing mutation occurred.

## Sprint 60 current state - 2026-08-12

- Final Production Launch Gate: **NO-GO**; all 20 required areas are `MUST_BEFORE_GO` and machine-validated in `docs/PRODUCTION_FINAL_GO_NO_GO_GATE.json`.
- Production remains **70% / NOT READY**; Gate A **DEFER**; Provisioning **NO-GO**; Migration authorization **NOT_GRANTED**.
- Production ledger remains `0001`-`0008`; missing `0009`, `0011`-`0022`; never execute unapproved `0010`.
- Recovery: PITR PASS, isolated Restore/RTO PASS at 112.335 seconds, RPO <=15 minutes NOT_PROVEN; Reference/Recoverable Boundaries remain UNKNOWN.
- Do not infer platform readiness from Staging/Repository controls. Auth0, Render API/worker, Netlify Production, domain, DNS/TLS, observability, secrets and final launch/cutover evidence remain non-PASS.
- Next minimal external authority is only an Owner Gate A budget decision, capped at Auth0 Essentials US$35/month after same-day revalidation; resource creation remains separately unauthorized.
- Sprint 60 made no Production connection, mutation, deploy, resource creation or payment.

## Sprint 59 current state - 2026-08-12

- Authenticated Neon Console and official Project/Branch/Operations/Restore API contracts were reviewed read-only. PITR and six-hour retention remain PASS evidence; no documented metadata field attests the latest recoverable or reference Production data boundary.
- The process had no dedicated Production read-only database URL, Neon API credential or Neon CLI. Do not substitute Owner/API/Migrator credentials. No database connection, SQL, API call, Preview, Restore or resource/configuration action occurred.
- Reference Production Boundary UNKNOWN; Latest Recoverable Boundary UNKNOWN; Recovery Gap UNKNOWN; RPO <=15 minutes NOT_PROVEN. RTO <=60 minutes remains PASS at 112.335 seconds from Sprint 57.
- Evidence SHA-256: `f2b60ecc459df2db14edc96618ee7923cb488a951504c865aa248f16c90df72c`.
- Production remains 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT_GRANTED. Next work requires a separately reviewed continuity-boundary instrumentation/authorization package.

## Sprint 58 current state - 2026-08-12

- Authenticated Neon Console read-only evidence reconfirmed the Production project/Branch, PITR capability and a six-hour retention window. It exposed an earliest history boundary and a current point-in-time selector default, but not a latest verified recoverable WAL/data boundary.
- Formal RPO contract is now `Reference Production Boundary - Latest Verified Recoverable Boundary`. A requested selector timestamp, retention duration, Branch fork speed or PITR capability cannot substitute for either boundary.
- Protected dedicated Production read-only inputs were absent from this process; no Owner/API/Migrator credential was substituted and no Production SQL or business-data read occurred.
- Latest Recoverable Boundary UNKNOWN; Reference Production Boundary UNKNOWN; Recovery Gap UNKNOWN; RPO <=15 minutes NOT_PROVEN. RTO <=60 minutes remains PASS at 112.335 seconds from Sprint 57.
- Evidence SHA-256: `9ee8a3fd4337ce177556fb375be5a12f61da21443e9831616eae72b415bc1596`.
- Production remains 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT_GRANTED. Next work needs a separately authorized RPO boundary instrumentation/evidence decision.

## Sprint 57 current state - 2026-08-12

- One exact Owner-authorized Neon historical isolated-Branch drill completed. The temporary Branch was distinct from Production, received no Production traffic, and was deleted; final usage returned to 1/10 with zero residual Sprint 57 Branches.
- Read-only verification on the isolated target confirmed database identity, `transaction_read_only=on`, Migration ledger `0001`-`0008`, and five core tables. Full owner/ACL/RLS parity and distinct process-only verification credentials were not proven.
- Restore point UTC: `2026-08-12T12:16:46.974Z`; RTO was 112.335 seconds (1.87225 minutes), therefore <=60 minutes PASS. Restore-point age at start was 33.482 seconds, but RPO <=15 minutes remains NOT_PROVEN without data-level continuity evidence.
- Evidence SHA-256: `db122c7efb0aced04e2d79dfbf65f8a9008b7e7967794b35f402e63fa91c6ef9`. Actual Restore cost remains UNKNOWN; no payment or upgrade occurred.
- Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Production Migration authorization NOT_GRANTED. Production database mutation: NONE.
- Next unique work requires separate authorization for RPO continuity proof, distinct process-only credential verification, and full restored owner/ACL/RLS catalog checks. Sprint 57 grants no continuing authority.

## Sprint 56 current state - 2026-08-12

- Human read-only Neon evidence records the current Free plan, Branch capacity 1/10 used and 9 available, PITR/history capability with a six-hour window, and historical point-in-time Branch configuration availability. No Branch or Restore was created.
- The Owner is now the configured Recovery Commander for a future separately authorized exercise. This closes the commander prerequisite only; it grants no Restore or Migration authority.
- Actual Restore cost is UNKNOWN despite a displayed US$0.20/GB-month instant-restore rate and no observed configuration-stage upgrade prompt. Never coerce this to zero.
- Actual isolated Restore NOT_EXECUTED; independent backup BLOCKED; scheduled snapshot NOT_CONFIGURED; RPO 15 minutes BLOCKED/NOT PROVEN; RTO 60 minutes BLOCKED/NOT MEASURED.
- Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Restore exercise and Production Migration authorizations NOT_GRANTED. No Production or external resource operation occurred.
- New evidence SHA-256: `2d35688d66b773f86e84ed9955f41b9258120cb3e9e04b340e3be271640f1e23`.
- Next unique gate: exact non-secret Restore cost/resource decision followed by a separate one-time Owner authorization request; do not create a target merely to determine cost.

## Sprint 55 current state - 2026-08-10

- The Repository-only isolated Restore authorization package and validator are complete; `pnpm production:recovery:authorize` returns package PASS but decision DEFER and exercise authorization NOT_GRANTED.
- Proposed future scope: one disposable non-Production recovery target, one distinct process-only credential, zero Production traffic/app binding, metadata/hash verification and mandatory cleanup.
- Current blockers: no exact Owner authorization, no named Recovery Commander, Branch/Restore capacity and cost UNKNOWN, independent backup BLOCKED and scheduled snapshot NOT_CONFIGURED.
- RPO/RTO measurement contracts are complete, but no Production exercise occurred: RPO 15 minutes BLOCKED; RTO 60 minutes BLOCKED / NOT MEASURED.
- Evidence SHA-256: `b674d9aeba6d06be79b84e5a17d3576b0d5225ab1d08ba92bcc64cf86862f892`.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and untracked `0010` files. No Production or external resource was operated.
- Next unique action is human read-only Neon capacity/cost confirmation plus Recovery Commander nomination; no Restore or resource creation.

## Sprint 54 current state - 2026-08-10

- Repository-only Production Recovery package, validator, report and sanitized hash evidence are complete.
- `pnpm production:recovery:readiness` performs no connection or SQL and returns package validation PASS with the actual Production Recovery decision NO-GO.
- Existing human evidence proves PITR availability and a six-hour history observation only. Scheduled snapshots are disabled, latest snapshot is NONE, and no isolated Restore occurred.
- RPO 15 minutes remains BLOCKED; RTO 60 minutes remains BLOCKED and NOT MEASURED. Independent backup, restored-target isolation/verification/cleanup and recovery commander remain open.
- Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO; Production Migration authorization NOT GRANTED. Sprint 54 made no Production or external-platform change.
- Next unique action: obtain owner approval or deferral for one isolated Restore exercise and name the recovery commander. Do not apply a Migration.

## Sprint 53 handoff - 2026-08-10

- Sprint 53 is **COMPLETE FOR RUNBOOK/GATE/DISPOSABLE SIMULATION**; Production Migration remains **NO-GO / NOT AUTHORIZED**.
- Authority: `docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_READINESS_REPORT.md`, finalized `docs/PRODUCTION_MIGRATION_EXECUTION_RUNBOOK_DRAFT.md`, and `database/production-migration-final-readiness.expected.json`.
- `pnpm db:migration:final-readiness` is Repository-only. It validates 19 required Gates, exact order/checksums, evidence provenance and the current fail-closed decision without accepting a database URL or executing SQL.
- Current Gate: 2 PASS (`0010_ABSENT`, `EXACT_EXECUTION_SEQUENCE`) and 17 non-PASS. Any non-PASS or missing Gate remains NO-GO.
- Historical Sprint 53 run: `pnpm db:migration:final-readiness:simulate` passed on one new loopback-only PostgreSQL 18.4 cluster; its evidence SHA-256 at that time was `cb5817d1977bf2cda0858d82223041f95d667c497824a43363a67ab9f340b68f`, residual resources 0. Sprint 61 current evidence is recorded above.
- Disposable simulation GO is never Production GO. Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; authorization NOT GRANTED.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and untracked `0010` files.
- Next unique work: separately authorized Backup/Restore/RPO/RTO and maintenance ownership evidence closure. Do not apply a Production Migration.

## Sprint 52 handoff - 2026-08-10

- Sprint 52 is **COMPLETE FOR DISPOSABLE STRUCTURAL PARITY**; current Production parity remains BLOCKED.
- `database/rehearse-structural-schema-parity.mjs` compares one isolated `0001`-`0008` upgrade path with an independent fresh-install path using PostgreSQL 18.4 and exact tracked checksums.
- Both final 21-row ledgers exclude `0010`. Every catalog section matches: schemas, relations, columns/types/defaults/nullability, constraints, indexes, Functions/signatures, triggers, sequences, policies/RLS, Extensions, owners and ACLs.
- Structural fingerprint MATCH: `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e`; missing/unexpected/mismatched objects and PUBLIC privilege drift are all zero.
- Historical Sprint 52 evidence SHA-256 at that time was `0073aa972158e6ff65a999c083e94743f7881252e83dbadabb7c584a8483ae65`; Sprint 61 regenerated the current evidence recorded above.
- Both clusters/processes/temporary credentials/config/data were removed; residual count 0.
- This is disposable evidence only. Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection or mutation occurred.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and untracked `0010` files.
- Next unique work: representative synthetic-data lock/runtime and disposable recovery rehearsal only.

## Sprint 51 handoff - 2026-08-10

- Sprint 51 is **COMPLETE FOR DISPOSABLE NON-PRODUCTION REHEARSAL**; Production Migration remains BLOCKED / NOT AUTHORIZED.
- `database/rehearse-production-migration-upgrade.mjs` creates two fresh loopback-only PostgreSQL 18.4 clusters, rejects Production inputs, loads only the exact tracked allowlist and removes each cluster after use.
- Both runs rebuilt `0001`-`0008`, applied exactly `0009`, `0011`-`0022` one transaction at a time, and rejected `0010`.
- Per-version predecessor/precondition/postcondition/ledger/lock controls passed; `0018` and `0020` Function dependencies passed. Forced SQL and postcondition failures rolled back to the baseline state.
- Both final catalogs matched with SHA-256 `a610a3d337fd623a8a055a084186b0985fffb75212569acb4f381d02c4f824fb`; deterministic evidence SHA-256 is `c9063a0a55b251b4945db9a2c8f71ae08f42c4fcdf4aab18c275b9d81d318b66`.
- Evidence/report: `docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json`, `.sha256`, and `docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_REPORT.md`.
- Empty disposable timings are not Production scale/lock/recovery evidence. Recovery, RPO/RTO, runtime compatibility and Gate A authorization remain blocked.
- Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. No Production connection, credential, SQL, Migration, deploy or external operation occurred.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and the untracked `0010` files.
- Next unique work: representative synthetic-data lock/runtime and disposable recovery rehearsal only; do not start a Production event.

## Sprint 50 handoff - 2026-08-10

- Sprint 50 is **COMPLETE AS REPOSITORY-ONLY PLANNING**; Production Migration execution remains **BLOCKED / NOT AUTHORIZED**.
- Authority: `docs/PRODUCTION_MIGRATION_GAP_REMEDIATION_PLAN.md`; future draft procedure: `docs/PRODUCTION_MIGRATION_EXECUTION_RUNBOOK_DRAFT.md`; machine-readable inventory: `database/production-migration-gap-remediation.expected.json`.
- Exact order is `0009`, `0011`-`0022`. Never include the local untracked `0010_commission_rules` files.
- Every version has a verified up/down checksum, dependency, precondition, mutation/lock risk, rollback class and compatibility note. No version is declared unconditionally reversible.
- Recovery remains BLOCKED: no scheduled snapshot or isolated Restore verification; RPO 15 minutes/RTO 60 minutes not proven. A maintenance window is required and zero-downtime is UNKNOWN.
- The generic migrator directory-scans and its `up` command applies all pending versions without per-version stops; it is not approved for this Production gap.
- Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Sprint 50 made no Production connection, SQL, Migration, repair, deploy or external change.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and untracked `0010` files.
- Next unique work: a separately authorized disposable non-Production upgrade rehearsal from `0001`-`0008`, using an exact allowlist and one-version verification checkpoints.

## Sprint 49 handoff - 2026-08-10

- Sprint scope **COMPLETE**; Production schema parity remains **BLOCKED**.
- An authorized human used the dedicated Production read-only credential. Identity, safe role boundary and TLS `verify-full` all passed; no Owner/Migrator/API/Push/Staging credential was substituted.
- Ledger evidence is current: expected 21 rows, Production 8 (`0001`-`0008`), missing `0009` and `0011`-`0022`, with no unexpected versions or checksum mismatches.
- The comparator stopped before structural catalog queries. Schema, Function, ACL, RLS/policy and Extension parity are NOT EVALUATED/BLOCKED, not inferred failures.
- Evidence files: `docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.json` and `.sha256`; evidence hash `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.
- Production readiness remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO. No Production write, Migration, repair, grant/revoke, deploy or credential change occurred.
- Preserve/exclude `.codex`, `.netlify`, `dist-staging-postgres`, `production-function-owner-diagnostic.txt` and untracked `0010_commission_rules` files.
- Next unique work is a Repository-only Migration gap remediation plan. Do not run the missing Migrations or structural comparison without new explicit authorization and satisfied recovery prerequisites.

## Sprint 48 handoff - 2026-08-10

- Status: **COMPLETE FOR EXPECTED BASELINE / PRODUCTION PARITY STILL BLOCKED**.
- `database/materialize-expected-catalog.mjs` uses an exact confirmation, rejects Production database inputs, starts a PostgreSQL 18 loopback-only Temp cluster, validates identity before Migration, and loads only filenames from the approved tracked inventory.
- Two fresh databases applied `0001`-`0009` and `0011`-`0022`; both ledgers contain 21 rows and no `0010`. The untracked `0010_commission_rules` files remain untouched and excluded.
- Artifact: `database/production-expected-catalog-baseline.json`; SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`; reproducibility PASS.
- Production was not connected or modified. Readiness remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.
- Next unique Sprint: only after a new explicit authorization and protected dedicated reader inputs, collect current Production metadata and compare it with this baseline. Never substitute owner/migrator/API credentials.

## Sprint 47 handoff - 2026-08-10

- Status: **BLOCKED AT CURRENT PRODUCTION EVIDENCE / REPOSITORY AND 0010 HISTORY CLOSED**.
- `0010` is classified as an intentional unapproved gap, not an expected ledger row: no Git object/path history exists, while committed records consistently exclude it. Never use the local untracked files as a baseline.
- The current process and `.env.production` lack both `DATABASE_READONLY_URL` and `BANK_PRODUCTION_READONLY_ROLE`; no Production connection was attempted and no Migrator/API credential was reused.
- Historical Production ledger evidence is `0001`-`0008`; current ledger and all structural difference counts remain UNKNOWN/BLOCKED.
- `docs/PRODUCTION_SCHEMA_PARITY_REPORT.md` is the current authority. Production stays 70% / NOT READY, Gate A DEFER, Provisioning NO-GO.
- Next unique Sprint: materialize and hash the expected catalog in a disposable non-Production PostgreSQL instance under explicit local-Migration authorization. Do not start a Production inspection first.

## Sprint 46 handoff - 2026-08-09

- COMPLETE as a Repository-only schema-parity plan; actual Production parity evidence remains **BLOCKED** and was not collected.
- `database/production-schema-parity.expected.json` defines `0001`-`0022`: 21 Git-tracked sources/checksums pass, while `0010` is explicitly `MISSING_TRACKED_SOURCE` with no invented checksum.
- `database/production-schema-parity-plan.mjs` and `database/operator/production-schema-parity.readonly.sql` validate the inventory and future SELECT-only catalog scope without accepting a database URL or connecting to Production.
- `docs/PRODUCTION_SCHEMA_PARITY_READONLY_PLAN.md` and its evidence schema define metadata scope, stop conditions and sanitized evidence. Production remains 70% / NOT READY; Gate A DEFER; Provisioning NO-GO.
- Preserve and exclude the existing untracked `0010_commission_rules` files. The next unique Sprint is Repository-only Migration `0010` governance; do not run Production SQL/Migration or start parity evidence collection.

## Sprint 45 handoff - 2026-08-09

- COMPLETE read-only quote evidence: owner candidate `bankeban.com` (`.com`); Verisign RDAP 404 plus Porkbun ordinary non-Premium result.
- Public quote: US$11.08 / one-year registration and US$11.08/year renewal. No purchase, reservation, cart, account, DNS or Production action.
- Known planning floor is US$49/month recurring services and US$599.08/year including the current domain quote, plus variable/UNKNOWN costs.
- Production readiness stays 70% / NOT READY; Gate A DEFER; Provisioning NO-GO.
- Next unique Sprint: Production Schema Parity Read-only Plan. Do not connect to Production or execute SQL/Migration without a new exact authorization.

## 2026-08-09 handoff - Sprint 44 Domain and Operations Cost Evidence Closure

- Status: **COMPLETE AS READ-ONLY PUBLIC EVIDENCE CLOSURE / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- No approved Production domain/TLD exists. Initial and renewal prices remain UNKNOWN; Cloudflare DNS and Netlify-managed TLS are only US$0 candidates.
- Better Stack Free is the documented limited US$0 monitoring/basic-alerting/short-log candidate. Paid telemetry/responder rates are optional and not approved; named responder, data handling, retention and delivery evidence remain open.
- Neon six-hour PITR remains PARTIAL; scheduled snapshots are not configured, snapshot/history totals remain usage-based/UNKNOWN, and isolated Restore remains BLOCKED.
- Known fixed floor remains US$49/month and US$588/year plus domain, Neon/backup usage, operations overage and other UNKNOWN items.
- Next unique Sprint is read-only exact Production domain/TLD selection and registrar quote evidence. Do not purchase, configure DNS/TLS, create integrations, change backup or operate Production.
- No Production, billing, account/integration, alert/log, snapshot, branch, Restore, SQL, Migration, Deploy, DNS, Secret, Auth0, Render, Netlify or Neon mutation occurred.

## 2026-08-09 handoff - Sprint 43 Neon Billing / Usage Evidence Closure

- Status: **COMPLETE AS HUMAN READ-ONLY EVIDENCE CLOSURE / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- Current actual Neon organization plan is **Free / US$0 fixed monthly plan fee**. Included per project: 0.5 GB storage, autoscaling to 2 CU, 100 compute hours and 10 branches.
- Current billing-period organization usage since 2026-08-01 is 10.77 CU-hours, 0.08 GB storage, 0 GB history and 0.3 GB network transfer. Never label these Production-only.
- Production project storage 32.84 MB and Staging project storage 46.01 MB are project-screen observations only; never convert them to GB-month.
- Production-only compute, billing storage, network transfer, snapshot storage and estimated/charged amount remain UNKNOWN. Neon US$15/month remains only a future paid-planning example.
- Next unique Sprint is read-only Domain and Operations Cost Evidence Closure. No purchase, platform integration, alert change, backup change or Production action is authorized.
- No Production, Neon configuration, billing, SQL, Migration, Restore, Deploy, DNS, Secret, Auth0, Render or Netlify operation occurred.

## 2026-08-09 handoff - Sprint 42 Gate A Blocker Closure Plan

- Status: **COMPLETE AS FAIL-CLOSED PLAN / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md` is the current blocker and execution-order authority. It separates Gate A decision blockers, Gate A execution prerequisites and downstream Gates B-G/Release blockers.
- No external blocker was closed and no evidence hash was regenerated. Known fixed minimum remains US$49/month or US$588/year; exact total remains unknown.
- Next unique Sprint is human read-only Neon Billing/Usage evidence. Never upgrade, edit compute/retention, create snapshot/branch, restore, run SQL or change billing.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 handoff - Sprint 41 Production Cost Finalization

- Status: **COMPLETE AS FAIL-CLOSED COST/DECISION PACKAGE / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- Minimum fixed known: US$49/month or US$588/year. Recommended fixed known: US$67/month or US$804/year. Growth total remains UNKNOWN.
- Neon Launch public rates/examples may be used only as formulas or planning anchors; the actual Production plan, complete-period CU/storage/history/snapshot/network usage and charge are not evidenced.
- Domain registration, monitoring/on-call selection, long-term logging, isolated Restore, overage and tax remain unknown or variable. Never coerce them to zero.
- Next unique human action is read-only Neon Billing/Usage evidence. Do not change plan, compute, retention, backup, database or any Production resource.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 handoff - Sprint 40 Netlify Billing / Gate A Cost Closure

- Status: **COMPLETE AS READ-ONLY COST EVIDENCE / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- Current Netlify evidence is Free, Credit-based, US$0 fixed, 300 credits/month; 274.6 credits are used and 25.4 remain. Deploys account for 270 credits, so capacity is not proven.
- Correct fixed floor: Auth0 35 + Render API/worker 14 + Netlify 0 = US$49/month or US$588/year, plus Neon and unknowns. Never restore the US$9/US$20 Netlify assumption as current cost.
- Next unique human action is read-only Neon Usage/Billing evidence. Do not change plan, compute, retention, backup or any Production resource.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 handoff - Sprint 39 Production Total Cost / Final Gate A

- Status: **COMPLETE AS COST AND AUTHORIZATION PREPARATION / GATE A DEFER / PRODUCTION NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- `docs/PRODUCTION_TOTAL_COST_GATE_A.md` is the current cost and authorization authority. Known fixed floor: US$58/month or US$696/year plus Neon usage and unknown items. The indicative US$73/month figure uses Neon's published typical Launch example and is not a guaranteed total.
- Auth0 Essentials remains the preferred future minimum-capacity option, but do not upgrade, buy, add payment or create any Tenant/SPA/API. Gates B-G remain closed.
- Next unique human action: view Netlify Billing / Plan details and return only current plan, Legacy/Credit-based model and recent credit usage. Do not change plan or deploy.
- No Production, billing, Auth0, Neon, Render, Netlify, DNS, database, Migration, deploy, Secret or traffic operation occurred.

## 2026-08-09 handoff - Sprint 38 Auth0 Capacity / Gate A

- Status: **COMPLETE AS EVIDENCE AND DECISION PREPARATION / EXECUTION DEFERRED**; product 98%, Production readiness 70%, release NOT READY, provisioning NO-GO.
- `docs/AUTH0_PRODUCTION_CAPACITY_GATE_A.md` is the current Gate A authority. The owner-observed Free limit cannot support a second Tenant; Essentials is the preferred future minimum-capacity option, not a purchase authorization.
- Do not reuse the Development Tenant for Production. Do not upgrade, add payment, create a Tenant/SPA/API, or start Gate B-G.
- Next work may only consolidate the complete Production cost envelope and a later exact Gate A authorization package. Recheck Auth0 pricing and downgrade/retention rules at authorization time.
- No Production, Auth0, billing, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 handoff - Sprint 37 Production Provisioning Preflight

- Status: **COMPLETE AS READ-ONLY PREFLIGHT / NO-GO**; product 98%, Production readiness 70%, release NOT READY.
- `docs/PRODUCTION_PROVISIONING_PREFLIGHT_REPORT.md` is the current blocker/classification and authorization-gate authority. ADR 0022 and the Sprint 36 plan remain valid.
- The preflight confirms Auth0 Production is blocked/not configured, Neon is partial, Render/Netlify Production are not configured, and DNS/TLS, monitoring, Secrets and rollback evidence remain open.
- No Production or billing action occurred. The next operator may only ask the owner to inspect Auth0 Team plan/Tenant capacity and return non-secret entitlement/quote information plus approve/reject intent. Do not buy, create or delete anything.

## 2026-08-09 handoff - Sprint 36 Production Resource Provisioning Plan

- Status: **COMPLETE AS PLAN / PROVISIONING NOT AUTHORIZED**; product 98%, Production readiness 70%, release NOT READY.
- Added the authoritative provisioning plan and ADR 0022. The plan orders Auth0, Neon recovery/capacity, Render, Netlify, DNS/TLS, monitoring, Migration evidence and traffic with independent human approval Gates A-G.
- Preserve all Sprint 34/35 evidence. Do not reinterpret the Staging Render service, Netlify Deploy Previews or Development Auth0 Tenant as Production resources.
- No Production action occurred. The next operator must stop at Gate A and obtain explicit owner approval for Auth0 tenant-capacity/cost and dedicated Production identity provisioning. That approval cannot authorize another gate.

## 2026-08-09 handoff - Sprint 35 external evidence inventory

- Status: **PARTIAL / HUMAN PLATFORM EVIDENCE REQUIRED**. Production readiness remains 70%; release remains NOT READY.
- Human Neon Backup & Restore evidence is now recorded: PITR is available, history retention is six hours, scheduled snapshots are disabled, no snapshot exists, and no Restore/Preview/branch/snapshot/configuration action occurred. Backup/Restore/DR remains PARTIAL; isolated restore remains BLOCKED.
- Human Neon Monitoring evidence is recorded: primary compute is idle with 0.25-2 CU autoscaling and 5-minute autosuspend; all required compute/database/pooler monitoring categories are available over the last-day view. Exact utilization/headroom was not inferred, so capacity remains PARTIAL.
- Human Netlify evidence proves the Project exists and has Deploy Preview history, but the console explicitly reports it has not yet been deployed. Production Deploy/branch/metadata are NOT_CONFIGURED, rollback is BLOCKED, and Production domain/DNS/TLS are UNKNOWN. Previews were not promoted to Production evidence.
- Human Render evidence proves the Project and Production-named Environment exist, but the single deployed Node/Singapore Service is explicitly the Staging API. No independent Production API exists; Production runtime/deploy metadata are NOT_CONFIGURED and health/readiness/log evidence is BLOCKED.
- Human Auth0 evidence proves only the Development Tenant/Staging SPA exists. Production Tenant/SPA/API/issuer/audience/allowlists are NOT_CONFIGURED; the Team Tenant limit is reached. No Development resource was reclassified as Production.
- `main` baseline `75fd5f0e445c00cc301a1115f7493c52b18ea856` was synchronized 0/0 before documentation work.
- Fail-closed validation returned Repository PASS, six BLOCKED and three NOT_CONFIGURED. The management evidence collector stopped Netlify, Render and Auth0 before network access because dedicated read-only authorization is absent.
- Sprint 34 Neon reader/application ACL evidence remains PASS. Database evidence remains PARTIAL because only ledger `0001`-`0008` is proven; later schema parity, capacity, backup/PITR and isolated restore are open.
- Safe external inventory is exhausted. The next and only human step is to review and explicitly approve or reject a separate Production Resource Provisioning Plan Sprint. Approval of planning alone must not authorize resource creation, deployment, Migration, traffic change or secret handling.
- No Production, Migration, database, deploy, DNS, Auth0, environment or traffic operation occurred. Do not proceed to Netlify, Render or Auth0 until the Neon evidence step is recorded.

## 2026-08-09 handoff - Sprint 34 COMPLETE / Neon evidence PASS

- An authorized human ran Provision and Verify against Commit `e58932032a788d6928c00457e3ffa661684ca580`; both completed with `COMMIT`. Codex did not connect to Production.
- `banke_production_readonly` passes the dangerous-attribute, read-only transaction, timeout, schema-create, business-read/write, sequence-write, ledger and application Function ACL gates.
- Eleven Bankeban Functions are strict PASS; the 37 `public.pgcrypto` / `cloud_admin` Functions remain truthful `ACCEPTED_PLATFORM_INFORMATION` and were not modified.
- Neon read-only evidence is PASS; Production database evidence is PARTIAL because only foundation ledger `0001`-`0008` is deployed and current feature parity/recovery are not proven.
- Sprint 34 is COMPLETE. Production readiness remains 70% and release remains NOT READY due to external Netlify/Render/Auth0, monitoring/recovery, current-stack cutover and device evidence. Do not start Sprint 35 automatically.

## 2026-08-09 handoff - Sprint 34 classified Function ACL

- Production read-only metadata confirms the 11 Bankeban Functions are safe: owner `neondb_owner`, PUBLIC/reader zero, and exactly four explicit `banke_api_production` entry points.
- All 37 remaining reader-executable Functions are `public.pgcrypto` members owned by Neon `cloud_admin`, inherited via PUBLIC, with no direct runtime grant. This is now accepted platform information, not a hidden application PASS and not a global-zero claim.
- Provision/Verify classifies exact application signatures separately from Extension members, never targets pgcrypto, and fails closed on any application ACL regression or unreviewed Extension tuple.
- Production evidence remains BLOCKED, readiness 70%, release NOT READY pending human Provision/Verify. Do not start Sprint 35.

## 2026-08-09 handoff - Sprint 34 diagnostic identity correction

- The first manual Function-owner diagnostic failed before returning metadata because the operator used the intended `_FUNCTION_OWNER` confirmation while the script enforced the stale `_FUNCTION_ACL` literal.
- This was not caused by a proven Neon `current_user`/`session_user` difference. The corrected script now requires both identities to equal the exact read-only login and emits a distinct fail-closed reason for every target condition.
- Production evidence remains BLOCKED, readiness 70%, release NOT READY. Next action is only the corrected read-only diagnostic command in `docs/PRODUCTION_READONLY_ACCESS.md`.

## 2026-08-09 handoff - Sprint 34 Function owner diagnostic

- Status: **PARTIAL / MANUAL READ-ONLY DIAGNOSTIC REQUIRED**. Production evidence remains BLOCKED, readiness remains 70%, and release remains NOT READY.
- The exact-role human provisioning re-run stopped before its transaction because at least one PUBLIC-executable Function in `public` or `app_private` is not owned by `neondb_owner`. No manual ACL statement or verification followed.
- Repository Migrations define 11 expected Bankeban Functions and four explicit `banke_api_production` entry points. `pgcrypto` Extension ownership is plausible but unconfirmed; do not infer the Production object without catalog evidence.
- Next action is only the confirmation-gated `database/operator/production-function-owner.diagnostic.sql`. Review its safe metadata before proposing another provision run; never manually revoke PUBLIC, ignore the mismatched owner, or substitute a privileged credential.
- This repository work did not connect to or modify Production, execute a Migration, deploy, or alter Auth0/platform configuration.

## 2026-08-08 handoff - Sprint 34 Function ACL fix

- Status: **PARTIAL / HUMAN RE-PROVISION AND VERIFY REQUIRED**. Production evidence remains BLOCKED; readiness remains 70%; release NOT READY.
- The corrected role-attribute script completed on Production. The reader verified every least-privilege boundary except Function execution: 37 Functions remain executable only because PostgreSQL grants Function `EXECUTE` to `PUBLIC` by default and direct revokes cannot override additive PUBLIC privileges.
- The manual script now requires the safe `banke_api_production` runtime role and its exact four explicit 0001-0008 Function grants, plus object ownership of every currently PUBLIC-executable Function, before any mutation. It transactionally removes existing and future PUBLIC Function execution while owner capability remains inherent, and rolls back unless PUBLIC/reader reach zero while the runtime stays at exactly four.
- No Production operation was performed by this repository correction. Wait for the owner to rerun `production-readonly-role.provision.sql`, then `production-readonly-role.verify.sql`; all effective/PUBLIC/direct reader Function counts must be zero before evidence collection.

## 2026-08-08 handoff - Sprint 34 Neon role-attribute compatibility fix

- Status: **PARTIAL / HUMAN RE-RUN REQUIRED**. The Production provisioning attempt is BLOCKED and Neon evidence is not PASS; Production readiness remains 70% and release NOT READY.
- The SQL-created `banke_production_readonly` role exists. The first script version failed at its first mutation because PostgreSQL/Neon forbids a non-superuser from issuing `ALTER ROLE ... NOSUPERUSER`, even when the target already has `rolsuper=false`.
- With `ON_ERROR_STOP`, no later role defaults, grants, revokes or default privileges executed. Only catalog preflight reads occurred; no business data, schema or Migration changed.
- The corrected script verifies all five dangerous attributes, memberships, ownership and operator `ADMIN OPTION` before mutation, then alters only `NOINHERIT`, connection limit and role defaults. Wait for the user to rerun it; do not mark Neon evidence PASS beforehand.

## 2026-08-08 handoff - Sprint 34 Production Read-only Access Provisioning

- Status: **PARTIAL / EXTERNAL PROVISIONING BLOCKED**. Repository scope COMPLETE; product completion 98%; Production readiness 70%; release NOT READY.
- The evidence database role is deliberately metadata-only: catalog inspection plus `schema_migrations`, with zero business-table reads/writes, sequence writes, function execution, memberships, ownership or dangerous attributes.
- Evidence commands no longer auto-load `.env.production`. Netlify and Render require an explicit proven read-only identity; Auth0 requires exactly five read scopes. Missing or excessive authority fails closed before network access.
- A SQL-created Neon role exists, but its first provisioning attempt failed before mutation and its protected evidence connection is not yet validated. The Sprint 33D timestamp and manifest remain the last actual evidence. Continue only with the corrected human provisioning steps in `docs/PRODUCTION_READONLY_ACCESS.md`.

## 2026-08-04 handoff — Sprint 33D Authorized Production Evidence Closure

- Status: **PARTIAL / EXTERNAL EVIDENCE BLOCKED**. Repository scope COMPLETE; product completion 98%; Production readiness 70%; release NOT READY.
- Actual collection: Repository PASS; public endpoints, Neon, DNS, operations, recovery and Netlify/Render/Auth0 Management BLOCKED because approved configuration or protected read-only access is absent. No external values were inferred.
- Evidence collector is GET-only for approved management hosts, reuses SELECT-only DB validation, hashes sanitized records, and never includes tokens, cookies, database URLs, environment values or raw resource IDs.
- Continue only with separately authorized Sprint 34 read-only access provisioning. Production was not operated.

## 2026-08-04 handoff — Sprint 33C Production Platform Validation

- Status: **PARTIAL / EXTERNAL PLATFORM EVIDENCE BLOCKED**. Repository scope COMPLETE; product completion 98%; Production readiness 70%; release NOT READY.
- The validator requires `BANK_ENV=production` and explicit read-only confirmation, uses bounded GET/HEAD plus SELECT-only metadata, and reports PASS/FAIL/BLOCKED/NOT_CONFIGURED with secret redaction.
- Local protected configuration lacks approved Production frontend/API origins, Production Auth0 public settings and a separate SELECT-only DB credential. Do not reuse Owner, Migrator, API, Push or Staging credentials.
- Production and all external platforms were untouched. Continue only with Sprint 33D and explicit read-only platform authority; stop before any mutation.

## 2026-08-04 handoff — Sprint 33B Production Security & Operations Gate

- Repository implementation is complete, but Sprint status is **PARTIAL / EXTERNAL EVIDENCE REQUIRED**. Product completion 98%; Production readiness 70%; release NOT READY.
- Added profile-derived Netlify headers, authenticated rate limiting, build SHA/request telemetry, read-only schema/Auth0 validation, VAPID parity, bounded Staging capacity smoke, sensitive scan, CI gate, ADR 0020, and the Production Operations Runbook.
- Production was not connected, migrated, configured, or deployed. Auth0, Google Sheets, Apps Script, Neon Production, Render Production, and Netlify Production were not changed.
- Do not claim B-01 through B-05 closed until actual Production schema/service, Auth0 event, recovery RPO/RTO, monitoring/capacity, and physical-device evidence is recorded.
- Next action requires explicit owner authority. Start with the separate read-only Production schema inspection; stop on any host/database/role/checksum mismatch.

## 2026-08-03 handoff — Sprint 32 Announcement Center

- Status: implementation, Neon Staging Migration rehearsal, real-engine synthetic E2E, and automated gates complete; physical-device acceptance remains **PENDING USER VERIFICATION**. Overall completion: **98%**.
- `0022_announcement_center` checksum is `e5056c193598a4dcabcee961ce924caf428ca1207d059ed4448ae85dc9cfc8d3`; it is applied only to Neon Staging after apply/rollback/reapply. Production and pending `0009`/`0010` were not touched.
- Manager/boss can create, update, and soft-delete within the live Workspace. Employees have read-only audience-filtered access. Unknown roles and cross-Workspace reads/mutations fail closed.
- Announcement publication writes one `ANNOUNCEMENT_CREATED` outbox event; existing Notification Center, Push queue/worker, Badge, revision sync, PWA subscription priority/fallback, and click behavior remain authoritative.
- Announcement read state is per Workspace/user and synchronizes the matching Notification Center unread state. Direct API Role table access remains denied.
- Next and only gate: execute the Sprint 32 announcement checklist on Windows, Android, iPhone Home Screen PWA, and iPad Home Screen PWA. Do not start another feature until results are recorded.

## 2026-08-02 handoff — Sprint 31 Real Event Notifications

- Regression closure: PWA subscription mode/session reconciliation now runs at authenticated bootstrap instead of only when Notification Center opens. Staging-only `0021_push_delivery_fallback` (`7ec470b263bda1c0677432f1a0f5cb255cefcd25fdf4e256ea6b7fb35f3105f4`) queues Browser fallback only after the preferred PWA returns 404/410 and is revoked. Neon Staging and synthetic E2E pass; Windows system notification remains **PENDING USER VERIFICATION**.
- Final fix: Staging-only `0020_push_subscription_priority` adds validated `client_mode` metadata. For one Workspace/User, all active PWA subscriptions are selected; active Browser subscriptions are selected only when no active PWA exists. This preserves multi-PWA delivery while preventing the reported PWA-plus-Browser duplicate. Browser mode is a fallback, not a second Notification Center row.
- Checksum `5accdcf763ef5bac72139d9cd8a5dc0d1ae49f70a3306467918f8154edc5733f`, Neon Staging apply, API Role direct-table denial, synthetic Windows/Android/iOS priority, Browser-only fallback, Workspace A/B isolation, deduplication, Badge, and notificationclick regression pass. Final Windows real-device evidence remains **PENDING USER VERIFICATION**.
- Status: implementation, full automated gates, Neon Staging Migration rehearsal, and synthetic database/API/Web Push E2E complete; physical-device delivery is **PENDING USER VERIFICATION**. Completion: **97%**.
- Migration `0019_real_event_notifications` is Staging-only with checksum `34ea99054d2e4484884ff0f8f89a4348dd0a8bed9fcaf8b57aceef03664b05d6`; apply/down/reapply and exact API grants passed. Production and pending `0009`/`0010` were not touched.
- Real notifications are created only after the business Command commits its outbox row. Recipient resolution is server-side and live-Membership-scoped; actor self-notification, forged recipient, cross-Workspace access, and direct API table access fail closed.
- Clock, leave, and shift preferences apply to future events without disabling Notification Center or the existing `push.test` diagnostic path.
- Synthetic E2E passed two active managers, employee self-exclusion, leave applicant targeting, affected-employee shift targeting, preference suppression, idempotent projection, badge/revision refresh, 404/410 cleanup, and Workspace A/B isolation.
- Next and only work: execute the Sprint 31 physical-device checklist on Windows and installed iPhone/iPad/Android PWAs. Do not start a new feature Sprint until those results are recorded.
- A Windows notification-click hotfix now records the standalone PWA client, prefers it over Browser tabs, focuses and posts an allowlisted local destination without reload, and opens one safe in-scope window only when the PWA is closed. Revalidate clock → Attendance, shift → Schedule, leave/time-off → Time-Off, plus preserved Session behavior; status remains **PENDING USER VERIFICATION**.

## 2026-08-01 handoff — Sprint 30 Offline First

- Status: implementation and automated gates complete; physical offline/recovery verification is
  **PENDING USER VERIFICATION**. Overall assessed completion is **96%**.
- The sole offline controller is `postgres-offline.js`, used only by the PostgreSQL browser path.
  It owns the bounded resource cache, reviewed Command queue, idempotency-key persistence,
  exponential backoff, replay serialization, revision conflict detection, and account isolation.
- Cached reads cover bootstrap (including employees and shifts), time-off, and notifications.
  Google Sheets does not load or execute this controller.
- Existing Commands are reused. Offline support includes clock in/out, leave replacement,
  schedule/time-off submit/cancel, and shift creation. Update/delete shift Commands do not exist
  and must not be simulated client-side.
- On recovery, queued writes drain before foreground refresh resumes. Successful replay fetches
  canonical bootstrap; a revision conflict is retained for explicit discard/review and never
  silently overwrites server state.
- Do not weaken the online Auth0/App Session check to make cold offline login appear supported.
  Do not store tokens, cookies, raw Session IDs, email, or secrets in browser persistence.
- Production, databases, migrations, Auth0/Render/Netlify configuration, Google Sheets, and Apps
  Script were not operated.

## 2026-07-30 handoff — Sprint 29 Web Push release gate

- Status: **PARTIAL / PENDING USER VERIFICATION**; overall completion remains **95%**.
- Starting baseline: `27ccc0aac2b1977365163874c2ed56459e9b4cd0`.
- Sprint 28 Android installed-PWA background delivery is accepted. Do not repeat or redesign it.
- Automated release-gate hardening now covers desktop-style iPadOS classification, Apple
  Home Screen-only Push, synchronous operation-lock recovery, duplicate activation,
  controlled disable/re-subscribe, stale subscription/account switching, same-origin
  notification clicks, stable tags, and badge/read-state consistency.
- Required remaining evidence is physical Windows Edge, iPhone Home Screen PWA, and iPad Home
  Screen PWA execution of `docs/SPRINT_29_WEB_PUSH_RELEASE_GATE.md`.
- Do not mark a device PASS from emulation. Safe failure evidence is limited to capability
  booleans, permission state, HTTP status, safe error code, request ID, device/browser version,
  and observation time.
- No Production, Production database/Migration/Auth0, Google Sheets, Apps Script, Firebase,
  APNs, email, SMS, or Production deployment operation is authorized.

## 2026-07-30 handoff — Sprint 28 FCM transport hardening

- Sprint 28 is **COMPLETE**. Implementation baseline: `d19765f9bf8be3f8812f783f03b081aaf5678c75`; assessed completion is **95%** (previously 94%).
- The accepted design is still ADR 0017 standard Web Push. `fcm.googleapis.com` is the Chrome/Android browser Push Service transport, not a Firebase SDK integration.
- Automated browser and live synthetic Neon Staging tests cover subscription create/update/delete/re-subscribe, 404/410 cleanup, background notification display, click handling, badge/foreground Notification Center refresh, live Session/Membership checks, cross-Workspace denial, and least privilege.
- No Firebase project, SDK, registration token, second Service Worker, schema change, Migration, or cloud resource was introduced.
- Real-device evidence recorded after 20:22 (Asia/Taipei): on the latest `STAGING POSTGRES` installed Android PWA, Push showed enabled; the owner sent a test notification on that same Android device, returned to the Home screen, and received the Android system background notification.
- Do not extend that evidence beyond the reported flow. Automated coverage exists for click, badge/list, disable, and re-subscribe, while any additional real-device release evidence remains part of the next gate.
- Next recommended work is Sprint 29 — remaining Web Push real-device release gate for Windows Edge and iPhone/iPad Home Screen PWA, Staging-only.
- Production, Production database, Production Auth0, Google Sheets, and Apps Script were not modified or deployed.

## 2026-07-30 — Edge Web Push re-registration correction

- Render evidence and Edge Network response confirmed `push.unregister` returned
  `400 COMMAND_INVALID` because the WNS endpoint host was not approved; it was not a
  Session, Workspace, Membership, expiration, key-shape, Auth0, permission, or CORS
  failure.
- The Edge provider family is `*.notify.windows.com`. Source validation and additive
  Staging Migration `0018_edge_web_push_provider_allowlist` use one strict provider set
  for `push.register`, `push.unregister`, and `push.test`.
- No arbitrary HTTPS host was allowed. Lookalike suffixes remain rejected, and all
  existing authorization and database boundaries remain unchanged.
- Windows Edge re-registration remains `PENDING USER VERIFICATION`; do not mark Sprint
  27 complete until controlled unregister → new subscription → register → enabled UI
  passes on the replacement Draft.

## 2026-07-29 handoff — Sprint 27 Standard Web Push

- Source baseline: `91013831b3e4ed2ffcc436e6afbf0d30f42eae5b`; assessed completion: **94%**.
- Architecture: PostgreSQL Notification Center remains authoritative; standard Web Push uses VAPID and `web-push` as a best-effort delivery worker.
- Migration `0016` passed Neon Staging apply/down/reapply; checksum is `31816e7e710a2b806dac0aed34329a268201b37456105a2b45f147d74ee0a476`.
- Live synthetic Staging E2E passes registration/unregistration, queue projection, idempotency, rate limiting, revoked-Membership rejection, direct-table denial, payload privacy, and Workspace A/B isolation; fixtures are cleaned.
- API Role grants were updated to 12 controlled functions and zero direct table access. A pre-existing CONNECT path to the old Staging restore database was removed; the accepted Neon `postgres` maintenance-database behavior remains.
- Staging activation: the distinct worker credential and VAPID secrets are protected in Render, the worker is enabled, readiness is HTTP 200, and the public-key-only Draft is `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app/`.
- Next action remains inside Sprint 27: add that exact Draft origin to existing Staging Auth0/Render allowlists and run Windows/iPhone PWA verification. No real-device Push result is claimed yet.
- Follow-up diagnosis: Render request IDs proved the reported test-button failure was `429 PUSH_RATE_LIMITED` after three successful test deliveries for the same user window. Session, Membership, Workspace, endpoint registration, CORS and Auth0 were not the rejecting layer. The UI and API now preserve that code and show actionable Chinese guidance; the safety limit remains unchanged.
- Production was not modified or deployed.

## 2026-07-29 handoff — Sprint 25 Notification Center Foundation

- Source baseline: `b5167958afece72e9132ded7797e4da5ee68c1cc`; assessed completion after local automated acceptance: **92%**.
- Historical Sprint 25 state: `0014_notification_center` existed but was not yet applied. Sprint 26 later applied it only to Neon Staging.
- Runtime design uses the existing outbox transaction, Session/Membership/Workspace checks, forced RLS, controlled functions, idempotency receipts, audit log, deterministic bootstrap revision, Smart Polling, and Service Worker revision message.
- API Role design remains zero direct table access. New execution grants are limited to notification list/revision/command functions.
- Frontend notification UI is PostgreSQL-only and uses safe DOM construction; Google Sheets does not activate it.
- No external push provider, email, or SMS channel exists.
- No Draft was created because the schema is not yet present in Staging.
- That controlled Staging apply/down/reapply, grant, Workspace A/B, and boss/employee API E2E work completed in Sprint 26. Real-device Draft acceptance remains.

## 2026-07-29 handoff — Sprint 24 Real-time Sync v2

- Source baseline: `0516803b2d7fbcf9bffc0e8bc8296a728dccab29`; assessed completion after automated acceptance: **91%**.
- The existing PostgreSQL synchronization controller now uses one adaptive timer: 2 seconds for recent activity, 20 seconds when idle, and 60 seconds while hidden/backgrounded.
- Foreground lifecycle events, activity, offline recovery, BroadcastChannel, environment-scoped storage events, Service Worker messages, and command refreshes converge on the same debounce/cooldown/in-flight controller.
- Revision signals contain only an integer revision. The Service Worker caches only that marker in the environment-specific app-shell cache and notifies controlled windows; it does not cache API responses.
- The API emits `X-Bootstrap-Revision`; the frontend validates it against the response body. Unknown, malformed, or mismatched revision headers fail closed.
- Unchanged revisions avoid the full bootstrap and all rendering. Changed revisions fetch one validated bootstrap and merge changed top-level sections; unrelated calendar, current-user, and full-app renders are skipped.
- Production, database schema/data, migrations, Auth0, Google Sheets, Apps Script, Render, Netlify, dependencies, and lockfiles are unchanged.
- Windows, iPhone, Android, and iPad real-device smart-polling behavior remains **PENDING USER VERIFICATION**. The next unique work is only the acceptance checklist in `docs/NEXT_SPRINT.md`.

## 2026-07-28 handoff — Sprint 23 synchronization hardening

- Source baseline: `dced15e48aaef02d60c062675015e80ba30e2330`; assessed completion after automated acceptance: **90%**.
- Added a revision-only browser/API read path while retaining the single Sprint 21/22 synchronization controller.
- The revision is deterministic over the caller's authorized bootstrap plus role-visible time-off data. A time-off approval can no longer remain invisible merely because the legacy bootstrap payload itself is unchanged.
- Foreground events and the 15-second visible polling cycle share the same debounce, cooldown, in-flight request, stale-Session rejection, and error-retention behavior.
- Unchanged revisions do not fetch or render the full bootstrap. Changed revisions fetch one validated bootstrap and refresh the Time-Off UI once, preserving unsent employee forms.
- Existing command business logic, Session/Membership/Workspace enforcement, Auth0, RLS, Google Sheets, and Production are unchanged.
- Automated API/client/controller/Time-Off tests and full project gates must remain green in the Sprint commit.
- Windows, iPhone, Android, and iPad Sprint 23 real-device synchronization remain **PENDING USER VERIFICATION**.
- Next unique work is the real-device synchronization acceptance in `docs/NEXT_SPRINT.md`.

## 2026-07-28 handoff — Sprint 22 foreground polling

- Source baseline: Sprint 21 commit `228849eec38128f6093e638991699bc61e509a63`; current assessed completion: **89%**.
- Added a 15-second foreground polling cycle inside the existing PostgreSQL synchronization controller. No second controller, endpoint, WebSocket, SSE, dependency, or architecture was introduced.
- The cycle runs only for a visible, online, authenticated PostgreSQL view; hidden/offline/logout/Session-clear/page unload stop it, while visible/pageshow/focus/online resume it.
- One timer plus the existing debounce/cooldown/in-flight promise prevents duplicate work. Server revision equality prevents state replacement and full render; changes use the accepted bootstrap path.
- Continuous network failures preserve the current UI and log only the first safe warning in a failure streak. Google Sheets and Production paths remain untouched.
- Fake-timer regression covers all Sprint 22 lifecycle/deduplication/revision/failure boundaries. Full quality, release, environment, sensitive-information, and dependency checks must remain green in the Sprint commit.
- Windows and iPhone Safari/PWA acceptance is **PENDING USER VERIFICATION**. Required result: approval appears within 20 seconds while the employee page stays foreground, with no reload/flicker/form loss/duplicate request/Session issue.
- No Production, database, migration, Auth0, Google Sheets, Apps Script, Render, or Netlify change/deployment is part of this Sprint.
- Next unique work is only the real-device evidence and release decision documented in `docs/NEXT_SPRINT.md`.

## 2026-07-28 handoff — Sprint 21 foreground synchronization

- Starting source baseline: `e0e0111a3c8d411d0075c176cb5a6a0fbaf798b5`; current assessed completion: **88%**.
- Implemented PostgreSQL foreground bootstrap synchronization for page visibility, `pageshow`, and focus without polling.
- Event bursts are debounced and deduplicated; one in-flight request is allowed. Unchanged revisions do not emit a bootstrap replacement or rebuild the UI.
- Time-off lists refresh separately and preserve unsent employee schedule/ad-hoc-leave forms.
- Deterministic server revisions cover the role-visible bootstrap payload, making employee/boss command results observable on foreground return.
- Focused and full regression, build, check, release gate, environment isolation, sensitive-information scan, and production dependency audit pass.
- Production, migrations, databases, Auth0, Google Sheets, and Apps Script were not modified or deployed.
- Real signed-in Windows and iPhone Safari/PWA foreground acceptance is **PENDING USER VERIFICATION**; do not infer PASS from automated browser lifecycle tests.
- Next unique Sprint: **Staging foreground-sync real-device acceptance and release decision**.

## 2026-07-27 handoff — time-off workflow Phase 1

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`.
- Completed additive Staging migration `0013_time_off_requests`, controlled read/command API, role grants, tests, and rollback/reapply rehearsal.
- Accepted API surface: `GET /v1/time-off-requests`; `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- Live Staging E2E passed employee own request access, manager review, employee review denial, approved coworker scheduled-leave visibility, pending visibility denial, private reason containment, minimal approved ad-hoc coverage, idempotent replay, duplicate-review rejection, Workspace isolation, and direct-table denial.
- The migration checksum is `f6f059b83f5a0ce0cbd172bbff479d8b9b9bb74cd4b0a2a1adc373d52fb4fcd2`. Migrations `0009` and the unrelated untracked `0010` remain outside this work.
- No Production, frontend, Auth0, Google Sheets, Apps Script, payroll, attendance, employee, or shift change was made.
- Current completion is **87%**. The request workflow is backend-ready in Staging but not user-facing.
- No feature-specific Draft Preview or iPhone UI acceptance exists yet.
- Next and only Sprint: **「前端排休／請假 UI 與老闆審核接線」**, using only the accepted route and commands above; include employee quota/status and same-store overview, manager pending/processed review, confirmed approve/reject actions, mobile privacy display, a new non-Production Draft, and iPhone acceptance.

## Historical handoff snapshot — 2026-07-25

更新日期：2026-07-25
產品程式基準：本文件所在 Commit（本輪驗收起始 Commit：`b47eceec6356fc0b1c70e4784ef4ba29a4fe9b63`）

## 最近完成的 Sprint

**Staging PWA Cache／Service Worker 首次載入修正**

- 以同一 localhost origin 先安裝舊 PostgreSQL Staging Worker，再置換成 Google Sheets Staging，完整重現第一次載入仍顯示 `STAGING POSTGRES`。
- 證實舊 Worker 會以全域 Cache Storage 的 cache-first 命中未版本化 `environment-config.js`／Manifest，造成新 HTML 與舊環境資源混用。
- build 現在為環境設定與 Manifest 加入各 cache build 專屬版本 URL；Worker 僅讀取目前 cache；Staging activation 清除同 origin 的另一個 Staging 變體 cache。
- Worker 註冊使用 `updateViaCache: 'none'`，避免更新檢查受舊 HTTP cache 影響。
- 修正後第一次切回、重新整理、雙向 Staging 變體更新與離線 app-shell 回復均保持正確環境。
- 未修改或部署 Production；未修改資料庫、Migration、Auth0、Neon、Google Sheets 或 Apps Script。

## 測試與驗收結果

- 桌機瀏覽器老闆／員工 UI：PASS。
- Auth0 Staging PKCE、Session Claim、角色與 Workspace 範圍：PASS。
- PostgreSQL read/bootstrap 與 mutation persistence：PASS。
- Revision、Session、Membership、跨 Workspace 與直接資料表拒絕：PASS。
- 無網路、bounded timeout、重複操作與無靜默 backend fallback：PASS。
- Snapshot reconciliation 與測試資料恢復：PASS。
- Service Worker／Cache namespace 隔離及 Google Sheets Staging rollback：PASS。
- 舊 PostgreSQL Worker 控制下第一次載入 Google Sheets Staging：PASS。
- 重新整理、Worker 更新、Google Sheets／PostgreSQL 雙向切換與離線回復：PASS。
- 自動回歸：29／29 PASS；品質檢查：PASS。
- Browser Console JavaScript error：未發現。
- 真實手機／平板／macOS 矩陣：**尚未執行，不得視為 PASS**。

## 2026-07-24 裝置矩陣執行紀錄

- 品質檢查：PASS。
- 自動回歸：29／29 PASS。
- 敏感資訊掃描：追蹤檔 0 個疑似 Token／Private Key 命中。
- Windows Chrome 真瀏覽器：
  - 未登入首頁、STAGING 識別、登入按鈕、重新整理及 Console：已執行。
  - 390×844、360×800、768×1024、1280×800 輔助 viewport：無水平溢位；此結果不得代替真實行動裝置。
  - 首次開啟舊 `STAGING POSTGRES` 快取問題已完成自動重現與修正；相同舊 Worker 狀態下第一次載入即顯示 Google Sheets `STAGING`。
  - 未取得人工 Auth0 測試身分操作，因此登入後老闆／員工、Session、Membership 與 Workspace 流程尚未驗收。
- Windows Edge、iPhone Safari／PWA、Android Chrome／PWA、iPad Safari、Android Tablet Chrome、macOS Safari／Chrome：缺少可操作的指定真實裝置或瀏覽器，標記 `BLOCKED`。
- 本輪只修改 PWA build／Service Worker 與相關回歸測試；沒有資料庫、Migration、Deploy 或 Production 異動。

## 2026-07-25 裝置矩陣續驗紀錄

- 沿用既有 Draft `https://6a63614eb402881cdc7fd7f2--inspiring-sunshine-9eab99.netlify.app/`；未重建 Site、未建立新 Draft、未部署 Production。
- Windows Chrome：
  - 真實瀏覽器第一次載入及重新整理均為 Google Sheets `STAGING`，沒有 `STAGING POSTGRES`，版本化 Manifest 正確，Console error 0。
  - Auth0 Staging allowlist 完成後，真實 PKCE 回呼、Access Token Session Claim 與 Auth0 `sid` 一致性均通過。
  - 重新整理後 Staging 驗證頁因 `cacheLocation: memory` 回到登入按鈕；再次登入可沿用 Auth0 Provider Session 且重新驗證 Claim。完整老闆／員工產品 UI、PWA 安裝及登出仍缺人工證據。
- Windows Edge：
  - 真實 Edge 引擎以隔離設定檔完成第一次載入及第二次載入；均顯示 `STAGING`、未顯示 `STAGING POSTGRES`，版本化 Manifest、Service Worker、Cache Storage 及 Script Cache 均有證據。
  - 互動式 Auth0、PWA 安裝、Narrator、高對比與完整核心流程仍為 `BLOCKED`。
- Draft 公開資產確認 `dataBackend=google_sheets`、未含 PostgreSQL Endpoint；PWA id／start URL 與 Staging cache identity 正確。
- 品質檢查 PASS；29／29 自動回歸 PASS。iPhone、Android、iPad、Android Tablet、macOS Safari／Chrome 因無指定真實裝置，維持 `BLOCKED`，不得視為 PASS。
- 沒有程式、資料庫、Migration、Production、Google Sheets 或 Apps Script 異動；僅更新本輪驗收文件。

## Git 與環境唯讀健康檢查摘要

以下為交接時已提供的唯讀確認，不包含 Secret 或憑證：

- 本輪開始時 GitHub `main` 已同步，驗收基準 HEAD 為 `701169468407df9a9965e9b9e325ecef1d120326`。
- 文件中的最新專案完成度為 86%，唯一下一優先工作為真實裝置矩陣驗收。
- Render Staging 可連線；受保護驗收操作需要合法授權。
- Netlify 固定 Draft 目前為 Google Sheets `STAGING`。
- 未發現明確程式 P0 技術債；掃描到的 `TODO` 僅存在於治理規範文字，不代表未完成程式。
- 架構成熟度約 85%，Production 準備度約 75%。

## 架構成熟度與 Production 準備度

- 專案整體完成度：**86%**。
- 架構成熟度：約 **85%**；身分、租戶、資料、環境與回滾邊界已建立並有 Staging 證據。
- Production 準備度：約 **75%**；尚缺裝置矩陣、監控／告警、CI/CD、發布操作與最終 release candidate 驗收。
- Production 判定：**不可上線**。最近 Sprint 未修改或部署 Production。
- Migration `0009`／`0010` 未套用，不得在裝置矩陣 Sprint 中執行。

## 已知 BLOCKED 項目

- 真實 iPhone、Android、iPad、Android Tablet 與 macOS 瀏覽器需要人工裝置／瀏覽器操作，不能用 viewport 模擬冒充通過。
- Windows Chrome 已完成真實 PKCE 與首次／重新載入，但完整老闆／員工產品 UI、PWA 安裝與登出仍需人工驗收。
- Windows Edge 已完成真實引擎首次／第二次載入與 PWA 儲存建立；互動式 Auth0、PWA 安裝、Narrator、高對比及完整核心流程仍需人工驗收。
- Render Staging 的受保護 API 驗收需要合法 Auth0 Staging 測試身分與有效 Membership；不得略過或偽造授權。
- 固定 Draft 目前已回滾為 Google Sheets `STAGING`。若本次矩陣需要重驗 PostgreSQL，必須先依既有可回復 runbook 取得明確核准並建立隔離 Draft，不得直接切換 Production。
- Safari Service Worker／Cache、PWA 安裝、背景／前景與動態字級尚缺真實裝置證據。
- Production observability、CI/CD、發布後監測與正式 release approval 尚未完成。

目前沒有已知 P0 程式阻擋；上述項目是驗收／營運閘門，未完成前仍禁止 Production 發布。

## 下一個 Sprint 的開始條件

1. 本機 `main` 與 `origin/main` 同步，並記錄要驗收的確切 Commit 與 Draft URL。
2. 準備 [`docs/NEXT_SPRINT.md`](NEXT_SPRINT.md) 列出的八種真實裝置／瀏覽器；缺少的項目必須標記 `BLOCKED`，不得以模擬器替代。
3. 使用合成的 Auth0 Staging 老闆、員工與第二 Workspace 身分；不得把密碼、Token 或個資寫入文件／Log。
4. 驗收前確認 Draft 顯示 `STAGING`、所有請求只指向核准的 Staging 服務、Render readiness 正常且 Production 未被存取。
5. 建立可重複的乾淨基線與 rollback 條件，記錄 Service Worker、Cache、storage、Session namespace 與初始 Snapshot revision。
6. 確認不需要 Migration；`0009`／`0010` 保持 pending。
7. 準備逐裝置截圖、Network／Console 摘要與 PASS／FAIL／BLOCKED 記錄，但不得包含 Secret、Token、Session ID 或真實個資。

未滿足開始條件時，只能回報 `BLOCKED`，不得修改 Production、套用 Migration 或自行開始其他 Sprint。
## 2026-07-29 handoff — Sprint 26 Notification Center Staging activation

- Source baseline: `340e7d043ff2f991e01104085f43d63dc58adeba`; assessed completion after Staging acceptance: **93%**.
- `0014_notification_center` is active only in Neon Staging with its reviewed checksum. Additive `0015_notification_command_validation` preserves migration immutability while correcting the real-engine `jsonb_object_length()` incompatibility.
- Apply/down/reapply and duplicate-up protection passed. Final ledger contains `0014`, then `0015`; intentionally pending `0009`/`0010` were not applied.
- API Role has zero direct notification-table privileges, no elevated role attributes, and exactly the reviewed controlled-function whitelist. PUBLIC table/function grants remain zero.
- Synthetic dual-Workspace boss/employee E2E passed recipient privacy, cross-Workspace denial, submission/review notifications, unread state, ordering, idempotency, revision refresh, SQL-injection rejection, and cleanup.
- Render Staging readiness is HTTP 200. A non-Production Draft is required for the final Windows/iPhone UI acceptance; Auth0 and Render allowlists must be changed only by the user.
- Production, Production database, Auth0, Google Sheets, Apps Script, and Production deployment were not modified.
