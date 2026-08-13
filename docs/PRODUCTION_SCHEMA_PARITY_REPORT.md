# Production Schema Parity Report

## Production Closure Phase 1 repository starting baseline - 2026-08-13

- Applied disposable sequence: exactly `0001`-`0008`; `0009`, `0010`, and `0011`-`0022` not applied.
- PostgreSQL: 18.4; independent rebuilds: 2; determinism: PASS; cleanup residuals: 0.
- Structural fingerprint A/B: `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e` / same.
- Artifact SHA-256: `6f09dd605cd939fc6bb9de778a6690d93cc66764334722fd2afbf7d5d6e70076`.
- Repository expected starting baseline: PASS. Live Production structural starting baseline: NOT_EVALUATED.
- Authoritative structural Gate remains BLOCKED; no Production connection or independent mismatch evidence exists.

## Sprint 65 current authorized evidence - 2026-08-13

- Source evidence SHA-256: `2b438c87081aa152a1cc7d53782e3e4d1b17bdf6693ae8c4497179cb0c8146ba`.
- Identity and TLS `verify-full`: PASS against protected expectations; literal observed names are intentionally omitted from the sanitized source.
- Ledger parity: BLOCKED; observed count/range 8/`0001`-`0008`, missing `0009` and `0011`-`0022`, unexpected NONE, checksum mismatch NONE.
- Structural parity: BLOCKED / NOT EVALUATED after ledger failure; no independent structural mismatch was observed.
- Exit code 2 reason: `MIGRATION_LEDGER_MISMATCH`.
- One-time read-only authorization consumed; no second connection, Migration, repair or Production mutation occurred during analysis.

## Sprint 49 authorized Production-side result - 2026-08-10

