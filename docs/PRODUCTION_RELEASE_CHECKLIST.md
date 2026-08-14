# Production Release Checklist

## Production Closure Phase 2H default-ACL classification

- [x] Traced the old default-ACL blocker to position loss across owner/grantee/grantor classification.
- [x] Required grantee OID 0 for PUBLIC and separated schema `public` as `PUBLIC_SCHEMA`.
- [x] Added strict no-raw-principal Evidence schema and fail-closed privilege/grant-option tests.
- [x] Added a narrow future relation/sequence default-ACL collector with one connection, retry 0, READ ONLY and no business rows.
- [ ] Narrow Production execution authorization: **NOT_GRANTED**.
- [ ] `ACL_SEMANTIC`: **BLOCKED**.
- [ ] `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**.

## Production Closure Phase 2F failure diagnostics

- [x] Confirmed Phase 2E Live Evidence JSON/hash were not created; no structural/ACL conclusion was inferred.
- [x] Replaced generic catch-only output with allowlisted stage and safe error code.
- [x] Added separate sanitized failure Evidence/hash contract; raw error messages and target/principal identifiers remain forbidden.
- [x] Covered all comparator stages, one connection/no retry, cleanup and diagnostic-write failure paths with mocks/local PostgreSQL 18.4.
- [ ] `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**.
- [ ] New single-use Production read-only authorization: **NOT_GRANTED**; Phase 2E authorization is consumed.

## Production Closure Phase 2E minimal live semantic Preflight

- [x] Dedicated semantic command/token cannot invoke the final `0022` comparator.
- [x] Fixed target/database/reader, PostgreSQL 18, role boundary and authenticated temporary-CA TLS are enforced.
- [x] Clean `main == origin/main` authorized commit and exact baseline hashes are enforced before connect.
- [x] Exact `0001`-`0008` ledger and static catalog-only query surface reject `0009`, `0010`, `0011+`, drift and business tables.
- [x] One Client, one connect attempt, zero retries and READ ONLY transaction verification covered by mocks.
- [x] Split structural/ACL evidence, sanitization and dedicated future file boundary documented.
- [ ] New single-use Owner Production read authorization: **NOT_GRANTED**.
- [ ] Live structural non-ACL and semantic ACL matches: **BLOCKED / NOT_EXECUTED**.
- [ ] Final `0022` parity and Migration authorization: independently **BLOCKED / NOT_GRANTED**.

## Production Closure Phase 2D ACL semantic Gate

- [x] Versioned semantic ACL model and deterministic canonical fingerprint implemented.
- [x] PostgreSQL defaults, PUBLIC, owner-implied privileges, grant options, default ACLs and outbound reader memberships modeled.
- [x] Schema/relation/function/sequence privileges include PostgreSQL 18 `MAINTAIN`.
- [x] Unknown principal/grantor/Extension/model/sanitization states fail closed.
- [x] Disposable PostgreSQL 18.4 matrix and pgcrypto behavior verified; temporary resources removed.
- [x] Historical Phase 2B source hash preserved; derived evidence has a separate hash.
- [ ] Corrected live non-ACL structural evidence: requires a new explicit single-use read-only authorization.
- [ ] Live ACL semantic match: BLOCKED; existing evidence lacks privilege-level facts.
- [ ] `STRUCTURAL_STARTING_BASELINE`: BLOCKED until both live sub-gates pass.
- [ ] `FRESH_LEDGER_AND_CHECKSUM`: independently BLOCKED.

## Production Closure Phase 2C sanitized drift analysis

- [x] Verify and preserve the Phase 2B source evidence and companion SHA-256 unchanged.
- [x] Confirm exact starting ledger PASS and fingerprint MISMATCH without reconnecting.
- [x] Reproduce the four-versus-140 column visibility issue in disposable PostgreSQL 18.4.
- [x] Replace the shared permission-filtered column query with catalog-only metadata and prove Phase 1/Phase 2A byte equivalence.
- [x] Classify all 57 remaining differences as ACL-only and avoid asserting unobserved ACL values.
- [x] Keep `STRUCTURAL_STARTING_BASELINE` BLOCKED and preserve 9/13, 70% / NOT READY.
- [ ] Define and review a semantic ACL comparison contract before requesting any further live read.
- [ ] Require a separate explicit Owner authorization for any future corrected Production comparison.

## Production Closure Phase 2A dedicated starting-baseline comparator

