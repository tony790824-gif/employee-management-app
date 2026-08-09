# Production Evidence Report - Sprint 33D

## Sprint 34 final human Neon evidence - 2026-08-09

- Executed by: **authorized human operator** against Commit `e58932032a788d6928c00457e3ffa661684ca580`
- Codex Production connection: **none**
- Provision: **PASS / COMMIT**
- Verify: **PASS / COMMIT**
- Neon Production read-only evidence: **PASS**
- Production database evidence: **PARTIAL** — the least-privilege reader, TLS transaction boundary, ACL classification and ledger `0001`-`0008` are proven; current application-schema parity through later Staging-only features, capacity, backup and restore are not proven.
- Overall Production evidence: **BLOCKED** by remaining Netlify, Render, Auth0, DNS/TLS, monitoring and recovery evidence.
- Production readiness: **70% / NOT READY**

The human operator confirmed `neondb`, `banke_production_readonly`, `transaction_read_only=on`, no dangerous role attributes, `NOINHERIT`, connection limit 3, bounded role timeouts, CONNECT/USAGE without CREATE, ledger SELECT, zero business-table SELECT, zero table writes and zero sequence writes. The ledger contains exactly the eight applied Production foundation Migrations `0001` through `0008`; no Migration was executed during this evidence closure.

Application Function evidence is **PASS**: all 11 expected Functions exist, all are owned by `neondb_owner`, application PUBLIC/reader EXECUTE is zero, and `banke_api_production` has exactly the four explicit approved entry points with no unapproved Function. The 37 `public.pgcrypto` Functions owned by `cloud_admin` remain `ACCEPTED_PLATFORM_INFORMATION`: their PUBLIC/reader effective EXECUTE is reported truthfully, but they are not Bankeban grants and were not revoked, altered, re-owned or dropped.

The sanitized human attestation is appended to `PRODUCTION_EVIDENCE_HASHES.json` as `manual.neon.production.readonly`; its record SHA-256 is `c5e59bded74a96d0829bf56087a49ef0f790d82f5e20b1f4c9f9a62ec85afb61` and the updated 14-entry manifest SHA-256 is `54d9a2f9a65461b1e7c6c20c050ff45007df9a6c543386aeef6045447f9ca8b1`. The original 13 Sprint 33D hashes and timestamp remain unchanged.

## Sprint 34 classified Function ACL evidence - 2026-08-09

- Read-only catalog diagnostic: **PASS / SAFE METADATA COLLECTED**
- Bankeban application set: **11 / owner `neondb_owner` / PUBLIC 0 / reader 0**
- Runtime application allowlist: **4 effective and 4 explicit / no unapproved application Function**
- Platform Extension set: **37 `public.pgcrypto` Functions / owner `cloud_admin` / inherited through PUBLIC**
- pgcrypto mutation: **NOT AUTHORIZED / NOT PERFORMED**
- Corrected Provision/Verify: **REPOSITORY PASS PENDING FULL GATES / HUMAN RE-RUN REQUIRED**
- Production evidence: **BLOCKED / NOT PASS**

The former global `function_execute_privilege_count = 37` is not represented as zero. It is now split into strict application metrics and truthful platform Extension information. Application PUBLIC or reader EXECUTE above zero, an owner mismatch, a missing/extra application Function, a non-approved runtime grant, or an unreviewed Extension tuple remains a hard failure. The reviewed pgcrypto PUBLIC ACL alone is an accepted managed-platform limitation because it provides no Bankeban Function or business-table access path.

## Sprint 34 diagnostic identity update - 2026-08-09

- Manual diagnostic result: **BLOCKED / CONFIRMATION TOKEN MISMATCH**
- Database/login/TLS supplied by operator: `neondb` / `banke_production_readonly` / required
- Metadata returned: **none**
- Provisioning or Production mutation: **not performed**
- Repository fix: confirmation token aligned and `current_user` plus `session_user` now independently fail closed against the exact reader login
- Production evidence: **BLOCKED / NOT PASS**

The failed condition was the script's old `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_ACL` literal versus the operator's intended `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER`; no Neon session-identity difference is established by this run. A new manual diagnostic is required before the Function owner blocker can be classified.

## Sprint 34 Function owner diagnostic update - 2026-08-09

- Human provision re-run: **BLOCKED / FAIL-CLOSED BEFORE TRANSACTION**
- Exact roles: `banke_production_readonly`, `neondb_owner`, and `banke_api_production`
- Blocker: at least one PUBLIC-executable Function in `public` or `app_private` is not owned by `neondb_owner`
- PUBLIC ACL mutation, corrected provisioning, and verification: **NOT PERFORMED**
- Business data, schema, Migration, and application runtime: **NOT MODIFIED BY THIS ATTEMPT**
- Repository response: **MANUAL READ-ONLY CATALOG DIAGNOSTIC ADDED**
- Neon Production evidence: **BLOCKED / NOT PASS**