- Sprint evidence scope: **COMPLETE**; final parity status: **BLOCKED**.
- Identity/role boundary/TLS `verify-full`: **PASS / PASS / PASS**.
- Migration Ledger Parity: **BLOCKED**. Expected 21, observed 8 (`0001`-`0008`); missing `0009` and `0011`-`0022`; unexpected NONE; checksum mismatch NONE.
- Structural Catalog Parity: **BLOCKED / NOT EVALUATED**. The fail-closed comparator stopped before structural collection.
- Expected baseline SHA-256: `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
- Sanitized evidence SHA-256: `07673403458f4ae58c35d2a64a6c3fcdf698a7fe80fbf0e7773679cfa92f6d3a`.
- Production readiness remains 70% / NOT READY; Gate A DEFER; Production Provisioning NO-GO.
- No Migration, schema repair, write, grant/revoke, deploy or credential change occurred.

## Sprint 48 expected-side update - 2026-08-10

- Expected Migration ledger: **PASS** — 21 approved versions; `0010` intentionally absent.
- Expected structural catalog: **PASS** — two independent PostgreSQL 18 rebuilds; SHA-256 `28b2c33eb1ede2bee8433a9721c3e2d7779edd8b0bd80d616fdbc99e87f125df`.
- Current Production Migration ledger: **BLOCKED / UNKNOWN** — not queried in Sprint 48.
- Current Production structural parity: **BLOCKED / UNKNOWN** — not queried or compared in Sprint 48.
- Production connection/mutation: **NONE**.

Date: 2026-08-10

Sprint: 47 - Production Schema Parity Read-only Evidence Closure

Final parity status: **BLOCKED**

Production readiness: **70% / NOT READY**

Gate A: **DEFER**

Production Provisioning: **NO-GO**

## Executive result

Repository and Git-history evidence were closed safely, but current Production catalog evidence could not be collected. The current process and protected `.env.production` file do not provide `DATABASE_READONLY_URL` or `BANK_PRODUCTION_READONLY_ROLE`. Higher-privilege Migrator/API configuration names exist, but their values were not read, reused or invoked. Per the fail-closed gate, no Production connection was attempted.

This Sprint performed no Production SQL, write, Migration, resource operation, deployment, DNS/Auth0/Render/Netlify/Neon change, Secret rotation or traffic switch.

## Expected Schema source

- Baseline commit inspected: `ea399843aab83fd2e1157e406bb8ae5f49a48ce5`.
- Authoritative Migration source: Git-tracked `database/migrations/*.up.sql` and matching down files.
- Expected slots: `0001`-`0022`.
- Expected ledger rows: 21 (`0001`-`0009`, `0011`-`0022`).
- All 21 tracked up-file SHA-256 values match `database/production-schema-parity.expected.json`.
- Required Extension proven by tracked source: `pgcrypto`.
- Catalog-resolved expected Tables, Columns/types/nullability/defaults, keys/constraints, Indexes, Schemas, Functions/signatures, Triggers, RLS/policies and Extensions: **BLOCKED / NOT MATERIALIZED**. Sprint 47 prohibited executing Migrations, and no pre-existing reviewed expected catalog artifact exists. Static text inference is not accepted as structural parity evidence.

## 0010 final classification

Classification: **INTENTIONAL_UNAPPROVED_GAP / NOT AN EXPECTED MIGRATION LEDGER ROW**.

Evidence chain:

1. `git ls-files`, all-ref object inspection and path history contain no tracked `database/migrations/0010_*` file.
2. No rename, deletion or squash record for an `0010` Migration exists in Git history.
3. Committed Migration/runbook/acceptance documents repeatedly identify `0010` as untracked, unapproved, intentionally pending/excluded and unapplied.
4. Existing local untracked `0010_commission_rules` files were not used for baseline derivation, checksummed, staged or treated as evidence.
5. Historical Production evidence records ledger `0001`-`0008`, so it did not contain `0010` at that evidence time.
6. Historical Staging acceptance records explicitly say `0010` remained unapplied while later exact-version Staging Migrations were managed independently.

The classification closes the numbering question only. It does not prove current Production ledger or structural parity.

## Production Actual Schema source

Current-run source: **NONE / BLOCKED**.

Required identity preconditions were not available:

- `DATABASE_READONLY_URL`: absent from process and protected Production env file.
- `BANK_PRODUCTION_READONLY_ROLE`: absent from process and protected Production env file.
- current `current_user = banke_production_readonly`: not executed / not proven for this run.
- current `transaction_read_only = on`: not executed / not proven for this run.

Historical Sprint 34 evidence proved the dedicated role and read-only boundary at that time. It is retained as historical evidence only and cannot substitute for a current catalog capture.

## Migration ledger comparison

Current status: **BLOCKED / CURRENT LEDGER UNKNOWN**.

Historical evidence comparison:

- Expected ledger: 21 rows (`0001`-`0009`, `0011`-`0022`).
- Historically observed Production ledger: `0001`-`0008`.
- Historical missing expected versions: 13 (`0009`, `0011`-`0022`).
- Historical extra versions: 0 evidenced.
- Historical checksum mismatches among `0001`-`0008`: 0 evidenced.

These historical counts are not promoted to current PASS/FAIL because no current read-only query was executed.

## Structural schema comparison

Status: **BLOCKED**.

| Classification | Count | Reason |
|---|---:|---|
| MATCH | UNKNOWN | Neither a materialized expected catalog nor current Production catalog is available. |
| MISSING_IN_PRODUCTION | UNKNOWN | Historical ledger gaps do not prove exact missing structural objects. |
| EXTRA_IN_PRODUCTION | UNKNOWN | Current Production catalog was not queried. |
| DEFINITION_MISMATCH | UNKNOWN | No normalized definitions were compared. |
| UNKNOWN / BLOCKED | all required structural categories | Expected catalog baseline and current Production evidence are incomplete. |

Migration Ledger Parity and Schema Structural Parity remain separate. Neither can be marked PASS.

## Security boundary

- No Production connection or SQL was attempted after the credential gate failed.
- Owner, Migrator, API, Push and Admin credentials were not used as substitutes.
- No business data, hostname, connection string, account/project/branch/endpoint identifier, credential, Token or Secret was recorded.
- Repository query plan remains restricted to SELECT-only `pg_catalog`, `information_schema` and `public.schema_migrations` metadata.

## Remediation plan (not executed)

1. In a separately authorized Repository/local-only Sprint, materialize the 21 tracked Migrations in a disposable non-Production PostgreSQL instance and generate a normalized, hashed expected catalog artifact.
2. Through an approved secure process outside Git/chat, expose the existing dedicated Production read-only URL and exact role only to the inspection process.
3. Re-run identity/read-only checks before any metadata output; stop on mismatch.
4. Execute the reviewed catalog-only query, sanitize/hash evidence, and compare ledger and structural sections independently.
5. If drift exists, produce a separate remediation proposal only. Do not execute ALTER, Migration or privilege changes during evidence collection.