- [x] Add a command distinct from final `db:parity:production` with a dedicated confirmation value.
- [x] Require exact ordered `0001`-`0008` ledger/name/checksum and reject `0009`, forbidden `0010`, `0011`-`0022`, duplicates and unknown versions.
- [x] Verify Phase 1 artifact/hash/fingerprint and Gate provenance without regenerating the baseline.
- [x] Reuse target/dedicated-reader/role protections, authenticated TLS and PostgreSQL 18 checks.
- [x] Restrict reads to `schema_migrations` and catalog metadata inside a READ ONLY transaction.
- [x] Add separate sanitized evidence/schema/hash and synthetic fail-closed tests.
- [x] Phase 2A kept live comparison NOT_EVALUATED and final ledger parity independently BLOCKED; Phase 2B later consumed the single-use authorization and produced MISMATCH/BLOCKED evidence.
- [x] Record the Phase 2B authorization as consumed; no reuse is permitted.

## Production Closure Phase 1 repository structural baseline

- [x] Materialize exactly `0001`-`0008` in two independent disposable PostgreSQL 18.4 clusters.
- [x] Reject application of `0009`, `0010`, and `0011`-`0022` in the starting-baseline path.
- [x] Verify exact eight-row ledger, normalized catalog coverage, byte-identical output and fingerprint `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e`.
- [x] Remove temporary clusters/data/credentials and verify zero residual resources.
- [x] Mark only the Repository starting-baseline prerequisite PASS.
- [ ] Obtain new explicit single-use authority before any live Production structural comparison.
- [ ] Keep authoritative `STRUCTURAL_STARTING_BASELINE` BLOCKED until sanitized live metadata matches this artifact.

## Sprint 65 authorized read-only evidence analysis

- [x] Verify the generated sanitized evidence and companion SHA-256 without reconnecting.
- [x] Close only `TARGET_IDENTITY`, `TLS_VERIFY_FULL`, and `ZERO_UNEXPECTED_MIGRATIONS`.
- [x] Keep `FRESH_LEDGER_AND_CHECKSUM` BLOCKED for missing `0009` and `0011`-`0022`.
- [x] Keep `STRUCTURAL_STARTING_BASELINE` BLOCKED / NOT EVALUATED; do not report an independent structural mismatch.
- [x] Record the authority as consumed and prohibit a second Production connection.
- [x] Recalculate the authoritative matrix as 9 PASS / 13 non-PASS while preserving 70% / NOT READY and Migration authorization NOT_GRANTED.
- [ ] Close the remaining 13 Gates with their separately required evidence and authorization.

## Sprint 64 event-time read-only evidence

- [x] Stop before connection when the dedicated reader inputs are absent; do not substitute privileged or Staging credentials.
- [x] Record a sanitized, hash-verified BLOCKED evidence artifact with connection, SQL and mutation all false.
- [ ] Reconfirm event-time target identity and TLS verify-full using the protected dedicated reader.
- [ ] Collect fresh ledger/checksum and zero-unexpected-version evidence.
- [ ] Collect structural starting-baseline metadata only after identity/TLS/ledger prerequisites pass.
- [ ] Keep `ROLE_BOUNDARY` and `EVIDENCE_FRESHNESS` non-PASS until their separate dependencies are satisfied.

## Sprint 63 Repository-closable Migration Gates

- [x] Validate required/tested/Production-observed/unknown runtime facts.
- [x] Require API/worker/frontend drain for every intermediate `0008`-`0021` checkpoint; permit current runtime only after final `0022` parity.
- [x] Create and hash the exact 21-version/42-file manifest and exact 13-version upgrade subset.
- [x] Reject missing/unexpected/order/checksum/content/manifest drift and any executable `0010`.
- [ ] Obtain candidate Commit authorization, event-time Production evidence, operator/runtime/monitoring configuration and mutation/event approvals.
- [ ] Keep Technical Readiness NO-GO and authorization NOT_GRANTED until all 22 Gates pass.

## Sprint 62 Migration preflight closure

- [x] Reconstruct all 22 Gates from the authoritative machine-readable package.
- [x] Classify every non-PASS Gate exactly once and record evidence/action/authorization/resource/cost/dependencies.
- [x] Revalidate approved 21-version inventory, checksums, dependencies, `0010` rejection and disposable evidence hashes.
- [x] Preserve isolated Restore and RTO PASS without promoting RPO or the event-specific restore point.
- [ ] Close 2 Repository, 5 read-only, 3 external-configuration, 3 mutation, 3 human-authorization and 2 dependency Gates.
- [ ] Keep Migration Technical Readiness NO-GO and authorization NOT_GRANTED until every one of the 22 Gates is PASS.

## Sprint 61 Production Migration authorization readiness

