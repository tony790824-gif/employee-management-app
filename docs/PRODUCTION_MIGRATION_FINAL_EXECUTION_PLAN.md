# Production Migration Final Execution Plan

Status: **REPOSITORY PLAN COMPLETE / EXECUTION NO-GO / NOT AN AUTHORIZATION**

Date: 2026-08-14

Sprint numbering remains capped at 65. This plan does not create a new Sprint or Closure Phase. It authorizes no Production connection, restore point, traffic change, Migration, rollback, deploy, role/ACL change, or other mutation.

## 1. Decision

`PRODUCTION MIGRATION EXECUTION READY = NO`.

The Repository-side execution chain is proven, but the event cannot currently be reduced to one safe Production authorization. The following independent preconditions remain non-PASS:

1. `STRUCTURAL_STARTING_BASELINE` and `ACL_SEMANTIC` are BLOCKED. Production has proven explicit default-ACL drift and the latest discovery returned `NO_ELIGIBLE_OPERATOR`; application-object owner and default-ACL owner are split. ACL research or repair is outside this plan.
2. No least-privilege Production Migration operator and role boundary are approved. An ACL-remediation operator and a Migration operator are different authorities; neither Owner/Admin nor runtime/read-only credentials may be selected by convenience.
3. RPO <=15 minutes is NOT PROVEN, independent backup/scheduled snapshot evidence is non-PASS, and no event-specific pre-Migration restore point exists.
4. No approved maintenance window, traffic-drain state, lock/long-transaction budget, monitoring/alert delivery, Migration commander, or forward-fix owner exists for the event.
5. No immutable candidate Commit and exact event authorization are granted. Current identity/TLS evidence is historical and must be refreshed inside the approved event.

Disposable PostgreSQL 18.4 rehearsal PASS proves the implementation path, not these Production conditions.

## 2. Authoritative inputs

- Exact manifest: `database/production-migration-exact-manifest.json`.
- Per-version dependencies, checksums, preconditions, lock risks and rollback classes: `database/production-migration-gap-remediation.expected.json`.
- 22-Gate state: `database/production-migration-final-readiness.expected.json`.
- Runtime compatibility: `database/production-migration-runtime-compatibility.expected.json`.
- Upgrade rehearsal: `docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_REPORT.md` and its hashed Evidence.
- Final structural baseline SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
- Final structural fingerprint: `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e`.

Only Git-tracked Migration files in the immutable manifest are valid. `0010` is an intentional unapproved gap and is permanently excluded.

## 3. Mandatory preconditions

Before an execution authorization may be requested, all items below must be documented as PASS:

1. Owner-approved immutable candidate Commit; clean `main`; manifest/checksum validation; no tracked or untracked Migration substitution.
2. Exact target identity and an independently approved least-privilege Migration operator. The operator must be able to execute only the reviewed DDL/function/ledger operations without role, membership, owner, billing or platform administration. Its effective role paths and ownership boundary must be proven read-only before use.
3. Dedicated read-only preflight identity, role boundary and TLS `verify-full`; exact starting ledger `0001`-`0008`; zero unexpected versions; zero checksum mismatches; `0010` absent.
4. Exact starting schemas, tables, columns, constraints, indexes, functions/signatures, triggers, policies/RLS, extensions, owners and ACLs match the accepted starting baseline. The current ACL drift means this condition is presently BLOCKED.
5. Approved recovery package: independent backup or an explicitly accepted equivalent, provider restore point at the event boundary, retention/expiry recorded, RPO <=15 minutes proven, isolated restore PASS, RTO <=60 minutes PASS, recovery commander and cleanup owner named.
6. Approved maintenance window and traffic plan: PostgreSQL API/worker/frontend writes drained; no mixed-version traffic through intermediate schemas; session/long-transaction counts within a pre-approved budget; alert delivery and named responders active.
7. Version-specific metadata/data-shape preconditions below are PASS using reviewed queries. Aggregate business data may be checked only as explicitly authorized counts/booleans; raw business rows are not evidence.
8. Exact event authorization names the Commit, target, operator, restore point, sequence, timeouts, stop authority, recovery commander, forward-fix owner, evidence paths and expiry. Approval is single-use and non-transitive.

## 4. Recovery checkpoint

A pre-Migration restore point is mandatory. It must be created or provider-captured immediately before traffic drain/preflight under a separately explicit recovery mutation boundary, then verified without exposing project/branch/endpoint identifiers or credentials. Evidence must include sanitized UTC creation time, retention expiry, target identity binding, RPO calculation and recovery commander acceptance.

