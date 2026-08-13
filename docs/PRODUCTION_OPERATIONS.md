# Production Operations Evidence Guide

## Sprint 64 protected-reader stop

- The event-time collector must inspect only process-level presence and stop before connection when any approved dedicated-reader input is missing.
- Never source a replacement from `.env`, chat, logs, Owner/Admin/Migrator/API/Push/Staging credentials or another process.
- Sprint 64 stopped with all protected inputs absent; no connection or SQL ran. The only artifact is sanitized status metadata plus SHA-256.
- A future rerun requires the Owner/operator to place the existing reader in the approved protected process. Presence confirmation is not Migration authorization and does not permit role changes, restore points, traffic control or writes.

## Sprint 63 Repository Migration controls

- Use `pnpm db:migration:repository-closure` to validate the exact manifest and runtime checkpoint contract. It performs no Production connection or SQL.
- Manifest SHA-256: `769fcc39a0a9aa0a8e18355e31dcd859018295cdb7f4940f75a30ce244217cbf`; `0010` is excluded and the candidate authorization is NOT_GRANTED.
- At every intermediate checkpoint (`0008`, `0009`, `0011`-`0021`), keep API, push worker and PostgreSQL frontend drained. Resume only after `0022` ledger/catalog PASS and all separate traffic/authorization Gates pass.
- Current count is 6 PASS / 16 non-PASS; Production remains 70% / NOT READY and Migration Technical Readiness NO-GO.

## Sprint 62 Migration Gate closure boundary

- The authoritative package is schema v3 with 22 Gates and exactly one primary A-G category for each of 18 non-PASS Gates.
- Phase 1 permits Repository work and separately authorized dedicated-reader evidence only. Phase 2 requires separate role/platform/monitoring configuration approvals. Phase 3 requires exact RPO, restore-point, traffic, maintenance, candidate and Migration-event authority.
- A closure-plan PASS is not Migration authorization. Stop before any Production read when dedicated-reader authority/inputs are absent, and stop before every configuration, resource, billing, mutation or traffic action until its exact approval exists.
- Current state: 4 PASS / 18 non-PASS, Technical Readiness NO-GO, authorization NOT_GRANTED, Production 70% / NOT READY.

## Sprint 61 Migration authorization boundary

- `pnpm db:migration:final-readiness` now validates 22 explicit Gates. Repository/package PASS still returns actual Production Technical Readiness NO-GO while any Gate is non-PASS.
- Isolated Restore and RTO are PASS evidence; RPO, pre-Migration restore point, independent backup/full restored security parity and 14 other event/runtime/ownership Gates remain non-PASS.
- Event-time dedicated reader inputs were absent. Never substitute Owner/Admin/Migrator/API/Push/Staging credentials or treat historical evidence as fresh.
- All 13 versions are conditionally reversible; automatic down is prohibited. Before commit, roll back only the current transaction; after commit, stop and choose a reviewed forward-fix, compatible hold or explicitly proven rollback.
- No Production Migration authorization exists. Repository/disposable PASS grants no connection, SQL, snapshot, restore point, Migration, deploy or traffic authority.

## Sprint 60 Final Launch operating boundary

- `PRODUCTION_FINAL_GO_NO_GO_GATE.md` is the current consolidated launch decision: all 20 areas are `MUST_BEFORE_GO`; Final decision is NO-GO.
- Close read-only governance first, then Gate A identity, Gate B recovery/capacity, Gate C Render, Gate D Netlify, Gate E domain/DNS/TLS, observability/secrets/ownership, Gate F migrations, final verification and Gate G traffic.
- Each Gate needs its own exact authorization. Payment, resource creation, migration, deployment and traffic permissions are non-transitive.
- `0010` remains prohibited. Missing `0009`, `0011`-`0022` must not run before recovery/RPO and the Migration Gate pass.
- Current RPO is NOT_PROVEN; RTO is PASS. No operational checklist may reinterpret PITR or the Restore drill as RPO proof.

## Sprint 59 RPO closure boundary

- Official Project/Branch/Operations/Restore metadata plus authenticated Console evidence do not establish the latest durable recoverable data boundary. A caller-selected timestamp or LSN is an input, not provider proof.
- With no protected database/API input, do not substitute a privileged credential or infer a boundary from retention, selector defaults, operation timestamps or Branch creation.
- Current result is Reference Boundary UNKNOWN, Latest Recoverable Boundary UNKNOWN, Recovery Gap UNKNOWN and RPO NOT_PROVEN. RTO remains PASS.
- Sprint 57 authority is closed. No marker, SQL, API call, Branch, Restore, configuration or Production mutation is authorized by Sprint 59.

