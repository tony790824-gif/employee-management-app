# Change Log

## 2026-08-13 - Production Closure Phase 2D ACL Semantic Comparator

- Added versioned `bankeban-acl-semantics-v1`, expanding PostgreSQL defaults and categorizing principals, effective privileges, grant options, default privileges and dedicated-reader membership paths without persisting raw Production identities.
- Added a dual-fingerprint Gate contract: non-ACL structural match plus semantic ACL match; raw ACL text is no longer considered sufficient proof.
- Disposable PostgreSQL 18.4 tests cover equivalent serialization/owner/grantor/Extension cases and fail closed on PUBLIC, write, grant-option, membership, unknown-principal, model-version and sanitization regressions.
- Preserved all Phase 2B source bytes; 0/57 historical ACL-only differences can be semantically resolved from the redacted evidence, so the Gate remains BLOCKED and Production remains 70% / NOT READY.

## 2026-08-13 - Production Closure Phase 2C Sanitized Structural Drift Analysis

- Preserved and hash-verified the single Phase 2B source evidence, then classified its 136 column omissions as a permission-filtered catalog query defect and its 57 ACL-only changes as unresolved operational/extension ACL semantics.
- Replaced the shared `information_schema.columns` collector with permission-independent `pg_catalog` metadata and proved Phase 1/Phase 2A byte equivalence in the same disposable PostgreSQL 18.4 database.
- Kept the live structural Gate BLOCKED, the matrix at 9/13 and Production at 70% / NOT READY; Phase 2C made no Production connection or mutation.

## 2026-08-13 - Production Closure Phase 2A Dedicated Starting-Baseline Comparator

- Added a dedicated, confirmation-gated exact-`0001`-`0008` Production starting-baseline comparator without executing it.
- Reused authenticated TLS and dedicated-reader safety boundaries, restricted catalog access to metadata, and added separate sanitized evidence/schema/hash files.
- Refactored the Gate contract so a future live starting-structure MATCH can close only `STRUCTURAL_STARTING_BASELINE` while final ledger parity remains BLOCKED.
- Kept Sprint numbering capped at 65, the matrix at 9/13 and Production at 70% / NOT READY; no Production connection or mutation occurred.

## 2026-08-13 - Production Closure Phase 1 Structural Starting Baseline

- Materialized exactly `0001`-`0008` in two independent disposable PostgreSQL 18.4 clusters and committed the byte-identical normalized baseline.
- Added a hash-verified repository artifact/evidence contract and fail-closed regression tests, preserving explicit `0010` exclusion.
- Kept live Production structural parity BLOCKED, the 22-Gate matrix at 9/13, Production 70% / NOT READY and Migration authorization NOT_GRANTED.

## 2026-08-13 - Sprint 65 Authorized Production Read-only Evidence Analysis

- Verified the single-use sanitized evidence and its SHA-256 without making a second Production connection.
- Closed only target identity, TLS verify-full and zero-unexpected-Migration Gates, moving the authoritative matrix from 6/16 to 9/13.
- Kept ledger parity and structural starting baseline BLOCKED, Production 70% / NOT READY, Technical NO-GO and Migration authorization NOT_GRANTED.

## 2026-08-13 - Sprint 64 Event-Time Production Read-Only Evidence Attempt

- Stopped before Production connection because the approved process lacked the dedicated reader inputs; no alternative credential was used.
- Added a sanitized, SHA-256-verified BLOCKED evidence artifact and regression test proving no connection, SQL, catalog collection or mutation occurred.
- Kept all five target Gates BLOCKED, left `ROLE_BOUNDARY` and `EVIDENCE_FRESHNESS` unchanged, and preserved the 6 PASS / 16 non-PASS matrix and 70% / NOT READY decision.

## 2026-08-13 - Sprint 63 Repository-Closable Production Migration Gate Closure

- Added a deterministic 21-version/42-file migration manifest with a 13-version upgrade subset, explicit `0010` exclusion and aggregate SHA-256 validation.
- Added the Node/pnpm/driver/PostgreSQL/extension/transaction compatibility matrix and fail-closed checkpoint policy.
- Added regression tests for missing/unexpected files, `0010`, order/content/checksum/manifest tampering and false Production/runtime claims.
- Closed only the two Repository Gates, moving the matrix from 4/18 to 6/16 while preserving Production 70% / NOT READY, Technical NO-GO and authorization NOT_GRANTED.

## 2026-08-12 - Sprint 62 Production Migration Preflight Gate Closure

- Reconstructed all 22 Migration Gates in the authoritative machine-readable package and classified every non-PASS Gate exactly once.
- Recorded evidence provenance, blocker, required action/authorization/resource, cost implication, dependencies and the three-phase minimum closure order.
- Revalidated the 21-version inventory, `0010` exclusion, Migration evidence hashes and Recovery inheritance without connecting to Production.
- Kept 4 PASS / 18 non-PASS, Technical Readiness NO-GO, authorization NOT GRANTED and Production 70% / NOT READY.

## 2026-08-12 - Sprint 61 Production Migration Authorization Readiness

- Revalidated the exact 21-version tracked inventory/checksums and strict `0009`, `0011`-`0022` order while rejecting unapproved `0010`.
- Reran disposable PostgreSQL 18.4 upgrade/fresh-install parity and the 22-Gate success-path simulation with zero residual resources.
- Split Recovery evidence into isolated Restore PASS, RTO PASS, RPO BLOCKED/NOT_PROVEN and pre-Migration restore point BLOCKED.
- Kept Production Migration Technical Readiness NO-GO, authorization NOT GRANTED and Production 70% / NOT READY; no Production connection or mutation occurred.

## 2026-08-12 - Sprint 60 Production Final Go/No-Go Gate

- Consolidated 20 required Production launch areas into one fail-closed, machine-verifiable Final Gate.
- Kept Production at 70% / NOT READY, Final decision NO-GO, Gate A DEFER, Provisioning NO-GO and Migration authorization NOT GRANTED.
- Added exact read-only, payment, mutation and deferral classifications plus the dependency-safe closure order.
- Added regression coverage that rejects missing blockers, false RPO/GO promotion and unauthorized Production/payment scope.
- Performed no Production connection, mutation, deploy, resource creation or payment.

## 2026-08-12 - Sprint 59 Production RPO Evidence Closure

- Completed authenticated Console and official Neon API-contract read-only review without Production SQL, API credentials, Restore or mutation.
- Confirmed that available metadata proves PITR and six-hour retention but does not attest the latest recoverable or reference Production data boundary.
- Kept both boundaries and Recovery Gap UNKNOWN; RPO <=15 minutes remains NOT_PROVEN while RTO remains PASS.
- Added sanitized hash evidence and strengthened the fail-closed Recovery Gate without changing Production 70% / NOT READY.

## 2026-08-12 - Sprint 58 Production Data Continuity / RPO Evidence

- Formalized RPO as the gap between a trusted Production reference boundary and the latest verified recoverable data boundary.
- Recorded authenticated Neon Console evidence for PITR and six-hour retention while rejecting the requested point-in-time selector as recoverability proof.
- Kept both boundaries and the recovery gap UNKNOWN, so RPO <=15 minutes remains NOT_PROVEN.
- Added sanitized hash evidence and fail-closed tests; no Production SQL, resource, configuration, data, schema, Migration or deployment mutation occurred.

## 2026-08-12 - Sprint 57 Authorized Neon Isolated Restore Drill

- Created one explicitly authorized historical isolated Branch, verified it read-only, measured RTO at 112.335 seconds, and deleted it with zero residual resources.
- Preserved Production Branch identity and traffic isolation; no Production database, schema, data or Migration mutation occurred.
- Recorded RPO <=15 minutes as NOT_PROVEN, full owner/ACL/RLS and distinct credential verification as open, and actual Restore cost as UNKNOWN.
- Added sanitized hash evidence and strengthened the Recovery Gate without changing Production 70% / NOT READY, Gate A DEFER or Provisioning NO-GO.

## 2026-08-12 - Sprint 56 Restore Capacity and Recovery Ownership Evidence

- Recorded Neon Free-plan capacity, 1/10 Branch usage, 9 available slots and historical point-in-time Branch configuration capability from human read-only evidence.
- Configured the Owner as Recovery Commander while preserving exact Restore and Migration authorization as NOT_GRANTED.
- Added hash-verified evidence and strengthened the fail-closed authorization validator so actual Restore cost cannot be coerced from UNKNOWN to zero.
- Kept isolated Restore NOT_EXECUTED, RPO/RTO blocked, independent backup blocked, scheduled snapshot not configured and Production 70% / NOT READY; no Production or external resource operation occurred.

## 2026-08-10 - Sprint 55 Isolated Restore Authorization Decision

- Added a fail-closed authorization package limiting any future exercise to one disposable target and one distinct temporary credential with zero Production traffic and mandatory cleanup.
- Defined cost/capacity stops, Recovery Commander requirement, RPO/RTO UTC measurements and restored-target verification.
- Recorded authorization DEFER / NOT_GRANTED because provider cost/capacity and ownership evidence remain open.
- Kept readiness 70% / NOT READY and performed no Production or external resource operation.

## 2026-08-10 - Sprint 54 Production Recovery Readiness

- Added a Repository-only fail-closed Recovery package and validator covering PITR, retention, backup, isolated Restore, RPO/RTO, Migration restore point, verification, cleanup and ownership.
- Recorded the existing six-hour PITR capability evidence without claiming an independent backup, 15-minute RPO or 60-minute RTO.
- Added sanitized, hash-verified evidence and the future isolated Restore/cleanup contract.
- Kept Production Recovery NO-GO, readiness 70% / NOT READY and Migration authorization NOT GRANTED; no Production operation occurred.

## 2026-08-10 - Sprint 53 Production Migration Final Execution Readiness

- Finalized the fail-closed Production Migration Runbook and machine-readable 19-Gate readiness package.
- Added a Repository-only evaluator that refuses GO on missing, blocked, unknown, unconfigured, failed or unauthorized evidence.
- Rehearsed the exact sequence on a new disposable PostgreSQL 18.4 cluster; baseline, per-version checks, final structural fingerprint and cleanup passed.
- Kept actual Production technical readiness NO-GO and authorization NOT GRANTED because 17 Gates remain non-PASS; no Production operation occurred.