- [x] Revalidate exact 21-version tracked inventory/checksums; reject `0010`, duplicates and unexpected versions.
- [x] Revalidate strict `0009`, `0011`-`0022` order and `0018`/`0020` Function dependencies.
- [x] Rerun disposable PostgreSQL 18.4 upgrade and fresh-install structural parity; zero residual resources.
- [x] Rerun the updated 22-Gate disposable success path while preserving actual Production NO-GO.
- [x] Record isolated Restore PASS and RTO 112.335 seconds PASS separately from RPO NOT_PROVEN.
- [x] Record rollback PARTIAL: zero unconditionally reversible versions; no automatic down.
- [ ] Provide fresh dedicated read-only identity/TLS/ledger/catalog evidence within the approved event window.
- [ ] Prove RPO <=15 minutes, independent backup/full restored security parity and an exact pre-Migration restore point.
- [ ] Close the remaining operator, artifact, runtime, environment, maintenance, traffic/lock, monitoring/responder and authorization Gates.
- [ ] Keep Production Migration Technical Readiness NO-GO and authorization NOT_GRANTED until all 22 Gates are PASS.

## Sprint 60 Final Production Launch Gate

- [x] Consolidate all 20 required Production launch areas and current evidence.
- [x] Classify every area by `MUST_BEFORE_GO`, read-only closure, payment and Production mutation.
- [x] Preserve Production readiness 70% / NOT READY, Final NO-GO, Gate A DEFER and Provisioning NO-GO.
- [x] Preserve Migration authorization NOT_GRANTED and exclude `0010`.
- [x] Preserve RPO NOT_PROVEN and RTO PASS at 112.335 seconds.
- [x] Add a fail-closed machine-readable Final Gate and regression test.
- [ ] Close every `MUST_BEFORE_GO` item with current Production evidence.
- [ ] Obtain separate authorization for each payment, resource, Migration, deploy and traffic Gate.
- [ ] Run the final immutable Production security, recovery, device and rollback verification.
- [ ] Approve traffic cutover only through a separate Gate G decision.

## Sprint 59 RPO closure checkpoint

- [x] Recheck authenticated Console PITR/retention without submitting Preview, Restore or configuration actions.
- [x] Review official Project, Branch, Operations and Restore API contracts.
- [x] Confirm no documented metadata field establishes both required data boundaries.
- [x] Refuse credential substitution when protected database/API inputs are absent.
- [x] Preserve UNKNOWN boundaries/gap, RPO NOT_PROVEN and Production Recovery NO-GO.
- [x] Hash and validate sanitized Sprint 59 evidence.
- [ ] Obtain an exactly authorized, trusted Reference Production Boundary.
- [ ] Obtain an exactly authorized, data-layer Latest Recoverable Boundary.
- [ ] Calculate a reproducible Recovery Gap between 0 and 900 seconds before RPO PASS.

## Sprint 58 RPO evidence checkpoint

- [x] Reconfirm PITR capability and six-hour history using authenticated read-only Console evidence.
- [x] Define Recovery Gap as reference Production boundary minus latest verified recoverable boundary.
- [x] Reject retention, selector defaults and requested timestamps as substitutes for recoverability proof.
- [x] Preserve fail-closed UNKNOWN boundaries/gap and RPO NOT_PROVEN.
- [x] Avoid privileged credential substitution when protected read-only inputs are absent.
- [x] Verify no SQL, business-data read, form submission, Preview, Restore, resource/configuration or Production mutation.
- [ ] Obtain a trusted non-sensitive Reference Production Boundary under separate authorization.
- [ ] Obtain and verify the Latest Recoverable Boundary at the data layer under separate authorization.
- [ ] Calculate a reproducible Recovery Gap <=900 seconds before marking RPO PASS.

## Sprint 57 isolated Restore checkpoint

- [x] Create one exactly authorized historical isolated Branch without replacing Production.
- [x] Verify database identity, read-only transaction, ledger `0001`-`0008` and core tables.
- [x] Measure RTO: 112.335 seconds, <=60 minutes PASS.
- [x] Verify zero Production traffic and no Production database/schema/data/Migration mutation.
- [x] Delete the temporary Branch; zero residual and final usage 1/10.
- [ ] Prove RPO <=15 minutes with data-level continuity evidence; current status NOT_PROVEN.
- [ ] Prove distinct process-only credential and full restored owner/ACL/RLS parity.
- [ ] Establish independent backup and accepted scheduled snapshot/equivalent controls.
- [ ] Determine actual Restore cost; current status UNKNOWN.
- [ ] Keep Production 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT_GRANTED.

## Sprint 56 Restore capacity and ownership checkpoint

