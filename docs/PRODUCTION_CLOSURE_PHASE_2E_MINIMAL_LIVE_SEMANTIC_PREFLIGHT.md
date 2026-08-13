# Production Closure Phase 2E - Minimal Live Semantic Evidence Preflight

Date: 2026-08-13

Status: **READY FOR A SEPARATE OWNER DECISION; NO LIVE EXECUTION AUTHORIZED**

Sprint numbering remains capped at Sprint 65. This Preflight used Repository/local mocks only: Production connections `0`, Production mutations `0`, Neon wake/unarchive `0`.

## Audited future command

- Command: `pnpm run db:parity:production-starting-baseline-semantic`
- Script: `database/compare-production-starting-baseline-semantic.mjs`
- Dedicated confirmation: `COMPARE_BANKE_PRODUCTION_STARTING_BASELINE_SEMANTICS`
- ACL model: `bankeban-acl-semantics-v1`
- Expected target: database `neondb`, role `banke_production_readonly`, PostgreSQL major 18.
- Process-only inputs: `DATABASE_READONLY_URL`, `BANK_PRODUCTION_CA_BUNDLE`, `BANK_PRODUCTION_DATABASE_NAME=neondb`, `BANK_PRODUCTION_READONLY_ROLE=banke_production_readonly`, `BANK_ENV=production`, `BANK_PRODUCTION_PARITY_CONFIRMATION`, and `BANK_PRODUCTION_EVIDENCE_COMMIT_SHA` equal to the clean checked-out HEAD.

The command is separate from `db:parity:production` and rejects that command's token. It creates one `pg.Client`, makes one `connect()` attempt, has no pool/retry/reconnect/subprocess connection, and closes the session in `finally`.

## Repository and artifact provenance

Before connecting, the command requires branch `main`, local `HEAD == origin/main`, no tracked changes, an explicit authorized commit equal to HEAD, and all comparator/model/baseline/Gate files Git-tracked. It validates:

- structural artifact SHA-256 `6f09dd605cd939fc6bb9de778a6690d93cc66764334722fd2afbf7d5d6e70076` and fingerprint `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e`;
- semantic ACL artifact SHA-256 `485097ac88f068cc46a73583ceff4ac6d64ad97e007c4ac20262fda0bf8394ec` and model `bankeban-acl-semantics-v1`;
- companion hashes, artifact contracts and exact applied sequence `0001`-`0008`.

No network fetch occurs inside the comparator. The operator must refresh `origin/main` before setting the authorized commit value.

## Identity, role and TLS boundary

The URL database/user and protected expected values must all equal the fixed target. Loopback targets and privileged-looking roles are rejected. Live SELECT checks require `current_database`, `current_user`, `session_user`, `transaction_read_only=on`, PostgreSQL 18, LOGIN/NOINHERIT, no dangerous attributes, no object ownership and no privilege-expanding outbound membership.

The CA PEM must be under the system temporary directory. Node TLS always supplies the trusted CA, `rejectUnauthorized=true`, and `servername=<actual connection hostname>`; URL `sslmode=require` is never treated as the effective verification mode and cannot override this configuration. Missing/invalid/outside-temp CA and hostname/certificate failures stop without retry.

## Exact read surface

Outside the evidence transaction, only two catalog-only SELECTs run: identity/version/read-only status, then role attributes/ownership/outbound membership. They are necessary before accepting the evidence transaction.

Inside `BEGIN TRANSACTION READ ONLY`, the command re-verifies `transaction_read_only=on`, then reads:

1. `public.schema_migrations`: `version`, `name`, `checksum` only;
2. reviewed `pg_catalog` structural metadata for namespaces, relations, columns, types/defaults, constraints, indexes, Functions, languages, dependencies, Extensions, triggers, sequences and policies;
3. reviewed ACL metadata through `pg_namespace`, `pg_class`, `pg_proc`, `pg_depend`, `pg_extension`, `pg_default_acl`, `pg_auth_members`, `pg_roles`, `acldefault` and `aclexplode`.

Function/view source text is hashed within PostgreSQL and not persisted. No employee, schedule, attendance, leave, notification, announcement, payroll, commission or other business row can be selected by the static allowlist. No dynamic relation input exists.

The exact ledger must be ordered `0001`-`0008` with matching names/checksums. Missing, duplicate, reordered or unknown versions and `0009`, `0010`, or `0011`-`0022` stop before structural/ACL collection.

## Minimum evidence and write boundary

Raw ACL strings are not returned to or persisted by Node. PostgreSQL expands ACL defaults server-side; raw principal names exist only transiently until categorized. Persisted ACL evidence is limited to canonical object keys, principal categories, effective privileges, grant-option state, NULL/default state, reader membership semantics, Extension classification, counts, differences and fingerprints.

Non-ACL evidence separately records corrected `pg_catalog` section counts, fingerprints and object summaries. The prior permission-filtered `information_schema.columns` collector is not used. A future authorized run may overwrite only:

- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.json`
- `docs/PRODUCTION_0001_0008_LIVE_SEMANTIC_COMPARISON_EVIDENCE.sha256`

It cannot overwrite Phase 1, immutable Phase 2B, Phase 2D or final `0022` evidence. Sanitization rejects URLs, credentials, hostnames, endpoints, secrets, tokens, raw ACL/principal fields and connection identifiers.

## Future side effects and authorization boundary

One future read may cause Neon Branch unarchive, compute wake, compute/network/I/O/cache usage, one TLS/database session, short catalog `ACCESS SHARE` locks, provider authentication/audit/monitoring logs, and overwrite of the two local sanitized files. It may consume Free-plan resources. No automatic retry exists.

A future Owner authorization must cover exactly those effects and one connection attempt. It must exclude Migration, repair, DDL/DML, role/ACL mutation, Restore, deploy, configuration, traffic, billing changes and any Owner/Admin/Migrator/API/Push/Staging credential.

## Gate rule

`REPOSITORY_0001_0008_STRUCTURAL_BASELINE=PASS` **and** `LIVE_PRODUCTION_STRUCTURAL_NON_ACL_MATCH=PASS` **and** `LIVE_PRODUCTION_ACL_SEMANTIC_MATCH=PASS` is required for `STRUCTURAL_STARTING_BASELINE=PASS`.

`FRESH_LEDGER_AND_CHECKSUM` for final `0022` parity remains independently BLOCKED. A starting-baseline PASS never implies final parity or Migration authorization.

Current state remains 9 PASS / 13 non-PASS, Production 70% / NOT READY, Gate A DEFER, Provisioning and Migration Technical Readiness NO-GO, Migration authorization NOT_GRANTED.