Migrations 0001-0008 define 11 Bankeban Functions expected to be owned by `neondb_owner`; exactly four are approved runtime entry points. Migration 0001 also requests `pgcrypto`, so a Neon/platform-owned Extension Function is a plausible cause, but it is not treated as confirmed Production evidence. The manual diagnostic reads only `pg_catalog` metadata and must identify the exact schema, signature, owner, Extension relationship, PUBLIC/runtime/reader EXECUTE state before any revised provisioning is considered.

Historical requirement at that point was a global `function_execute_privilege_count = 0`. The completed catalog diagnostic later proved that metric mixed Bankeban Functions with the managed `public.pgcrypto` Extension. The current equivalent security gate requires Bankeban application PUBLIC/reader EXECUTE to be zero, runtime execution to be exactly the four explicit entry points, and the reviewed pgcrypto tuple to remain informational and unmodified. No Production status is promoted without the pending corrected human Provision/Verify run.

## Sprint 34 Function ACL verification update - 2026-08-08

- Production connection: **AUTHORIZED READ-ONLY VERIFY / TLS PASS**
- Database and role: **PASS** — `neondb` / `banke_production_readonly`
- Read-only role attributes, role defaults, CONNECT/schema boundaries and Migration ledger: **PASS**
- Business-table SELECT, table writes and sequence writes: **PASS / ZERO**
- Function execution: **BLOCKED** — 37 effective `EXECUTE` privileges remain through PostgreSQL's default `PUBLIC` Function ACL
- Migration ledger: **READABLE / 0001 THROUGH 0008**
- Business data, schema, Migration and application runtime: **NOT MODIFIED**
- Neon Production evidence: **BLOCKED / NOT PASS**

The direct evidence-role Function revoke completed, but PostgreSQL adds direct, membership and `PUBLIC` grants; a role-specific revoke is not a deny. Repository tests reproduce that ACL behavior. The corrected manual script now requires and preserves the existing runtime's exact four-function direct allowlist, and requires the approved object owner to own every currently PUBLIC-executable Function, before transactionally removing current/future `PUBLIC EXECUTE`. It rolls back unless PUBLIC and the reader reach zero and the runtime allowlist remains unchanged. No corrected script was run against Production during this repository update.

The Sprint 33D evidence timestamp and hash manifest below remain unchanged. This real verification result is not promoted to PASS and does not fabricate a new evidence hash.

## Sprint 34 Neon compatibility update - 2026-08-08

- Production connection: **AUTHORIZED READ-ONLY PREFLIGHT ATTEMPT**
- Provisioning result: **BLOCKED / SCRIPT COMPATIBILITY DEFECT**
- Failure: the first mutating statement attempted `ALTER ROLE ... NOSUPERUSER`, which Neon cannot authorize without a true PostgreSQL superuser.
- Subsequent grants/revokes/default privileges: **NOT EXECUTED** because `ON_ERROR_STOP` stopped at the first mutation.
- Business data, schema, Migration and evidence status: **UNCHANGED**
- Corrected script: **AUTOMATED TESTS PASS / PENDING HUMAN RE-RUN**
- Neon Production evidence: **BLOCKED / NOT PASS**

This attempt is operational evidence of a compatibility defect, not Neon schema evidence. It does not replace or regenerate the Sprint 33D evidence timestamp or hash manifest.

## Sprint 34 provisioning preflight - 2026-08-08 (historical)

- Repository least-privilege provisioning controls: **PASS**
- Neon Production read-only credential: **BLOCKED**
- Netlify dedicated read-only evidence identity: **BLOCKED**
- Render dedicated read-only evidence identity: **BLOCKED**
- Auth0 exact-scope read-only M2M token: **BLOCKED**
- Evidence re-run: **NOT PERFORMED**
- Production request, connection, mutation or secret export: **none**

The protected operator environment did not contain the required access. No external provider or database request was made. The evidence timestamp below and manifest SHA-256 `f1a48ff74795c58f2120cc323598b905caf20c89b3503c1828b5124030b179a1` remain the last actual Sprint 33D collection and were not regenerated or reclassified.

Date: 2026-08-04

Baseline: `80b4bd6d8e53c72e5101cd66b363a10dc5b20cb4`

Evidence timestamp: `2026-08-04T11:20:11.116Z`

Mode: **read-only / fail-closed**

Sprint status: **PARTIAL - EXTERNAL EVIDENCE BLOCKED**

Production readiness: **70% - NOT READY**

Production mutation: **none**

## Result

The repository evidence collector and its security tests pass. The Sprint 33D baseline lacked approved Production frontend/API origins, a distinct database reader and protected Netlify/Render/Auth0 Management authorization. Sprint 34 has since closed only the Neon reader item through human evidence; the other unavailable evidence remains `BLOCKED`. `NOT AUTHORIZED` is reserved for a supplied read-only credential that the provider explicitly rejects with HTTP 401/403.

No Production deploy, Migration, database connection/write, Auth0 change, environment-variable change, platform-resource change, traffic change, restore, user creation, or real notification occurred.