## Sprint 58 RPO evidence boundary

- RPO is `Reference Production Boundary - Latest Verified Recoverable Boundary`; both must use a trustworthy common time basis and the recoverable boundary must be verified at the data layer.
- PITR capability, retention duration, a selector default/requested timestamp and Branch fork speed are not sufficient evidence.
- Current result: both boundaries and the Recovery Gap are UNKNOWN, so RPO <=15 minutes is NOT_PROVEN. Never coerce these values from the six-hour window or Sprint 57 timestamps.
- No database credential was available to this process; do not substitute Owner/API/Migrator credentials. No SQL, Preview, Restore, resource, configuration or Production mutation occurred.

## Sprint 57 isolated Restore evidence boundary

- The one-time Sprint 57 authorization is consumed and closed. It covered one historical isolated Branch, basic read-only verification and mandatory cleanup only.
- RTO 112.335 seconds, target isolation and cleanup passed. RPO remains NOT_PROVEN; distinct process-only credential and full owner/ACL/RLS verification remain partial.
- Final Branch usage is 1/10 with zero residual Sprint 57 resource. Production database/schema/data/Migration mutation and Production traffic routing were NONE.
- Do not reuse this authority for another Branch, snapshot, Restore, SQL, Migration, retention/plan change or deploy. Actual Restore cost remains UNKNOWN.

## Sprint 56 recovery evidence boundary

- Current Neon plan Free; Branch capacity 1/10 used with 9 available. Historical point-in-time Branch configuration is available and no configuration-stage upgrade prompt was observed.
- Owner is the configured Recovery Commander. The role nomination is not an authorization to create, Restore, migrate, deploy or change billing/configuration.
- Actual Restore cost remains UNKNOWN. Stop before resource creation or billing action unless exact cost/resource scope and one-time authority are recorded.
- Actual Restore NOT_EXECUTED; independent backup BLOCKED; scheduled snapshot NOT_CONFIGURED; RPO/RTO remain blocked. Production stays 70% / NOT READY and NO-GO.

## Sprint 55 isolated Restore authorization boundary

- `pnpm production:recovery:authorize` validates a Repository-only package. PASS means the package is internally consistent; the external decision remains DEFER and authorization NOT_GRANTED.
- A future request may cover at most one disposable isolated target and one distinct temporary credential. It must never receive Production traffic or application configuration and must leave zero residual resources.
- RPO is measured from selected restore-point UTC to Restore acceptance UTC and also requires provider continuity evidence. RTO is measured from Restore acceptance to completed verification. Cleanup is timed separately.
- Stop on unknown cost/capacity, required upgrade/payment, absent commander, target/credential reuse, traffic exposure, identity/TLS failure, RPO/RTO miss, catalog/security mismatch, sensitive output or cleanup failure.
- Current next action is read-only console evidence and commander nomination only; no target, Restore, credential, SQL, Migration or configuration change.

## Sprint 54 recovery operating boundary

- `pnpm production:recovery:readiness` is Repository-only, accepts no database URL and executes no SQL. A package-validation PASS still reports actual Production Recovery `NO_GO` while any required Gate is non-PASS.
- Current evidence proves PITR availability and a six-hour history observation only. It does not prove RPO 15 minutes, RTO 60 minutes, an independent backup or an isolated Restore.
- Before any future Migration, require an exact provider restore-point identifier/UTC timestamp, retention expiry, pre-change ledger/catalog hash, recovery commander, rollback owner, isolated verification plan and cleanup owner.
- A restored target must use distinct credentials, receive no Production traffic, never connect to the Production app, and be destroyed only after ledger/catalog/ACL/RLS verification and evidence capture.
- Do not create a snapshot/branch, Restore, upgrade, pay, run SQL/Migration, deploy or modify a platform without separate exact authorization.

## Sprint 53 final Migration readiness boundary

- `pnpm db:migration:final-readiness` is Repository-only and performs no connection or SQL. It validates the 19-Gate package and must return NO-GO while any record is not exactly PASS.
- `pnpm db:migration:final-readiness:simulate` is confirmation-gated and disposable-only. Its GO result validates only the test scenario; it never changes the Production decision.
- Current actual decision: Technical Readiness NO-GO, authorization NOT GRANTED, 17 open Gates.
- Do not use `database/migrate.mjs up` for this gap. Do not batch versions, include `0010`, auto-run down, edit the ledger or retry without a new human checkpoint.
- The next permitted work is a separately authorized recovery/RPO/RTO and maintenance ownership evidence closure. It must not apply a Production Migration.

