# Production Migration Execution Runbook Draft

Status: **FINAL TECHNICAL RUNBOOK / NO-GO / NOT AN AUTHORIZATION**

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

Current status: **BLOCKED** until the final candidate Commit and immutable artifact are separately approved.

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

## Current outcome

The Runbook and machine-readable Gate are complete and passed disposable simulation. Production Migration Technical Readiness remains **NO-GO**, and Production Migration Authorization remains **NOT GRANTED**, because 17 required Gates are not PASS. Do not label this `TECHNICALLY READY FOR AUTHORIZED MIGRATION`.