## Platform evidence

| Platform | Status | Evidence |
|---|---|---|
| Repository validation | PASS | Environment isolation, ignored real environment files, CI no-deploy policy, security-header source and validation variable names passed. |
| Netlify Production public endpoint | BLOCKED | No approved Production frontend origin is configured. Site/domain/deploy/rollback metadata was not guessed. |
| Netlify Production management | BLOCKED | No protected read-only authorization is available. No Netlify Management API request was sent. |
| Render Production public endpoint | BLOCKED | No approved Production API origin is configured. Health/readiness and runtime metadata were not guessed. |
| Render Production management | BLOCKED | No protected read-only authorization is available. No Render Management API request was sent. |
| Neon Production read-only access | PASS | Human Provision/Verify proved the dedicated reader, read-only boundary, ledger `0001`-`0008`, zero business reads/writes and strict application Function ACLs. Codex did not connect. |
| Production database feature parity / recovery | PARTIAL | Foundation metadata is proven, but current feature-schema parity, capacity, backup/PITR and isolated restore evidence remain open. |
| Auth0 Production public metadata | BLOCKED | Approved Production issuer/JWKS/audience are not configured. |
| Auth0 Production management | BLOCKED | No protected Management read-only authorization is available. Callback/logout/web-origin allowlists were not inferred from Staging. |
| DNS / TLS | BLOCKED | Approved Production frontend/API origins are required before DNS/TLS evidence can be collected. |
| Monitoring / operations | BLOCKED | Repository telemetry/runbooks exist; external uptime, alert routing and database monitoring evidence is unavailable. |
| Backup / restore / RPO / RTO | BLOCKED | Targets are documented, but an independent backup and timed isolated restore are not evidenced. |
| Environment isolation | BLOCKED externally | Repository boundary passes; complete Production endpoint/Auth0/platform evidence is unavailable. |

## Evidence hash manifest

Algorithm: **SHA-256**

| Evidence ID | SHA-256 |
|---|---|
| `public.repository.gate` | `f302af8daa43314d441eb5feb15ec5596f4fb00a5a89505e4144fb8794168bb3` |
| `public.frontend.site` | `7d0977ca1c3290284c0bd3881582c2cebeab0c405a0b630f1425ba096a0b268a` |
| `public.api.service` | `6bdca5fb64df85bdde79cf906a958ebda5920332342c4602898d510d11bdd6d7` |
| `public.database.schema` | `28fd42304e3b89605f9f15d6ce31cc61f07f998f31cbbd6502ac190e3867a886` |
| `public.auth0.public` | `882f917ecbc28ff473123e9f494e61d1bec10be0077a3fd2568a527bb7ca6c3b` |
| `public.auth0.management` | `01afb6f1fa1420453509d33869f00cb26a245269774b2fda2dc1964f3a5a6958` |
| `public.network.dns_tls` | `71a83fde927abc50b8950745d9af6b1ddb4c3d80197b21cdb81fdc2bc2fc3301` |
| `public.operations.monitoring` | `683c5cda6fdacb0db61e1af10f186796d99dc6a4c83706182a92f2de61995473` |
| `public.operations.recovery` | `dbd2c373eb5eac968f6e55de7799cdbdd32c9c66b44a338858826c12ffd5a649` |
| `public.environment.isolation` | `b613323c19e262a3dc79f192ef25a93096f08d0424adbcf5c7b78a4b22c73c3f` |
| `netlify.production` | `090cd819a4348d3b8ae64d5083677e066692c0c1af31e02c943ac5b5460c042c` |
| `render.production` | `5f6f5821d2e2e48c1203787e9dc891227c62b7fd253116b83adf468d3ef3c38e` |
| `auth0.production.management` | `30ae04418039235a87c6569dfacad0269f84f9c466c3eb1ad7026d095747132c` |
| `manual.neon.production.readonly` | `c5e59bded74a96d0829bf56087a49ef0f790d82f5e20b1f4c9f9a62ec85afb61` |

Manifest SHA-256: `54d9a2f9a65461b1e7c6c20c050ff45007df9a6c543386aeef6045447f9ca8b1`

The hashes cover canonical sanitized evidence records. They do not hash, store, export, or reveal access tokens, cookies, database URLs, private keys, raw resource IDs, environment values, or personal data.

## Required authorization to continue

1. Provision protected read-only Netlify, Render and Auth0 Management access plus the approved Production resource identifiers. Do not send values through chat or commit them.
2. Preserve the verified Neon reader and classified Function ACL boundary. Do not rerun provisioning or alter pgcrypto unless a separately reviewed database change requires new evidence.
3. Configure the approved credential-free Production frontend/API origins and public Auth0 metadata in the protected operator environment.
4. Re-run `pnpm production:evidence:collect`; retain `BLOCKED` until access is supplied and the evidence is directly verified. A supplied credential rejected with 401/403 must be recorded as `NOT AUTHORIZED`.