The existing historical isolated-restore drill and measured RTO of 112.335 seconds remain PASS inputs. They do not prove the event restore point or RPO <=15 minutes. If the restore point is absent, ambiguous, expired, outside the accepted RPO, billable beyond the approved budget, or cannot be restored to an isolated no-traffic target, stop before Migration.

## 5. Maintenance and traffic gate

Zero downtime is not claimed. The event requires a maintenance window because the sequence includes `ACCESS EXCLUSIVE` table changes, CHECK validation/full scans, trigger DDL, non-concurrent indexes and function replacement.

Before `0009`, prove:

- application writes and worker delivery are drained;
- the current Google Sheets path remains the accepted user-facing rollback baseline and is not switched by this event;
- no long transaction or lock exceeds the approved budget;
- `lock_timeout = 2s` and `statement_timeout = 30s` are accepted for this event, or stricter reviewed values are recorded;
- monitoring, alert delivery, Migration commander, recovery commander and forward-fix owner are active;
- no Render, Netlify, Auth0, DNS or traffic cutover is bundled into the Migration authorization.

## 6. Identity, connection and execution boundary

- Pre/post verification uses the dedicated Production read-only role only.
- Migration apply uses only the separately approved least-privilege Migration operator; never the reader, API, Push, Staging credential, or an unreviewed Owner/Admin role.
- Every connection requires TLS `verify-full`, hostname verification, a temporary trusted CA and process-only credentials. Secrets, hostnames and connection strings must not enter command history, Evidence, Git or logs.
- The executor must use the immutable exact allowlist. Generic directory scanning and the generic `db:migrate up` path are prohibited.
- One Migration version per transaction; pause for an explicit human continue decision after every committed version.

## 7. Exact sequence and per-version preconditions

| Version | Required predecessor and preconditions | Primary Production risks |
| --- | --- | --- |
| `0009` | Exact `0001`-`0008`; `app_private.auth_sessions` metadata matches; target names absent | Catalog locks; new index build |
| `0011` | `0009` verified; foundation business-table metadata and tenant-context signature match; bootstrap function name available | Function catalog lock |
| `0012` | `0011` verified; `workspace_members` shape/owner match; `display_name` absent; existing rows satisfy the new check | `ACCESS EXCLUSIVE`; CHECK validation; function lock |
| `0013` | `0012` verified; employee/user/workspace/leave, command receipt/audit/outbox metadata and required function signatures match; targets absent | Catalog locks; indexes; trigger/RLS/policy creation |
| `0014` | `0013` verified; outbox/time-off/membership metadata and `pgcrypto` match; targets absent | Trigger DDL on outbox; catalog locks; indexes |
| `0015` | `0014` verified; exact notification command signature and owner match | Function catalog lock |
| `0016` | `0015` verified; notification/session/membership metadata and required `pgcrypto` functions match; targets absent | Trigger DDL; catalog locks; indexes |
| `0017` | `0016` verified; exact auth-session/tenant-context metadata and predecessor session function match | Function catalog lock; mixed-session semantics |
| `0018` | `0017` verified; endpoint constraint matches `0016`; exact command-function source fragments exist; all existing endpoints satisfy allowlist | `ACCESS EXCLUSIVE`; full CHECK scan; function lock |
| `0019` | `0018` verified; `0014` signatures match; notification rows satisfy expanded checks; outbox/membership metadata match; target v1 functions absent | `ACCESS EXCLUSIVE`; CHECK validation; non-concurrent index; trigger/function locks |
| `0020` | `0019` verified; subscription rows accept browser default; exact function source includes `0018`; no conflicting column/index | `ACCESS EXCLUSIVE`; possible rewrite not disproven; index/function locks |
| `0021` | `0020` verified; client-mode column/index and exact worker-complete signature/owner match | Function catalog lock |
| `0022` | `0021` verified; notification/preference/push/outbox metadata match; existing rows satisfy announcement type; targets absent | `ACCESS EXCLUSIVE`; full CHECK scan; trigger/function locks; indexes |

The only execution order is:

`0009 -> 0011 -> 0012 -> 0013 -> 0014 -> 0015 -> 0016 -> 0017 -> 0018 -> 0019 -> 0020 -> 0021 -> 0022`

## 8. Transaction and checkpoint contract

For each version:

