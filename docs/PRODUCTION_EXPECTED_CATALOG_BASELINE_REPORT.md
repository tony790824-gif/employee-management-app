# Production Expected Catalog Baseline Report

Status: **PASS — EXPECTED BASELINE MATERIALIZED / PRODUCTION COMPARISON NOT EXECUTED**

Date: 2026-08-10

Production readiness: **70% / NOT READY**

Gate A: **DEFER**

Production Provisioning: **NO-GO**

## Outcome

Sprint 48 created a disposable, isolated, non-Production PostgreSQL 18 cluster on the local machine. Two independent empty databases were created in that cluster. Each database applied only the 21 Git-tracked, checksum-approved Migrations in this order:

`0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`, `0009`, `0011`, `0012`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`, `0019`, `0020`, `0021`, `0022`.

The untracked `0010_commission_rules` files were not opened, checksummed, staged or executed. `0010` is absent from both resulting Migration ledgers.

## Fail-closed identity boundary

The materializer requires the exact `MATERIALIZE_BANKE_DISPOSABLE_BASELINE` confirmation and refuses to run when any Production database URL/host variable is present. Before the first Migration in each empty database it verifies:

- database name starts with the disposable-only prefix;
- current and session roles are the dedicated local baseline owner;
- server address is IPv4/IPv6 loopback only;
- `listen_addresses` is exactly `127.0.0.1`;
- PostgreSQL data directory is below the newly created operating-system Temp root;
- PostgreSQL major version is 18.

The cluster used a fresh random SCRAM credential for loopback TCP connections. Its short-lived password file was removed immediately after `initdb`; the value was never logged or written to the Repository. The cluster accepted no external URL or credential, and its Temp data directory was deleted after the evidence was generated.

## Normalization and deterministic hash

The baseline contains only catalog metadata and `public.schema_migrations`. It includes schemas, relations, columns, constraints, indexes, Functions, triggers, sequences, RLS policies, Extensions, ownership/ACL metadata and the 21-row Migration ledger. It contains no business rows, object OIDs, applied timestamps, database identity, hostname, port, local path or credential.

Migration-owner names are normalized to `$MIGRATION_OWNER`, arrays and object keys are deterministically sorted, and unstable runtime fields are omitted. Both independent rebuilds produced byte-identical canonical JSON and the same SHA-256 hash.

- Artifact: `database/production-expected-catalog-baseline.json`
- Hash record: `database/production-expected-catalog-baseline.sha256`
- SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`
- Reproducibility: **PASS**

## Catalog counts

| Category | Count |
|---|---:|
| Migration ledger | 21 |
| Schemas | 2 |
| Relations | 27 |
| Columns | 247 |
| Constraints | 396 |
| Indexes | 63 |
| Functions | 72 |
| Triggers | 17 |
| Sequences | 0 |
| RLS policies | 19 |
| Extensions | 2 |

PostgreSQL 18 represents `NOT NULL` metadata in `pg_constraint`, which is included in the constraint count. This schema uses UUID identifiers, so zero sequences is an expected observed result rather than missing evidence.

## Execution notes

Two earlier local startup probes stopped before any Migration: the first was blocked by the sandboxed Windows restricted-token behavior; the second exposed inherited Windows process handles. The final materializer uses an independent PostgreSQL log and detached standard handles. These local startup defects were corrected without altering a Migration.

No Production endpoint, Production credential, Production SQL, Production Migration, external database, deploy, DNS, Auth0, Render, Netlify or Neon resource was accessed or modified.

## Remaining gate

This PASS establishes only the expected catalog side of a future comparison. Production Migration-ledger parity and structural parity remain **BLOCKED / UNKNOWN** until a separately authorized metadata-only run uses the dedicated Production read-only role and compares sanitized Production catalog evidence against this committed hash.
