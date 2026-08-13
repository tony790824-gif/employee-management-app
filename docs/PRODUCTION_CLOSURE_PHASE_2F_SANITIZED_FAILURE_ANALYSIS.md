# Production Closure Phase 2F - `SANITIZED_FAILURE` root-cause analysis

Date: 2026-08-13

Status: **PARTIALLY_PROVEN / REPOSITORY DEFECT FIXED / LIVE RESULT UNKNOWN**

Sprint numbering remains capped at Sprint 65. Phase 2E authorization is consumed and not reusable. Phase 2F made zero Production connections and zero Production mutations.

## Evidence finding

The expected Phase 2E files do not exist in the workspace after the authorized attempt:

- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json`
- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256`

Therefore no companion hash, JSON Schema result, generated timestamp, commit provenance, ledger result, non-ACL result or ACL result exists to validate. This proves only that the successful Evidence write boundary was not reached. It does not prove a structural or ACL mismatch and cannot identify which earlier stage failed.

## Proven root cause and limit

Commit `05e51635228124f7fa22ab4532827e70b2a1c599` caught every failure from configuration, provenance, artifact loading, CA loading, connection, identity, role boundary, transaction, ledger, collectors, normalization, comparison, sanitization, write and cleanup, then emitted the same `SANITIZED_FAILURE` string. The original error was intentionally not printed, but no safe stage or code was retained.

This is a proven observability implementation defect. The underlying Production failure stage is **UNKNOWN** and cannot be recovered without prohibited re-execution. PostgreSQL 18.4 disposable testing also disproved the suspected `MEMBER WITH ADMIN OPTION` query as a general PostgreSQL 18 compatibility failure.

## Repository correction

The comparator now tracks a fixed allowlisted stage and a sanitized error code. Unknown messages are never persisted; only an approved internal code, safe external code token, or generic stage failure code is retained. A failure may write only:

- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_FAILURE.json`
- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_FAILURE.sha256`

The failure contract records no target identifiers, URL, hostname, credential, raw principal, raw error message or business data. It records stage, safe code, connection-attempt count, retry count, cleanup result and unchanged BLOCKED Gates. If diagnostic persistence itself fails, stderr still contains only the safe stage/code and reports that the artifact was not written.

Covered stages are pre-connect guard, query allowlist, repository/artifact provenance, CA/TLS configuration and connection, identity, role boundary, READ ONLY transaction, ledger, non-ACL collection, normalization, ACL semantic collection, fingerprint comparison, cleanup, Evidence sanitization and Evidence write/hash.

## Gate decision

`STRUCTURAL_STARTING_BASELINE` remains **BLOCKED**. `FRESH_LEDGER_AND_CHECKSUM` remains independently **BLOCKED**. The authoritative matrix remains **9 PASS / 13 non-PASS**, Production remains **70% / NOT READY**, Gate A **DEFER**, Provisioning and Migration Technical Readiness **NO-GO**, and Migration authorization **NOT_GRANTED**.

No new Production authorization is implied. A future one-time read-only request can be considered only as a new, explicit Owner decision after reviewing this corrected diagnostic contract and its possible Neon wake/usage side effects.