- [x] Record current Neon Free plan and Branch capacity: 1/10 used, 9 available.
- [x] Confirm historical point-in-time Branch configuration capability without creating a Branch.
- [x] Name Owner as Recovery Commander and record accepted responsibilities.
- [ ] Confirm exact actual Restore cost; current status UNKNOWN.
- [ ] Obtain exact one-time isolated-Restore authorization; current status NOT_GRANTED.
- [ ] Execute/verify/clean up an isolated Restore; current status NOT_EXECUTED.
- [ ] Prove RPO <=15 minutes and RTO <=60 minutes; currently blocked/not measured.
- [ ] Establish independent backup and accepted scheduled snapshot/equivalent controls.
- [ ] Keep Production 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT_GRANTED.

## Sprint 55 Isolated Restore authorization checkpoint

- [x] Define exact one-target/one-temporary-credential authorization boundary.
- [x] Define zero Production traffic/application binding and sensitive-data boundary.
- [x] Define RPO/RTO UTC measurement, restored catalog/security verification and cleanup contract.
- [x] Add a fail-closed Repository authorization Gate and hash evidence.
- [x] Name and accept a human Recovery Commander/cleanup owner.
- [ ] Re-confirm current Neon Branch/Restore capacity and exact cost without creating a resource. Capacity is confirmed; exact cost remains UNKNOWN.
- [ ] Obtain exact one-time Owner authorization; currently NOT_GRANTED.
- [ ] Execute and time the isolated Restore only after that separate authorization.
- [ ] Keep RPO/RTO BLOCKED and RTO NOT MEASURED until actual evidence passes.
- [ ] Keep Production Migration authorization NOT_GRANTED.

## Sprint 54 Production Recovery checkpoint

- [x] Preserve human read-only evidence of PITR availability and six-hour history without exposing identifiers.
- [x] Add a fail-closed Repository Recovery Gate and sanitized hash evidence.
- [x] Document the future isolated-target, timing, verification, cleanup and Migration restore-point contracts.
- [ ] Prove an independent encrypted backup and approved retention window.
- [ ] Configure/evidence an accepted snapshot or equivalent recovery control under separate approval.
- [ ] Complete one isolated Restore with distinct credentials and zero Production traffic.
- [ ] Prove RPO 15 minutes and RTO 60 minutes using actual timestamps; current RTO is NOT MEASURED.
- [ ] Verify restored ledger/catalog/Functions/indexes/constraints/owners/ACL/RLS and required app objects.
- [ ] Name the recovery commander and prove cleanup.
- [ ] Keep Recovery NO-GO and Production Migration authorization NOT GRANTED until all items are PASS.

## Sprint 53 Production Migration final-readiness checkpoint

- [x] Validate exact `0009`, `0011`-`0022` order/checksums and reject `0010`.
- [x] Finalize the future per-version Runbook, partial-execution stop, retry and recovery rules.
- [x] Add a machine-readable 19-Gate fail-closed evaluator with no permissive fallback.
- [x] Rehearse the Gate and exact sequence on a new disposable PostgreSQL 18.4 cluster; cleanup residual 0.
- [ ] Record exact event authorization and authorized candidate Commit.
- [ ] Prove approved least-privilege Migration operator, target/TLS/role boundary and fresh ledger/checksums.
- [ ] Prove current Production `0001`-`0008` structural starting fingerprint.
- [ ] Prove isolated Restore, RPO 15 minutes, RTO 60 minutes and pre-change restore point.
- [ ] Approve immutable execution artifact, maintenance window, traffic controls, lock budget, monitoring/responders and runtime compatibility.
- [ ] Keep Production Migration Technical Readiness NO-GO and authorization NOT GRANTED until every item is PASS.

## Sprint 52 disposable structural parity checkpoint

- [x] Create independent loopback-only PostgreSQL 18.4 upgrade and fresh-install clusters.
- [x] Capture the `0001`-`0008` baseline structural fingerprint before upgrade.
- [x] Apply exact tracked `0009`, `0011`-`0022` and reject `0010`.
- [x] Compare schemas, tables/views, columns/types/defaults/nullability, constraints, indexes, Functions/signatures, triggers, sequences, Extensions, policies/RLS, owners and ACLs.
- [x] Require ledger parity and structural fingerprint MATCH; missing, unexpected, mismatched and PUBLIC privilege drift are zero.
- [x] Terminate processes and delete disposable data/config/credentials; residual resource count 0.
- [ ] Rehearse representative data-volume/concurrency locks and coordinated runtime compatibility.
- [ ] Complete isolated Restore, RPO/RTO, recovery-owner and exact Production authorization gates.
- [ ] Keep current Production parity BLOCKED and release NO-GO until separately authorized Production evidence passes.

## Sprint 51 isolated upgrade rehearsal checkpoint

