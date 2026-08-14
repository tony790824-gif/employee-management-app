# Production Migration Execution Runbook Draft

Status: **FINAL TECHNICAL RUNBOOK / READY FOR ONE EXPLICIT EVENT AUTHORIZATION / NOT AUTHORIZED**

Fast Production Path update (2026-08-14): the authoritative execution contract is `docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_PLAN.md` and the exact runner is `pnpm run db:migration:production-event`. The 13 non-PASS launch records are not 13 separate Migration projects; five event controls close inside one bounded authorization. ACL owner split, full Production platform provisioning and formal RPO <=15 minutes remain separate traffic-GO concerns, not Migration technical prerequisites. Nothing in this update grants a Production connection or mutation.

Final execution-plan update (2026-08-14): `docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_PLAN.md` consolidates this runbook, the exact manifest, per-version preconditions, recovery/traffic checkpoints and current Live blockers into one event contract. The current answer is `PRODUCTION MIGRATION EXECUTION READY = NO`: ACL/starting-baseline drift, the missing least-privilege Migration operator, RPO/event restore point, maintenance/traffic/monitoring ownership and exact event authorization must be resolved independently before one bounded Migration authorization can be requested. No ACL remediation is included.

Sprint 65 update: one authorized dedicated-reader connection closed `TARGET_IDENTITY`, `TLS_VERIFY_FULL`, and `ZERO_UNEXPECTED_MIGRATIONS`, producing 9 PASS / 13 non-PASS. `FRESH_LEDGER_AND_CHECKSUM` remains BLOCKED because Production retains only `0001`-`0008`; `STRUCTURAL_STARTING_BASELINE` was not evaluated after the ledger stop. The authority is consumed. This Runbook still does not authorize a second read, Migration, candidate Commit, maintenance event or Production mutation.

Sprint 63 closes only the Repository runtime-contract and immutable-manifest Gates. The matrix is now 6 PASS / 16 non-PASS. The exact manifest hash is `769fcc39a0a9aa0a8e18355e31dcd859018295cdb7f4940f75a30ce244217cbf`; its candidate authorization remains NOT_GRANTED.

Sprint 62 closure review classified every non-PASS Gate exactly once and recorded the dependency-ordered minimum path in `docs/PRODUCTION_MIGRATION_FINAL_EXECUTION_READINESS_REPORT.md`. Sprint 63 closed only the two Repository targets, leaving 6 PASS / 16 non-PASS. Repository-only and read-only closure work cannot authorize a Migration; external configuration, RPO/restore-point/traffic mutations and exact Owner decisions remain separate stops.

Sprint 61 revalidation keeps this Runbook fail-closed. The machine-readable package separates isolated Restore PASS and RTO PASS from RPO NOT_PROVEN and the blocked event-specific pre-Migration restore point. A fresh disposable upgrade/fresh-install parity run and 22-Gate simulation pass; after Sprint 63 the real Production Gate still has 16 non-PASS items. No dedicated reader inputs were available for event-time revalidation, and no Production operation ran.

This runbook describes a possible future maintenance event for `0009`, `0011`-`0022`. It must not be run until Gate A, recovery, tooling, structural preconditions and a separate exact owner approval all pass.

Sprint 51 proved the exact one-version transaction sequence and failure stops only on empty disposable PostgreSQL 18.4 databases. Sprint 52 proved structural equality between upgraded and fresh-install disposable databases. Sprint 53 validated this Runbook and its fail-closed Gate on another disposable cluster. All rehearsal tools remain local/disposable-only and must not be pointed at Production. Representative lock/runtime evidence, recovery and every Production authorization checkpoint below remain open.

`database/production-migration-final-readiness.expected.json` and `pnpm db:migration:final-readiness` are the machine-readable Gate. Every required record must be `PASS`; missing, `BLOCKED`, `NOT_GRANTED`, `UNKNOWN`, `NOT_CONFIGURED` or `FAIL` means NO-GO. A disposable simulation result is never accepted as Production evidence.

## Gate 0 - authorization checkpoint

Record the exact approved commit, target environment, 13-version allowlist, operator role, maintenance window, traffic plan, recovery commander and forward-fix owner. Reject general or stale approval. Reject `0010` and any source that is not a clean immutable Git artifact.

Current status: **NOT GRANTED**. Sprint 53 completion is not an execution authorization.

## Gate 1 - recovery checkpoint

Require current backup/PITR evidence, an approved restore point, successful isolated Restore rehearsal, RPO 15-minute proof, RTO 60-minute proof and enough retention for detection/recovery. Current status: **BLOCKED**.

## Gate 2 - read-only preflight

