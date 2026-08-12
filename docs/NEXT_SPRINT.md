# Next external gate — Production evidence and authorization

## Sprint 57 proposal - Exact Isolated Restore Cost and One-time Authorization Gate

Sprint 56 recorded read-only evidence that Neon Free is the current plan, Branch capacity is 1/10 used with 9 available, historical point-in-time Branch configuration is available without an observed configuration-stage upgrade prompt, and the Owner is the nominated Recovery Commander. Actual Restore remains NOT_EXECUTED and actual Restore cost remains UNKNOWN.

The next unique gate is to obtain an exact, non-secret provider cost/resource decision for one disposable isolated recovery target and then ask the Owner for an explicit one-time authorization covering exactly that resource, the distinct credential, zero Production traffic, verification and cleanup. If determining cost would itself create a Branch, Restore, billing action or configuration change, stop and request a separately bounded approval. Production Migration authorization remains NOT_GRANTED.

## Historical Sprint 56 - Neon Restore Capacity/Cost Evidence and Recovery Commander Nomination

Read-only evidence confirms one Production Branch out of ten, nine available slots, historical point-in-time Branch configuration capability, no upgrade prompt observed at configuration stage, and Owner/Recovery Commander nomination. It does not prove actual Restore cost or execution. Authorization remains NOT_GRANTED.

Do not create a Branch/target, click Restore, change retention/snapshots, upgrade/pay, reveal identifiers, run SQL/Migration or deploy. If capability or cost cannot be proven safely, keep Isolated Restore/RPO/RTO BLOCKED.

## Historical Sprint 55 - Isolated Restore Authorization Decision

- Repository authorization package: COMPLETE; evidence SHA-256 `b674d9aeba6d06be79b84e5a17d3576b0d5225ab1d08ba92bcc64cf86862f892`.
- Authorization decision DEFER; exercise authorization NOT_GRANTED; six decision Gates non-PASS.
- Exact scope is limited to one disposable target and one distinct temporary credential with zero Production traffic and required cleanup.
- Production remains 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT_GRANTED.

## Historical Sprint 55 proposal - Authorized Isolated Restore Decision and Recovery Ownership

Sprint 54 completed the Repository-only Recovery preflight and evidence contract. Provider PITR capability and a six-hour history observation are recorded, but no independent backup, scheduled snapshot, isolated Restore, 15-minute RPO proof, 60-minute RTO timing, restored-target verification, cleanup evidence or named recovery commander exists.

The next unique action is an owner decision on whether to authorize one isolated Neon Restore evidence exercise, including its exact cost/resource boundary, disposable target, zero-traffic rule, distinct credentials, timed verification, cleanup and recovery commander. If the current plan cannot support this safely, keep the Gate BLOCKED and decide the plan/cost separately. Do not upgrade, create a resource, Restore, run SQL or apply a Production Migration without a new exact authorization.

## Historical Sprint 54 - Production Recovery Readiness

- Repository preflight/evidence package: COMPLETE and hash-verified.
- Production Recovery technical readiness: NO-GO; 12 of 14 required Gates are non-PASS.
- RPO 15 minutes: BLOCKED. RTO 60 minutes: BLOCKED / NOT MEASURED.
- Production remains 70% / NOT READY, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT GRANTED.

## Historical Sprint 54 proposal - Authorized Backup/Restore/RPO/RTO and Maintenance Evidence Closure

Sprint 53 completed the Runbook, machine-readable Gate and disposable success-path simulation. Actual Production technical readiness is still NO-GO because recovery, event-time Production preflight, approved operator/artifact, maintenance/traffic controls, monitoring responders and runtime compatibility remain non-PASS.

The next unique Sprint should close only the highest safety dependency: obtain an exact owner-approved, non-Migration recovery evidence scope; prove the available pre-change restore point, isolated Restore, RPO 15 minutes, RTO 60 minutes, recovery commander and maintenance ownership. If any step requires a Production snapshot, branch, restore or configuration mutation, stop for a separate exact approval. Do not apply `0009` or any other Production Migration.

## Historical Sprint 53 - Production Migration Final Execution Readiness

- Runbook and 19-Gate package: COMPLETE.
- Disposable PostgreSQL 18.4 Gate/sequence simulation: PASS; cleanup residual 0.
- Actual Production Gate: NO-GO; authorization NOT GRANTED; 17 Gates non-PASS.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Historical Sprint 53 proposal - Representative Synthetic-data Lock and Recovery Rehearsal

Sprint 52 proved that an isolated `0001`-`0008` upgrade and an independent fresh install produce the same complete structural fingerprint. It did not prove behavior with representative row counts, concurrent sessions, live runtime versions or recovery.

The next unique Sprint should remain disposable and non-Production: generate non-sensitive representative synthetic data, exercise controlled concurrent sessions, measure version-specific locks/timeouts, and rehearse recovery from a disposable backup after an injected failure. It must not use Production data or credentials, connect to Production, include `0010`, or claim local RPO/RTO as Production evidence.

## Historical Sprint 52 - Disposable Structural Schema Parity

- Upgrade and fresh-install PostgreSQL 18.4 paths: PASS.
- Ledger and all structural sections: PASS; fingerprint MATCH; missing/unexpected/mismatched objects: 0.
- Cleanup: PASS; residual resources: 0.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production operation occurred.

## Historical Sprint 52 proposal - Representative Synthetic-data Lock and Recovery Rehearsal

Sprint 51 proved the exact empty-database `0001`-`0008` to `0022` chain twice in isolated PostgreSQL 18.4. It did not prove Production-sized locks, concurrent-runtime compatibility or recovery.

The next unique Sprint should remain disposable and non-Production: generate non-sensitive representative synthetic data and controlled concurrent sessions, measure version-specific lock/timeout behavior, and rehearse recovery from a disposable backup after an injected mid-chain failure. It must not use Production data or credentials, connect to Production, weaken the exact allowlist, include `0010`, or claim Production RPO/RTO from local evidence.

## Historical Sprint 51 - Isolated 0001-0008 to 0022 Migration Upgrade Rehearsal

- Two independent PostgreSQL 18.4 clusters: PASS; baseline/final ledgers and catalogs deterministic.
- Exact chain `0009`, `0011`-`0022`: PASS one version per transaction; `0010`: REJECTED.
- Precondition, dependency, checksum, failure rollback and conditional-rollback guards: PASS.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection or mutation occurred.

## Historical Sprint 51 proposal - Isolated 0001-0008 to 0022 Migration Upgrade Rehearsal

Sprint 50 completed the Repository-only remediation plan. The strict future chain is `0009`, `0011`-`0022`; `0010` is excluded. Production execution remains BLOCKED because recovery/isolated-Restore proof, structural preconditions, runtime compatibility, exact stepwise execution tooling and Gate A authorization are absent.

The next single Sprint should build an isolated, disposable, non-Production database at the approved `0001`-`0008` baseline, then rehearse only the exact 13-version allowlist one version per transaction with a verification stop after each version. It must measure lock/duration behavior, exercise precondition failures and rollback guards, prove `0010` rejection and emit sanitized evidence. It must not use Production data/credentials, connect to Production, deploy, mutate external resources or claim the rehearsal makes Production safe.

## Historical Sprint 50 - Production Migration Gap Remediation Plan

- Repository plan and validator: COMPLETE.
- Production Migration execution, structural preconditions and recovery gate: BLOCKED / NOT AUTHORIZED.
- Maintenance window: REQUIRED; zero-downtime: UNKNOWN.
- Generic directory-scanning `db:migrate up`: not approved for this gap because it cannot enforce the exact 13-version list and per-version human stops.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no mutation occurred.

## Historical Sprint 50 proposal - Production Migration Gap Remediation Plan (Repository-only)

Sprint 49 completed its authorized read-only scope and correctly stopped at Migration Ledger parity. Production contains `0001`-`0008`; compared with the approved expected ledger, `0009` and `0011`-`0022` are missing. There are no unexpected versions or checksum mismatches. Structural catalog collection did not start.

The next single Sprint may only prepare a fail-closed remediation plan: Migration dependency/order review, preconditions, backup/restore prerequisites, rollback/stop conditions, downtime and evidence contract. It must not connect with a privileged credential, run a Migration, repair schema, grant/revoke, deploy or mutate Production. Any future execution requires a separate exact owner authorization after Gate A and recovery prerequisites are satisfied.

## Historical Sprint 49 - Authorized Production Read-only Catalog Comparison

