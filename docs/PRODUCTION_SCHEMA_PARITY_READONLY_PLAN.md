# Production Schema Parity Read-only Plan

Status: **EXPECTED CATALOG BASELINE PASS / PRODUCTION EVIDENCE BLOCKED**

Date: 2026-08-09

Production readiness: **70% / NOT READY**

Gate A: **DEFER**

Production Provisioning: **NO-GO**

## Purpose and boundary

This plan prepares a later, separately authorized metadata-only comparison between the Git-tracked PostgreSQL schema and Production. Sprint 48 materialized the expected side in a local disposable PostgreSQL 18 environment; it did not connect to Production, deploy, configure an external platform, purchase `bankeban.com`, or handle a Production credential.

The future operator must use the existing dedicated Production read-only role and the exact authorization procedure in `docs/PRODUCTION_READONLY_ACCESS.md`. Staging evidence cannot satisfy this plan.

## Expected Migration ledger

`database/production-schema-parity.expected.json` defines the required ledger slots `0001` through `0022`. It records SHA-256 checksums only for Git-tracked `.up.sql` sources.

- Tracked and checksum-verified: `0001`–`0009`, `0011`–`0022` (21 versions).
- `0010`: **INTENTIONAL_UNAPPROVED_GAP**. Git object/history inspection found no tracked `0010` Migration, rename, deletion or squash; committed operating records consistently exclude it as unapproved/unapplied. Untracked local files remain non-authoritative.
- Required Extension derived from tracked sources: `pgcrypto`. Any further Extension requirement depends on resolving `0010` and cannot be assumed.
- The expected ledger therefore contains 21 entries across slots `0001`-`0022`; `0010` is not an expected ledger row. No checksum is invented for the gap, and no existing Migration is modified.
- The catalog-resolved expected schema is **PASS**. `database/production-expected-catalog-baseline.json` was generated twice from empty disposable databases and both canonical outputs produced SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.

## Comparison scope

The later authorized comparison covers metadata only:

1. database and read-only role identity, role attributes and memberships;
2. `public.schema_migrations` version, name and checksum;
3. `public` and `app_private` schemas and ownership/ACL metadata;
4. tables, views, materialized views and sequences;
5. columns, types, nullability, defaults and identity metadata;
6. constraints and normalized catalog definitions;
7. indexes, uniqueness/primary flags, validity and definitions;
8. functions/procedures, identity signatures, kind, owner, security-definer flag, volatility, ACL and Extension classification—but never Function bodies;
9. table/schema/sequence/Function ownership and ACL metadata;
10. row-level security flags and policy metadata;
11. required and unexpected Extensions, versions, schemas and owners.

No business-table row may be read. `public.schema_migrations` is the only non-catalog relation allowed.

Expected object metadata must be generated from the 21 reviewed Migration sources in a disposable, isolated non-Production PostgreSQL instance matching the approved Production major version. Normalize and hash that catalog output before any Production comparison. Neither Staging state nor hand-authored object guesses may replace this expected artifact.

## Read-only query plan

`database/operator/production-schema-parity.readonly.sql` is a future manual evidence query, not an application script. It:

- requires an exact confirmation phrase, expected database and dedicated role;
- verifies `current_database()`, `current_user`, `session_user` and `transaction_read_only=on` before returning metadata;
- verifies dangerous role attributes are false;
- contains only `SELECT`/`WITH` statements after psql control commands;
- reads only `pg_catalog`, `information_schema` and `public.schema_migrations`;
- excludes Function bodies, business rows and mutation-capable calls.

`database/production-schema-parity-plan.mjs` statically validates the tracked inventory, query file, committed baseline shape and SHA-256 without accepting a database URL or opening a network connection. Its Repository dry-run now passes the expected-side inventory/query/baseline gates. That PASS does not inspect or imply Production parity.

`database/materialize-expected-catalog.mjs` is the separately confirmation-gated local generator. It rejects Production database inputs, verifies a loopback-only PostgreSQL 18 Temp cluster before any Migration, applies the exact approved inventory twice, compares byte-identical canonical output, writes the artifact/hash and destroys the cluster.

## Mandatory stop conditions

Stop immediately and record `BLOCKED` when any condition occurs:

- target host/database identity cannot be proven through the separately authorized runbook;
- current/session role does not match the dedicated Production read-only role;
- role has SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, unsafe inheritance, membership or ownership;
- an expected Migration is missing, an unknown version is present, or name/checksum differs;
- any schema object, Function signature, owner, ACL, RLS flag/policy or required Extension differs;
- an unexpected Extension is present;
- any query cannot be proven SELECT-only and metadata-only;
- evidence is incomplete or contains a forbidden sensitive field.

No mismatch authorizes a repair, Migration, grant, revoke or other Production change.

## Evidence contract

Future sanitized evidence must conform to `docs/PRODUCTION_SCHEMA_PARITY_EVIDENCE.schema.json` and contain:

- timestamp and compared Git commit SHA;
- expected and observed Migration ranges;
- checksum, schema, Function, ACL, RLS/policy and Extension results;
- final `PASS`, `PARTIAL` or `BLOCKED` status and non-sensitive stop reasons.

It must not contain credentials, connection strings, hostnames, endpoint/project/branch IDs, passwords, Secrets, Tokens, Cookies or Authorization values. PASS is allowed only when every required result is PASS, the evidence is complete, and no stop condition exists.

## Future authorization sequence

1. Preserve the committed expected artifact/hash and re-materialize it whenever an approved Migration changes.
2. Make the dedicated Production read-only credential available only through an approved process environment; never commit or paste it.
3. Obtain exact human authorization for a Production metadata-only run.
4. Verify target identity and role safety before catalog output.
5. Capture sanitized evidence, compare all sections against the committed baseline and hash the evidence artifact.
6. Stop on any difference. Any remediation requires a separate plan and authorization.
