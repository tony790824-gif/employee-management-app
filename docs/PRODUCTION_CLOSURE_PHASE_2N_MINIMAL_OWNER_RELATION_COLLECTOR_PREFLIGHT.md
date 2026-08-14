# Production Closure Phase 2N — Minimal Application Owner-Relation Collector Preflight

## Status and decision

- Scope: Repository/local/mock only. Sprint numbering remains capped at Sprint 65; Sprint 66 does not exist.
- Decision: **A — READY_FOR_MINIMAL_OWNER_RELATION_AUTHORIZATION**.
- Production connections / attempts: **0 / 0**.
- Production SQL / mutations / credentials / Neon wake: **NONE**.
- This decision means only that the future collector is technically reviewable for a new, explicit, single-use Owner authorization. It is not authorization and no command was executed.

## Implemented future command

- Command: `pnpm run db:parity:production-application-owner-relation`
- Confirmation: `COMPARE_BANKE_PRODUCTION_APPLICATION_OWNER_RELATION`
- Required process-only inputs: `DATABASE_READONLY_URL`, `BANK_PRODUCTION_CA_BUNDLE`, `BANK_PRODUCTION_DATABASE_NAME=neondb`, `BANK_PRODUCTION_READONLY_ROLE=banke_production_readonly`, `BANK_ENV=production`, the exact confirmation, and `BANK_PRODUCTION_EVIDENCE_COMMIT_SHA` equal to the future authorized clean commit.
- The command must not be run until the Owner grants a new one-time authorization covering the connection and provider side effects.

The implementation constructs one `pg.Client`, increments the attempt counter immediately before one `connect()`, has no Pool/reconnect/retry/subprocess connection, enforces authenticated TLS with `rejectUnauthorized=true` and hostname verification, and rejects loopback. It requires PostgreSQL 18, exact database/current/session reader identity, the existing no-dangerous-attribute/no-effective-outbound-membership/no-ownership reader boundary and `transaction_read_only=on`.

After those guards it starts exactly `BEGIN TRANSACTION READ ONLY`, rechecks read-only state, validates the exact ordered `0001`–`0008` ledger, collects only the reviewed catalog metadata, and always ends with `ROLLBACK`. The `finally` path rolls back when necessary and closes the client. The human wrapper remains responsible for clearing process-only secrets and deleting the temporary CA in its own `finally` block.

## Metadata and proof boundary

Allowed sources are restricted to `public.schema_migrations(version,name,checksum)` and reviewed PostgreSQL catalogs: `pg_database`, `pg_namespace`, `pg_class`, `pg_proc`, `pg_roles`, `pg_auth_members`, `pg_default_acl`, `aclexplode`, `pg_depend`, and `pg_extension`. Static query validation blocks application/business relations and mutation tokens. Business-row reads are **NONE**.

The collector reconstructs the current object relationship in transient process memory and compares it with the Phase 2M artifact:

- object-set fingerprint: `ce84209b37fe81c7ec93d211327f2e0f3cb4576a5966d48803dae6ddd2bf6200`;
- artifact SHA-256: `dd057fa39036cd71115c4420941c6e936172b749af587aae41b71b0c9b25a0cc`;
- required coverage: 65/65;
- owner-set count: exactly 1;
- unrelated ownership: 0;
- ambiguity: false.

The 65 objects remain database 1, `app_private` schema 1, relations 18, indexes 34, and application Functions 11. Schema `public`, 37 Extension Functions, two Extensions, system catalogs, and parent-owned columns/constraints/policies/triggers stay separately classified. An exclusion-count or owner-alias mismatch blocks the proof.

The candidate owner must have `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, and `rolbypassrls` all false. Outbound and effective outbound membership counts must be zero. A reviewed inbound relationship that creates a second category match blocks as ambiguous. PUBLIC OID zero can never become `EXPECTED_OWNER`.

The proof compares current transient OID relationships. A rename with the same OID/relationship remains classifiable. Drop/recreate with a new OID receives no inherited classification and must prove all 65 relationships again. Raw OIDs and principal names never enter persisted Evidence.

## ACL semantic separation

The collector requires the exact existing explicit default-ACL fact set:

- relation privileges: 8;
- sequence privileges: 3;
- total: 11;
- `WITH GRANT OPTION`: 11/11.

Even if `OWNER_RELATION_PROOF=PASS`, these explicit default privileges are not the Bankeban `0001`–`0008` baseline and remain `DEFAULT_ACL_GRANT_OPTION_SEMANTICS=SEMANTIC_MISMATCH`. Owner proof **never** promotes `ACL_SEMANTIC` automatically.

## Sanitized Evidence

Success/BLOCKED relationship Evidence uses:

- `docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.json`
- `docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.sha256`
- `docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.schema.json`

The committed file is an explicit `NOT_EVALUATED` placeholder with zero connection attempts and null source commit. It is not Live evidence. A future authorized run may replace it only after strict schema/sanitization validation.

Safe failure Evidence uses a separate schema and future output pair. It contains only allowlisted stage, internal/external safe code, attempt/retry counts, cleanup result and BLOCKED status. Raw error messages are never persisted. If either success or failure Evidence cannot pass validation/write/hash, the command fails closed and terminal output remains generic/sanitized.

Forbidden persisted content includes raw OIDs, raw principals, role/user names, raw ACLs, URLs, hostnames, endpoints, credentials, tokens, cookies, certificate contents, connection identifiers, business data and Function bodies. All Evidence schemas use `additionalProperties=false`; hash artifacts are forced to LF for cross-platform determinism.

## Mock and fail-closed verification

Tests cover exact 65/65 success candidate, 64/65 and unexpected-object stops, zero/multiple owners, unrelated ownership, ambiguity, all dangerous attributes, outbound/effective membership, inbound-category ambiguity, PUBLIC zero, rename/drop-recreate behavior, Extension/public exclusions, object/hash/provenance tampering, wrong token/database/user, loopback, PostgreSQL version, temporary-CA/TLS failure, business-relation query rejection, one Client/one connect/no retry, raw identity/ACL/unknown fields, safe failure stages, success/failure cleanup, exact 8/3/11 grant-option facts and the prohibition on automatic ACL promotion.

No disposable database was needed; the collector path was exercised exclusively with injected mock clients and local immutable artifacts. Temporary test files were removed; residual count is zero.

## Gate result

- `STRUCTURAL_NON_ACL=PASS`
- `ACL_SEMANTIC=BLOCKED`
- `STRUCTURAL_STARTING_BASELINE=BLOCKED`
- `FRESH_LEDGER_AND_CHECKSUM=BLOCKED`
- 22-Gate: **9 PASS / 13 non-PASS**
- Production Readiness: **70% / NOT READY**
- Gate A: **DEFER**
- Production Provisioning: **NO-GO**
- Production Migration authorization: **NOT_GRANTED**

## Exact next action

The Owner may either defer or separately authorize exactly one execution of the command at the clean committed Phase 2N SHA. Any authorization must permit only the dedicated Production reader, one connection attempt, no retry, TLS verify-full with temporary CA, exact `0001`–`0008` ledger and reviewed catalog/ACL metadata in one read-only transaction, sanitized local Evidence overwrite, cleanup, and possible Neon wake/compute/network/I/O/cache/catalog-lock/audit effects. It must exclude final `0022` parity, business rows, Migration, DDL/DML, repair, Restore, deploy, role/ACL/settings/billing changes, non-reader credentials and every other Production mutation.
