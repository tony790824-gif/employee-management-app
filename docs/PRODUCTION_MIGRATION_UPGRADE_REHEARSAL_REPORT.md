# Sprint 51 Isolated Migration Upgrade Rehearsal Report

Status: **COMPLETE FOR DISPOSABLE NON-PRODUCTION REHEARSAL / PRODUCTION REMAINS NO-GO**

Date: 2026-08-10

## Scope and safety boundary

The rehearsal used two newly initialized, loopback-only PostgreSQL 18.4 clusters under the local temporary directory. Each cluster used a random local credential held only in process memory, applied Migrations only to its disposable database, and was deleted after the run.

The runner refuses to start when any configured Production database input is present. It did not load a project environment file, connect to Production, use Production data or credentials, deploy, run an external platform operation, or modify any persistent database.

The exact baseline is `0001`-`0008`. The only upgrade allowlist is:

`0009 -> 0011 -> 0012 -> 0013 -> 0014 -> 0015 -> 0016 -> 0017 -> 0018 -> 0019 -> 0020 -> 0021 -> 0022`

`0010` is rejected before execution. The runner resolves exact Git-tracked filenames and verifies committed SHA-256 values; it never scans a Migration directory to decide what to run.

## Baseline and upgrade result

Both runs independently rebuilt `0001`-`0008`, verified the eight-row ledger, and produced the same normalized baseline catalog SHA-256:

`ff59824a1f3eedc97ed4bd562dc78a75dbdc454a92297137650b7f17e6c3753f`

Each upgrade ran as one version per transaction. Before each transaction the exact predecessor ledger and version-specific precondition were checked. Postconditions, the updated ledger, current-session lock evidence and required objects were checked before commit. A failed check rolls back and stops the chain.

| Version | Run A duration (ms) | Run B duration (ms) | Result |
| --- | ---: | ---: | --- |
| `0009` | 5.952 | 5.931 | PASS |
| `0011` | 1.885 | 2.039 | PASS |
| `0012` | 5.662 | 5.135 | PASS |
| `0013` | 12.897 | 11.683 | PASS |
| `0014` | 8.405 | 7.949 | PASS |
| `0015` | 2.156 | 2.169 | PASS |
| `0016` | 13.657 | 13.522 | PASS |
| `0017` | 1.948 | 2.253 | PASS |
| `0018` | 3.404 | 3.806 | PASS |
| `0019` | 7.832 | 8.502 | PASS |
| `0020` | 7.098 | 6.293 | PASS |
| `0021` | 3.647 | 3.133 | PASS |
| `0022` | 12.095 | 11.207 | PASS |

These timings describe empty disposable PostgreSQL 18 databases only. They are not Production lock, capacity, data-volume or maintenance-window evidence.

The normalized final catalog SHA-256 was identical in both runs:

`a610a3d337fd623a8a055a084186b0985fffb75212569acb4f381d02c4f824fb`

Both final catalogs matched the committed Sprint 48 expected catalog. Both final ledgers contained exactly 21 versions and excluded `0010`.

## Failure and guard coverage

- wrong order: rejected before database execution;
- skipped or extra version: rejected;
- `0010`: rejected;
- checksum mismatch: rejected against the Git-tracked inventory;
- missing predecessor/dependency: rejected, including the ordered dependencies for `0018` and `0020`;
- failed precondition: current transaction rolled back and the next version did not run;
- failed postcondition: current transaction rolled back and the next version did not run;
- SQL transaction failure: rolled back; the ledger and `0009` object state remained at baseline;
- blocking lock observed in the migration session: fail-closed;
- automatic down/rollback: rejected because all 13 Production remediation records are conditionally reversible, not unconditionally authorized.

The transaction and forced-postcondition probes were executed against the real disposable database before the successful chain. Both preserved the `0001`-`0008` ledger and left no `0009` object behind.

## Determinism and evidence

- Run A/B deterministic summaries: byte-identical;
- deterministic summary SHA-256: `c9063a0a55b251b4945db9a2c8f71ae08f42c4fcdf4aab18c275b9d81d318b66`;
- sanitized evidence: `docs/PRODUCTION_MIGRATION_UPGRADE_REHEARSAL_EVIDENCE.json`;
- sanitized evidence SHA-256: `0192da56bc53ac60f882463a231e1edcac74980477b40a3f65c67043e91eb359`;
- committed expected baseline SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.

Evidence excludes passwords, connection strings, hostnames, ports, database names, local paths, tokens, endpoints, Production identifiers and business rows.

## Production decision

This result proves only that the exact reviewed chain can upgrade an empty `0001`-`0008` disposable PostgreSQL 18 database deterministically. It does not prove Production row compatibility, lock duration, traffic compatibility, backup/Restore readiness, RPO/RTO, or authorization.

Production Readiness remains **70% / NOT READY**. Gate A remains **DEFER**. Production Provisioning remains **NO-GO**. Production Migration execution remains **BLOCKED / NOT AUTHORIZED**.