- [x] Build two independent local loopback-only PostgreSQL 18.4 clusters and remove them after use.
- [x] Rebuild exact `0001`-`0008` baseline before each upgrade.
- [x] Apply only `0009`, `0011`-`0022` one version per transaction; reject `0010`, skipped, reordered, extra and checksum-mismatched inputs.
- [x] Verify version pre/postconditions, predecessor/final ledger, required `0018`/`0020` Functions, lock evidence and transaction rollback behavior.
- [x] Produce deterministic sanitized evidence and matching final catalogs across both runs.
- [ ] Prove representative data-volume/concurrency lock behavior and coordinated runtime compatibility.
- [ ] Complete scheduled backup/isolated Restore, RPO/RTO and recovery-owner evidence.
- [ ] Obtain separate exact Production authorization; Sprint 51 grants none.
- [ ] Keep readiness 70% / NOT READY, Gate A DEFER and Production NO-GO until actual Production gates close.

## Sprint 50 Migration remediation checkpoint

- [x] Exact missing inventory is `0009`, `0011`-`0022`; `0010` is excluded.
- [x] Strict dependencies/order, up/down checksums, preconditions, DDL/lock/runtime risk, rollback classification and evidence contract are documented and machine-validated.
- [x] Generic directory-scanning Migration execution is rejected until an exact allowlist and per-version stop path exists.
- [ ] Collect structural predecessor metadata and prove every version-specific precondition against current Production.
- [ ] Complete scheduled backup/restore and isolated Restore evidence; prove RPO 15 minutes and RTO 60 minutes.
- [x] Rehearse the exact upgrade from `0001`-`0008` in disposable non-Production and measure empty-database locks/durations/rollback guards.
- [ ] Approve a maintenance window, runtime compatibility matrix, recovery owner, forward-fix owner and exact execution artifact.
- [ ] Obtain separate explicit authorization for the exact Production event. This checklist and Sprint 50 do not authorize it.
- [ ] Keep readiness 70% / NOT READY, Gate A DEFER and Production NO-GO until actual evidence closes every gate.

## Sprint 49 Production ledger checkpoint

- [x] Dedicated Production read-only identity, safe role boundary and TLS `verify-full` proved before ledger collection.
- [x] Current ledger compared with the committed 21-row expected baseline; sanitized evidence/hash recorded.
- [x] Exact blocker recorded: Production `0001`-`0008`; missing `0009` and `0011`-`0022`; no unexpected versions or checksum mismatches.
- [x] Structural catalog collection stopped before execution when ledger parity failed.
- [ ] Review and separately authorize a Production Migration remediation plan; this checklist does not authorize execution.
- [ ] Re-run ledger and structural parity only after any separately approved remediation and require every section PASS.
- [ ] Keep release NOT READY, Gate A DEFER and Production NO-GO while parity remains BLOCKED.

## Sprint 48 expected catalog baseline checkpoint

- [x] Disposable database identity proved PostgreSQL 18, loopback-only listener, Temp-contained data directory and dedicated local owner before every Migration.
- [x] Two empty databases applied only `0001`-`0009` and `0011`-`0022`; `0010` was not read, checksummed, executed or added to either ledger.
- [x] Both normalized catalogs are byte-identical and match committed SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
- [x] Committed artifact contains all required metadata categories and no runtime identity, path, endpoint, credential or business rows.
- [x] Obtain separate authorization and protected process-only Production reader inputs for the actual catalog comparison.
- [ ] Keep Production parity BLOCKED and release NO-GO until current Production ledger and every structural section match this baseline.

## Sprint 47 schema parity evidence checkpoint

- [x] `0010` Git/history classification closed as an intentional unapproved gap; no fake Migration/checksum was created.
- [x] All 21 expected tracked Migration checksums and the catalog query safety validator pass.
- [x] Materialize and hash a catalog-resolved expected schema in an isolated non-Production PostgreSQL instance.
- [ ] Provide the dedicated Production read-only URL/role through an approved process-only channel.
- [ ] Prove current role identity and `transaction_read_only=on`, then collect sanitized catalog evidence.
- [ ] Compare Migration ledger and structural schema independently; exact missing/extra/mismatch counts remain UNKNOWN.
- [ ] Keep Production NO-GO and parity BLOCKED until every current evidence section passes.

## Sprint 46 schema parity planning checkpoint