Using only the dedicated reader, prove target identity, TLS `verify-full`, safe role boundary, exact `0001`-`0008` ledger/checksums and every required predecessor object/owner/ACL/RLS/policy/Extension. Stop on any unknown or mismatch. Do not collect business rows.

Historical Sprint 49 identity/ledger evidence is provenance, not event-time evidence. Re-run it within the approved freshness window. Current Production structural starting baseline remains **BLOCKED / NOT EVALUATED**.

## Gate 3 - execution artifact

Build from a clean checkout of the authorized commit. Verify the 13 up/down SHA-256 values against `database/production-migration-gap-remediation.expected.json`. Prove there is no `0010` or undeclared file. The current generic `db:migrate up` path is prohibited because it directory-scans and cannot stop after each version.

Current Repository artifact status: **PASS**. The separate candidate Commit identity and Owner execution authorization remain **BLOCKED / NOT_GRANTED**.

## Gate 4 - traffic and lock checkpoint

Enter the approved maintenance window. Confirm traffic is in the approved drained/read-only state, current sessions and long transactions are within budget, and monitoring/alerting responders are active. Record only sanitized counts/status, never credentials or business rows.

Current status: **NO WINDOW / TRAFFIC CONTROL UNKNOWN / RESPONDERS NOT CONFIGURED**.

## Gate 5 - one-version transaction sequence

For each exact version in order:

1. Reconfirm previous ledger checkpoint and version checksum.
2. Reconfirm version-specific table/Function/constraint/owner/ACL preconditions.
3. Begin one transaction with approved `lock_timeout`, `statement_timeout` and application name.
4. Apply only that version's reviewed up SQL.
5. Insert only that version's ledger row through the approved executor.
6. Verify affected metadata, RLS/policies, Function owner/ACL and ledger checksum.
7. Commit only if all verification is PASS.
8. Capture normalized evidence/hash and pause for the human continue decision.

Never skip a failed version or batch the remaining versions after a checkpoint failure.

Retry is allowed only after the failure cause is understood, the current transaction is proven rolled back, the ledger and affected metadata still match the last committed checkpoint, evidence is preserved, and a new human continue decision is recorded. A retry never skips or rewrites a ledger row.

## Gate 6 - required sequence

`0009`, `0011`, `0012`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`, `0019`, `0020`, `0021`, `0022`.

Do not add `0010`. Dynamic source transformations in `0018` and `0020` must find their exact expected predecessor fragments; failure is a stop, not a reason to edit Production Functions manually.

## Gate 7 - stop and recovery path

If failure occurs before commit, roll back the current transaction and stop. If it occurs after a version commit, do not automatically run down or edit the ledger. Keep traffic in the approved safe state, preserve evidence, assess the version-specific down guard and prefer a reviewed forward fix when data/state has been created.

Escalate on identity, checksum, schema, owner/ACL, Extension, lock, timeout, capacity, runtime compatibility, recovery or evidence failure.

For partial execution, the last committed version is authoritative. Do not assume the old application remains compatible, do not automatically run a destructive down file, and do not continue to the next version. The recovery commander chooses a reviewed forward fix, compatible application hold, or explicitly proven version-specific rollback.

## Gate 8 - final verification

After `0022`, re-run the dedicated read-only ledger comparison and then the complete normalized structural catalog comparison. Require exact parity for schemas, relations, columns, constraints, indexes, Functions/signatures, triggers, policies/RLS, owners, grants/ACL and Extensions. Compare with expected baseline SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.

Migration completion without full catalog parity is **BLOCKED**, not PASS.

Require exact final structural fingerprint `f7fcde233753d0d09ed0a3adf796fb2c814afd866ece1542e556b465ce322e9e`, zero missing/unexpected/mismatched objects and zero unexpected PUBLIC privilege drift.

## Gate 9 - runtime compatibility and release

Database parity does not authorize Render, Netlify, Auth0, DNS, Secret or traffic changes. Those remain separate release gates. Deploy only versions proven compatible with the committed schema and preserve the approved rollback/forward-fix path.

Repository compatibility status: **PASS** only under the fail-closed policy that API, push worker and PostgreSQL frontend remain drained at `0008` through `0021`. The current runtime is allowed only after `0022` ledger/catalog verification. Mixed-version and zero-downtime operation remain prohibited/not proven; event-time traffic control is a separate non-PASS Gate.

## Current outcome

The Runbook and machine-readable Gate are complete and passed Repository/disposable validation. Production Migration Technical Readiness remains **NO-GO**, and Production Migration Authorization remains **NOT GRANTED**, because 16 required Gates are not PASS. Do not label this `TECHNICALLY READY FOR AUTHORIZED MIGRATION`.
