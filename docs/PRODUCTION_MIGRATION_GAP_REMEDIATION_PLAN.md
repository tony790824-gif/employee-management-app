# Production Migration Gap Remediation Plan

Status: **SPRINT 50 REPOSITORY PLAN COMPLETE / PRODUCTION EXECUTION BLOCKED**

Date: 2026-08-10

Authority: planning and Repository validation only; this document does not authorize a connection, Migration, repair, grant, deploy or other Production mutation.

Sprint 51 update: the exact chain and fail-closed executor controls passed twice against fresh empty disposable PostgreSQL 18.4 clusters. This closes only the isolated empty-database rehearsal requirement. Production structural/data-volume preconditions, contention, recovery, runtime compatibility, Gate A and execution authorization remain BLOCKED.

Sprint 53 update: the final Runbook, 19-Gate machine-readable readiness package and another disposable success-path simulation are complete. The current Production Gate still has 17 non-PASS items, so Production Migration Technical Readiness is NO-GO and authorization is NOT GRANTED. Repository controls do not close recovery, current Production structural baseline, runtime/environment or operational prerequisites.

## 1. Confirmed baseline

The authorized Sprint 49 read-only evidence is the only current Production baseline:

- dedicated read-only identity, role boundary and TLS `verify-full`: PASS;
- expected ledger: 21 approved Git-tracked versions;
- observed Production ledger: `0001`-`0008`;
- missing: `0009`, `0011`-`0022`;
- `0010`: intentional unapproved gap and not an expected or executable version;
- unexpected versions: NONE;
- checksum mismatches among observed rows: NONE;
- structural catalog: NOT EVALUATED because comparison stopped at ledger mismatch.