- [x] Expected ledger slots `0001`-`0022` and SHA-256 values for all 21 Git-tracked sources are recorded.
- [x] Future catalog scope, sanitized evidence schema and fail-closed stop conditions are documented and tested without a database connection.
- [x] Future manual query contains only SELECT metadata access to catalogs and `public.schema_migrations`; no business rows or Function bodies are read.
- [ ] Resolve Migration `0010` governance; it currently has no authoritative Git-tracked source/checksum.
- [ ] Obtain separate human authorization, execute the read-only Production comparison and hash complete evidence.
- [ ] Require all ledger/checksum/schema/Function/owner/ACL/RLS/policy/Extension results PASS before schema parity can pass.
- [ ] Keep readiness 70% / NOT READY, Gate A DEFER and Production NO-GO until actual evidence closes the gates.

## Sprint 45 domain quote checkpoint

- [x] Owner supplied one exact quote candidate: `bankeban.com` / `.com`.
- [x] Point-in-time registry availability and registrar initial/renewal quote recorded without account or purchase activity.
- [ ] Recheck availability, Standard/Premium classification and price immediately before an explicitly authorized purchase.
- [ ] Prove domain ownership, DNS records, managed TLS, Auth0/Render allowlists, HSTS and rollback after their own Gate E authorization.
- [ ] Keep Production NO-GO until every remaining external gate passes; quote evidence does not authorize purchase or deployment.

Status: **NOT READY - external evidence required**

Sprint 44 public cost update: Domain/DNS/TLS, monitoring/alerting/logging and Neon backup/snapshot/restore candidates are documented and hash-verified. No approved exact domain, provider integration, responder, scheduled snapshot or isolated Restore exists; readiness remains 70%, Gate A DEFER and Production NO-GO.

- [x] Official public Domain/DNS/TLS, monitoring/alerting/logging and backup/Restore unit-cost candidates are recorded without account identifiers or Secrets.
- [x] Free tiers are labelled candidates and are not treated as accepted Production capacity or configured evidence.
- [ ] Owner selects an exact Production domain/TLD and directly evidences current initial/renewal quote without purchasing.
- [ ] Monitoring/logging provider, data-handling boundary, retention, capacity, named responder and alert-delivery evidence are accepted.
- [ ] Scheduled snapshot/retention policy and isolated Restore prove RPO/RTO under a separately approved Gate.
- [ ] Owner accepts the complete fixed + variable + UNKNOWN cost envelope.

Sprint 43 Neon billing update: current organization plan and fixed fee are evidenced as Free / US$0. Organization-wide usage is recorded, but Production-only usage, charge, capacity and recovery cost remain UNKNOWN. Gate A remains DEFER, Production NO-GO and readiness 70%.

- [x] Neon current organization plan, fixed monthly plan fee, included Free limits and organization-level usage are recorded without sensitive identifiers.
- [x] Organization-wide usage is explicitly separated from Production-only evidence; project-screen MB values are not converted to billing units.
- [ ] Production-only CU-hours, billing storage/GB-month, network transfer, snapshot storage and estimated/charged amount are directly evidenced.
- [ ] Free plan capacity, recovery capability and retention satisfy an approved Production requirement.
- [ ] Domain, monitoring/alerting/logging, backup/Restore cost and owner budget acceptance are complete.

Sprint 42 blocker-closure gate: the authoritative inventory and order are in `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md`. Planning is complete, but no external blocker is closed. Gate A is DEFER, Production is NO-GO and readiness remains 70%.

- [x] Every current blocker records status, action, external/repository boundary, cost, risk, evidence and human owner.
- [x] Zero-resource evidence work is separated from Gate A and downstream Gates B-G mutations.
- [x] Sprint 43+ closure order is documented and approvals are explicitly non-transitive.
- [ ] `GA-01` Neon/domain/operations/DR cost evidence and owner budget acceptance are complete.
- [ ] Gate A exact Auth0 action, current quote, recovery and stop conditions are explicitly authorized.
- [ ] Every downstream Gate B-G item is independently direct-evidence PASS before its action.

Sprint 41 cost authorization gate: Minimum fixed known is US$49/month; Recommended fixed known is US$67/month; Growth remains UNKNOWN. Gate A is DEFER and Production remains NO-GO.

- [ ] Owner accepts **US$49/month fixed known minimum plus Neon and UNKNOWN costs**; this is not an exact total.
- [x] Neon current organization plan and organization-level usage are directly evidenced.
- [ ] Neon Production-only CU/storage/history/snapshot/network usage and charge are directly evidenced.
- [ ] Domain registrar/TLD initial and renewal price is directly evidenced.
- [ ] Monitoring, alert-delivery, named responder and log-retention plan/cost are selected and evidenced.
- [ ] Backup/snapshot/isolated-Restore capability and expected cost are approved.
- [ ] A separate exact purchase authorization exists before any billing or resource action.

Sprint 40 Netlify update: current plan is Free / Credit-based / US$0 / 300 credits; 274.6 credits are used, primarily by 18 deploys. Fixed cost evidence is PASS, but capacity remains unresolved and no approved Production Deploy exists.

