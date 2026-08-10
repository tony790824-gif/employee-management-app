# Production Migration Execution Runbook Draft

Status: **DRAFT / BLOCKED / NOT AN AUTHORIZATION**

This runbook describes a possible future maintenance event for `0009`, `0011`-`0022`. It must not be run until Gate A, recovery, tooling, structural preconditions and a separate exact owner approval all pass.

Sprint 51 proved the exact one-version transaction sequence and failure stops only on empty disposable PostgreSQL 18.4 databases. `database/rehearse-production-migration-upgrade.mjs` remains local/disposable-only and must not be pointed at Production. Representative lock/runtime evidence, recovery and every Production authorization checkpoint below remain open.

## Gate 0 - authorization checkpoint

Record the exact approved commit, target environment, 13-version allowlist, operator role, maintenance window, traffic plan, recovery commander and forward-fix owner. Reject general or stale approval. Reject `0010` and any source that is not a clean immutable Git artifact.

## Gate 1 - recovery checkpoint

Require current backup/PITR evidence, an approved restore point, successful isolated Restore rehearsal, RPO 15-minute proof, RTO 60-minute proof and enough retention for detection/recovery. Current status: **BLOCKED**.

## Gate 2 - read-only preflight

Using only the dedicated reader, prove target identity, TLS `verify-full`, safe role boundary, exact `0001`-`0008` ledger/checksums and every required predecessor object/owner/ACL/RLS/policy/Extension. Stop on any unknown or mismatch. Do not collect business rows.

## Gate 3 - execution artifact

Build from a clean checkout of the authorized commit. Verify the 13 up/down SHA-256 values against `database/production-migration-gap-remediation.expected.json`. Prove there is no `0010` or undeclared file. The current generic `db:migrate up` path is prohibited because it directory-scans and cannot stop after each version.

## Gate 4 - traffic and lock checkpoint

Enter the approved maintenance window. Confirm traffic is in the approved drained/read-only state, current sessions and long transactions are within budget, and monitoring/alerting responders are active. Record only sanitized counts/status, never credentials or business rows.

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

## Gate 6 - required sequence

`0009`, `0011`, `0012`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`, `0019`, `0020`, `0021`, `0022`.

Do not add `0010`. Dynamic source transformations in `0018` and `0020` must find their exact expected predecessor fragments; failure is a stop, not a reason to edit Production Functions manually.

## Gate 7 - stop and recovery path

If failure occurs before commit, roll back the current transaction and stop. If it occurs after a version commit, do not automatically run down or edit the ledger. Keep traffic in the approved safe state, preserve evidence, assess the version-specific down guard and prefer a reviewed forward fix when data/state has been created.

Escalate on identity, checksum, schema, owner/ACL, Extension, lock, timeout, capacity, runtime compatibility, recovery or evidence failure.

## Gate 8 - final verification

After `0022`, re-run the dedicated read-only ledger comparison and then the complete normalized structural catalog comparison. Require exact parity for schemas, relations, columns, constraints, indexes, Functions/signatures, triggers, policies/RLS, owners, grants/ACL and Extensions. Compare with expected baseline SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.

Migration completion without full catalog parity is **BLOCKED**, not PASS.

## Gate 9 - runtime compatibility and release

Database parity does not authorize Render, Netlify, Auth0, DNS, Secret or traffic changes. Those remain separate release gates. Deploy only versions proven compatible with the committed schema and preserve the approved rollback/forward-fix path.

## Current outcome

This draft is ready for a disposable non-Production rehearsal only under a separately scoped authorization. Production execution remains NO-GO because recovery evidence, structural preconditions, exact execution tooling, runtime compatibility and Gate A approval are absent.