The normalized expected catalog hash remains `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`. The Sprint 49 sanitized Production evidence hash remains `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.

## 2. Final inventory and dependency order

The only permitted future order is:

`0009 -> 0011 -> 0012 -> 0013 -> 0014 -> 0015 -> 0016 -> 0017 -> 0018 -> 0019 -> 0020 -> 0021 -> 0022`

`0010` is not a dependency, is not present in the approved inventory and must be rejected even if a local file with that number exists. The order is strict because later versions replace or inspect exact predecessor Function definitions, constraints and table shapes. In particular, `0018` patches the exact `0016` push-command source, `0020` expects the `0018` source changes, and `0021`/`0022` depend on the push/notification structures created by the preceding chain.

| Version | Direct dependency | Main schema mutation | Principal Production risk | Rollback classification |
| --- | --- | --- | --- | --- |
| `0009` | verified `0001`-`0008` | security-event inbox table, indexes and ingest Function | object-name/owner/ACL drift; catalog and index locks | conditionally reversible; destructive after inbox data exists |
| `0011` | `0009` | bootstrap Function | Function signature/owner drift; runtime dependency | conditionally reversible before PostgreSQL UI runtime depends on it |
| `0012` | `0011` | nullable `workspace_members.display_name` with CHECK; bootstrap replacement | `ACCESS EXCLUSIVE`; CHECK validation; loss of names on down | conditionally reversible only before values/runtime use |
| `0013` | `0012` | time-off tables, indexes, RLS, policies and Functions | FK/object drift; new indexes; approved results cannot be undone by down | conditionally reversible before feature use; forward fix after use |
| `0014` | `0013` | notifications table and outbox trigger | trigger DDL lock on live outbox; notification state loss | conditionally reversible before notification data/use |
| `0015` | `0014` | notification command Function replacement | exact predecessor Function/ACL and mixed runtime | conditionally reversible with coordinated runtime rollback |
| `0016` | `0015` | push subscription/delivery tables, RLS, Functions and notification trigger | trigger DDL lock; queue/subscription state loss | conditionally reversible before subscriptions; forward fix after use |
| `0017` | `0016` | session establishment Function replacement | active-session semantic incompatibility | conditionally reversible with coordinated Auth0/runtime rollback |
| `0018` | `0017` | replace push endpoint CHECK and dynamically patch push Function | `ACCESS EXCLUSIVE`, full CHECK scan, exact Function-source dependency | conditionally reversible only if Edge endpoints do not exist |
| `0019` | `0018` | rename Functions; alter notifications; preferences; index and trigger | `ACCESS EXCLUSIVE`, CHECK validation, non-concurrent index, trigger lock | conditionally reversible; down stops after new event notifications exist |
| `0020` | `0019` | add `client_mode` default, index and Function patches | `ACCESS EXCLUSIVE`, non-concurrent index, rewrite absence unproven | conditionally reversible with coordinated subscription/worker fallback |
| `0021` | `0020` | push delivery completion Function replacement | worker-version and in-flight queue incompatibility | conditionally reversible only with drained queue/runtime rollback |
| `0022` | `0021` | announcement tables/RLS; notification CHECK; outbox trigger and Functions | `ACCESS EXCLUSIVE`, CHECK scan, trigger lock, app/worker coupling | conditionally reversible only while announcements are unused; down otherwise stops |

No version is classified unconditionally reversible. Exact file hashes, preconditions, mutation classes, lock risks and rollback conditions are machine-readable in `database/production-migration-gap-remediation.expected.json`.

## 3. Preconditions

Every item below is required before a future execution request can be considered. Current status is **BLOCKED** unless noted otherwise.

1. Re-run the dedicated read-only identity, TLS and ledger checks against the exact authorized commit; observed ledger must still be `0001`-`0008`, with no checksum mismatch or unexpected version.
2. Collect the structural metadata that Sprint 49 deliberately did not collect. Each predecessor table, column, constraint, index, Function signature, owner, ACL, policy, trigger and Extension needed by the next version must match the approved expected state.
3. Prove `pgcrypto` and all referenced foundation Functions exist with approved owner/ACL. Do not infer this from Staging or the disposable expected build.
4. Prove target object names/columns/indexes do not already exist with unledgered definitions.
5. Prove existing rows satisfy every new CHECK/FK requirement. Exact row counts, table sizes, index sizes, write rate and lock timing are currently UNKNOWN.
6. Prove old runtime, future PostgreSQL API, push worker and frontend compatibility at every schema checkpoint. No zero-downtime claim exists.
7. Use an immutable, clean Git artifact containing exactly the 13 approved up/down pairs. Any `0010` file or unapproved Migration in the execution source is a hard stop.
8. Obtain a separate, exact owner approval for one maintenance event, the exact commit, target, sequence, operator identity, backup/restore checkpoint and stop/forward-fix owners.

## 4. Migration-time mutation and lock assessment

The reviewed files contain DDL and Function definitions; they contain no explicit migration-time business-row backfill except existing-row values introduced by constant defaults in `0019` and `0020`. Runtime Function bodies include business DML, but those bodies are definitions and are not invoked by applying the Migration.

This does not make execution low risk. Existing-table operations can block concurrent traffic:

- `0012`: table alteration and CHECK validation on `workspace_members`;
- `0014`, `0016`, `0019`, `0022`: trigger replacement/addition on existing event/notification tables;
- `0018`: drop/add CHECK on `push_subscriptions`, including validation of existing endpoints;
- `0019`: notification table alteration, new defaults/checks and non-concurrent deduplication index;
- `0020`: `client_mode` NOT NULL/default and non-concurrent index; PostgreSQL fast-default behavior is plausible but a no-rewrite result is not proven for current Production;
- `0022`: notification-type CHECK replacement and validation.

Production table sizes, row distributions, concurrent write rates, lock wait duration and statement duration are UNKNOWN. A maintenance window is therefore **REQUIRED** and zero-downtime is **UNKNOWN**, not PASS.

## 5. Backup, Restore and recovery prerequisite

Status: **BLOCKED**.

The current evidence shows only a six-hour PITR/history window, no scheduled snapshot and no isolated Restore rehearsal. Before any Migration:

- meet the approved RPO target of 15 minutes and RTO target of 60 minutes;
- capture an approved pre-change restore point and record its sanitized identifier/time;
- produce independent backup/snapshot evidence appropriate to the chosen Production plan;
- complete an isolated Restore and application verification rehearsal without touching Production;
- prove how schema, application code and secrets are restored together;
- assign a recovery commander and forward-fix owner;
- prove enough retained time remains to detect, stop and recover.

PITR availability alone does not satisfy this gate. Until all items pass, no Migration authorization package may be issued.

## 6. Execution tooling blocker

`database/migrate.mjs` is not approved for this Production gap as currently invoked:

- it discovers every matching up file from the migrations directory;
- a local untracked `0010` file would therefore be discoverable;
- `up` loops through all pending files and does not honor a per-version target/verification stop;
- it does wrap each version in a transaction and verifies applied checksums, but those controls do not provide the required exact allowlist and human checkpoint after every version.

A future Sprint must create and rehearse an exact-manifest, one-version-at-a-time execution path from a clean immutable artifact. This plan does not implement or authorize that executor.

## 7. Mandatory stop conditions

Stop before or during the future maintenance event on any of the following:

- target/database/role identity mismatch, TLS not `verify-full`, or exact authorization absent;
- ledger drift, unexpected version, checksum mismatch, or any appearance of `0010` in the execution set;
- structural, ownership, ACL, RLS/policy, trigger, Function signature or Extension precondition unknown/mismatch;
- backup, restore, RPO, RTO or recovery-owner checkpoint incomplete;
- lock budget exceeded, statement timeout, long transaction, unexpected table rewrite or capacity alarm;
- runtime compatibility not proven or traffic cannot be safely drained/held;
- per-version transaction, ledger insert, object verification, grant verification or evidence capture fails;
- sanitized evidence is incomplete or its SHA-256 cannot be reproduced.

On stop: roll back only the current uncommitted transaction, keep traffic in the pre-approved safe state, capture sanitized evidence and escalate. Do not automatically run a down Migration, modify the ledger, skip a version or continue to the next version.

## 8. Rollback and forward-fix contract

The repository has down files, but their existence is not proof of safe Production rollback. Several down files drop data-bearing tables, state or columns; `0019` and `0022` explicitly refuse rollback after new records exist; `0018` can reject rollback after Edge endpoints exist. Approved Production rollback therefore means:

- before commit: database transaction rollback;
- after commit but before feature use: only an explicitly approved, version-specific down path with data/compatibility proof;
- after feature use or data creation: forward fix by default, preserving business/audit/notification data;
- application rollback: only to a version proven compatible with the currently committed schema.

No destructive down operation is authorized by this plan.

## 9. Evidence contract

For every future version, save only sanitized evidence: timestamp, authorized commit SHA, approval-record hash, identity/TLS result, backup/recovery checkpoint, pre/post ledger, version and up checksum, transaction result, elapsed time, lock/timeout result, post-version metadata verification, stop reasons and a SHA-256 of the normalized record.

Never store a connection string, host, endpoint, username, password, Token, Cookie, Authorization header, project/branch identifier or business rows. After the final version, re-run the full ledger and structural comparison against the committed expected baseline. Production parity can become PASS only when every catalog section passes; successful Migration application alone is insufficient.

## 10. Decision

- Sprint 50 Repository planning: **COMPLETE**.
- Production Migration execution: **BLOCKED / NOT AUTHORIZED**.
- Backup/Restore prerequisite: **BLOCKED**.
- Structural preconditions: **BLOCKED / NOT EVALUATED**.
- Production readiness: **70% / NOT READY**.
- Gate A: **DEFER**.
- Production Provisioning: **NO-GO**.
- Production mutation in Sprint 50: **NONE**.