- [x] Netlify current plan, billing model, included credits and current usage recorded without sensitive billing data.
- [x] Current Netlify fixed cost corrected to US$0; Personal/Pro are not treated as current cost.
- [ ] Stable Production traffic/deploy credit usage remains within an accepted budget with rollback reserve.
- [ ] Any future paid upgrade has separate current quote, capacity need, billing and approval evidence.

Sprint 39 cost update: the known fixed planning floor is US$58/month plus Neon and unknown items; a US$73/month indicative value uses Neon's published typical Launch example and is not an exact total. Gate A remains DEFERRED. No billing, purchase, upgrade or Production action is authorized.

- [x] Official public cost sources and the three cost scenarios are documented and hash-verified.
- [x] Known fixed costs are separated from usage-based examples and unknown items.
- [x] Current Netlify account plan and Credit-based billing model were verified read-only in Sprint 40; the historical Sprint 39 evidence gap is closed.
- [ ] Neon actual Production usage/recovery estimate, domain price and monitoring/alerting quote are verified.
- [ ] Owner accepts the full fixed-plus-variable cost envelope and separately authorizes an exact Gate A action.

Sprint 38 Auth0 capacity update: the Free plan/Tenant limit and point-in-time Essentials/Professional quotes are recorded and hashed. The checklist remains NOT READY: Gate A execution is DEFERRED, no dedicated Production Tenant/SPA/API exists, and no purchase or Auth0 change is authorized.

Sprint 35 inventory (2026-08-09): Repository and Sprint 34 Neon reader evidence remain PASS. Production schema parity is PARTIAL; capacity is UNKNOWN; Netlify/Render/Auth0 public identities are NOT_CONFIGURED; their management evidence, DNS/TLS, monitoring and recovery are BLOCKED. No Production request or mutation was made during this inventory.

Neon Backup & Restore evidence update: PITR is available with a six-hour history window, but scheduled snapshots are disabled, no snapshot exists, and no isolated restore was executed. The combined backup/restore/RPO/RTO item remains unchecked and PARTIAL/BLOCKED as applicable.

Neon Monitoring evidence update: primary compute is configured for 0.25-2 CU autoscaling and 5-minute autosuspend; RAM/CPU/activity/deadlock/cache/working-set/connection/pooler/database-size monitoring is available. No exact utilization/headroom threshold was retained, so capacity acceptance remains unchecked and PARTIAL.

Netlify evidence update: the Project exists and has Deploy Preview history, but has never had a Production Deploy. Production deploy/domain/branch items remain unchecked; rollback is BLOCKED because no Production deployment history exists. No Preview is accepted as Production evidence.

Render evidence update: a Production-named Environment exists, but its only Service is explicitly the Staging Node API. Independent Production service/API/runtime/deploy/health items remain unchecked and NOT_CONFIGURED/BLOCKED. Environment naming alone is not Production service evidence.

Auth0 evidence update: only one Development Tenant and the Staging SPA exist. Production Tenant/SPA/API/issuer/audience/allowlists remain unchecked and NOT_CONFIGURED; Team Tenant capacity is BLOCKED. Development resources are not Production evidence.

This checklist is Production-specific and complements `docs/RELEASE_CHECKLIST.md`. Checking an item requires direct evidence; repository implementation or Staging proof alone is insufficient.

## Sprint 37 authorization gate

- [x] Sprint 36 plan/ADR/Readiness/Evidence/Operations/Checklist/Backlog consistency reviewed.
- [x] Every current blocker classified by automation, human action, external limit, possible billing, approval and missing evidence.
- [x] Current Production provisioning decision recorded as **NO-GO**.
- [x] Auth0 Team capacity and current plan/cost evidence reviewed without purchase or mutation.
- [x] Shared Development-Tenant Production rejected; dedicated Production Tenant retained as the required architecture.
- [x] Current Gate A execution decision recorded as **DEFER**; no spending or resource operation authorized.
- [ ] Gate A proposal explicitly approved; this checkbox alone must not create resources.
- [ ] Every Gate A-G prerequisite is direct-evidence PASS before its own action.

The checked repository-preflight items do not satisfy a Production platform gate or raise readiness.

## Sprint 36 pre-provisioning gates