## Sprint 52 structural parity rehearsal boundary

- `pnpm db:migration:structural-parity` is confirmation-gated, local/disposable-only and rejects configured Production database inputs.
- It creates one `0001`-`0008` upgrade path and one independent fresh-install path, then compares actual catalog rows across every approved structural section. It does not infer parity from the ledger alone.
- A mismatch in objects, definitions, signatures, owner, ACL or PUBLIC privilege drift stops fail-closed. Evidence contains only sanitized catalog identifiers, counts, statuses and hashes.
- Current result is disposable MATCH with zero residual resources. Never use it to claim current Production parity, scale/lock safety, recovery, RPO/RTO or authorization.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 51 disposable rehearsal boundary

- `pnpm db:migration:rehearse` is a confirmation-gated **local disposable-only** tool. It rejects configured Production database inputs and is not approved as a Production executor.
- It uses the exact order `0009`, `0011`-`0022`, rejects `0010`, verifies tracked checksums and stops/rolls back on any predecessor, precondition, postcondition, ledger or blocking-lock failure.
- Two empty PostgreSQL 18.4 runs passed deterministically. Do not extrapolate their durations to Production or use them to claim zero downtime, RPO/RTO, capacity or live-runtime compatibility.
- Production recovery, scale/lock, compatibility, maintenance and authorization gates remain blocked. Production stays 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 50 Migration remediation operating boundary

- Use `docs/PRODUCTION_MIGRATION_GAP_REMEDIATION_PLAN.md` as the only planning authority; its execution runbook is a draft and grants no permission.
- Future sequence is exactly `0009`, `0011`-`0022`; reject `0010`, a dirty working tree, a directory-discovered manifest or a stale checksum.
- Do not use the current generic `db:migrate up` for this gap. It does not provide the required exact allowlist or human stop after every version.
- Current recovery gate is BLOCKED, maintenance window is REQUIRED and zero-downtime is UNKNOWN. Never proceed without isolated Restore/RPO/RTO evidence and explicit per-event authorization.
- On failure, roll back only the current uncommitted transaction and stop. Do not automatically run down, edit the ledger, skip a version or continue.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO. Sprint 50 performed no Production operation.

## Sprint 49 parity stop state

- Authorized dedicated-reader identity, role boundary and TLS `verify-full` passed.
- Migration ledger comparison stopped fail-closed: Production has `0001`-`0008`; expected also requires `0009` and `0011`-`0022`. No unexpected versions or checksum mismatches were found.
- Do not run structural catalog comparison against this state. Do not apply, repair, grant/revoke or deploy anything from this evidence.
- Any remediation first requires a Repository-only dependency/rollback/recovery plan and a separate exact owner authorization. Gate A and recovery prerequisites remain unsatisfied.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 47 parity evidence stop state

- Current parity collection is BLOCKED before connection: the process has no dedicated Production read-only URL/role. Never substitute Migrator/API/Push/Admin credentials.
- `0010` is an intentional unapproved gap and not an expected ledger row. Continue to exclude local untracked files.
- Before any Production query, first create a normalized expected catalog artifact from the 21 tracked Migrations in a separately authorized disposable non-Production database.
- A later Production run still requires exact human authorization and process-only credentials. Stop on identity/read-only mismatch before returning metadata.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 46 schema parity operating boundary

- `docs/PRODUCTION_SCHEMA_PARITY_READONLY_PLAN.md` is the future parity-run authority, but it grants no permission to connect or execute SQL.
- Run `pnpm db:parity:plan` locally to validate only the tracked inventory and query safety. Its current `BLOCKED` result is required because Migration `0010` lacks a tracked authoritative source.
- Do not use untracked `0010_commission_rules` files, Owner/Migrator/API/Push credentials or Staging evidence to bypass the blocker.
- A future catalog run requires a new exact human authorization and the dedicated Production read-only role. Stop on identity, role, ledger/checksum, schema, owner, ACL, RLS/policy, Extension or evidence mismatch; never repair during evidence collection.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 45 domain operating boundary

- `bankeban.com` (`.com`) is an owner-selected quote candidate, not an owned/configured Production domain.
- Current Porkbun public quote is US$11.08 for one year and US$11.08/year renewal; registry/registrar evidence showed available and non-Premium at the evidence time.
- Recheck price and availability immediately before any future purchase approval. Do not buy, reserve, add to cart, enable auto-renew, change nameservers/DNS, configure TLS/origins or route traffic under this evidence.
- Gate A remains DEFER; Production remains NO-GO at 70% / NOT READY.

