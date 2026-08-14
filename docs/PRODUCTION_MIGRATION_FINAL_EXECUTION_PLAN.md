# Production Migration Final Execution Plan

Status: **PRODUCTION MIGRATION EXECUTION READY = YES / AWAITING ONE EXPLICIT EVENT AUTHORIZATION**

Date: 2026-08-14

Sprint numbering remains capped at 65. This package does not authorize a Production connection, restore point, traffic change, Migration, rollback, deploy, role/ACL change, or any other mutation.

## Decision

The exact Migration event can be completed under one narrowly scoped Owner authorization. The former 13 non-PASS records remain truthful in the authoritative 22-Gate launch model, but they compress into five event controls instead of thirteen independent prerequisite projects:

1. **Authorization and immutable artifact** — exact Commit, target, command, sequence, expiry and stop owners.
2. **Migration operator boundary** — event-time proof that the supplied operator has the minimum existing DDL/ledger authority, owns the affected application objects, and has no superuser/role/database/replication/BYPASSRLS powers.
3. **Event-time non-ACL preflight** — exact `0001`-`0008` ledger/checksums, zero unexpected versions, `0010` absent, and the committed non-ACL structural starting baseline.
4. **Recovery checkpoint** — create and verify one event-specific restore point before the database connection. The Sprint 57 isolated restore and measured RTO remain the recovery-method proof.
5. **Change window and responders** — writes drained, lock/long-transaction budget accepted, Migration commander and recovery/forward-fix owner present.

The ACL owner split is not a Migration blocker. The approved Migration files do not depend on the separate ACL-remediation operator and do not alter default privileges. ACL security remains a `MUST_BEFORE_TRAFFIC_GO` Gate and is not waived or repaired here. Likewise, formal RPO <=15 minutes remains a traffic GO continuity Gate; the Migration event instead requires a verified event-specific restore point and the already proven isolated-restore/RTO path.

Auth0, Render, Netlify, custom domain, external APM, long-term log retention and scheduled snapshots are not technical prerequisites for applying these database Migrations. They proceed in parallel and remain required where applicable before real user traffic.

## Exact execution package

The only executable entry point is shown below. The operator must set pnpm's official
process-scoped CI flag **before** pnpm starts so the non-interactive Codex/CI
shell cannot prompt to rebuild dependency state:

```powershell
$env:CI = 'true'
pnpm run db:migration:production-event
```

`CI=true` changes only pnpm's interaction mode. It does not bypass dependency
validation, any Migration guard, or any Production authorization. Do not use
`--force`, do not set `confirmModulesPurge=false`, and do not delete
`node_modules` as part of the Production event.

It is fail-closed and requires process-only inputs for the exact Owner authorization, immutable Commit, dedicated direct-endpoint Migration credential, expected database/operator identities, temporary CA, verified restore point and active drained maintenance state. It requires TLS `verify-full` plus channel binding, one connection, retry zero, PostgreSQL 18, and a non-dangerous operator boundary. It never scans the Migration directory for Production execution.

The exact sequence is:

`0009 -> 0011 -> 0012 -> 0013 -> 0014 -> 0015 -> 0016 -> 0017 -> 0018 -> 0019 -> 0020 -> 0021 -> 0022`

`0010` is permanently excluded.

Before the first mutation, the runner opens a READ ONLY transaction and proves the exact `0001`-`0008` ledger/checksums and non-ACL structural baseline. **One Migration version per transaction** is mandatory: each approved version runs with the existing reviewed precondition, `lock_timeout = 2s`, `statement_timeout = 30s`, exact up SQL, ledger insert, postcondition, ledger verification and blocking-lock check. A failed version rolls back and stops; versions cannot be skipped or reordered.

After `0022`, a READ ONLY post-check proves the exact 21-version ledger/checksums and committed non-ACL final structural baseline. Only sanitized event evidence and its SHA-256 are written locally. Credentials, URLs, hostnames, raw principals and business rows are excluded.

## Stop conditions

Stop before or during the event on any of the following:

- missing/stale authorization, Commit or restore-point proof;
- wrong database, operator, PostgreSQL version, direct endpoint, TLS, CA or channel binding;
- dangerous operator attribute, missing CREATE/ownership authority, or identity mismatch;
- unexpected/duplicate Migration, checksum drift, `0010`, skip or reorder;
- starting or final non-ACL structural mismatch;
- failed version precondition/postcondition, dependency, lock or statement timeout;
- writes not drained, responder unavailable, evidence sanitization/hash failure;
- any request to broaden the event into ACL repair, deploy, runtime provisioning or traffic cutover.

## Rollback and forward-fix

Before a version commits, the transaction is rolled back and the event stops. After a version commits, the ledger checkpoint is authoritative: keep writes drained and use only a separately reviewed forward fix, conditionally safe down operation, or the recovery commander's restore decision. No automatic down or blind retry is allowed; all 13 down paths remain conditionally reversible.

## Authorization boundary

One future authorization may cover: creation/verification of one event-specific restore point; one direct Migration connection; event-time operator/ledger/non-ACL structural preflight; the exact 13 transactions; sanitized evidence; and final ledger/non-ACL structural verification. It must explicitly accept possible Neon compute wake, network/I/O, catalog locks and the reviewed DDL mutations.

It must not cover `0010`, ACL remediation, role/membership/owner changes, Auth0/Render/Netlify/DNS changes, runtime deploy, traffic GO, billing changes, restore-over-Production, or unrelated SQL.

Production Readiness remains **70% / NOT READY**, Gate A **DEFER**, Production Provisioning **NO-GO**, and Production Migration Authorization **NOT_GRANTED** until the Owner grants that exact event authorization.

This Repository task made no Production connection or mutation.