## 2026-08-10 - Sprint 52 Disposable Structural Schema Parity

- Added a fail-closed structural comparator that checks actual normalized catalog objects rather than relying only on Migration ledger equality.
- Compared an isolated `0001`-`0008` upgrade path with an independent 21-Migration fresh install; all schema, Function, trigger, RLS, ownership and ACL sections matched.
- Recorded zero missing/unexpected/mismatched objects, matching fingerprints, complete cleanup and sanitized hash evidence.
- Kept readiness 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection, SQL, Migration, deploy or external operation occurred.

## 2026-08-10 - Sprint 51 Isolated Migration Upgrade Rehearsal

- Added a Production-input-rejecting PostgreSQL 18 disposable rehearsal tool with an exact Git-tracked `0009`, `0011`-`0022` allowlist and explicit `0010` rejection.
- Completed two independent `0001`-`0008` upgrade rehearsals with per-version transactions, pre/postconditions, ledger/lock checks and fail-closed rollback probes.
- Produced deterministic sanitized evidence and matching final catalog hashes, plus regression tests for order, dependency, checksum, transaction and rollback guards.
- Kept readiness 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection, credential, SQL, Migration, deploy or external operation occurred.

## 2026-08-10 - Sprint 50 Production Migration Gap Remediation Plan

- Added an exact, checksum-verified inventory and validator for the 13 missing Production Migrations (`0009`, `0011`-`0022`) while rejecting `0010`.
- Added audited dependency/order, Production precondition, DDL/lock/runtime risk, rollback/recovery and evidence contracts plus a non-authorizing execution runbook draft.
- Identified that the generic directory-scanning Migration runner lacks exact-manifest and per-version verification stops, so Production execution remains blocked.
- Preserved readiness 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection, SQL, Migration, deploy or external operation occurred.

## 2026-08-10 - Sprint 48 Disposable Expected Catalog Baseline Materialization