1. Verify the exact predecessor ledger and current up-file checksum.
2. Verify that version's preconditions and lock budget.
3. Begin one transaction; set local approved timeouts and application identity.
4. Execute only the exact reviewed up SQL.
5. Add only that version's ledger row through the approved executor.
6. Verify affected metadata, owner/ACL/RLS/policies, dependency functions and ledger checksum before commit.
7. Commit only on complete PASS; write sanitized Evidence/hash; pause for the human continue decision.

No transaction may contain two versions. No failed version may be skipped, reordered or replaced. `0018` and `0020` must fail closed if their exact predecessor function fragments are absent.

## 9. Stop conditions

Stop immediately on authorization/expiry mismatch, target or operator mismatch, TLS failure, ledger drift, checksum mismatch, any unexpected version or `0010`, starting-baseline/owner/ACL/RLS/extension mismatch, failed per-version pre/postcondition, lock timeout, statement timeout, long transaction, capacity/monitoring failure, restore-point/RPO failure, runtime compatibility failure, evidence/hash failure, or loss of traffic isolation.

A stop consumes the continue decision. Do not retry blindly, edit the ledger, hand-edit a function, run down automatically or proceed to the next version.

## 10. Failure, rollback and forward-fix

- Before commit: roll back the current transaction, prove the ledger and affected metadata remain at the last committed checkpoint, preserve sanitized evidence, and stop.
- After a version commit: the committed ledger is authoritative. Keep traffic drained and choose only a separately reviewed forward fix, compatible runtime hold, or conditionally safe version-specific down operation.
- All 13 down paths are conditionally reversible; none is unconditionally authorized. A down file that would destroy populated security events, leave requests, notifications, subscriptions, deliveries or announcements is prohibited without a separate data-preservation decision.
- Restore is a recovery option only under the recovery commander's separate decision and isolated verification contract; this plan does not authorize restore-over-Production.

## 11. Post-Migration verification

After `0022`, while traffic remains drained:

1. Dedicated reader proves exact 21-version ledger: `0001`-`0009`, `0011`-`0022`; `0010` absent; zero unknown/duplicate/checksum mismatch.
2. Complete normalized catalog comparison proves schemas, relations, columns, constraints, indexes, functions/signatures, triggers, policies/RLS, owners, grants/ACL and extensions match the committed final baseline.
3. Require final structural fingerprint `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e` and expected baseline SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
4. Validate runtime compatibility, workspace isolation, Auth0/session boundaries, notification/push queues and rollback readiness before any later deploy or traffic Gate.
5. Preserve normalized evidence and SHA-256 only; never persist credentials, raw business rows or platform identifiers.

ACL semantic verification cannot be skipped. It does not need another exploratory investigation, but the final structural/ACL comparison must prove no unapproved privilege drift. The currently proven default-ACL drift means this final Gate would remain BLOCKED unless that independent ACL blocker is first resolved or an equivalent security policy is explicitly approved. This Migration plan does not repair or waive it.

## 12. Can one authorization complete the event?

**Not today.** The current blockers require prior independent evidence, platform configuration and Owner decisions. A Migration authorization cannot safely create its own operator, resolve ACL drift, prove RPO, configure monitoring or approve its own maintenance window.

After every mandatory precondition above is independently PASS, one exact, time-bounded Production Migration authorization may cover only:

- event-time dedicated-reader preflight;
- the already approved event restore-point checkpoint;
- traffic-drained verification;
- the exact 13 one-version transactions with human pauses;
- sanitized per-version evidence;
- final dedicated-reader ledger/catalog/ACL verification;
- rollback/forward-fix stop handling within the pre-approved boundary.

It must still exclude ACL remediation, role/membership/ownership changes, runtime deploy, Auth0/Render/Netlify/DNS changes, Production traffic cutover, billing changes and `0010`.

## 13. Remaining blockers after a successful Migration

Even a fully verified `0022` Migration would not make the application ready for launch. Remaining launch blockers include dedicated Production Auth0, Render API/worker and Netlify frontend; Production secrets/environment isolation; domain/DNS/TLS; monitoring/alerting/logging; accepted backup/RPO operations; unresolved ACL security; device/release verification; operations ownership; and a separate reversible Production traffic GO decision.

Production Readiness remains **70% / NOT READY**, Gate A **DEFER**, Production Provisioning **NO-GO**, and Production Migration Authorization **NOT_GRANTED**.

This Repository/local planning task made no Production connection or mutation.
