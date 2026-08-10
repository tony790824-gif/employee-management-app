# Sprint 55 Isolated Restore Authorization Package

Status: **REPOSITORY SCOPE COMPLETE / AUTHORIZATION DEFERRED / EXERCISE NOT GRANTED**

Date: 2026-08-10

## Decision

The proposed exercise is technically bounded, but it is not yet safe to authorize. Current Neon Branch/Restore capacity and incremental cost have not been re-verified, no human Recovery Commander has been named, and no exact one-time resource authorization exists. Therefore:

- Isolated Restore: **BLOCKED**;
- RPO <= 15 minutes: **BLOCKED**;
- RTO <= 60 minutes: **BLOCKED / NOT MEASURED**;
- authorization recommendation: **DEFER**;
- exercise authorization: **NOT GRANTED**.

This package is not an approval to click Restore, create a Branch/target or credential, change retention/snapshots, upgrade a plan, run SQL/Migration, deploy or modify Production.

## Exact authorization boundary proposed for a later owner decision

One future authorization may cover only:

1. select one owner-approved Production restore point within the evidenced history window;
2. create exactly one disposable, isolated, non-Production Neon recovery target from that point;
3. create/use at most one distinct process-only verification credential for that target, with TLS `verify-full`;
4. perform metadata/hash verification only; do not display or retain business rows;
5. record sanitized UTC timing and PASS/FAIL facts;
6. delete the temporary credential and recovery target after evidence capture;
7. prove zero residual resources.

It does not cover active-Production Restore/overwrite, Production traffic, application binding, Production SQL, Migration `0009`/`0011`-`0022`, unapproved `0010`, Snapshot/retention changes, plan upgrade, billing action, deploy, DNS, Auth0, Render or Netlify changes.

## Cost and resource boundary

- Current evidenced Neon plan: Free.
- Maximum new recovery targets: one.
- Maximum temporary verification credentials: one.
- Current available Branch capacity: **UNKNOWN; re-confirm in provider before authorization**.
- Restore/history/resource cost: **UNKNOWN; re-confirm before authorization**.
- Maximum approved spend: **NOT SET**.
- If the provider shows a charge, plan upgrade, capacity shortage or a different resource operation: **STOP**. The owner must separately approve the exact cost and changed scope.

No assumption that a Free-plan included Branch makes this exercise free is permitted.

## Isolation and credentials

The target must have a distinct identity and credential boundary, never use an active Production application credential, and never receive Production frontend/API/worker/DNS traffic. It must not be added to Render, Netlify, Auth0, DNS, traffic routing or deployment configuration. Credentials remain process-only and must not appear in Git, logs, evidence or chat.

## Measurement contract

RPO uses UTC timestamps:

`RPO minutes = Restore operation accepted UTC - selected restore-point UTC`

A calculated value <=15 minutes is insufficient unless the provider continuity/retention evidence also covers that interval. Missing continuity evidence means BLOCKED.

RTO uses UTC timestamps:

- start: provider accepts the isolated Restore operation;
- ready checkpoint: isolated target accepts the verified TLS connection;
- end: ledger/catalog/security verification completes;
- `RTO minutes = end - start`.

Cleanup duration is recorded separately. No actual timing means RTO remains NOT MEASURED.

## Restored-target verification

Fail closed unless all of the following pass without exposing business data:

- distinct target identity and TLS `verify-full`;
- zero Production traffic/application binding;
- exact `0001`-`0008` ledger and checksums;
- expected starting structural fingerprint;
- critical tables, Functions, indexes and constraints;
- owners, ACL, RLS/policies, required Extensions and application-required objects;
- sanitized evidence/hash;
- target and credential cleanup with zero residual resources.

The exercise must not proceed into `0009`, `0011`-`0022`; `0010` remains an intentional unapproved gap.

## Ownership

Before authorization, the owner must name one human Recovery Commander who owns start/stop decisions, verification acceptance, incident escalation and final cleanup. A separate rollback/forward-fix owner is still required for any future Migration. Current Recovery Commander status is **NOT_CONFIGURED**.

## Stop conditions

Stop on missing/stale authorization, absent commander, unknown/charged capacity, active-Production mutation, non-isolated target, reused credential, traffic exposure, TLS/identity failure, restore point older than 15 minutes, missing provider continuity evidence, RTO over 60 minutes, ledger/catalog/security mismatch, sensitive output, cleanup failure, or any request for SQL/Migration/deploy/configuration change.

## Next owner decision

Before any external operation, provide only non-secret console facts:

- whether one isolated recovery target can be created without overwriting Production;
- current available Branch/restore capacity;
- whether creation incurs a charge or requires upgrade;
- the proposed human Recovery Commander.

Do not provide account/project/branch/endpoint IDs, hostnames, URLs, credentials or payment information. After those facts are recorded, request a separate exact authorization for the one-time operation described above.