- Added a confirmation-gated local PostgreSQL 18 materializer with loopback/Temp/role/database identity checks and explicit rejection of Production database inputs.
- Applied only the 21 approved tracked Migrations to two empty disposable databases; both ledgers excluded `0010` and produced byte-identical normalized catalog metadata.
- Committed the expected catalog artifact and SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`, plus deterministic/fail-closed regression coverage.
- Kept Production readiness 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production connection, SQL, Migration, deploy or external resource operation occurred.

## 2026-08-10 - Sprint 47 Production Schema Parity Read-only Evidence Closure

- Classified Migration slot `0010` as an intentional unapproved gap using Git/history and committed operating evidence; no fake Migration or checksum was created.
- Added a fail-closed parity report separating expected ledger, expected catalog, current Production ledger and structural parity.
- Recorded that the dedicated Production read-only URL/role were unavailable, so no connection or SQL was attempted and exact differences remain UNKNOWN.
- Kept Production readiness 70% / NOT READY, Gate A DEFER and Provisioning NO-GO; no Production, Migration, deploy, external configuration, DNS, Secret or traffic operation occurred.

## 2026-08-09 - Sprint 46 Production Schema Parity Read-only Plan

- Added a Git-tracked Migration inventory for expected ledger slots `0001`-`0022`, preserving `0010` as a fail-closed missing authoritative source rather than accepting untracked files.
- Added a Repository-only checksum/query validator, future SELECT-only catalog query set, sanitized evidence schema and regression tests.
- Updated Production readiness, evidence, operations, release, backlog and handoff documents without changing 70% / NOT READY, Gate A DEFER or Production NO-GO.
- No Production connection, SQL, Migration, database/resource change, deploy, DNS, domain purchase or Secret operation occurred.

## 2026-08-09 - Sprint 43 Neon Billing / Usage Evidence Closure

- Recorded sanitized human read-only evidence that the current Neon organization is on Free / US$0 per month and documented its included per-project limits.
- Separated organization-wide billing-period usage from Production-only usage and retained every undisplayed Production-only cost field as UNKNOWN.
- Updated Gate A, evidence, readiness, operations, backlog and handoff documents without changing the 70% / NOT READY, DEFER and NO-GO decisions.
- No Production resource, billing setting, SQL, Migration, Restore, Deploy, DNS, Secret or external platform configuration was changed.

## 2026-08-09 - Sprint 42 Production Gate A Blocker Closure Plan

- Added one authoritative blocker inventory covering Auth0, Neon, Render, Netlify, domain/DNS/TLS, operations, recovery, Secrets, schema parity, Web Push, costs and release rollback.
- Classified each blocker by current status, required action, external/repository boundary, cost impact, risk, evidence and human ownership.
- Recorded an ordered Sprint 43+ closure route while retaining Gate A DEFER, Production readiness 70% / NOT READY and Production provisioning NO-GO.
- No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic operation occurred.

## 2026-08-09 - Sprint 41 Production Cost Finalization and Gate A Decision Package

- Revalidated official Auth0, Neon, Render, Netlify, DNS/TLS and monitoring cost boundaries and preserved every account-specific unknown.
- Finalized three fail-closed models: Minimum fixed known US$49/month, Recommended fixed known US$67/month, and Growth UNKNOWN; Neon public examples remain non-binding planning anchors.
- Kept Gate A DEFERRED, Production readiness at 70% / NOT READY and provisioning NO-GO. No Production, billing, platform, database, Migration, deploy, DNS, Secret or traffic action occurred.

## 2026-08-09 - Sprint 40 Netlify Billing Evidence and Gate A Cost Closure

- Recorded sanitized owner evidence for the current Netlify Free credit-based plan, 300-credit allowance and 274.6-credit current-period usage.
- Corrected the fixed cost floor to US$49/month and US$588/year by replacing the former US$9 Netlify paid-plan assumption with the evidenced US$0 current plan.
- Added Free-capacity, deployment-discipline and future-paid-gate scenarios plus warning/freeze thresholds; no Netlify setting was changed.
- Kept Gate A DEFERRED, Production readiness at 70% / NOT READY and provisioning NO-GO.

## 2026-08-09 - Sprint 39 Production Total Cost and Final Gate A Package

- Added a source-backed inventory for Auth0, Neon, Render, Netlify, domain/DNS/TLS, monitoring, logging, backup/restore, Push worker and optional alerting.
- Separated known fixed cost, official usage examples and unknown/variable items across Minimum Safe, Recommended Small Business and Growth scenarios.
- Recorded a known fixed floor of US$58/month plus Neon and unknowns; the indicative Neon-example planning value is US$73/month plus unknowns, not an exact total.
- Kept Gate A DEFERRED, Production readiness at 70% / NOT READY and provisioning NO-GO.
- Added a sanitized public-pricing evidence record and SHA-256 verification. No Production or billing action occurred.

## 2026-08-09 - Sprint 38 Auth0 Production Capacity Evidence and Gate A Preparation

- Added a sanitized SHA-256 evidence record for the owner-observed Auth0 Free, Essentials and Professional capacity/pricing state without retaining account or billing identifiers.
- Evaluated four identity options and rejected shared Development-Tenant Production and an unapproved identity-provider migration.
- Recorded Gate A as **DEFER execution now**; Auth0 Essentials remains the preferred future minimum-capacity route for a dedicated Production Tenant.
- Kept Production readiness at 70% / NOT READY and provisioning NO-GO. No purchase, billing, Auth0, Production, database, Migration, deploy, DNS, Secret or traffic action occurred.

## 2026-08-09 - Sprint 37 Production Provisioning Preflight

- Audited the Sprint 36 handoff and confirmed the resource plan, ADR, Readiness, Evidence, Operations, Release Checklist and Backlog remain consistent.
- Added a consolidated Production blocker matrix with automation, human-action, external-limit, possible-billing, approval and missing-evidence classifications.
- Recorded an explicit NO-GO authorization gate and a project-specific provisioning order without creating or changing any external resource.
- Product completion remains 98%; Production readiness remains 70% / NOT READY. No Production, billing, Secret, database, Migration, deploy, DNS, deletion or traffic action occurred.

## 2026-08-09 - Sprint 36 Production Resource Provisioning Plan

- Added a fail-closed Production resource inventory, target architecture, dependency order and one-at-a-time human approval Gates A-G.
- Documented the Production Secret boundary, Staging/Production isolation matrix, evidence requirements and cross-layer rollback plan in ADR 0022 and the provisioning plan.
- Kept product completion at 98% and Production readiness at 70% / NOT READY; no resource, configuration, database, Migration, deploy, DNS, traffic or Secret operation occurred.
- Set the only next action to an owner Gate A decision for Auth0 tenant capacity and dedicated Production identity provisioning.

## 2026-08-09 - Sprint 34 Neon read-only evidence closure

- Recorded the authorized human Production Provision/Verify PASS against Commit `e58932032a788d6928c00457e3ffa661684ca580`; Codex did not connect to Production.
- Closed the Neon reader and application Function ACL evidence blockers while retaining 37 `public.pgcrypto` / `cloud_admin` Functions as truthful `ACCEPTED_PLATFORM_INFORMATION`.
- Appended a sanitized, SHA-256-hashed manual Neon evidence record without storing credentials, connection strings, business data or Function bodies.
- Sprint 34 is complete, but Production readiness remains 70% / NOT READY because current feature parity, Netlify/Render/Auth0, monitoring, recovery and other external evidence remain open.

## 2026-08-08 - Sprint 34 Production Read-only Access Provisioning

- Fixed Neon compatibility by replacing forbidden dangerous-attribute ALTER clauses with pre-mutation catalog checks; a dangerous pre-existing role now fails closed and safe roles continue with only permitted properties.
- Recorded the authorized Production attempt as BLOCKED / SCRIPT COMPATIBILITY DEFECT. `ON_ERROR_STOP` stopped at the first mutation, so no grants, revokes, business data, schema or Migration changed.
- Added manual, confirmation-gated Neon Production reader provision/verify/disable SQL and strict role/privilege validation.
- Removed automatic `.env.production` loading from all read-only evidence commands and added exact read-only authority gates for Netlify, Render and Auth0.
- Added the Production read-only access runbook and fail-closed tests. External credentials are absent, so evidence re-run remains BLOCKED; Production readiness remains 70% and release remains NOT READY.
- No Production request, database connection/write, Migration, deploy, Auth0/platform change, secret export or evidence fabrication occurred.

## 2026-08-04 — Sprint 33D Authorized Production Evidence Closure

- Added GET-only Netlify, Render and Auth0 Management evidence adapters while reusing the public platform validator and SELECT-only Neon inspection boundary.
- Added canonical sanitized evidence records, a 13-entry SHA-256 manifest, integrity/redaction/no-write tests and the Production Evidence Report.
- Actual external evidence remains BLOCKED because approved Production origins, a distinct DB reader and protected platform read access are not configured. Production readiness remains 70% and release remains NOT READY.
- No Production system, database, Migration, Auth0, environment variable, resource, traffic, restore or notification was modified.

## 2026-08-04 — Sprint 33C Production Platform Validation

- Added a fail-closed read-only Production platform validator covering public frontend/API/Auth0/DNS/TLS evidence and SELECT-only PostgreSQL schema metadata.
- Added JSON/Markdown evidence statuses, timeouts, response bounds, environment isolation, secure-header/cookie checks and sensitive-output redaction with no-write tests.
- Added ADR 0021, Production Platform Validation Report, Production Release Checklist and operations evidence guide.
- Production readiness remains 70% and release remains NOT READY because external platform, monitoring and recovery evidence is blocked/not configured. Production was not operated.

## 2026-08-04 — Sprint 33B Production Security & Operations Gate

- Added environment-derived frontend security headers, bounded authenticated API rate limits, build identity, and privacy-minimized request telemetry.
- Added strictly read-only Production schema inspection, public Auth0 Production validation, VAPID parity, bounded Staging capacity smoke, tracked-file sensitive scan, and a non-deploying GitHub quality gate.
- Added ADR 0020 and a Production Operations Runbook with RPO/RTO, monitoring, release, rollback, and explicit external stop conditions.
- Production readiness increased from 62% to 70%, but release remains NOT READY pending separately authorized Production schema/service, Auth0 event, recovery, monitoring/capacity, and physical-device evidence. Production was not operated.

## 2026-08-04 — Sprint 33A Production Readiness Audit

- Added an evidence-based Production readiness report covering security, infrastructure, database, performance, PWA, monitoring, rollback, and release gates.
- Separated product completion (**98%**) from Production readiness (**62%**, **NOT READY**) and classified 5 Blockers, 8 High, 7 Medium, and 2 Low findings.
- Corrected stale architecture and handoff wording while retaining historical migration context. No feature code, Production environment, database, Migration, Auth0, Google Sheets, Apps Script, or deployment was changed.

## 2026-08-03 — Sprint 32 Announcement Center

- Added Staging-only `0022_announcement_center` with Workspace-scoped announcements, per-user read markers, audience rules, soft delete, forced RLS, controlled functions, and complete rollback protection.
- Added authenticated Announcement REST endpoints and PostgreSQL frontend list/detail/create/update/delete/read behavior without adding a second API or notification architecture.
- Published announcements now create `ANNOUNCEMENT_CREATED` through the existing transactional outbox, Notification Center, Web Push queue/worker, unread badge, revision sync, and safe `/announcements/{id}` click navigation.
- Neon Staging apply/rollback/reapply, checksum, least privilege, Manager/employee permissions, Workspace A/B isolation, notification/badge consistency, idempotency, soft delete, Build, Check, tests, and Release Gate pass. Physical PWA acceptance remains pending; Production was not operated.

## 2026-08-03 — Sprint 31 PWA delivery fallback regression fix

- Reconciled an existing installed-PWA Push subscription immediately after authenticated PostgreSQL bootstrap instead of waiting until Notification Center is opened.
- Added Staging-only Migration `0021_push_delivery_fallback`: an eligible PWA remains the only initial delivery target; only an explicit PWA 404/410 expiry revokes it and idempotently queues the same notification for an eligible Browser fallback.
- Neon Staging checksum, API/Push Role separation, synthetic 404/410 recovery, single Notification Center row, Workspace isolation, Badge, deduplication, and notificationclick regressions pass. Windows PWA system-delivery revalidation remains pending; Production was not operated.

## 2026-08-03 — Sprint 31 Push Subscription Priority

- Added Staging-only Migration `0020_push_subscription_priority` and validated `pwa`/`browser` registration metadata.
- Real-event delivery now sends to active PWA subscriptions and uses Browser subscriptions only when the Workspace/User has no active PWA, preventing duplicate PWA-plus-Browser system notifications while preserving Browser fallback.
- Kept Notification Center one-row semantics, Workspace isolation, endpoint allowlists, delivery deduplication, Badge, notificationclick, and API least privilege unchanged.
- Neon Staging checksum, least-privilege inspection, and synthetic Windows/Android/iOS priority E2E pass. Windows physical duplicate-notification verification remains pending; Production was not operated.

## 2026-08-01 — Sprint 30 Offline First

- Added a bounded, versioned offline cache for PostgreSQL bootstrap, employee, shift, time-off, and
  Notification Center data without changing the Google Sheets path.
- Added a reviewed offline Command queue for attendance, leave/time-off operations, and existing
  shift creation, with stable de-duplication and enqueue-time idempotency keys.
- Added sequential recovery, bounded exponential backoff, online retry, canonical bootstrap
  refresh, and server-revision conflict protection.
- Scoped persisted data to the Staging environment and a one-way Auth0 Session binding; logout and
  account switching clear cached data. No token, cookie, raw Session ID, email, or secret is stored.
- Added a visible pending/conflict state and explicit safe discard-and-refresh action. Offline
  submissions no longer claim server persistence before replay succeeds.
- Bumped future Service Worker cache versions so an eventual authorized build does not retain an
  obsolete app shell. No Production deployment occurred.
- Added automated coverage for caching, queue allowlisting, de-duplication, idempotency, retry,
  conflict detection, replay serialization, account isolation, online recovery, and logout cleanup.
- Production, databases, migrations, Auth0/Render/Netlify configuration, Google Sheets, and Apps
  Script were not modified or deployed.

## 2026-07-30 — Sprint 29 Web Push release-gate hardening

- Recognized desktop-style iPadOS Safari as `ipados` and kept Apple Push activation restricted
  to an installed Home Screen PWA.
- Fixed the Push operation lock when permission denial or the Home Screen requirement completes
  synchronously, so the UI remains actionable for a later permission change or re-subscription.
- Added Apple-specific, actionable Chinese permission/subscription guidance without changing
  the standard Web Push transport or security boundary.
- Strengthened automated coverage for duplicate activation, controlled disable, stale
  subscription/account switching, same-origin notification clicks, stable notification tags,
  and badge/Notification Center read-state consistency.
- Sprint 29 remains **PARTIAL / PENDING USER VERIFICATION** for Windows Edge, iPhone Home Screen
  PWA, and iPad Home Screen PWA. Overall completion remains 95%.
- Production, databases, migrations, Auth0, Render/Netlify architecture, Google Sheets, and
  Apps Script were not modified or deployed.

## 2026-07-30 — Sprint 28 FCM transport hardening

- Kept ADR 0017 standard Web Push: `web-push`, VAPID, the browser Push API, and the existing Service Worker. No Firebase SDK, Firebase project, FCM registration token, or parallel worker was added.
- Verified that Chrome/Android subscriptions use the strict `fcm.googleapis.com` provider boundary and that arbitrary or lookalike HTTPS endpoints remain rejected.
- Extended synthetic Neon Staging coverage for subscription registration, same-endpoint update, controlled removal, re-subscription, and HTTP 404/410 endpoint revocation.
- Strengthened browser-worker coverage for background notification display, same-origin notification click handling, browser-managed subscription-change notification, foreground Notification Center refresh, and unread badge behavior.
- Closed Sprint 28 after the owner verified the latest `STAGING POSTGRES` installed Android PWA after 20:22 (Asia/Taipei): Push showed enabled, a same-device test was sent, and the Android system background notification arrived after returning to the Home screen.
- Updated assessed completion from 94% to 95%. Production, Production database, Production Auth0, Google Sheets, Apps Script, and Production deployment were not modified or operated.

## 2026-07-30 — Sprint 27 Edge Web Push provider allowlist

- Confirmed that Edge registration and re-registration reached the existing authenticated Push Commands but failed with `400 COMMAND_INVALID` because the Microsoft WNS endpoint host was absent from both the Node and PostgreSQL allowlists.
- Added only the official Microsoft WNS `notify.windows.com` host and its subdomains; arbitrary HTTPS endpoints and lookalike suffixes remain rejected.
- Kept `push.register`, `push.unregister`, and `push.test` on one provider policy and added additive Staging-only Migration `0018_edge_web_push_provider_allowlist` for the table constraint and controlled database Function.
- Preserved Session, Membership, Workspace, idempotency, RLS, API Role, worker Role, VAPID, and subscription-binding checks. Production was not migrated or deployed.

## 2026-07-29 — Sprint 27 Standard Web Push

- Fixed the Windows test-notification error presentation after Render evidence confirmed `POST /v1/commands/push.test` returned `429 PUSH_RATE_LIMITED`, not an authorization, Session, Membership, Workspace, Subscription, CORS, or Token failure.
- Preserved the server-side three-per-ten-minute safety limit, added code-specific API messages and Chinese Notification Center guidance, and added a clean-profile register-then-test regression.
- Added Staging-only Migration `0016_web_push_subscriptions` with Session-scoped subscriptions, durable deliveries, forced RLS, controlled registration/status/worker functions, bounded retries, expiry cleanup, and down migration.
- Added authenticated `GET /v1/push/status` plus `push.register`, `push.unregister`, and rate-limited `push.test` Commands.
- Added a separate least-privilege Web Push worker Role boundary and Node `web-push` dispatcher with minimal logs and no direct table access.
- Added Notification Center device controls and Service Worker `push`, `notificationclick`, and `pushsubscriptionchange` handling.
- Completed Neon Staging apply/down/reapply for `0016`; no Production migration or deployment occurred.
- Added a live Neon Staging synthetic E2E for subscription registration, queue delivery boundaries, rate limiting, Membership revocation, least-privilege API access, and Workspace A/B isolation.
- Activated the isolated Render Staging worker with a distinct least-privilege database credential and protected VAPID settings; `/v1/readiness` remained HTTP 200 and the worker reported enabled.
- Built and published a non-Production `STAGING POSTGRES` Draft containing only the public VAPID key. Windows/iPhone PWA delivery remains pending exact-origin allowlisting and user verification.

## 2026-07-29 — Sprint 25 Notification Center Foundation

- Added additive Migration `0014_notification_center` with recipient-scoped notification storage, unread state, indexes, forced RLS, controlled read/revision/command functions, transactional outbox projection, and a complete down migration.
- Added `GET /v1/notifications`, `notifications.mark-read`, and `notifications.mark-all-read` through the existing authenticated PostgreSQL API and idempotent Command boundary.
- Added an unread badge and notification dialog with unread-first/newest-first ordering, safe DOM rendering, mark-one/read-all behavior, Session cleanup, and mobile touch sizing.
- Integrated the current recipient's notification state into the existing deterministic bootstrap revision, Smart Polling, cross-tab, and Service Worker revision path; no second sync controller or push provider was added.
- Added notification schema, API, role-grant, frontend client, UI, revision, privacy, environment-isolation, and regression tests.
- Historical Sprint 25 state: Migration `0014` had not yet been applied. Sprint 26 later applied it only to Neon Staging; Production remains unchanged.

## 2026-07-29 — Sprint 24 Real-time Sync v2

- Replaced the fixed PostgreSQL Staging polling interval with one adaptive controller: 2 seconds while recently active, 20 seconds while idle, and 60 seconds while backgrounded.
- Added revision-only BroadcastChannel, environment-scoped storage-event, and Service Worker notification paths for multi-tab/PWA convergence without broadcasting bootstrap data, credentials, or personal information.
- Added offline/online recovery while retaining the accepted debounce, cooldown, one-timer, and one-in-flight protections.
- Added `X-Bootstrap-Revision` to bootstrap/revision responses and strict browser validation against the JSON response body.
- Changed revisions now merge only changed top-level bootstrap sections and affected listeners skip unrelated renders; unchanged revisions still avoid the full bootstrap request and all UI updates.
- Added automated coverage for adaptive timers, lifecycle recovery, cross-tab/PWA signals, revision headers, incremental application, offline failure retention, and environment isolation.
- No Production deployment, database/migration operation, Auth0 change, Google Sheets change, Apps Script change, dependency change, or cloud resource change was made. Windows, iPhone, Android, and iPad evidence remains pending.

## 2026-07-28 — Sprint 23 real-time synchronization hardening

- Added authenticated `GET /v1/bootstrap/revision` so the browser can compare a small revision response before downloading the full bootstrap.
- Unified the deterministic revision across role-visible bootstrap and time-off request state, so leave approval/rejection changes are observable by another signed-in device.
- Kept the accepted 15-second polling, 250 ms debounce, 1-second cooldown, single timer, and shared in-flight protection.
- Unchanged revisions now avoid the full bootstrap request, state replacement, render, and Time-Off list refresh. Changed revisions use the existing validated bootstrap path and refresh Time-Off once while preserving unsent forms.
- Shift creation, attendance clock-in/out, attendance-hour approval, employee creation, scheduled leave, and ad-hoc leave remain on their existing command/business paths; no business rule was changed.
- Added contract and fake-timer regression for revision-only reads, time-off-only revision changes, unchanged-request suppression, changed bootstrap refresh, lifecycle deduplication, and Session/environment isolation.
- No Production deploy, database/migration operation, Auth0 change, Google Sheets change, or Apps Script change was made. Sprint 23 real-device synchronization evidence remains pending.

## 2026-07-28 — Sprint 22 foreground polling sync

- Extended the existing PostgreSQL foreground synchronization controller with one 15-second visible/authenticated polling cycle.
- Reused the existing 250 ms debounce, 1-second cooldown, shared in-flight request, server revision comparison, bootstrap render path, and time-off read refresh.
- Polling stops on hidden/offline/logout/Session-clear/unload and resumes on visible/pageshow/focus/online without duplicate timers.
- Unchanged revisions do not rewrite or rerender state; network failures retain the current screen and suppress repeated warning spam.
- Added fake-timer regression for start/stop/resume, duplicate timer prevention, in-flight deduplication, changed/unchanged revisions, offline recovery, unload/logout cleanup, and Google Sheets/Production isolation.
- No Production, database, migration, Auth0, Google Sheets, Apps Script, Render, or Netlify deployment/configuration was changed. Real Windows and iPhone foreground polling acceptance remains pending.

## 2026-07-28 — PostgreSQL foreground synchronization

- Added debounced `visibilitychange`, `pageshow`, and `focus` synchronization for authenticated PostgreSQL views without polling.
- Added in-flight request protection, cooldown deduplication, stale-session result rejection, and safe retry after network failure.
- Bootstrap state is replaced and rendered only when the server-issued revision changes.
- Added deterministic role-visible bootstrap revisions so successful commands that alter visible data are observable without timestamp noise or client-generated revisions.
- Time-off foreground refresh preserves unsent employee forms and avoids rerendering unchanged request data.
- Added regression coverage for event bursts, unchanged/changed revisions, in-flight requests, logout, network failure/retry, form preservation, and Google Sheets isolation.
- Production, Auth0, migrations, databases, Google Sheets, and Apps Script were not modified or deployed.

## 2026-07-27 — Scheduled-leave and ad-hoc-leave backend separation

- Added additive Staging migration `0013_time_off_requests` with Workspace-scoped request/date tables, forced RLS, controlled functions, constraints, indexes, review metadata, private reasons, and a complete down migration.
- Added six commands to the existing PostgreSQL Command API: scheduled-leave submit/cancel, ad-hoc-leave submit/cancel, and manager approve/reject.
- Added a role-scoped read endpoint that exposes own requests, manager review data, approved coworker scheduled-leave names/dates, and only minimal approved ad-hoc coverage.
- Kept legacy `leave_selections` unchanged; it is updated only when a new scheduled-leave request is explicitly approved. No historical row was guessed or converted.
- Applied, rolled back, and reapplied `0013` only on Neon Staging with checksum `f6f059b83f5a0ce0cbd172bbff479d8b9b9bb74cd4b0a2a1adc373d52fb4fcd2`.
- Added static migration/grant/command tests and live Staging E2E for permissions, privacy, idempotency, duplicate review rejection, Workspace isolation, and direct-table denial.
- Corrected the release gate's generated-asset allowlist so the intentional cache-revision rewrites in `index.html` and `service-worker.js` are validated by environment/PWA checks instead of being falsely reported as source drift.
- Frontend employee/manager request UI is intentionally deferred to the next single Sprint. Production was not modified or deployed.

## 2026-07-27 — Authoritative current-user UI

- Added a responsive authenticated-user label that displays the formal `bootstrap.currentUser.displayName` and normalized manager/employee role while retaining the separate `STAGING POSTGRES` environment badge.
- Kept `bootstrap.currentUser` as the sole UI identity source; the browser does not infer the displayed user from role selectors, employee lists, Auth0 profile fields, email addresses or test-account strings.
- Added safe `尚未設定姓名` handling for a null formal name and fail-closed hiding for an unknown role.
- Added regression coverage for manager, employee, null-name, unknown-role and mobile overflow behavior. APIs, PostgreSQL schema, migrations, Auth0, Production and business rules were not modified.

## 2026-07-27 — Authoritative current-user bootstrap

- Added nullable, Workspace-scoped `workspace_members.display_name` as the formal manager-name source; employee names remain authoritative in `employees.name`.
- Extended the existing least-privilege PostgreSQL bootstrap with a backward-compatible `currentUser` object containing `displayName`, normalized role, employee ID and Workspace ID.
- Applied only controlled migration `0012_current_user_bootstrap` to Neon Staging, completed a transactional down/up rollback rehearsal and reran boss/employee/cross-Workspace/API-role validation.
- Production, frontend UI, Auth0, Google Sheets, Apps Script, employee records and business rules were not modified.

## 2026-07-27 — Employee leave save controls returned to the calendar

- Kept the existing explicit `leaves.replace-month` save model while moving the employee save controls from “我的出勤／收入” back beneath the leave calendar.
- Added authoritative bootstrap-to-draft comparison, changed-day counts, cancel-to-server-state behavior, duplicate-submit protection, safe failure retention and success feedback.
- Added unsaved-change protection before switching to the work/income tab or leaving the page, plus a mobile two-button layout with 44px touch targets.
- Added regression coverage for hidden clean state, multiple edits, cancel, persistence, failed saves, rapid clicks, navigation protection, boss isolation and iPhone-width layout. Production, migrations, Auth0, Workspace, Membership, PostgreSQL schema and Google Sheets Staging were not modified.

## 2026-07-27 — Social in-app browser login guidance

- Added a Staging-only compatibility notice before Auth0 initialization for LINE, Facebook, Messenger and Instagram in-app browsers.
- Added a safe copy-URL action that copies only the clean Draft root URL and never copies Auth0 callback parameters, tokens or session data.
- Kept Safari, Chrome and installed PWA flows unchanged, and deliberately avoided unreliable attempts to force-open Safari or another external browser.
- Added mobile browser regression coverage for the supported in-app browser signatures, normal Safari/Chrome and standalone PWA behavior. Production, Auth0, APIs, databases and migrations were not modified.

## 2026-07-27 — Staging PostgreSQL shift creation stability

- Removed the full-page reload after a successful `shifts.create`; the existing PostgreSQL bootstrap refresh now supplies the authoritative snapshot and rerenders the schedule in place.
- Restricted automatic session invalidation to `SESSION_INVALID` and `TOKEN_SESSION_INVALID`, and standardized the browser event as `shift-session-invalid`.
- Added Staging-only command diagnostics containing only request ID, HTTP status, error code and command name.
- Added regression coverage for immediate and persisted shift rendering, rapid duplicate submission, ordinary command errors that retain login state, and the two explicit session-invalid codes.
- Updated the schedule copy to state that shift update and deletion are not yet available. Production, migrations, Auth0, Membership, Workspace data and Google Sheets Staging were not modified.

## 2026-07-26 — Staging PostgreSQL boss leave cancellation persistence

- Fixed the boss leave-calendar path so PostgreSQL cancellations use the existing `leaves.replace-month` Command API with the selected employee, month and authoritative date set.
- Removed the false-success UI behavior: PostgreSQL state now changes only after a successful command and refreshed server bootstrap; failed commands keep the prior state and show a bounded error code.
- Added HTTP boundary, browser-adapter and rollback-only live Neon Staging coverage proving a boss can set and cancel an employee leave day and the employee bootstrap immediately reflects the cancellation.
- Production, migrations, Auth0, Google Sheets and the existing Google Sheets Staging Draft were not modified.

## 2026-07-22 — Reversible Staging browser PostgreSQL cutover accepted

- Deployed the isolated `STAGING POSTGRES` bundle to the fixed Netlify Draft origin, without a Production deploy, and completed real Auth0 boss and employee browser flows against Render Staging and Neon Staging.
- Connected existing UI actions to the reviewed PostgreSQL commands for leave replacement, clock in/out, employee creation, shift creation and attendance-hour approval; every mutation refreshes the authoritative bootstrap snapshot.
- Fixed attendance approval to use the selected attendance row revision rather than the snapshot revision, and advanced the isolated PostgreSQL service-worker cache to `banke-staging-postgres-v4` so the corrected Draft assets activate predictably.
- Verified employee-scoped UI, boss visibility, persisted leave/attendance/hour updates, live snapshot reconciliation and a Workspace B identity being rejected by the fixed Workspace A Draft.
- Added bounded unavailable/timeout client regression coverage and reconfirmed Session/Membership/role isolation with the live Staging bootstrap test.
- Rolled the fixed Draft origin back to the unchanged Google Sheets Staging build and verified the visible environment returned from `STAGING POSTGRES` to `STAGING` with no browser JavaScript error. Production was not modified or deployed.

## 2026-07-22 — Neon Staging UI bootstrap acceptance

- Added an exact-version Staging migration controller that applies or rolls back only `0011_ui_bootstrap`, verifies its checksum/ledger/function state, requires the approved synchronized Key ID, and deliberately leaves 0009/0010 pending.
- Applied 0011 to Neon Staging, reconverged the five-function minimum API allowlist and passed live boss/employee bootstrap plus Session/Membership/role/cross-Workspace isolation E2E using the runtime API role.
- Completed rollback, absence verification, reapply and post-rollback E2E; Render Staging readiness remained HTTP 200 and the synchronized key was not regenerated or changed.
- Updated the Staging hosting status and release/backlog/health evidence. Production, Google Sheets, Apps Script, Auth0 and frontend traffic were not modified or deployed.

## 2026-07-22 — Isolated Staging Node API hosting preparation

- Added a Render Blueprint for the existing Node API with a fixed Staging environment, Singapore Free instance, disabled automatic deploys, readiness health checks and graceful shutdown.
- Kept PostgreSQL, Auth0, tenant-context and CORS values in Render's protected environment-variable flow; no credential or endpoint secret is committed.
- Added deployment-boundary tests and a Staging hosting runbook. The Blueprint contains no migration/import command, does not apply `0011_ui_bootstrap`, and does not switch any frontend or Production traffic.

## 2026-07-22 — Isolated PostgreSQL Staging UI bootstrap

- Added a least-privilege PostgreSQL bootstrap migration, authenticated Node read endpoint and browser adapter that hydrates the existing boss/employee UI from live Session/Membership-scoped data.
- Added a separately named and namespaced `STAGING POSTGRES` build so its PWA manifest, cache, storage and session cannot collide with normal Staging or Production.
- Added fail-closed Auth0 claim handoff, PostgreSQL logout cleanup, reload isolation from Google Sheets session recovery and an explicit API bind-host allowlist.
- Added focused API/client/migration/role/environment and reversible cutover rehearsal tests.
- No public endpoint, database migration, business data, Production deployment, Google Sheets, Apps Script, Auth0 configuration or existing Netlify Draft Preview was changed. Commercial readiness is assessed at 81%; live Staging deployment and E2E remain pending.

## 2026-07-20 — PostgreSQL frontend integration boundary

- Added a strict browser-side PostgreSQL API client for health/readiness, authenticated session lifecycle, employee reads, and the six existing command routes.
- Added HTTPS/loopback URL validation, request/response byte limits, timeout handling, idempotency validation, no-store/omit-credentials transport defaults, and safe invalid-session signaling.
- Added environment gates that keep Local on `local_preview` and Staging/Production on `google_sheets`; every `postgresApiUrl` remains empty, so no PostgreSQL cutover or network traffic is activated.
- Added focused transport and environment-isolation regression coverage and included the client in reproducible build/service-worker asset lists.
- No database schema/data, Production deployment, Auth0, Apps Script, Google Sheets, or existing Netlify Draft Preview was changed. Commercial readiness is assessed at 80%; live Staging API/cutover evidence remains outstanding.

## 2026-07-20 — Project cleanup and technical-debt review

- Audited tracked source, build/runtime references, package dependencies, migration history and documentation links; no safe dead-source or unused-dependency deletion was identified.
- Added the self-contained Auth0 Staging initiation test to the complete test chain and added syntax coverage for it and the manual Staging acceptance tool.
- Documented the current implementation architecture without changing any accepted ADR, cloud resource, database, Auth0 setting or Production environment.
- Recorded intentional migration rollback duplication, cross-layer helper duplication, the historical duplicate ADR `0011` number and the long serial test command as follow-up technical debt.
- Commercial readiness remains 79%; no deployment or new product capability is counted.

## 2026-07-20 — Reproducible Lambda artifact packaging

- Added deterministic Lambda ZIP packaging from the frozen pnpm lockfile with cache-first, production-only, script-disabled and symlink-free dependency installation.
- Added explicit packaged runtime dependencies for PostgreSQL and AWS Secrets Manager rather than relying on mutable runtime-provided SDK versions.
- Added SHA256 output, embedded/external CycloneDX 1.5 SBOM and a deterministic artifact manifest with source hashes and exact direct dependency versions.
- Added isolated packaged-handler invocation and two-build byte-for-byte reproducibility tests, plus rejection of `.env`, private-key/certificate and pnpm metadata files.
- No AWS/Auth0/Netlify resource was created, no service was deployed and Production was not modified.

## 2026-07-20 — AWS Staging infrastructure preparation

- Hardened the Staging CloudFormation template with default-disabled event ingress/consumer, deterministic queue naming and immutable Lambda S3 object versions.
- Split EventBridge delivery failures from Lambda processing failures into separate encrypted DLQs and corrected SQS visibility timeout for the configured Lambda timeout plus batching window.
- Added TLS-only queue policies, exact EventBridge source-account/rule constraints, optional exact KMS decrypt conditions and JSON Lambda logging.
- Added CloudWatch alarms for Lambda errors, throttles and duration, queue age, both DLQs and EventBridge DLQ-delivery failure.
- Expanded local validation for CloudFormation references/resource allowlists, IAM wildcard/admin exclusions, monitoring, retry and environment boundaries; documented the safe activation/runbook gates.
- Fixed the Lambda queue-ARN contract and AWS partition validation. No cloud resource, database migration or Production system was created, modified or deployed.

## 2026-07-19 — Auth0 Staging security-event pipeline implementation

- Added a Staging-only Node.js consumer for Auth0 security events delivered through an AWS partner EventBridge source and encrypted SQS.
- Added strict source/envelope/time/correlation validation, minimal safe logs and fail-closed partial-batch retry behavior.
- Added PostgreSQL migration `0009` for a transactionally idempotent security-event inbox and controlled Session compromise/revocation function.
- Added a least-privilege Staging event-role grant gate, EventBridge/SQS/Lambda CloudFormation template, retry/DLQ controls and synthetic security tests.
- Added pipeline, threat-model, database, API and release-gate documentation. No AWS/Auth0/Netlify resource was created; no Staging/Production migration or deployment occurred.

## 2026-07-19 — Production API role final acceptance

- Accepted Neon/PostgreSQL's platform maintenance-database behavior: `PUBLIC CONNECT` on `postgres` is not a P0 blocker when it creates no new path to `neondb` business data.
- Removed application provisioning logic that attempted to change platform-owned maintenance-database ACLs.
- Required the Production runtime URL to name `neondb` explicitly and added a fail-closed startup check against `current_database()` before the API listens.
- Expanded Production privilege verification to cover role attributes and membership, zero table/sequence access, the exact controlled-function allowlist, forbidden DDL, foreign-server/user-mapping creation, `dblink`/`postgres_fdw`, and the isolated `postgres` maintenance database.
- Recorded inherited `PUBLIC TEMPORARY` as a monitored low-risk platform limitation. No business data, Production API, frontend, Auth0, AWS, Netlify, Google Sheets, or Apps Script deployment was changed.

## 2026-07-19 — Production least-privilege API database role

- Added an independent Production role-grant confirmation gate so API credential provisioning never enables schema migrations.
- Created the dedicated `banke_api_production` role with `NOINHERIT`, no administrative/RLS-bypass attributes, no object ownership, no direct table/sequence privileges, and EXECUTE access to exactly four controlled `app_private` functions.
- Added repeatable privilege-boundary verification for direct business/app-private reads, schema/role creation, RLS changes, forged Workspace context, function allowlisting, role separation, and zero-data preservation.
- Stored the generated runtime credential only in the Git-ignored local `.env.production`; no secret, business data, frontend, API, or Production deployment was committed.

## 2026-07-19 — Production PostgreSQL target isolation guard

- Added an explicit `BANK_PRODUCTION_DATABASE_HOST` allowlist requirement for Production migration and runtime API configuration.
- Production direct migrator and pooled runtime URLs must target the same normalized Neon host and database before a connection can be opened.
- Added regression coverage for missing/mismatched Production hosts, cross-database runtime configuration, and the valid isolated Production shape.
- No Neon connection was opened, no migration was executed, and no Production data or frontend route was modified.

## 2026-07-19 — Auth0 Staging token lifecycle acceptance

- Added a Staging-only, memory-only Auth0 Authorization Code + PKCE S256 acceptance harness that never prints or stores token, authorization-code or session values.
- Passed real Auth0 Staging access-token validation, session-claim binding, refresh rotation, old refresh-token reuse rejection, token-family revocation and allowlisted provider logout.
- Extended live Staging PostgreSQL coverage to prove that a refreshed access token cannot bypass a suspended user or inactive Workspace A membership, while an independently active Workspace B membership remains usable.
- Production, Google Sheets, Apps Script and the database schema were not modified or deployed.
- Kept Production blocked until a public isolated Staging event path automatically maps Auth0 refresh-reuse/account-disable events to local PostgreSQL session revocation.

## 2026-07-18 — Sprint 3 OIDC and unforgeable tenant context foundation

- Added a read-only OIDC discovery/JWKS readiness check for the next Local/Auth0 connection step. It verifies exact issuer/JWKS metadata, Authorization Code, PKCE S256 and usable RS256 keys without requiring or printing any secret or token.
- Selected Auth0 as the single managed OIDC/OAuth 2.0 provider; added strict RS256 issuer/audience/time validation, same-origin JWKS caching, key rotation, unknown-key fail-closed behavior, timeout and RSA-key bounds.
- Rejected token `workspace_id`; the requested workspace is now re-authorized against live PostgreSQL user, workspace, membership, role and session state for every controlled call.
- Added migrations 0004–0008 for OIDC principal mapping, revocable local sessions, tenant-context keys/nonces and controlled SECURITY DEFINER query/command functions.
- Removed all runtime table/sequence privileges. The API role may execute only four exact controlled functions and cannot invoke tenant verification directly.
- Added 30-second HMAC-signed, single-use internal tenant assertions. Direct table access and forged custom GUC remain denied even with the runtime database credential.
- Live Staging tests cover two tenants, all six commands, assertion replay, member/user suspension, simulated refresh-family compromise, logout and least-privilege grants.
- Fixed Session `iat` second/millisecond precision and leave audit resource-ID operator precedence defects found on the real engine.
- Added a Staging-only Auth0 SPA entry point using Authorization Code + PKCE S256, exact Staging audience, memory-only token cache and isolated frontend configuration; Production, Google Sheets and Apps Script were not changed or deployed.
- Completed a real Auth0 Staging login acceptance: the namespaced access-token session claim was present, non-empty and matched the Auth0 ID-token `sid` without logging either value. Refresh rotation/reuse, logout and account-disable E2E remain pending.

## 2026-07-18 — Sprint 2 Managed Staging PostgreSQL validation

- Applied migrations 0001–0003 to an isolated Neon PostgreSQL 18.4 Staging database and verified checksums, per-migration transactions, advisory locking, and repeat execution protection.
- Imported a non-sensitive Google Sheets snapshot through dry-run, apply, and replay flows; reconciled employees, shifts, attendance, leave, payroll, and import metadata.
- Provisioned a separate pooled `NOINHERIT` API role with DML access only to the ten runtime tables; schema migration history and DDL remain inaccessible.
- Passed positive and negative FORCE RLS tests across two synthetic workspaces, including no-context direct SQL, A-context-to-B cross-tenant mutation, and composite foreign-key attempts.
- Passed all six implemented Command API flows and repeated the live test twice to prove idempotent execution.
- Added a staging-only, host-pinned PostgreSQL 18 `pg_dump`/`pg_restore` rehearsal. Restore reconciliation, 11 forced-RLS tables, and tenant-isolated API reads passed in `banke_restore_sprint2`.
- Query plans used the existing employee phone and workspace/date indexes; no speculative index was added.
- Fixed a repeatability defect in the live leave-selection test. Production, Google Sheets, Apps Script, and the frontend route were not changed or deployed.
- Confirmed a Production-blocking trust-boundary limitation: possession of the shared API database credential can forge the custom tenant GUC. Formal identity plus a signed/externally verified database context or trusted connection proxy is required before cutover.

## 2026-07-18 — Sprint 1 PostgreSQL multi-tenant foundation

- Added three transactional PostgreSQL migrations for tenant identity mapping, employees, shifts, leave selections, attendance, payroll adjustments, idempotency receipts, audit logs, outbox events, and snapshot-import ledger.
- Added FORCE RLS workspace isolation, composite tenant foreign keys, constraints, indexes, optimistic revisions, soft-delete metadata, and migration checksum/advisory-lock safety gates.
- Added a separate Node Command API with strict allowlists, RS256 JWT verification, active membership checks, per-request tenant transactions, exact CORS allowlisting, 1 MiB request limits, idempotent commands, audit, and outbox writes.
- Added a dry-run-first Apps Script/Google Sheets snapshot importer. Legacy credentials are never imported; memberships require formal identity reenrollment.
- Existing Google Sheets Production path was not changed or deployed. Live PostgreSQL execution remains a Staging acceptance gate because no PostgreSQL server is configured in this workspace.

## 2026-07-17 — Staging frontend isolation

- Added explicit Local, Staging, and Production frontend build profiles.
- Added a STAGING badge and Staging-only Apps Script endpoint.
- Isolated Service Worker caches, PWA identity, localStorage, and sessionStorage by environment.
- Added repeatable builds, isolation regression coverage, and a manual cross-device E2E checklist.
- Production was not deployed or modified during this Sprint.

## 2026-07-17 — Sprint 2: Database Schema and API Specification Design

### Added

- **正式資料庫 Schema (docs/schema.sql)**：完成 PostgreSQL 關聯式模型設計，包含多租戶隔離、Argon2id 身分驗證、業務資料正規化與稽核日誌。
- **正式 API 規格 (docs/openapi.yaml)**：完成基於 OpenAPI 3.0 的命令式 API 設計，涵蓋 JWT Auth 流程與核心業務命令。
- **身分驗證序列定義**：在 `docs/API.md` 中明確定義 Login、Refresh、Logout 的後端互動邏輯。

### Changed

- 更新 `docs/DATABASE.md` 與 `docs/API.md`，將其目標模型指向正式的 SQL 與 YAML 文件。

### Verified

- Schema 設計符合 ADR 0012 的多租戶與正規化原則。
- API 規格符合 Command API 原則，並解決了全量 snapshot 覆寫的風險。
- 整體商業上線完成度由 60% 提升至 62%。

## 2026-07-16 — Sprint 2: Formal Auth and Backend Migration Architecture Design

### Added

- **正式後端遷移設計 (ADR 0012)**：定義從 Google Sheets 遷移至正式關聯式資料庫 (PostgreSQL) 與身份驗證系統 (JWT + Refresh Token) 的架構規格。
- **身分驗證流程定義**：包含短效 Access Token、長效 Refresh Token、Argon2id 雜湊、登出撤銷、停權禁止與跨裝置登入規則。
- **角色與權限模型 (RBAC)**：明確定義老闆 (Full Access)、管理者 (Scoped) 與員工 (Personal + Team) 的資料讀寫邊界。
- **多租戶隔離原則**：規定所有業務資料表必須包含 `workspace_id`，並透過資料庫 RLS 或 API Repository 層級強制隔離。
- **遷移計畫**：定義從 A1 Snapshot 清洗、正規化到批次匯入新資料庫的五步驟流程。

### Verified

- 設計文件與既有 P0 止血 ADR (0001–0011) 保持一致，並符合 Project Constitution 工程原則。
- 整體商業上線完成度由 58% 提升至 60%。

## 2026-07-16 — Payroll accuracy and logout functionality

### Fixed

- **薪資計算口徑統一 (Bug 17)**：老闆端的「薪資試算」與「匯出 CSV」現在統一改用實際「出勤紀錄」作為核定依據，而非排班計畫，徹底解決老闆與員工看到數字不一致的問題。
- **打卡四捨五入修正 (Bug 21)**：移除打卡下班時強制的 0.5 小時最小值，避免誤觸打卡（少於 15 分鐘）產生錯誤工時。
- **新增登出按鈕 (Bug 24)**：在頂部控制列新增「登出」按鈕，並在點擊後完整清除本機敏感資料、session 與 Cloud 快取。

### Changed

- 老闆總覽 (Stats) 現在同時顯示「排班時數／工時」與「實際時數／支出」，方便管理計畫與預算的差異。
- 薪資匯出檔名由「薪資試算」改為「薪資實付」，反映資料來源的變更。

### Verified

- 通過 13 組 P0/state/cleanup 回歸測試。
- 本機 smoke test：老闆可看到計畫與實際對比，員工可正常登出且清除資料。
- 整體商業上線完成度提升至 58%。

## 2026-07-16 — UTC fix and Role UI improvements

### Fixed

- 修正 `app.js`、`access.js` 與 `employee-work.js` 的月份與日期計算，改用 `Intl.DateTimeFormat` 搭配 `Asia/Taipei` 時區，徹底解決 UTC 邊界造成每月 1 日顯示錯誤月份的 P0/P1 Bug。
- 修正 `employee-layout.css`，在員工模式下隱藏「出勤／請假」、「員工」與「薪資試算」等老闆專用頁籤，確保員工介面簡潔且符合權限最小化原則。
- 修正 `access.css` 中的 Bug 19，確保「儲存休假」面板在 `hidden` 屬性存在時能正確隱藏，避免在老闆模式下錯誤顯示。

### Verified

- 通過 13 組 P0/state/cleanup/schema 回歸測試。
- 完成老闆與員工模式下的介面驗收，確認頁籤隱藏邏輯正確。
- 整體商業上線完成度由 54% 提升至 56%。

## 2026-07-16 — P0 schema versioning and migration

### Fixed

- 建立正式 schema 版本化與遷移系統；Apps Script 與前端 state store 具備 `sync.schemaVersion` 及其遷移功能。
- `google-sheets-backend.gs` 的 `readData_` 與 `readDataStrict_` 現在會先通過 `migrate_` 正規化舊資料至最新版本，再進行形狀與值驗證。
- `state-store.js` 的 `normalize` 整合遷移邏輯，確保本機與雲端資料版本同步。
- 修正 `enhancements.js` 備份下載檔名使用 UTC 時間造成台灣每月 1 日凌晨日期錯誤的 Bug。

### Verified

- 新增 v0 資料自動遷移至 v1、非法版本拒絕、`ensureSync_` 與 `bumpRevision_` 保留版本號，以及前端 state 遷移回歸測試。
- 全部 14 組回歸測試通過。整體商業上線完成度由 53% 調整為 54%。

## 2026-07-17 — P0 controlled Staging acceptance

### Fixed

- 修正 Apps Script 在全域 lock 內為每次登入執行 4096 次 HMAC，導致請求逾時並阻塞其他操作的 P0 問題。
- 新建 credential 改為版本化 `hmac-sha256-v2`：每筆獨立 salt、server-only pepper、domain separation 與固定成本；既有 `iterated-hmac-sha256-v1` 在成功登入後自動遷移。
- malformed scheme／iterations 維持 fail closed；未知帳號仍執行相同 v2 verifier 路徑。

### Staging verification

- 建立與正式資料隔離的 Staging Google Sheet、Apps Script 專案及 Web App 部署；正式站未發布。
- 線上驗收通過老闆／員工登入、員工管理、排班、排假、打卡、revision conflict、老闆同步與 session 撤銷。
- 私人備份、checksum 驗證、readiness、實際 restore、restore 後 readiness 皆通過；Staging 已回復乾淨 revision 0。
- 品質檢查、13 組既有 P0/state/cleanup 回歸與 25 個發布資產 build 通過；origin/main 另新增的 migration 測試由完整發布閘門一併驗證。

## 2026-07-16 — P0 request size and snapshot value schema

### Fixed

- Apps Script `doPost` 在 JSON parse 與 API 前以 UTF-8 bytes 限制 1 MiB raw request body；超限回 `REQUEST_PAYLOAD_TOO_LARGE` 並保留前端 `requestId`。
- A1 snapshot 現共用電話、credential 表示、員工時薪、薪資調整、日期與時間值驗證；老闆儲存錯誤回 `REQUEST_DATA_INVALID`，最後寫入防線錯誤回 `DATA_WRITE_INVALID`。
- 前端登入不再將 PIN 的非數字字元自動刪除後接受；電話、6 位純數字 PIN 與既有 8 碼大寫英數啟用碼在雲端登入前已檢查。
- 舊資料缺欄、空薪資調整與原樣舊負數扣款維持相容；新建或複製負數調整被拒絕。
- Service Worker cache 升至 v44，確保已安裝 PWA 在未來受控發布後取得新登入驗證邏輯。

### Verified

- 新增 request 小於／等於／超過 1 MiB、多位元 UTF-8、電話／PIN／啟用碼、金額、日期／時間、舊資料、空薪資調整、負數舊資料及失敗不寫入測試。
- 13 組 P0/state/cleanup 回歸、品質檢查與 25 檔 build 全部通過。本次未新增 A1 欄位，也未部署正式版本；整體商業上線完成度由 52% 調整為 53%。

## 2026-07-16 — P0 boss save request boundary

### Fixed

- 老闆 `save` 新增 top-level 欄位白名單與 collection／map 基本形狀驗證；未知欄位、錯誤形狀、array root 與空操作回 `REQUEST_DATA_INVALID`。
- 合併改以伺服器既有 snapshot 為底，只覆寫 request 明確傳送的可變欄位，避免漏傳 `employees`、`shifts`、`leaves` 等欄位時靜默清空資料。
- `workspace`、`sync`、`access` 維持 server-managed；明確合法空集合仍保留原本刪除語意。

### Verified

- 擴充既有 P0 concurrency 測試，涵蓋未知欄位、錯誤集合、舊 payroll array、array root、空操作、server 欄位竄改、部分儲存保留與明確清空。
- 本次未新增 API action、畫面或資料 schema，且未部署正式版本；整體商業上線完成度維持 52%。

## 2026-07-16 — P0 cloud snapshot shape guard

### Fixed

- Google Sheet 主資料除了 JSON root 以外，現在也會驗證陣列、object map、巢狀記錄與 `sync.revision` 的基本形狀。
- 任一已知欄位形狀錯誤時回 `DATA_SOURCE_INVALID`，停止登入、同步、清理與寫回，保留 A1 原始內容供人工救援。
- 營運備份使用相同的欄位形狀規則，無法安全解讀時回 `BACKUP_SOURCE_INVALID`；缺少欄位的舊資料仍可讀取，空的舊版 `payrollAdjustments` 仍可無損轉換。

### Verified

- 既有營運復原測試新增 11 種欄位損壞、備份拒絕、舊資料相容與 A1 不變的回歸案例。
- 本次未變更畫面、API action、正式資料 schema 或線上部署。
- 重新依功能、測試、權限、資料庫、跨裝置與部署準備度評估：功能實作估值仍約 67%，整體商業上線完成度由 67% 修正為 52%。

## 2026-07-16 — P0 cloud data corruption guard

### Fixed

- 一般 APP API 讀取 Google Sheet 主資料時，無效 JSON、`null`、array 或其他非 object root 不再被當成空白公司資料。
- 主資料損壞時改以 `DATA_SOURCE_INVALID` fail closed，保留原始 A1 內容並停止登入、同步與寫入，避免下一次操作覆蓋可供人工救援的資料。

### Verified

- 沿用既有營運復原測試，新增一般 API 損壞 JSON、錯誤根節點、錯誤碼與原始內容不變的回歸案例。
- 本次未變更前端、API action、資料 schema 或正式部署；產品完成率維持 67%。

## 2026-07-16 — P0 legacy payroll backup compatibility

### Fixed

- 營運備份可把舊資料中缺少、`null` 或空陣列形式的 `payrollAdjustments` 無損正規化為目前的 object map，再建立與驗證復原包。
- 非空陣列或其他無法證明可無損轉換的格式仍回傳 `BACKUP_SOURCE_INVALID`，不覆蓋最後成功備份指標，也不暗中改寫主要工作表。

### Verified

- 新增舊格式成功備份、readiness 一致讀取、未知資料拒絕與最後成功備份指標保護測試。
- 本次只修改 Apps Script 營運備份讀取邊界；APP 畫面、一般 API 與資料庫 schema 未變，且未發布正式版本。

## 2026-07-16 — Project cleanup acceptance

### Fixed

- 修正 720px 以下老闆與員工月曆被員工姓名撐開、造成手機橫向捲動的問題。
- Service Worker cache 升至 v43，確保已安裝裝置取得手機版修正。

### Verified

- 新增月曆縮欄防回歸檢查；品質檢查、12 組回歸、build 與 release gate 全數通過。
- 桌機及 390×844 老闆／員工角色實測通過；員工管理權限未洩漏，瀏覽器無 console warning/error。
- 本次未變更 API、Database schema 或產品功能；完整證據見 [Project Cleanup Acceptance](docs/reviews/PROJECT_CLEANUP_ACCEPTANCE.md)。

## 2026-07-16 — Project cleanup closure and stable baseline

### 整理

- 以 `management-actions.js` 統一員工、班次與出勤的事件綁定與老闆雲端提交流程，移除重複的 `fallback-actions.js`。
- 移除未啟用的 Firebase／Supabase 草稿與規則檔，避免部署、維護與安全稽核誤判。
- Google Sheets Web App URL 只由 `google-sheets-config.js` 管理；缺少設定時明確停止連線。
- Service Worker 只讓頁面導覽回退至 app shell，JS／CSS 失敗不再收到 HTML。
- 匯入備份與薪資調整改用同一老闆儲存入口，在重新載入前等待雲端確認並保留必要回滾／衝突資料。
- 專案忽略本機 pnpm cache 與整理前 ZIP，不將機器產物納入版本基準。

### 驗證

- 品質檢查通過：16 個前端腳本、1 個 Apps Script、25 個發布資產。
- 12 組 P0/state/cleanup 回歸全部通過；`dist/` 25 個檔案與來源白名單逐檔一致。
- 老闆預覽的新增班次／新增員工可取消；員工預覽可連續選取 4 天休假並切換出勤分頁；瀏覽器無 console warning/error。
- 本次沒有變更 API request/response 或資料 schema；線上發布仍須執行 Apps Script 備份與 readiness gate。

## 2026-07-15 — P0 Backup, restore and release gate

### 營運修正

- 新增管理員專用 `createOperationalBackup()`、`verifyLatestOperationalBackup()`、`restoreLatestOperationalBackup()` 與 `runReleaseReadinessCheck()`；未接入 Web App API。
- 私人 Google Drive 復原包同時保存 snapshot 與必要 Script Properties，並具格式版本、checksum、workspace、revision、來源與時間驗證。
- 復原需一次性確認值；非空目標先建立 safety backup，跨 workspace 拒絕，成功後撤銷所有舊 session，失敗自動回滾。
- 自我審查修正空白新資料表無法災難復原，以及非私人 Drive 項目驗證失敗後殘留的問題。
- 自我安全審查移除 Apps Script execution log 中的一次性復原確認值，改採固定欄位白名單摘要。
- 回滾寫入本身失敗時改回傳 `RESTORE_ROLLBACK_FAILED` 與 safety backup 檔案 ID，避免維運人員誤判為已安全回復。
- 新增本機 `pnpm release:check`，逐檔驗證 25 個發布資產且禁止後端復原識別字進入前端。

### 驗證與文件

- 新增正常、篡改、公開分享、錯誤確認、過期／錯來源、跨 workspace、pepper 損壞、空白目標、日誌脫敏、自動 rollback 與 rollback failure 邊界測試；總計 11 組 P0/state 測試。
- 新增 ADR 0010、Architecture Review、營運 Runbook 與 Release Checklist，並同步 README、API、Database、Health Report 與 Backlog。

## 2026-07-15 — P0 PIN credential hardening

### 安全修正

- Google Sheets 當時不再為新帳號保存快速、無 salt 的 PIN／啟用碼 SHA-256，改為每筆獨立 salt、4096 次 HMAC-SHA256 與 Apps Script server-only pepper；此歷史 v1 方案已由 2026-07-17 的 v2 runtime 修正取代。
- 舊 `bossPinHash`、`pinHash`、`activationCodeHash` 在正確登入／啟用時自動升級，不要求使用者重設 PIN。
- 相同 PIN 會產生不同 salt/hash；未知電話與錯誤電話執行 dummy KDF，credential 比對採固定流程。
- malformed prehash、credential 或 pepper 一律 fail closed；review 發現的 pepper 靜默輪替風險已修正為 `CREDENTIAL_CONFIG_INVALID`。
- 老闆／員工 projection 與移除員工封存資料會移除新舊所有 credential 欄位。

### 驗證與文件

- 新增 credential migration、salt 唯一性、pepper 隔離、錯誤 PIN、首次啟用、篡改與設定損壞回歸測試。
- 全部十組 P0/state 測試、語法／資產檢查與 production build 通過。
- 新增 [ADR 0009](docs/adr/0009-salted-pin-credentials.md) 與 [Architecture Review](docs/reviews/P0_CREDENTIAL_HARDENING_REVIEW.md)，同步更新 README、API、Database、Health Report 與 Product Backlog。

## 2026-07-15 — P0 Snapshot optimistic concurrency

### Data integrity

- 新增 server-managed `sync.revision`；舊資料安全遷移為 revision 0。
- 老闆全量儲存必須提交 `baseRevision`，過期、缺少或重播均拒絕。
- 員工排假、打卡、首次啟用及成功老闆儲存會推進全域 revision。
- 衝突時不覆蓋任何伺服器資料，並回傳最新安全 projection。

### Fixed

- 前端衝突後停止自動重試，保留 attempted/remote 衝突備份並提示匯出。
- 新增員工與重設 PIN 遇到衝突時不再回滾抹掉待備份修改。
- 登出會清除完整衝突備份；後續成功儲存會清除過期備份。
- Service Worker cache 升至 v40。

### Verified

- 新增舊資料遷移、stale save、replay、missing revision、員工 action、credential 保存及前端衝突保全測試。

## 2026-07-15 — P0 Stored XSS containment

### Security

- 姓名、職稱、電話、班次備註、出勤類型與備註改以 DOM 純文字節點渲染。
- 移除 authenticated scripts 的 HTML parsing sinks 與動態行內事件處理器。
- 新增惡意 `img`／`svg`／`script` payload 與 source sink 防回歸測試。

### Changed

- 新增共用 `dom-safety.js`，並保證先於管理功能載入。
- Service Worker cache 升至 v39，發布白名單加入安全 DOM 模組。

### Verified

- 8 組 P0/state test suites、語法／資產檢查與 production build 全部通過；25 個資產輸出至 `dist/`。

## 2026-07-15 — P0 明確單一工作區邊界

### Security

- Apps Script 伺服器產生不可變 `workspaceId`，並同時保存在 Script Properties 與資料快照。
- 每個工作階段綁定工作區；資料、session 或回應的工作區不一致時 fail closed。
- 老闆全量儲存無法修改或刪除工作區 ID；瀏覽器只核對伺服器回傳值。
- 舊資料會在第一次成功登入時補上工作區 ID；舊版未綁工作區的 session 失效。

### Fixed

- 補上工作區欄位的 state 正規化與員工資料投影。
- 修正既有員工授權測試重設資料時誤刪新 schema 欄位的回歸問題。
- Service Worker cache 升至 v38。

### Verified

- 新增舊資料升級、client workspace 注入、session workspace 竄改、snapshot mismatch 與員工投影測試。
- `pnpm verify` 全部通過，24 個資產輸出至 `dist/`。
- 老闆／員工本機預覽正常，無 console warning/error。

## 2026-07-15 — P0 短效工作階段與登入限流

### Security

- 新增 8 小時伺服器工作階段；Apps Script 只保存 token hash。
- 同一電話 15 分鐘內第 5 次登入失敗後鎖定 15 分鐘。
- PIN hash 僅用於登入，不再保存於 `sessionStorage` 或重送至一般 API。
- 過期、登出與員工移除會撤銷工作階段。
- 老闆／員工回應移除 `bossPinHash`、`pinHash`、`activationCodeHash`，只提供登入狀態。

### Fixed

- 恢復登入前會先向伺服器驗證，不再信任本機 session flag。
- 遠端 pull 不再觸發自動 save。
- 工作階段失效會清除本機敏感快取並返回登入頁。
- 弱網登出最多等待 3 秒。

### Verified

- 新增暴力嘗試、到期、偽造、重播、撤銷、角色越權及員工移除測試。
- `pnpm verify` 通過，24 個資產輸出至 `dist/`。

本專案採日期＋Sprint 記錄；正式版本策略將在 release pipeline 建立後改為 Semantic Versioning。

## 2026-07-15 — P0 首次帳號認領止血

### Security

- 空白 Google Sheets 雲端只允許 Script Property `SHIFT_APP_OWNER_PHONE` 指定的電話建立第一組老闆 PIN。
- 未設定 PIN 的員工不再因知道電話號碼就能直接認領帳號。
- 新增員工與重設 PIN 改用 8 碼安全亂數一次性啟用碼；後端只保存 SHA-256 hash，成功啟用後立即刪除。
- 員工 projection 同時移除 `pinHash` 與 `activationCodeHash`。

### Fixed

- 編輯員工保留既有 credential，不再意外清除 PIN。
- 員工電話新增／編輯採相同正規化規則，阻止不同格式建立同一電話。
- 雲端儲存改為 latest-state queue，不再在儲存中靜默丟棄下一次變更。
- 新增員工會等待雲端寫入完成才顯示啟用碼與重新載入；失敗會回復本機變更。

### Verified

- 老闆未設定、電話不符、正確初始化與既有帳號相容測試。
- 員工缺碼、錯碼、正確啟用、啟用碼重播、舊資料未配置與敏感欄位隔離測試。
- 老闆／員工本機預覽、全部既有 P0 回歸、語法檢查與正式 build 通過。

## 2026-07-15 — P0 員工雲端授權止血

### Added

- 員工本人休假、上班打卡、下班打卡的明確 Apps Script 命令。
- 員工欄位級回應投影與 P0 授權防回歸測試。
- Action-level authorization 架構決策與 A–I Review。

### Security

- 員工帳號呼叫全量 `save` 現在會被伺服器拒絕。
- 員工登入／pull 不再取得其他員工、老闆 access、PIN hash、封存員工或薪資調整資料。
- 員工 ID 由伺服器驗證結果決定，忽略客戶端偽造身份。

### Changed

- 員工排假與打卡先由雲端確認成功，再更新本機畫面。
- 正式環境 session 失效時不再靜默退回本機儲存。
- PWA cache 更新至 v35。

### Verified

- 錯誤 PIN、員工全量覆寫、跨員工資料、超額／錯月份休假、重複打卡均有拒絕測試。
- 老闆既有儲存、員工本人排假與打卡、登入前隔離、state recovery、介面穩定與 build 全數通過。
- 本機員工預覽實測 31 天日曆、3 天休假儲存與上班打卡通過。

## 2026-07-15 — Sprint 1／P0 登入前資料隔離

### Added

- 驗證成功後才依序載入管理功能的 authenticated bootstrap。
- 登入前資料隔離防回歸測試與 ADR。

### Changed

- 未登入時隱藏管理 shell，且不執行 `app.js` 與角色／薪資／出勤模組。
- 登入期間停用欄位與按鈕，避免重複送出。
- session 恢復會驗證角色與員工 ID 一致性；損壞 session 會安全清除。
- Google Sheets 模式登出或管理程式載入失敗時，清除已渲染資料與本機敏感 state。
- PWA cache 更新至 v34。

### Verified

- 未登入：管理 shell 隱藏、公司資料列數為 0、`app.js` 未載入。
- 老闆／員工本機預覽與員工連續選取 8 天休假通過，無 console warning/error。
- 品質檢查、三組 P0 回歸測試與正式 build 通過。

## 2026-07-15 — Sprint 1／P0 損壞資料安全復原

### Added

- `state-store.js`：主要本機 state 的安全解析、正規化、v2/v1 遷移與單一損壞備份。
- State store 測試：空資料、partial state、損壞 JSON、primitive、array、null、舊版復原、備份失敗與大量資料。
- 修正空字串狀態被誤判為「沒有資料」而載入範例員工的邊界問題。

### Changed

- `app/access/employee-work/boss-hours/fallback-actions/login/enhancements` 改用共用 state store。
- PWA cache 更新至 v33。

### Verified

- 10,000 位員工資料、連續 100 次讀寫無資料遺失。
- 老闆與員工瀏覽器預覽、員工休假選取與儲存流程無 console error。

## 2026-07-15 — Sprint 1／P0 介面載入穩定性

### Fixed

- 員工版面不再監聽並搬移同一批子節點，排除無限 MutationObserver 迴圈。
- 老闆工時增強只監聽出勤表的直接列，避免修改儲存格時自我觸發。
- 舊資料或本機預覽缺少 `shifts/attendance` 等欄位時，啟動流程會補齊完整 state schema。
- PWA cache 更新至 v32，確保已安裝裝置取得本次修復。

### Verified

- 員工與老闆本機預覽可穩定載入且無 console error。
- 員工連續點選 4 天休假不跳頁；排班與我的出勤分頁可往返。
- 390px 手機煙霧測試可操作，但發現既有橫向溢位，已列後續 UX 修復。

## 2026-07-15 — Sprint 0（完成）

### Added

- Project Health Report 與 Product Backlog。
- PROJECT_CONSTITUTION、README、API、Database 與平台 ADR 文件。
- 零第三方依賴的 quality check 與 static build 基線。
- 本機 Git 版本控制基線與 Sprint 0 架構／品質審查紀錄。

### Changed

- Service Worker 發布資產清單不再包含未啟用 Firebase 檔案。
- 驗證入口改為只依賴 Node，不再假設環境一定提供 npm。

### Known Risks

- 員工介面 MutationObserver 無限更新尚待 Sprint 1 修復。
- 現況 Google Sheets API 仍有 Critical 越權與全量覆寫風險，不可上線。
## 2026-07-29 — Sprint 26 Notification Center Staging activation

- Applied, rolled back, and reapplied immutable `0014_notification_center` only on Neon Staging; verified its reviewed checksum, ledger order, objects, forced RLS, indexes, constraints, trigger, functions, and PUBLIC revocations.
- Added `0015_notification_command_validation` after real PostgreSQL testing proved `jsonb_object_length()` unavailable. The patch changes only exact-key validation in the controlled read-state Command and preserves the `0014` checksum/history.
- Added a Staging-only migration manager with environment/host safeguards, advisory lock, explicit rollback confirmation, duplicate-up protection, and deliberate exclusion of `0009`/`0010`.
- Added fully synthetic dual-Workspace notification E2E covering manager/employee delivery, approve/reject, badge count, read state, sorting, idempotency, revision refresh, privacy, cross-tenant denial, SQL injection, least privilege, and fixture cleanup.
- Production, Production database, Auth0, Google Sheets, Apps Script, and Production deployment were not modified.