Status: **NEON READ-ONLY EVIDENCE PASS / OTHER EXTERNAL PLATFORM EVIDENCE BLOCKED**

## Sprint 44 domain and operations evidence state

- Use `docs/PRODUCTION_DOMAIN_OPERATIONS_COST_EVIDENCE.md` as the current public cost/limits authority. It is evidence and planning only, not an operations authorization.
- No approved Production domain/TLD exists. Domain first-year/renewal prices remain UNKNOWN; do not buy, reserve, enable auto-renew or change DNS.
- Cloudflare DNS and Netlify-managed TLS are US$0 candidates. Better Stack Free is a limited US$0 monitoring/alerting/logging candidate. None is configured or accepted as Production capacity.
- Before any later monitoring Gate, name the responder, approve data handling/retention, configure separate Production filters, and prove external alert delivery for frontend, readiness, Push Worker and database signals.
- Render dashboard logs retain 7/14/30 days by Hobby/Pro/Scale-Enterprise plan. Better Stack Free logs retain 3 GB for 3 days; paid Nano offers 40 GB and 30-day retention. Production plan/volume/overage remain unselected.
- Neon six-hour PITR is not the full backup/DR control. No scheduled snapshot or isolated Restore exists; do not create either without Gate B approval.
- Known fixed floor remains US$49/month and US$588/year plus domain and variable/UNKNOWN costs. Gate A remains DEFER, readiness 70%, Production NO-GO.

## Sprint 43 Neon billing operating state

- Current actual Neon organization plan is Free / US$0 fixed monthly plan fee. This is plan evidence, not proof that Free capacity or recovery meets Production requirements.
- Organization usage since 2026-08-01 is 10.77 CU-hours, 0.08 GB storage, 0 GB history and 0.3 GB network transfer. Never use these values as Production-only thresholds or forecasts.
- Production 32.84 MB and Staging 46.01 MB are project-screen observations only; do not convert them to GB-month or charges.
- Production-only compute, billing storage, network transfer, snapshot storage and amount remain UNKNOWN. The US$15/month example is not current actual cost.
- Do not upgrade, change compute/autosuspend/retention, create snapshots/branches, restore or run SQL. Gate A remains DEFER, readiness 70%, Production NO-GO.
- The next permitted work is read-only Domain and Operations cost evidence; no purchase, alert integration, backup configuration or Production action is authorized.

## Sprint 42 blocker-closure operating boundary

- Use `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md` as the current blocker and order authority.
- Work may proceed only inside its `Zero-resource closure` list until the owner provides a new exact authorization.
- Gate A approval, if later granted, applies only to the stated Auth0 action. Gates B-G, restore, Migration, deployment, DNS and traffic always require separate stops.
- Keep a blocker `PARTIAL`, `BLOCKED`, `NOT_CONFIGURED` or `UNKNOWN` until direct current evidence meets every acceptance criterion.
- No Production or billing operation was performed in Sprint 42.

## Sprint 41 cost-control boundary

- Gate A remains DEFER and provisioning remains NO-GO; no Production runbook step is authorized by the cost model.
- Before any future purchase, record the exact account quote, billing cycle, included usage, overage/spend-control behavior, cancellation/downgrade impact and named owner.
- Neon cost alerts must cover compute CU-hours, database/branch storage, restore-history storage, snapshot storage and network transfer. UNKNOWN values must not be normalized to zero.
- Netlify deployment credit thresholds remain 70% warning, 75% stop non-essential deploys and 85% release freeze; Free exhaustion can pause projects.
- Minimum monitoring may use provider and external Free tiers only after alert delivery and responder ownership are proven. Paid on-call/log retention remains an independent Gate.

## Sprint 40 Netlify billing operating state

- Current Netlify fixed cost is Free / US$0 with 300 monthly credits; capacity remains unresolved at 274.6 credits used.
- Normal Production deployment target is at most 4 per billing period; management cap 8 including emergencies. Warn at 70%, stop non-essential deploys at 75%, freeze at 85% unless separately approved emergency work.
- These are operational recommendations only. Do not modify Netlify plan, credits, payment, settings or deploy context.
- Gate A remains DEFER, readiness 70% / NOT READY, Production NO-GO.

## Sprint 39 cost and Gate A operating state