- [ ] Gate A: dedicated Auth0 Production Tenant/SPA/API explicitly approved and evidenced.
- [ ] Gate B: Neon recovery/capacity work explicitly approved; existing Production database and Sprint 34 roles preserved.
- [ ] Gate C: independent Render Production API/Push worker explicitly approved and evidenced.
- [ ] Gate D: Netlify Production candidate explicitly approved; no Staging/Google Sheets/placeholder/Secret contamination.
- [ ] Gate E: DNS/TLS change explicitly approved with exact rollback records.
- [ ] Monitoring, alert delivery, capacity thresholds and evidence retention PASS.
- [ ] Gate F: exact Production Migration manifest/checksum/recovery plan explicitly approved.
- [ ] Gate G: owner go/no-go and reversible traffic switch explicitly approved.

Unchecked gates are release blockers. Approval for one line never approves another.

## Candidate and repository

- [x] Repository contains confirmation-gated Neon reader provision/verify/disable procedures and fail-closed platform credential validation.
- [x] Distinct Neon reader is SQL-created, exact-role verified and metadata-only; credential value was not exposed or committed.
- [ ] Netlify and Render access is proven read-only for the exact Production resources; otherwise automated evidence remains BLOCKED.
- [ ] Auth0 M2M token contains exactly the five approved read scopes and no mutation scope.
- [ ] Exact candidate Commit recorded; `main` and `origin/main` are 0/0.
- [ ] Build, Check, full tests, Release Gate, Production Repository Gate, sensitive scan, dependency audit, and `git diff --check` pass.
- [ ] `pnpm production:platform:validate` reports no `FAIL`; every `BLOCKED`/`NOT_CONFIGURED` item is resolved with evidence.
- [ ] `pnpm production:evidence:collect` reports PASS for authorized Netlify, Render, Neon and Auth0 evidence; verify the committed SHA-256 manifest.
- [ ] No real `.env`, secret, token, cookie, database URL, private key, test password, or personal data is tracked.

## Frontend / Netlify

- [ ] Approved Production site, custom domain and deploy context are verified read-only.
- [ ] HTTPS and HTTP-to-HTTPS redirect pass; TLS certificate is authorized and not near expiry.
- [ ] `environment-config.js` identifies Production and points only to the approved Production API.
- [ ] Production Service Worker/cache namespace is isolated from Local, Staging, Draft and Google Sheets staging assets.
- [ ] CSP, HSTS, `nosniff`, Referrer Policy, Permissions Policy, `frame-ancestors 'none'`, cache policy and secure cookies pass.
- [ ] Rollback alias/artifact and owner are recorded. No publish occurs during validation.

## API / Render

- [ ] Approved Production service and URL are verified; `/v1/health` and `/v1/readiness` return HTTP 200 with Production environment and immutable build identity.
- [ ] Build/start commands, runtime, region, auto-deploy policy, timeout/proxy settings and protected environment names match the approved design.
- [ ] Exact CORS contains only the approved Production frontend; no Draft, Local or Staging origin is present.
- [ ] Rate limit, request size, telemetry masking and error responses pass without exposing secrets or stack traces.

## Database / Neon

- [x] Read-only role is distinct from Owner, Migrator, API, Push and Staging roles; no dangerous role attributes or DDL privileges exist.
- [x] Classified Function ACL evidence passes: all 11 Bankeban Functions are owned by `neondb_owner`, application PUBLIC/reader EXECUTE counts are zero, and `banke_api_production` has exactly four explicit approved grants.
- [x] Platform Function evidence reports the 37 reviewed `public.pgcrypto` / `cloud_admin` Extension Functions separately as `ACCEPTED_PLATFORM_INFORMATION`; no pgcrypto ACL, owner, or Extension object was mutated.
- [ ] `neondb`, direct approved host, TLS, server version and connection capacity are verified.
- [ ] Migration ledger/order/checksums and repository manifest align; `0010` is not included.
- [ ] Tables, indexes, constraints, functions, triggers, policies, RLS and FORCE RLS match the reviewed schema.
- [ ] Backup/PITR retention meets RPO 15 minutes and an independent isolated restore meets RTO 60 minutes.

## Auth0, DNS and operations

- [ ] Dedicated non-development Tenant/Application/API/Connection/Action are verified.
- [ ] PKCE S256, RS256, exact callbacks/logout/web origins/CORS, token lifetime, refresh rotation/reuse detection, MFA/protections and security-event delivery pass.
- [ ] DNS records, certificate chain, HSTS, mixed-content and secure-cookie behavior pass.
- [ ] Uptime, error, latency, rate-limit, push, database, backup and deployment alerts are connected to named responders.
- [ ] Rollback and incident runbooks have owners and a completed rehearsal record.

## Release decision

- [ ] Every Blocker and High item in `docs/PRODUCTION_READINESS_REPORT.md` and `docs/PRODUCTION_PLATFORM_VALIDATION_REPORT.md` is closed with direct evidence.
- [ ] Explicit owner authorization for the Production release window is recorded separately.