- Dedicated read-only identity, role boundary and TLS `verify-full`: PASS.
- Migration Ledger Parity: BLOCKED; expected 21, observed 8, missing `0009` and `0011`-`0022`.
- Unexpected versions/checksum mismatches: NONE.
- Structural catalog: NOT STARTED / BLOCKED by ledger gate.
- Sanitized evidence SHA-256: `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no mutation occurred.

## Historical planned Sprint 49 - Authorized Production Read-only Catalog Comparison

Sprint 48 completed the deterministic expected catalog baseline from two empty disposable PostgreSQL 18 databases. The committed SHA-256 is `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`; both 21-row ledgers exclude `0010`.

The next single Sprint requires a new explicit authorization plus the dedicated Production read-only URL/role through a protected process-only channel. It may execute only the existing metadata query, verify target/role/read-only identity, sanitize and hash results, and compare every ledger/catalog section against the committed baseline. Any mismatch must stop fail-closed; it may not repair, migrate, grant, deploy or mutate Production.

## Historical Sprint 48 - Disposable Expected Catalog Baseline Materialization

- Expected-side status: PASS; two rebuilds produced byte-identical metadata and hash.
- Production-side status: BLOCKED / not executed.
- Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.

## Sprint 48 - Disposable Expected Catalog Baseline Materialization

Sprint 47 closed the Git-history classification of `0010` as an intentional unapproved gap, but Production parity evidence remains **BLOCKED**. Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**.

The next single Sprint should create a disposable, isolated non-Production PostgreSQL instance, apply only the 21 reviewed Git-tracked Migrations (`0001`-`0009`, `0011`-`0022`), and export normalized/hashable catalog metadata as the expected structural baseline. It requires explicit authorization to execute Migrations only in that disposable environment. It must not connect to or modify Production, include the untracked `0010` files, deploy, or operate external Production resources.

## Historical Sprint 47 - Production Schema Parity Read-only Evidence Closure

- `0010` classification: intentional unapproved gap; it is not an expected ledger row.
- Repository checksum inventory and SELECT-only query plan: PASS.
- Expected catalog baseline: BLOCKED / not materialized.
- Current Production read-only identity/catalog inspection: BLOCKED because the dedicated URL and role were not available to the process; no higher-privilege credential was substituted.
- Current Migration Ledger Parity and Structural Parity: BLOCKED/UNKNOWN. No Production connection or SQL occurred.

## Historical planned Sprint 47 - Migration 0010 Governance and Expected-ledger Closure

Sprint 46 completed the Repository-only schema-parity plan, catalog query review, evidence contract and dry-run validator. Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**.

The next single Sprint is Repository-only governance for Migration slot `0010`. The tracked source of truth contains `0001`-`0009` and `0011`-`0022`, while local untracked `0010_commission_rules` files are not authoritative and were not inspected, staged or checksummed by Sprint 46. Sprint 47 must decide through review whether `0010` becomes an approved tracked Migration or a formally reserved/retired ledger slot, then update the expected-ledger policy and tests. It must not connect to Production, execute SQL/Migration, modify a database, deploy or operate an external resource.

## Historical Sprint 46 - Production Schema Parity Read-only Plan

Sprint 45 closed only the exact `bankeban.com` public availability and price-evidence item. Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**.

Completed as a Repository-only plan. `docs/PRODUCTION_SCHEMA_PARITY_READONLY_PLAN.md` defines expected `0001`-`0022` slots, tracked checksums, safe metadata queries, stop conditions and evidence fields. The validator correctly reports `BLOCKED` because `0010` has no Git-tracked authoritative source. No Production connection, SQL, Migration, database change, deploy, domain purchase or DNS operation occurred.

## Historical Sprint 45 - Production Domain/TLD Quote Evidence Closure

- Owner-selected quote candidate: `bankeban.com` (`.com`).
- Verisign `.com` RDAP returned 404 and Porkbun's public result showed a normal non-Premium registration at US$11.08 for one year, renewing at US$11.08/year.
- Availability and price are point-in-time evidence only; no purchase, reservation, cart, account, auto-renew, nameserver or DNS action occurred.
- Current planning floor: US$49/month recurring services; US$599.08/year including the quoted domain, plus variable/UNKNOWN costs.

## Historical planned Sprint 45 - Production Domain/TLD Selection and Registrar Quote Evidence Closure (read-only)

Sprint 44 completed the official public Domain/DNS/TLS, monitoring/alerting/logging and Neon recovery-cost candidate inventory. It did not close an external gate. Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**.

The next single human read-only action is:

1. Choose one exact intended Production domain name and TLD; do not purchase it.
2. In the selected registrar search page, record the current initial registration and renewal prices, currency, term and whether the name is standard or premium.
3. Return only the domain candidate and public quote. Do not provide account ID, registrant details, invoice, payment information or credentials.
4. Do not buy, add payment, enable auto-renew, change nameservers/DNS, configure Netlify/Auth0/Render, deploy or reserve any resource.
5. If the chosen name is unavailable or premium, record that status and select no replacement without owner direction.

This may close the Domain price evidence item only. It does not authorize Gate A, a purchase, DNS/TLS setup or any Production resource.

## Historical Sprint 44 - Domain and Operations Cost Evidence Closure

- No approved Production domain/TLD exists; initial and renewal prices remain UNKNOWN.
- Cloudflare DNS and Netlify-managed TLS are US$0 candidates, not configured gates.
- Better Stack Free is a US$0 monitoring/basic-alerting/short-log candidate; optional paid telemetry and responder prices are recorded but not approved.
- Neon six-hour PITR remains PARTIAL, scheduled snapshots are not configured, snapshot/history storage totals are usage-based and UNKNOWN, and isolated Restore remains BLOCKED.
- Known fixed floor remains US$49/month and US$588/year plus variable/UNKNOWN items.
- No purchase, account/integration, alert, log connection, snapshot, branch, Restore, SQL, DNS, deploy or Production mutation occurred.

## Historical planned Sprint 44 - Domain and Operations Cost Evidence Closure (read-only)

Sprint 43 closed only the Neon current-plan and organization-level usage facts. Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**.

The next unique Sprint is read-only evidence and selection work:

1. Record the intended Production domain/TLD and a current initial/renewal registrar quote without purchasing it.
2. Select candidate monitoring, alerting and logging tiers; record included retention, alert delivery, overage and named-responder requirements without configuring integrations.
3. Record backup/snapshot/isolated-Restore cost candidates and their unknowns without changing Neon retention, snapshots, branches or restore state.
4. Keep every undisplayed or account-inapplicable value `UNKNOWN`; do not treat Free tiers as accepted Production capacity.
5. Do not share account/project identifiers, hostname, credentials, invoice/payment details or personal information.
6. Do not purchase, upgrade, configure alerts, create resources, run SQL, restore, deploy, change DNS or modify Production.

This evidence may refine `GA-01`, `DNS-01`, `OPS-01` and `NEON-02`; it does not authorize Gate A or any downstream Production Gate.

## Historical Sprint 43 - Neon Production Billing / Usage Evidence Closure

- Current actual Neon organization plan: Free / US$0 fixed monthly plan fee.
- Organization usage since 2026-08-01: 10.77 CU-hours, 0.08 GB storage, 0 GB history and 0.3 GB network transfer.
- Production-only usage, snapshot storage and charged amount remain UNKNOWN; project-screen MB values were not converted to billing units.
- No upgrade, configuration, SQL, snapshot, branch, restore or billing operation occurred.

## Historical next unique action after Sprint 41 - Neon Production Usage and Backup Cost Evidence Closure

Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**. Sprint 41 finalized the cost formulas, but the exact total remains unknown because the existing Neon Production account's plan and complete-period billable usage are not evidenced.

The next single action is human read-only evidence:

1. Open Neon Console **Billing → Usage** and select the Production project plus the latest complete billing period.
2. Record only: current plan; compute CU-hours; root/child storage GB-month; instant-restore/history GB-month; snapshot storage GB-month; public network transfer; and the non-sensitive estimated/charged amount for that period.
3. Return `UNKNOWN` for fields not shown. Do not infer the plan from the six-hour PITR view.
4. Do not share organization/project/branch/endpoint IDs, hostname, connection string, credentials, invoice/payment details or personal information.
5. Do not upgrade, edit compute/autosuspend/retention, create snapshot/branch, restore, run SQL or change billing.

This evidence may refine cost estimates; it does not authorize Gate A, Production provisioning or a database operation.

## Historical next unique action after Sprint 40 - Neon usage and recovery cost evidence

Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**. Netlify current fixed cost is now evidenced at US$0, but Neon remains the largest unresolved platform-cost component.

The next single action is read-only:

1. Open Neon **Usage / Billing** for the Production project/branch.
2. Record only current plan, the latest complete billing period's CU-hours, storage, history/snapshot usage and non-sensitive estimated/charged amount.
3. Do not reveal project/branch/endpoint identifiers, hostname, connection string, credentials, invoice/payment or personal information.
4. Do not upgrade, edit compute/autosuspend/retention, create snapshot/branch, restore, run SQL, or change billing.
5. Return `UNKNOWN` for any field the console cannot prove.

This does not authorize Gate A, Production provisioning or any database operation.

## Next unique action after Sprint 39 - Netlify billing model evidence

Production remains **NO-GO** at **70% / NOT READY** and Gate A remains **DEFER**. The cost model is complete enough to show a fixed known floor, but not an exact total.

The next single action is read-only:

1. Open Netlify **Billing / Plan details** for the existing Team/Project owner account.
2. Record only the current plan name, whether billing is Legacy or Credit-based, included monthly credits and recent 30-day credit usage.
3. Do not add payment, upgrade, downgrade, switch billing model, buy credits, change the Project, or deploy.
4. Do not share account identifiers, invoices, payment details, tokens or screenshots containing personal/billing information.
5. Return the non-sensitive values so the US$9 Personal versus US$20 Pro candidate and overage risk can be resolved.

This action does not authorize Gate A execution, a purchase or any Production resource operation. See `docs/PRODUCTION_TOTAL_COST_GATE_A.md`.

## Next unique Sprint after Sprint 38 - Production cost envelope and final Gate A authorization package

Production remains **NO-GO** at **70% / NOT READY**. Sprint 38 recorded capacity evidence and selected Option A as the preferred future architecture, but the current execution decision is **DEFER**.

The next Sprint may only:

1. consolidate current non-secret cost/capacity evidence for Auth0, Neon recovery/capacity, Render, Netlify, domain/DNS, monitoring/alerting and backup/restore;
2. state the minimum viable Production stack, monthly/annual range, billing owners, renewal/cancellation risks and unresolved quotes without purchasing anything;
3. recheck Auth0 Essentials price, Tenant entitlement, downgrade/retention implications and required security features immediately before any proposal;
4. produce an exact Gate A approve/reject/defer package with impact, rollback and stop conditions;
5. stop before plan upgrade, payment, Tenant/Application/API creation, any Production resource change, deploy, Migration, database operation, DNS, Secret or traffic action.

If the owner does not explicitly authorize the exact Gate A action later, keep Production NO-GO and the Development Tenant Staging-only.

## Historical next action after Sprint 37 - Auth0 capacity evidence and decision

Production provisioning remains **NO-GO** and readiness remains **70% / NOT READY**.

The only next user action is read-only:

1. Open the Auth0 Team billing/subscription and Tenant-capacity views.
2. Confirm the current Tenant entitlement, whether a second dedicated Production Tenant is supported, and the current quoted cost/plan impact.
3. Do not upgrade, purchase, delete, create or modify any Tenant/Application/API.
4. Return only non-secret plan/capacity/cost information and either `Gate A proposal approved` or `Gate A proposal rejected`.

Approval of the proposal still does not authorize resource creation. A later action request must repeat platform, cost, Production/Staging impact, rollback and exact steps before Gate A is executed. Gates B-G remain forbidden.

## Historical next action after Sprint 36 - Human Gate A

Sprint 36 completed the plan only. Production readiness remains **70% / NOT READY** and no Production resource exists because of this Sprint.

The next single action is an owner **approve/reject** decision for **Gate A — Auth0 Production tenant capacity and dedicated identity provisioning**:

1. Confirm whether the Auth0 plan/team may be changed to add a dedicated Production Tenant; this may incur platform cost.
2. Confirm the dedicated Production Tenant, SPA and API must be isolated from the existing Development/Staging Tenant.
3. If approved, the operator must return with the current quoted cost/plan impact, intended public resource names and exact rollback/disable steps before creating anything.
4. If not approved, mark Gate A BLOCKED and stop. Do not reuse the Staging Tenant.

This decision does **not** authorize creating resources, changing Auth0, handling Secrets, or starting Gates B-G. Follow `docs/PRODUCTION_RESOURCE_PROVISIONING_PLAN.md`.

## Sprint 35 current stop - owner provisioning-plan decision required

Repository inventory is complete and the fail-closed validators did not contact Production management APIs or the database. Sprint 35 remains **PARTIAL**; Production readiness is 70% and release is NOT READY.

Neon safe evidence is recorded. Netlify has no Production Deploy. Render has no independent Production API. Auth0 has only a Development Tenant/Staging SPA, and the Team Tenant limit is reached. Remaining closure requires resource/configuration/deploy or recovery actions and is outside Sprint 35 read-only authority.

The only next action is an authorized human read-only view in Neon Console:

1. Review the Sprint 35 evidence matrix.
2. Explicitly approve or reject preparation of a separate **Production Resource Provisioning Plan** Sprint.
3. If approved, planning must cover Auth0 Tenant capacity/dedicated identity, independent Render Production API, Netlify Production deploy/domain, DNS/TLS, monitoring/alerts, backup policy and isolated restore.
4. Planning approval alone does not authorize creation, deployment, Migration, restore, traffic change or secret handling.

Stop after the decision. Every eventual mutation requires its own explicit approval and rollback conditions.

## Current stop condition - Sprint 34 complete, do not start Sprint 35 automatically

The authorized human Provision/Verify run passed at Commit `e58932032a788d6928c00457e3ffa661684ca580`; Neon read-only evidence is PASS and Sprint 34 is complete. Production remains NOT READY at 70% because Netlify, Render, Auth0, DNS/TLS, monitoring, recovery, current-schema/application cutover and remaining physical-device evidence are not closed.

The recommended next Sprint is **Sprint 35 — Remaining Production External Evidence Closure (read-only)**: collect separately authorized Netlify/Render/Auth0/DNS/monitoring evidence and recovery proof without deployment, Migration, traffic change or business-data mutation. Do not start it without a new user instruction and the required read-only authority.

## Sprint 34 — Production Read-only Access Provisioning & Evidence Re-run

Goal: provision only the missing protected read-only access and rerun Sprint 33D evidence collection. This requires explicit owner/platform authorization and must not deploy, migrate, change traffic, restore active Production, or modify application/platform settings.

1. Create distinct read-only Netlify, Render and Auth0 Management credentials/scopes plus approved resource identifiers in the protected operator environment; never send values through chat or Git.
2. Create a distinct SELECT-only Neon Production role; prove it is not Owner, Migrator, API, Push or Staging and has no dangerous attributes or DDL access.
3. Configure credential-free approved Production frontend/API origins and public Auth0 metadata.
4. Run `pnpm production:evidence:collect`; require direct PASS evidence or retain the exact BLOCKED/NOT AUTHORIZED status.
5. Stop before any Production mutation or release operation.

## Historical Sprint 33D — Authorized Production Evidence Closure

Goal: collect the missing Production evidence using only approved read-only access. Do not deploy, migrate, write data, alter Auth0/platform settings, change traffic, perform a restore against active Production, or send real notifications.

1. Configure approved credential-free Production frontend/API origins and run the fail-closed platform validator.
2. Create/provide a distinct SELECT-only Production database credential and verify schema/ledger/role metadata.
3. Collect read-only Netlify, Render, Neon, Auth0, DNS/TLS and monitoring evidence using `docs/PRODUCTION_RELEASE_CHECKLIST.md`.
4. Under separate recovery-drill approval, create an independent backup and restore only into an isolated non-Production target, then measure RPO/RTO.
5. Close every `BLOCKED`/`NOT_CONFIGURED` item before proposing any Production release operation.

## Historical gate after Sprint 33B

Sprint 33B repository work is complete. Do not begin a feature Sprint or Production mutation automatically.

1. Obtain explicit owner approval for a read-only Production schema inspection using a separate read-only credential; record `neondb`, role, ledger checksums, and pending versions without writes.
2. Obtain explicit Auth0 Production access and validate the dedicated tenant/API/Application/Action plus security-event delivery without changing Staging.
3. Approve a backup plan meeting RPO 15 minutes and an isolated restore drill targeting RTO 60 minutes; never rehearse destructive restore against active Production.
4. Connect monitoring/alerts and run the bounded Staging capacity acceptance; record thresholds and responders.
5. Close Windows/Android/iPhone/iPad physical-device release evidence.
6. Only after all evidence passes, authorize a separate reversible Production schema/service/cutover operation.

Use `docs/PRODUCTION_OPERATIONS_RUNBOOK.md`. Stop on any host/role/checksum/backup/Auth0/VAPID/device/alert mismatch.

# Historical plan — Sprint 33B Production Security & Operations Gate

Goal: close the highest-risk operational controls identified by `docs/PRODUCTION_READINESS_REPORT.md`, using Staging-only implementation and rehearsal before any separate Production authorization.

1. Enforce and verify frontend CSP and security headers on an isolated Draft without weakening Auth0 or PWA behavior.
2. Add bounded general API abuse protection and prove authorized Session, Workspace, Command, and Push flows remain functional.
3. Add build-identity/readiness evidence and a safe VAPID public-key parity gate without exposing key material.
4. Establish CI quality/security gates and controlled artifact promotion; no Production deploy is part of this Sprint.
5. Add centralized Staging metrics/alerts for readiness failures, API error rates/latency, push queue depth/dead delivery, and database saturation.
6. Run representative Staging capacity tests for revision polling/bootstrap and document initial SLO, alert thresholds, RPO/RTO, and rollback acceptance.

Stop after Staging evidence and documentation. Production, Production Database/Migration/Auth0, Google Sheets, Apps Script, and Production deployment require separate authorization and remain out of scope.

# Historical gate — Sprint 32 Announcement Center physical-device acceptance

Status: **PENDING USER VERIFICATION**. Automation and synthetic Neon Staging E2E cannot replace physical PWA evidence.

1. On Windows PWA, sign in as manager, publish an `ALL` announcement, and confirm one announcement list row, one Notification Center row, badge increment, and one system push.
2. Click the system notification with the PWA open and closed; confirm the existing PWA is focused/opened at `/announcements/{id}` without full reload or Session loss.
3. Sign in as employee in the same Workspace and verify list/detail/read state, newest-first ordering, badge decrement, and no create/edit/delete controls.
4. Publish `MANAGER` and `EMPLOYEE` announcements; verify only matching roles see each announcement and receive its notification.
5. Repeat with a second Workspace account and verify title, content, read state, notification, and push never cross the tenant boundary.
6. Soft-delete a Staging announcement and confirm it disappears without deleting or exposing unrelated notifications/data.
7. Repeat list/detail/read/badge/push/click on Android installed PWA, iPhone Home Screen PWA, and iPad Home Screen PWA. Record each device separately as PASS/FAIL/BLOCKED.

Stop after evidence collection. Production, Production Migration/database/Auth0, Google Sheets, Apps Script, and Production deployment remain out of scope.

# Historical gate — Sprint 31 physical-device real-event notification acceptance

Status: **PENDING USER VERIFICATION**. Do not infer device PASS from automation.

0. On one Windows machine, open and authenticate the installed PWA before triggering an event so its existing subscription is reconciled to the current Session. Also enable Push in an ordinary Browser for the same Staging Workspace/User. Trigger one real event and confirm exactly one Windows system notification is delivered by the PWA. Disable/unregister the PWA, trigger another event, and confirm the Browser fallback receives exactly one notification. Confirm Notification Center still contains one row per event. A synthetic Staging 410 recovery already passes, but this physical result remains pending.
1. On Windows and an installed mobile PWA, sign in as one employee and one boss/manager in the same Staging Workspace.
2. Employee clocks in and out; only boss/manager devices must receive one Notification Center row and one system push per active device. The actor must not receive a manager notification.
3. Employee submits scheduled leave and ad-hoc leave; only authorized reviewers receive them. Approve one and reject one; only the applicant receives each result.
4. Boss creates a shift/direct approved leave update for the employee; only that affected employee receives the schedule notification.
5. Confirm unread badge, list ordering, mark-read state, Smart Polling, foreground/background delivery, and notification click focusing the installed PWA without full reload: clock events open Attendance, shift events open Schedule, and leave/time-off events open Time-Off.
6. With the installed Windows PWA closed and a same-Origin Browser tab open, click another notification. Confirm exactly one PWA window opens at the safe destination and a still-valid Session is not forced through login.
7. Turn off each of clock/leave/shift categories in turn and prove new matching events stop while other categories and `push.test` continue.
8. Repeat with a second Workspace account and verify no event crosses the tenant boundary.
9. Record Windows, iPhone Home Screen PWA, iPad Home Screen PWA, and Android installed PWA separately as PASS/FAIL/BLOCKED.

Stop after evidence collection. Production, Migration, Auth0, Render architecture, and Production databases remain out of scope.

# Historical Sprint 30 real-device offline acceptance

## Current Sprint 30 status

Implementation and automated gates are complete. Overall assessed completion is **96%**; the only
Sprint 30 remainder is physical-device verification using
`docs/SPRINT_30_OFFLINE_FIRST_REVIEW.md`.

Verify on the isolated `STAGING POSTGRES` Draft only:

1. Load while online, then go offline and confirm cached schedule, employee, time-off, and
   Notification Center data remain readable.
2. Queue a clock action, time-off action, and supported shift creation; confirm pending status and
   no duplicate submission from repeated taps.
3. Restore the network and confirm sequential automatic delivery, canonical bootstrap refresh,
   and persistence after reload.
4. Create a server-side revision change from another client before reconnecting and confirm the
   queued operation stops as a visible conflict instead of overwriting data.
5. Logout and switch accounts; confirm the previous account's cache and queue are unavailable.

Do not treat a cold offline start as an authenticated login, do not invent missing shift update/
delete Commands, and do not deploy or modify Production.

## Historical — Sprint 29 remaining Web Push real-device release gate

## Current Sprint 29 status

Automated hardening is complete, but Sprint 29 remains
**PARTIAL / PENDING USER VERIFICATION** at **95%** overall completion.

The only remaining work is to execute
`docs/SPRINT_29_WEB_PUSH_RELEASE_GATE.md` on:

1. Windows Edge installed PWA.
2. iPhone Home Screen PWA.
3. iPad Home Screen PWA.

For each device, record permission, initial/de-duplicated subscription, foreground/background/
closed delivery, notification click, badge/list/read consistency, disable, re-subscribe, logout,
account switch, and Workspace isolation. Do not use Safari tabs or viewport simulation as Apple
Home Screen PWA evidence.

Do not begin a new feature Sprint, deploy Production, run a Production Migration, modify a
Production database/Auth0 tenant, or introduce Firebase/APNs/email/SMS before this evidence is
recorded.

## Current gate

Sprint 28 is **COMPLETE**. After 20:22 (Asia/Taipei), the owner verified background
system delivery from the latest `STAGING POSTGRES` installed Android PWA by sending
a test notification on that same Android device and returning to the Home screen.
The implementation baseline is `d19765f9bf8be3f8812f783f03b081aaf5678c75`;
current assessed completion is **95%**.

ADR 0017 remains authoritative. No Firebase SDK/project/token, second Service Worker,
Production deployment, Production database operation, or Production Migration is
permitted.

## Sprint 29 scope

1. Windows Edge: controlled unregister → browser unsubscribe/new subscription → controlled register → enabled UI.
2. Windows Edge: same-device background test, notification click focus/navigation, badge/list consistency, disable, and re-subscribe.
3. iPhone/iPad Home Screen PWA: permission, subscription, same-device background delivery, click, badge/list consistency, disable, and re-subscribe.
4. Confirm each device remains bound to the live Session, Membership, and Workspace and never exposes another Workspace.
5. Use only the current isolated non-Production `STAGING POSTGRES` Draft and existing services. Make no code change unless a reproducible defect requires a separate minimal fix.

## PASS / FAIL / BLOCKED

- `PASS`: the full device-specific flow succeeds with no cross-Workspace data, unexpected logout, sensitive Console output, or Production request.
- `FAIL`: a reproducible product defect occurs. Capture only the HTTP status, safe error code, request ID, and step; never capture a token or full subscription endpoint.
- `BLOCKED`: the required device is unavailable or an external Staging-only allowlist is incomplete.

## Sprint 28 completed acceptance record

- Android Chrome/installed PWA background delivery: **PASS**, owner-verified after 20:22 (Asia/Taipei) on 2026-07-30.
- Verified flow: latest `STAGING POSTGRES` Draft → Notification Center shows Push enabled → same Android device sends test → return to Android Home screen → system background notification received.
- This record does not claim unreported device actions. Click, badge/list, disable, and re-subscribe retain automated coverage and are recommended for the Sprint 29 real-device release gate.

## Stop conditions

- Stop on any Production URL/database, cross-Workspace delivery, missing Session/Membership enforcement, full endpoint/key exposure, or request to weaken the provider allowlist.
- Do not start Production rollout, Production Migration, or a new notification transport from this acceptance Sprint.

---

# Historical next work — Finish Sprint 27 Staging Web Push acceptance

## Current gate

Programming and Neon Staging Migration acceptance are complete. This is not Sprint 28.
The Edge WNS allowlist correction is complete in source and requires final Windows
re-registration verification after `0018_edge_web_push_provider_allowlist` is active in
Neon Staging and the replacement Draft is allowlisted.

## Remaining external Staging acceptance

The distinct worker credential, protected VAPID settings, enabled Render worker, HTTP 200 readiness, and public-key-only Draft are complete.

1. Add `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app/` to the existing Auth0 Staging callback and logout allowlists.
2. Add `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app` to the existing Auth0 Staging web-origin/CORS allowlists and Render `BANK_ALLOWED_ORIGINS`.
3. Complete the Windows and iPhone Home Screen PWA checks below.

## Windows Chrome — PENDING USER VERIFICATION

1. Sign in to the Draft and open Notification Center.
2. In Edge, use the existing granted permission, click re-register, and confirm the
   sequence completes: controlled unregister, new browser subscription, controlled
   register, then enabled UI.
3. Click enable in Chrome, grant notification permission, and send one test notification.
4. Confirm the first test succeeds; after three tests in ten minutes, confirm the fourth shows the Chinese safety-limit message without logout or a generic authorization error.
5. Verify foreground, background, closed-window delivery, click-to-open Notification Center, unread badge, disable, and re-register.
6. Verify another device subscription is not removed and logout/expired Session cannot receive new protected events.

## iPhone Home Screen PWA — PENDING USER VERIFICATION

1. Open the Draft in Safari, add it to the Home Screen, and launch the installed PWA.
2. Enable Push only from the in-App button, grant permission, and send one test notification.
3. Background and close the PWA, trigger a synthetic Notification Center event, verify system delivery, tap-to-open, badge/list consistency, disable, and re-register.
4. Ordinary Safari-tab use must show the Home Screen requirement and must not be reported as Push PASS.

## Stop conditions

- Stop on Production endpoint/configuration, cross-Workspace delivery, direct Role table access, sensitive payload/log, failed Migration checksum, failed readiness, or any request to expose a private key.
- Do not start Sprint 28 until the owner records available device results.

---

# Historical next work — Apply Notification Center to isolated Neon Staging

## Goal

Completed in Sprint 26: Migration `0014_notification_center` and the Notification Center runtime were proven against isolated Neon Staging without modifying Production. The next unique work is the real-device checklist appended below.

## Required controlled steps

1. Confirm the target is Neon Staging and record the existing restore/PITR condition.
2. Completed: verified `0014` as the intended feature migration while `0009`/`0010` remained excluded.
3. Completed: applied `0014` plus additive `0015`, recorded checksums, verified table/index/foreign-key/RLS/trigger/functions, and reapplied least-privilege API Role grants.
4. Verify the API Role has zero direct table access and can execute only the reviewed notification functions.
5. With synthetic Workspace A/B identities, prove recipient-only reads, cross-user/cross-Workspace denial, manager/employee targeting, idempotent read Commands, and no exposure of leave reasons.
6. Prove outbox write and notification creation are one transaction; a rejected command must create neither.
7. Exercise down migration and reapply on Staging, then verify checksum and application state.
8. Pending user verification: run real boss/employee browser E2E, Smart Polling/Service Worker notification refresh, logout cleanup, mobile layout, and accessibility on the new non-Production Draft.

## Stop conditions

- Stop on any unexpected pending migration, checksum mismatch, cross-Workspace or reason disclosure, direct API Role table privilege, rollback failure, Production endpoint, or need to weaken RLS.
- Do not add Firebase Push, APNs, email, SMS, a second polling controller, or a second notification data path.
- Do not deploy Production or apply `0014` to Production.

---

# Historical next work — Sprint 24 real-device Smart Polling acceptance

## Automated baseline

- Overall assessed completion: **91%**.
- PostgreSQL Staging uses one adaptive synchronization controller: active 2 seconds, idle 20 seconds, and background 60 seconds.
- Revision-only API reads, `X-Bootstrap-Revision` validation, cross-tab/PWA revision signals, offline recovery, request deduplication, and incremental top-level state application are covered by automated tests.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, Netlify, dependencies, and lockfiles were not changed or deployed.

## Windows — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in two separate signed-in Sessions: manager in Chrome or Edge and employee in the other browser.
2. Keep the employee request/status page visible and active.
3. Approve a synthetic scheduled-leave or ad-hoc-leave request from the manager Session.
4. Confirm the employee sees the approved state within 3 seconds without refresh, navigation reset, modal closure, form loss, duplicate notification, or full-screen flicker.
5. Leave the employee page untouched for more than 30 seconds, perform another manager update, and confirm convergence within 20 seconds.
6. Open a second employee tab, perform one manager update, and confirm both employee tabs converge without duplicate command requests.
7. Disconnect the employee device, perform one manager update, reconnect it, and confirm the next online synchronization converges without logout or data loss.
8. Verify DevTools shows no overlapping revision/bootstrap requests, no repeated Console error, and no Production or Google Sheets endpoint.

## iPhone Safari/PWA — PENDING USER VERIFICATION

1. Sign in to the approved `STAGING POSTGRES` Draft as the employee in Safari or the installed Staging PWA.
2. Keep the App visible and active while a manager approves a synthetic request; verify the state appears within 3 seconds.
3. Leave the App visible but untouched for more than 30 seconds; verify a later manager change appears within 20 seconds.
4. Background the App, make one manager change, then return to the App; verify foreground refresh occurs without flash, scroll reset, form loss, or Session error.
5. Repeat once across offline/online recovery and confirm the current screen is retained.

## Android Chrome and iPad Safari/PWA — PENDING USER VERIFICATION

Repeat the iPhone cases on each real device. Viewport simulation is not accepted as real-device evidence. Confirm touch targets, scrolling, standalone PWA return, timer throttling recovery, and no environment/cache crossover.

## PASS / FAIL / BLOCKED

- **PASS:** all available real-device cases meet the active/idle/background convergence windows, preserve UI state, avoid overlapping requests, and remain isolated to PostgreSQL Staging.
- **FAIL:** stale state exceeds the expected interval while online, requests overlap, UI/form/navigation state is lost, cross-tab updates duplicate work, Session handling regresses, or any Production/Google Sheets traffic appears.
- **BLOCKED:** the approved Draft, Staging identity/Membership, device, or external Staging service is unavailable.

## Stop conditions

- Stop on Production/unknown endpoint traffic, migration/database need, cross-role/Workspace data, Session fail-open, repeated mutation, data loss, or a requirement to redesign the synchronization architecture.
- Do not deploy Production or begin another feature Sprint before the owner records the available device results.

---

# Historical next work — Sprint 22 foreground-polling real-device acceptance and release decision

## Sprint 22 automated baseline

- Overall assessed completion: **89%**.
- The accepted Sprint 21 controller now runs one 15-second polling cycle only while the PostgreSQL App is authenticated, visible, and online.
- Hidden/offline/logout/Session-clear/unload stops polling; visible/pageshow/focus/online resumes one timer.
- The existing debounce, cooldown, in-flight promise, validated bootstrap, deterministic server revision, and time-off form preservation remain unchanged.
- Unchanged revisions do not replace state or render. Changed revisions use the existing bootstrap/UI path.
- Automated lifecycle, fake-timer, retry, environment-isolation, build, check, regression, release, sensitive-information, and dependency checks pass.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, and Netlify architecture/configuration were not modified or deployed.

## Single goal

Collect real signed-in evidence that foreground polling shows a manager approval to an employee within 20 seconds while the employee App remains visible. Do not change code or start Sprint 23 unless the evidence exposes a reproducible defect.

## Windows — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in Windows Chrome and sign in as the manager.
2. Open a separate signed-in employee Session and submit one synthetic scheduled-leave or ad-hoc-leave request.
3. Keep the employee request/status page visible; do not refresh, switch tab, hide the window, or navigate away.
4. Approve the request in the manager Session.
5. Start timing when the manager success response appears.
6. Verify the employee status changes within 20 seconds without manual refresh.
7. Verify the employee remains on the same tab; scroll, modal, and unsent fields remain stable; no full-page flash or duplicate success message appears.
8. In DevTools, verify there is no overlapping bootstrap request, no repeated Console error, and no Production/Google Sheets endpoint.

## iPhone Safari/PWA — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in Safari or the installed Staging PWA and sign in as the employee.
2. Submit one synthetic scheduled-leave or ad-hoc-leave request, then keep the request/status screen visible and the device unlocked.
3. Approve the request from a separate manager device/Session.
4. Do not refresh, background Safari/PWA, switch page, or navigate.
5. Verify the approval appears within 20 seconds.
6. Verify there is no screen flash, navigation reset, form loss, duplicate notification, logout, or Session error.
7. Repeat once after an offline/online recovery: disconnect before one cycle, reconnect, then verify a later cycle updates without clearing the current screen.

## PASS / FAIL / BLOCKED

- **PASS:** both real Windows and iPhone cases update within 20 seconds and all UI/network/security expectations hold.
- **FAIL:** stale state exceeds 20 seconds while online/visible, requests overlap, UI rerenders unnecessarily, form/navigation state is lost, Console floods, or Session/environment isolation regresses.
- **BLOCKED:** the approved Draft, valid Staging identities/Memberships, required device, or external Staging service is unavailable.

## Stop conditions

- Stop on Production/unknown endpoint traffic, migration/database need, cross-role/Workspace data, Session fail-open, repeated mutation, data loss, or a requirement to redesign the synchronization API.
- Do not deploy Production or begin Sprint 23 before the owner records both real-device results.

---

## Historical Sprint 21 acceptance record

## Sprint 21 acceptance baseline

- Overall assessed completion: **88%**.
- PostgreSQL foreground refresh is implemented for visible `visibilitychange`, `pageshow`, and focus.
- Event bursts are debounced and deduplicated; only one bootstrap request may be in flight.
- The browser rerenders only when the deterministic server-issued revision changes.
- Time-off reads refresh without clearing unsent employee forms.
- Automated build, check, full regression, release gate, environment isolation, sensitive-information scan, and production dependency audit pass.
- Production, migrations, databases, Auth0, Google Sheets, and Apps Script were not modified or deployed.

## Single goal

Complete evidence-based signed-in Staging acceptance for foreground synchronization. Do not add features or change the synchronization architecture.

## Windows acceptance

1. Sign in as an employee on the new `STAGING POSTGRES` Draft and submit scheduled leave.
2. Leave that employee page open or put it in the background.
3. In a separate browser/Session, sign in as a manager and approve the request.
4. Return to the employee page without manual reload.
5. Verify the approved state appears automatically.
6. Verify the current tab and unsent forms remain, no full-page flash occurs, Network shows one effective foreground refresh, and Console has no error.

## iPhone Safari/PWA acceptance

1. Sign in as an employee and submit scheduled leave.
2. Put Safari/PWA in the background.
3. Approve the request from a separate manager Session.
4. Reopen Safari/PWA without manual refresh.
5. Verify the approval appears automatically without navigation reset, form loss, flicker, or repeated requests.

## PASS / FAIL / BLOCKED

- **PASS:** both signed-in scenarios update automatically and all UI/network expectations hold.
- **FAIL:** stale data remains, requests duplicate, UI resets/flickers, a form is lost, or a Console/security error occurs.
- **BLOCKED:** Draft origin is not allowlisted, test identities are unavailable, or the required real device/browser cannot be operated.

## Stop conditions

- Stop on Production access, migration/database change, Auth0 Production change, tenant leakage, Session regression, persistent UI loss, or a need to redesign the API.
- iPhone results remain **PENDING USER VERIFICATION** until performed on the actual device.

## Historical time-off UI Sprint record (completed)

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`.
- Overall completion: **87%**.
- Neon Staging migration: `0013_time_off_requests`; it is not applied to Production. Migrations `0009`／`0010` were not changed or applied.
- Existing contracts only: `GET /v1/time-off-requests`; `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- Production, Auth0, Google Sheets, and Apps Script were not modified in Phase 1.
- Phase 1 completed only the data model and controlled read/Command API. No feature-specific Draft or iPhone UI acceptance exists yet.

## Single goal

Connect the existing employee and manager frontend to the already accepted `0013_time_off_requests` read/command boundary. Do not create a second API, change the eight-day quota, convert legacy leaves, or apply a new migration unless a reproducible backend contract gap proves it necessary.

## Employee acceptance

- Separate “我的排休” and “我要請假” entry points.
- Show own draft/local edits, pending, approved, rejected, and cancelled statuses.
- Scheduled leave shows the existing eight-day used/remaining quota.
- Ad-hoc leave supports a single day or bounded date range, type, and private reason.
- Show coworkers' approved scheduled-leave names/dates only, plus minimal approved ad-hoc coverage without reasons.
- Employee may submit/cancel only their own requests.

## Manager acceptance

- Separate pending scheduled-leave and ad-hoc-leave queues.
- Show processed history and same-store approved scheduled-leave overview.
- Confirm approve/reject actions and prevent duplicate submission.
- Never expose another Workspace.
- Build a new non-Production Draft and complete the approved iPhone workflow only after the role-scoped UI is ready.

## Mobile and failure acceptance

- Minimum 44px touch targets, no horizontal overflow, bounded long names/reasons.
- Success refreshes bootstrap/read state without full-page reload.
- Failures keep the form/draft, show a safe actionable message, and do not log out for ordinary business errors.
- Run iPhone Safari and Android Chrome acceptance on an isolated non-Production Draft.

## Stop conditions

- Stop on a missing backend contract, privacy leak, Workspace leak, Session regression, unexpected legacy-data conversion, need for Production access, or need for a new migration.

## Prohibited

- Production deploy/migration; Auth0 redesign; Google Sheets/Apps Script changes; shifts update/delete; employees update; PWA work; unrelated refactoring; inclusion of `.codex`, `.netlify`, build outputs, or untracked `0010_commission_rules`.

---

## Historical next-sprint record (superseded; does not override the 87% baseline above)

## 唯一目標

在不新增產品功能、不修改資料庫、不套用 Migration、不部署 Production 的前提下，使用真實手機、平板與桌機瀏覽器，驗證目前 Google Sheets `STAGING` 固定 Draft 的核心老闆／員工流程、響應式畫面、觸控、可及性、PWA／Cache、Session／Membership 失效與環境隔離。

若另行明確核准重驗 PostgreSQL 資料層，必須使用既有隔離 `STAGING POSTGRES` Draft 與可回復 runbook；不得在本 Sprint 中自行切換資料層。

## 基準與限制

- 產品程式基準：本文件所在 Commit（上一個驗收 Commit：`701169468407df9a9965e9b9e325ecef1d120326`）。
- 專案完成度基準：86%。
- 固定 Draft 目前狀態：Google Sheets `STAGING`。
- Production 前端、API、Auth0、PostgreSQL、Netlify 與資料不得修改、連線作業或部署。
- Migration `0009`／`0010` 不得套用；不得新增或修改 Migration。
- 不得重新產生 tenant context key、建立真實使用者、使用 Production 資料或輸出任何 Secret／Token／Session ID／密碼。
- 不得用 viewport 模擬、裝置模擬器或自動化結果冒充真實裝置 PASS；可用於輔助定位，但證據必須標明來源。
- 發現缺陷時記錄最小重現證據並依停止條件中止；不得在同一 Sprint 順便新增功能或大規模重構。

## 2026-07-25 目前矩陣狀態

| 編號 | 狀態 | 已完成證據 | 尚缺證據 |
|---|---|---|---|
| D1 iPhone Safari／PWA | BLOCKED | 390×844 輔助 viewport 無水平溢位 | 真機 Safari、觸控、PWA、VoiceOver、Session 與核心流程 |
| D2 Android Chrome／PWA | BLOCKED | 360×800 輔助 viewport 無水平溢位 | 真機 Chrome、觸控、PWA、TalkBack、離線與核心流程 |
| D3 iPad Safari | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Safari、旋轉／Split View、PWA、VoiceOver 與核心流程 |
| D4 Android Tablet Chrome | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Chrome、旋轉／分割畫面、PWA、TalkBack 與核心流程 |
| D5 Windows Chrome | BLOCKED（首次載入、PKCE、Claim PASS） | 真 Chrome 首次／重新載入均為 Google Sheets `STAGING`；Manifest 正確、Console error 0；Auth0 allowlist 後真實 PKCE、Session Claim 與 `sid` 一致性通過；Provider Session 可重用 | 完整老闆／員工產品 UI、PWA 安裝、登出、多分頁及可及性人工驗收 |
| D6 Windows Edge | BLOCKED（首次載入、PWA 儲存 PASS） | 真 Edge 隔離設定檔首次／第二次載入均為 `STAGING`；Manifest、Service Worker、Cache Storage、Script Cache 有證據 | 互動式 Auth0、PWA 安裝、追蹤防護、Narrator、高對比與完整核心流程 |
| D7 macOS Safari | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Safari、ITP、PWA／Dock、VoiceOver、登入後流程 |
| D8 macOS Chrome | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Chrome、PWA、VoiceOver、多分頁及登入後流程 |

PWA Cache 修正輪次的品質檢查 PASS、自動回歸 29／29 PASS；同 origin 舊 PostgreSQL Worker 控制下，Google Sheets Staging 第一次載入、重新整理、Worker 更新與離線回復均為 PASS。2026-07-25 續驗亦確認 Draft 僅含 Google Sheets Staging 設定，Chrome 與 Edge 首次載入均未再出現 `STAGING POSTGRES`。D1–D8 尚未全部取得真實裝置 PASS，因此真實裝置矩陣 Sprint **尚未完成**，專案完成度維持 86%。

## 下一輪最小人工操作

1. 先用 iPhone Safari、Android Chrome、iPad Safari、Android Tablet Chrome、macOS Safari／Chrome 各開啟核准 Draft；記錄裝置、OS、瀏覽器版本及第一次／重新載入結果。
2. 在支援裝置安裝 PWA，驗證 Staging 名稱、standalone 啟動、Service Worker 更新、離線／重連與 Cache 不跨環境。
3. 在 Windows Chrome／Edge 補完整產品老闆／員工流程、登出、多分頁、PWA 安裝與可及性；不得只以 Auth0 驗證頁視為產品 UI PASS。
4. 每個裝置獨立記錄 PASS／FAIL／BLOCKED；任何 Production request、錯誤環境、跨 Workspace 或資料不一致立即停止。

## 最少人工真機驗收步驟

每一個 D1–D8 必須獨立執行並記錄裝置、OS、瀏覽器版本與不含敏感資訊的畫面證據：

1. 以固定 Draft HTTPS URL 開啟，先確認畫面只顯示紫色 `STAGING`；若出現 `STAGING POSTGRES`、Production 或 Local，立即停止並記錄。
2. 既有安裝／曾開啟過的裝置先直接開啟一次，再重新整理一次；確認兩次都不載入錯誤資料來源。另以乾淨瀏覽器或清除「僅此 Staging 網域」的網站資料重測。
3. 使用合成 Staging 老闆登入，驗證員工、班次、排假、出勤、工時核定、頁面返回／重新整理及登出；不得記錄密碼、Token 或 Session ID。
4. 使用合成 Staging 員工登入，驗證當月／次月日曆、額度內排假、打卡、工時／收入、重新整理及登出。
5. 使用第二 Workspace 合成身分嘗試目標 Workspace，確認 Read／Command 皆拒絕；再驗證 Session 過期或 Membership 失效後 fail closed。
6. 直向／橫向或 100%／125% 縮放重跑核心頁面，確認無溢位、遮擋、軟鍵盤覆蓋、無法點擊或連續點選跳頁。
7. 安裝 PWA（支援時），驗證名稱含 Staging、關閉重開、背景／前景、離線／重連、Service Worker 更新及 Cache namespace；不得與 Local／Production 共用 Session 或資料。
8. 檢查 Console／Network：不得有未捕捉錯誤，不得出現 Production／未知後端；完成資料對帳與合成測試資料恢復後，為該裝置標記 PASS／FAIL／BLOCKED。

## 目標裝置與瀏覽器

| 編號 | 真實裝置 | 瀏覽器 | 必測方向 |
|---|---|---|---|
| D1 | iPhone | Safari | 直向、橫向 |
| D2 | Android Phone | Chrome | 直向、橫向 |
| D3 | iPad | Safari | 直向、橫向、Split View（可用時） |
| D4 | Android Tablet | Chrome | 直向、橫向 |
| D5 | Windows | Chrome | 100%／125% 縮放、鍵盤 |
| D6 | Windows | Edge | 100%／125% 縮放、鍵盤 |
| D7 | macOS | Safari | 一般視窗、較窄視窗、鍵盤 |
| D8 | macOS | Chrome | 一般視窗、較窄視窗、鍵盤 |

每個編號必須分別產出 PASS／FAIL／BLOCKED；不得以另一個瀏覽器或作業系統代替。

## 驗收前置

- [ ] 記錄 Commit、固定 Draft HTTPS URL、日期、裝置型號、OS 與瀏覽器版本。
- [ ] 畫面清楚顯示 `STAGING`，網址與 PWA 名稱不含 Production 身分。
- [ ] 確認 Network 只連向核准的 Staging 來源，沒有 Production API／Auth0／資料庫請求。
- [ ] 確認 Google Sheets Staging readiness／備份與可回復基線；不得記錄憑證或個資。
- [ ] 準備合成的 Staging 老闆、員工及第二 Workspace 身分與有效測試 Membership。
- [ ] 記錄初始員工、班次、排假、出勤、薪資可見資料與 revision，供操作後對帳及恢復。
- [ ] 確認 Service Worker、Cache Storage、localStorage 與 Session namespace 為 Staging 專用。

## 共通驗收清單

### 身分與權限

- [ ] 老闆登入成功；錯誤憑證、取消登入與過期 Session 顯示可理解錯誤，不出現無限轉圈。
- [ ] 員工登入成功，且只看見本人允許的班表、排假、出勤與收入資料。
- [ ] 登出清除 Staging 認證狀態；返回、重新整理或重新開啟 PWA 不可恢復舊 Session。
- [ ] Session 撤銷、帳號停權或 Membership 移除後，即使頁面未關閉也必須 fail closed。
- [ ] 第二 Workspace 身分不可讀取、建立、修改或刪除目標 Workspace 資料。
- [ ] 前端隱藏不作為授權依據；任何錯誤角色操作由後端拒絕。

### 核心老闆／員工流程

- [ ] 老闆可查看員工、班次、排假、出勤與允許的薪資摘要。
- [ ] 員工可查看當月／次月日曆、選擇額度內休假並儲存；老闆同步後結果一致。
- [ ] 員工上班／下班打卡後，老闆出勤畫面顯示正確狀態；老闆核定工時後員工收入一致。
- [ ] 新增員工／班次的既有流程可以完成或顯示已知限制，不產生重複資料。
- [ ] 重複點擊登入、儲存、打卡、登出與導覽不造成雙重 mutation、重複畫面或卡死。
- [ ] Revision conflict 顯示明確訊息，不會靜默覆寫另一裝置資料。
- [ ] 操作後依初始記錄完成員工、排假、出勤、工時與 revision 對帳，並恢復合成測試資料。

### 響應式、觸控與可及性

- [ ] 直向／橫向／視窗縮放後，登入、日曆、頁籤、按鈕、對話框與表格不水平溢位或互相遮擋。
- [ ] 觸控目標可點、沒有 hover-only 操作、日曆連續點選不跳頁或失去選擇。
- [ ] 軟體鍵盤不遮住帳號、PIN、錯誤訊息或主要按鈕；關閉鍵盤後版面恢復。
- [ ] 200% 文字／系統較大字級時核心操作仍可完成。
- [ ] 鍵盤可依合理順序導覽，焦點可見，Esc／Enter 行為安全；頁籤狀態可辨識。
- [ ] VoiceOver／TalkBack／桌面螢幕閱讀器可讀出欄位名稱、按鈕、狀態與錯誤；不可只靠顏色表達。

### 弱網、離線與錯誤恢復

- [ ] 慢速網路時顯示 loading／disabled，沒有重複送出或無限 spinner。
- [ ] API timeout 顯示明確重試選項；不得靜默 fallback 至另一資料層。
- [ ] 離線開啟只使用 Staging app shell，不顯示 Production 或其他環境舊資料。
- [ ] 重新連線後不重複排假、打卡或其他命令；畫面回到 authoritative state。
- [ ] 錯誤訊息不含 Token、Session ID、資料庫資訊、完整個資或 stack trace。

### PWA、Service Worker、Cache 與環境隔離

- [ ] 安裝名稱、圖示與啟動畫面清楚標示 Staging；不得覆蓋或開啟 Production。
- [ ] 首次安裝、更新、關閉重開、返回前景與硬重新整理載入同一核准版本。
- [ ] Service Worker 更新後舊 cache 可安全淘汰，不發生舊 HTML＋新 JS／CSS 混用。
- [ ] 清除 Staging site data 只影響 Staging，不影響其他環境。
- [ ] Cache Storage、localStorage、Session 與帳號資料不存在 Local／Production namespace 污染。
- [ ] Console 無未捕捉 JavaScript error；Network 無 Production、未知後端或未授權 origin。

## 裝置專屬驗收項目

### D1 — iPhone Safari

- 驗證 Safari 返回／前進、分頁重新載入、背景至少數分鐘再返回及低電量模式下狀態。
- 驗證「加入主畫面」、standalone 啟動、safe-area、瀏海／Dynamic Island 與底部工具列不遮擋控制項。
- 驗證 Service Worker 更新及 Safari Cache 清除後可取得新版本，不留無限舊 cache。
- 使用 VoiceOver、系統較大字級與軟體鍵盤完成登入、排假、打卡及登出。

### D2 — Android Phone Chrome

- 驗證安裝提示／加入主畫面、standalone 啟動、返回鍵與背景／前景恢復。
- 使用 TalkBack、系統較大字級、鍵盤自動填入及縮放完成核心流程。
- 驗證 Chrome offline／重新連線及 Service Worker 更新不重複 mutation。

### D3 — iPad Safari

- 驗證直向、橫向與可用時的 Split View；日曆七欄、表單與對話框不裁切。
- 驗證觸控、外接鍵盤（可用時）、VoiceOver、較大字級與 PWA standalone。
- 驗證 Safari 分頁記憶體回收或背景恢復後 Session／Cache 行為安全。

### D4 — Android Tablet Chrome

- 驗證直向／橫向、分割畫面（可用時）、觸控與外接鍵盤（可用時）。
- 驗證寬畫面不錯誤放大手機控制列，日曆、表格與對話框維持清楚層級。
- 驗證安裝、更新、離線／重連與 TalkBack。

### D5 — Windows Chrome

- 驗證 100%／125% 縮放、窄視窗、鍵盤全流程、焦點順序與螢幕閱讀器基本可讀性。
- 驗證 Install App、桌面捷徑啟動、Service Worker 更新、DevTools Network／Console 及 cache namespace。
- 驗證多分頁 revision conflict 與登出後其他分頁立即失效。

### D6 — Windows Edge

- 重複 Chrome 的核心流程，另驗證 Edge 安裝、Application Cache／Service Worker 與追蹤防護不破壞 Auth0／Staging 請求。
- 驗證 Windows 高對比模式與 Narrator 基本流程。
- 驗證多分頁、返回／前進與重新開啟已安裝 PWA 的 Session 清除。

### D7 — macOS Safari

- 驗證 Safari Intelligent Tracking Prevention 條件下 Auth0 返回、登出與重新登入。
- 驗證窄視窗、系統縮放／較大文字、鍵盤、VoiceOver、背景／前景與 Cache 更新。
- 驗證安裝／加入 Dock（瀏覽器支援時）及 standalone 不共用錯誤環境資料。

### D8 — macOS Chrome

- 驗證 PWA 安裝、鍵盤、VoiceOver、縮放、多分頁 revision conflict 與登出同步。
- 驗證 DevTools Network／Console、Service Worker lifecycle 與 cache/storage namespace。
- 驗證 Chrome／Safari 之間不共享 Staging Session，且皆不出現 Production cache／資料。

## 判定標準

### PASS

- 該裝置的所有適用共通與專屬項目皆符合預期。
- 無資料遺失、重複 mutation、跨角色／跨 Workspace 洩漏、錯誤後端、Production request、未捕捉 JavaScript error 或不可恢復 cache 問題。
- 操作後資料對帳一致且合成測試資料已恢復。
- 具備裝置／OS／瀏覽器版本、步驟與不含敏感資訊的證據。

### FAIL

- 具備可重現步驟的功能、權限、資料一致性、環境隔離、PWA、響應式、觸控或可及性缺陷。
- 測試人員可完成必要操作，但實際結果不符合既有需求或安全邊界。
- FAIL 必須建立單一缺陷紀錄、嚴重度與最小重現證據；本 Sprint 不順便重構。

### BLOCKED

- 缺少指定真實裝置／瀏覽器、合法 Staging 帳號／Membership、核准 Draft／origin、Render 授權或必要外部服務可用性。
- 任何只以模擬器、viewport 或未授權請求取得的結果。
- BLOCKED 不等同 PASS，也不得降低矩陣範圍來宣稱 Sprint 完成。

## 立即停止條件

- 任一請求、登入、Cache、Session 或資料指向 Production 或未知環境。
- 出現跨 Workspace／跨角色資料、直接資料表存取或授權 fail-open。
- 出現 Secret、Token、Session ID、密碼、完整連線字串或真實個資外洩。
- 發生非預期資料寫入、資料對帳不一致、重複 mutation、revision 靜默覆寫或無法恢復合成測試資料。
- 固定 Draft 無法回復 Google Sheets `STAGING`，或環境／Service Worker cache 發生污染。
- 驗收需要套用 Migration、修改 Production、降低安全檢查、重建 tenant context key 或改變已驗收架構。
- 發現 P0／P1 安全或資料完整性問題；立即停止受影響矩陣，保留不含敏感資訊的證據並回報。

## 完成條件與輸出

- D1–D8 均有明確 PASS／FAIL／BLOCKED，且不得遺漏版本與證據。
- 共通、裝置專屬、PWA／Cache、弱網、權限、資料對帳與 rollback 結果全部彙整。
- 任何 FAIL／BLOCKED 已分級並列出下一個最小安全修復工作；不得在本 Sprint 自動開始修復或下一 Sprint。
- 再確認 Production 未修改／部署，Migration `0009`／`0010` 未套用，固定 Draft 最終為核准的 Google Sheets `STAGING` 狀態。
# Next unique Sprint — Sprint 23 real-device synchronization acceptance

## Automated baseline

- The browser checks `GET /v1/bootstrap/revision` every 15 seconds only while PostgreSQL Staging is authenticated, visible, and online.
- The unified server revision includes the caller's bootstrap and role-visible Time-Off state.
- Unchanged revisions do not fetch the full bootstrap or rerender. Changed revisions use the existing validated bootstrap path.
- Debounce, cooldown, one timer, one in-flight request, offline/hidden suspension, Session invalidation, form preservation, and Google Sheets/Production isolation remain covered automatically.
- No Production, database, migration, Auth0, Google Sheets, Apps Script, Render, or Netlify operation is authorized by this acceptance.

## Required manual matrix — PENDING USER VERIFICATION

For each available device, use separate employee and manager Staging Sessions:

1. **Windows Chrome/Edge:** employee submits scheduled leave; manager approves; keep employee App visible and verify the status/calendar updates within 20 seconds without reload. Repeat for clock-in and manager approved-hours updates in the opposite direction.
2. **iPhone Safari/PWA:** repeat approval and clock-in flows while the employee App remains foreground. Verify no flash, navigation reset, form loss, logout, duplicate request, or Console-visible failure.
3. **Android Chrome/PWA:** repeat the same flows on a real Android device; viewport simulation is not acceptance evidence.
4. **iPad Safari/PWA:** repeat the same flows and verify tablet layout, current tab, scroll position, modal/form state, and automatic convergence.

Also verify one shift creation from a manager Session appears on another already-open authorized device. Shift update/delete are not currently accepted commands and must not be represented as completed.

## PASS / FAIL / BLOCKED

- **PASS:** every available required real device converges within 20 seconds, retains the active UI state, and shows no duplicate/overlapping request or environment/role leak.
- **FAIL:** stale state exceeds 20 seconds while online and visible; full bootstrap is fetched on unchanged revision; UI flashes/resets; forms are lost; requests overlap; or Session/environment isolation regresses.
- **BLOCKED:** a required real device, approved Draft, valid synthetic identity/Membership, or Staging service is unavailable.

## Stop conditions

- Stop immediately on Production traffic, cross-Workspace/role leakage, mutation duplication, data loss, migration need, Auth0 architecture change, or a requirement to alter accepted business logic.
- Record actual Windows/iPhone/Android/iPad results before starting another feature Sprint.

---
## Next unique Sprint — Notification Center real-device acceptance

Goal: accept the Staging-only Notification Center on Windows Chrome/Edge and iPhone Safari/PWA after the new Draft origin is allowlisted. Do not modify Production, databases, migrations, Auth0 architecture, Google Sheets, or Apps Script.

1. Add the exact new Draft callback/logout/origin to Auth0 Staging and its origin to Render CORS.
2. Sign in as an employee, submit scheduled leave and ad-hoc leave, and keep the employee App open.
3. Sign in as boss in a separate browser/device; confirm one unread notification per submission and open the related Time-Off review screen.
4. Approve one request and reject the other; confirm the employee receives the corresponding notifications through existing Smart Polling/cross-client revision sync without reload.
5. Verify unread badge count, unread-first/newest-first order, mark-one, mark-all, navigation, logout cleanup, refresh persistence, mobile touch targets, and no Console error.
6. Confirm Workspace B and unrelated users receive no Workspace A notification or private reason.
7. Record each Windows/iPhone result as PASS/FAIL/BLOCKED; do not infer device PASS from automated tests.