- Sprint 39's US$58/month baseline is historical. Sprint 40's current authority is **US$49/month fixed known floor plus Neon and unknowns**; do not present US$64/month as exact because it includes a published typical Neon example.
- Gate A remains **DEFER**. Do not upgrade Auth0, add payment, buy a plan, or create Production resources.
- The historical Netlify Billing / Plan inspection was completed read-only in Sprint 40. The next allowed operator step is only a read-only Neon Billing / Usage inspection; do not upgrade, alter compute or retention, create snapshots/branches, or execute SQL.
- Production readiness remains 70% / NOT READY and Production remains NO-GO.

## Sprint 38 Gate A operating state

- Auth0 capacity/pricing evidence is recorded in `docs/AUTH0_PRODUCTION_CAPACITY_GATE_A.md`; it contains no account, billing or Secret identifier.
- Current decision is **DEFER**. Do not upgrade, add payment, purchase, create a Tenant/Application/API, or change Auth0.
- Essentials is only the preferred future target architecture. Its observed US$35/month quote is not a total Production-cost estimate and must be rechecked before any later authorization.
- The next allowed work is total-cost and authorization-package preparation only. Production remains NO-GO and Gates B-G remain closed.

## Sprint 37 NO-GO operating state

- `docs/PRODUCTION_PROVISIONING_PREFLIGHT_REPORT.md` consolidates every current blocker and confirms Production provisioning is NO-GO.
- No automated check may cross from validation into resource creation, billing, configuration, deploy, Migration, DNS, Secret or traffic operations.
- The only current human task is to view Auth0 Team plan/Tenant-capacity information and report non-secret entitlement/quote data. Do not purchase, create, delete or modify anything.
- A future Gate A request must still stop and restate cost, Staging/Production impact, rollback and exact human steps. Approval cannot carry to Gates B-G.

## Sprint 36 gated provisioning boundary

- Use `docs/PRODUCTION_RESOURCE_PROVISIONING_PLAN.md` as the only approved order for future resource work.
- Stop before each Gate A-G. Record action, reason, platform, possible cost, Staging impact, Production impact, rollback and exact human steps.
- Approval is single-gate and non-transitive. Resource creation, configuration, deploy, Migration, DNS and traffic remain forbidden until their own approval.
- Preserve the current Google Sheets Production path as rollback baseline until Gate G is separately accepted.

## Sprint 35 operating state

The repository inventory and fail-closed collectors were rerun without protected platform credentials. They made no Production request. Neon safe evidence is recorded. Netlify has no Production Deploy. Render has no independent Production API. Auth0 has only a Development Tenant/Staging SPA and the Team Tenant limit is reached. All currently safe read-only platform inventory is complete; the next step is an owner authorization decision, not a platform mutation.

1. Review the Sprint 35 evidence summary and decide whether to authorize a separate **Production Resource Provisioning Plan** Sprint.
2. The plan must address, in order: Auth0 Tenant capacity and dedicated Production identity, independent Render Production API, Netlify Production deploy/domain, DNS/TLS, monitoring/alerts, scheduled backup and isolated restore.
3. This decision does not authorize creating or changing any resource. Each mutation/deploy/migration step requires a later explicit approval and rollback plan.

The detailed procedure remains `docs/PRODUCTION_OPERATIONS_RUNBOOK.md`. This guide defines how Sprint 33C evidence is collected without changing Production.

Sprint 34 Neon least-privilege Provision/Verify passed through an authorized human operator. The remaining evidence commands still require separately authorized, proven read-only Netlify, Render and Auth0 access.

## Read-only validation

1. Use an approved operator workstation and protected environment variables. Never paste values into chat, logs, reports, tests, source files, or Git.
2. Configure only credential-free public origins and public Auth0 metadata plus a distinct SELECT-only `DATABASE_READONLY_URL`.
3. Run `pnpm production:platform:validate` for public/schema validation, then `pnpm production:evidence:collect` for platform evidence and SHA-256 records. Both require explicit Production/read-only flags internally and emit sanitized JSON.
4. Record the candidate Commit, evidence timestamp, status and non-sensitive counts. Store platform screenshots/exports in the approved evidence system, not the repository when they contain identifiers.
5. Treat `BLOCKED` and `NOT_CONFIGURED` as open gates. Never reinterpret them as PASS.

## Stop conditions

Stop immediately on an unexpected host/database/role, checksum mismatch, TLS failure, Staging/Draft/Local marker, insecure cookie/header, unexpected CORS origin, missing restore evidence, secret-like output, or any request requiring write authority.

Production deployment, Migration apply, Auth0 mutation, platform-resource creation, traffic change, restore, real notification and data write each require separate explicit authorization.
