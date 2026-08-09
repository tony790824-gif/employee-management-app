# Production Read-only Access Provisioning

Status: **NEON PROVISION AND VERIFY PASS / EXTERNAL PLATFORM EVIDENCE PARTIAL**

Date: 2026-08-09

This runbook prepares Sprint 34 evidence access without changing Production. Missing access remains `BLOCKED`; Owner, Migrator, API, Push, Staging, or other privileged credentials must never be substituted.

## Verified Production Function classification

Status: **APPLICATION ACL PASS / PLATFORM EXTENSION INFORMATION ACCEPTED / HUMAN PROVISION AND VERIFY PASS**

The authorized human operator successfully ran the corrected scripts at Commit `e58932032a788d6928c00457e3ffa661684ca580`: Provision ended in `COMMIT`, then the distinct reader Verify ended in `COMMIT`. Codex did not connect to Production or execute either script.

The authorized read-only catalog diagnostic proved that all 11 Bankeban application-managed Functions are in `app_private`, owned by `neondb_owner`, unavailable to `PUBLIC` and `banke_production_readonly`, and unavailable to `banke_api_production` except for the four explicitly granted API entry points. The only 37 Functions inherited by the reader through `PUBLIC` are `public.pgcrypto` Extension members owned by Neon role `cloud_admin`; the runtime has no direct grant on them.

The safe acceptance model is therefore classified, not global:

- **Application-managed:** exact 11-signature allowlist; owner must be `neondb_owner`; PUBLIC and reader effective EXECUTE must be zero; runtime effective/direct EXECUTE must be exactly the four approved API entry points. Any missing, extra non-Extension, owner-mismatched, PUBLIC-readable, reader-readable, or unapproved runtime Function fails closed.
- **Platform-managed:** only Extension members identified by `pg_depend`/`pg_extension` as `public.pgcrypto`, owned by `cloud_admin`, are accepted as platform information. Their PUBLIC/reader effective EXECUTE counts are reported truthfully and are not represented as zero.
- **Unexpected Extension:** any Extension name, schema, or owner outside the reviewed `public` / `pgcrypto` / `cloud_admin` tuple fails closed pending a new review.

Provisioning never targets a pgcrypto Function, owner, or ACL. It revokes only the exact Bankeban Function signatures and confirms the pgcrypto counts/ACL state did not change inside the transaction. PostgreSQL tracks Extension members as one managed package, so individual Extension objects must not be treated as loose application objects. Official basis: [PostgreSQL 18 Extension packaging](https://www.postgresql.org/docs/18/extend-extensions.html), [`pg_extension`](https://www.postgresql.org/docs/18/catalog-pg-extension.html), and [default privileges](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).

## Diagnostic confirmation-token incident

Status: **BLOCKED / SCRIPT FIXED / MANUAL DIAGNOSTIC RE-RUN REQUIRED**

The first manual Function-owner diagnostic used the intended confirmation `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER`, but the script incorrectly compared it with `DIAGNOSE_BANKE_PRODUCTION_FUNCTION_ACL`. That exact false condition caused the combined target check to fail; it was not evidence of a Neon role/session identity difference. No metadata was returned and no Production statement changed state.

The corrected diagnostic requires all of these conditions independently and reports a specific safe stop reason: database `neondb`; exact confirmation and role names; all three roles present in `pg_roles`; and both `current_user` and `session_user` equal to `banke_production_readonly`. PostgreSQL uses `session_user` for the authenticated login and `current_user` for the effective permission identity. They are normally equal on a direct login; `SET ROLE` can change only the latter. Requiring both prevents an Owner, Migrator, API role, inherited role, or role-switched session from running the evidence diagnostic.

From PowerShell at the Repository root, with the protected read-only URL already present only in the process environment, run exactly:

```powershell
$env:PGSSLMODE = 'require'
psql --no-psqlrc --dbname="$env:DATABASE_READONLY_URL" -v ON_ERROR_STOP=1 -v confirmation=DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER -v readonly_role=banke_production_readonly -v object_owner=neondb_owner -v runtime_role=banke_api_production -f database/operator/production-function-owner.diagnostic.sql
```

Do not replace `DATABASE_READONLY_URL` with an Owner, Migrator, runtime, Staging, or Production API credential. Do not paste the URL into chat or a tracked file.

## Function owner fail-closed blocker

Status: **RESOLVED BY READ-ONLY CLASSIFICATION / HISTORICAL STOP**

The human re-run used `banke_production_readonly`, `neondb_owner`, and `banke_api_production`. It stopped before `BEGIN` with `A PUBLIC-executable Function has a different owner`; no verification or manual ACL statement followed. The later catalog diagnostic confirmed that this broad owner guard was matching only the 37 Neon-managed `public.pgcrypto` Extension Functions owned by `cloud_admin`, not a Bankeban Function.

The diagnostic output is now the reviewed classification baseline. It read only schema, routine name, identity arguments/signature, owner, Extension name and ACL metadata; it did not read a Function body or business row and executed no DDL/DML.

### Expected 0001-0008 Bankeban Functions

All Functions below are created by the tracked Migrations and are expected to retain the Migration object owner, `neondb_owner`. `CREATE OR REPLACE FUNCTION` preserves the existing owner.

| Signature | Source | Runtime EXECUTE |
|---|---|---|
| `app_private.current_workspace_id()` | 0001 | no |
| `app_private.current_user_id()` | 0001 | no |
| `app_private.current_role()` | 0001 | no |
| `app_private.touch_updated_at()` | 0001 | no |
| `app_private.base64url_decode(text)` | 0004 | no |
| `app_private.raise_auth_error(text)` | 0004 | no |
| `app_private.verify_tenant_context(text,text,text,text,boolean)` | 0004/0005 | no |
| `app_private.api_establish_session(text,text,text)` | 0004/0006/0008 | **yes** |
| `app_private.api_logout_session(text,text,text)` | 0004 | **yes** |
| `app_private.api_list_employees(text,text,text)` | 0004 | **yes** |
| `app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)` | 0004/0007 | **yes** |

Migration 0001 requests `pgcrypto`. Production currently exposes 37 `public.pgcrypto` Functions owned by `cloud_admin`; these are Extension-managed platform information. PostgreSQL built-ins in `pg_catalog` remain outside the `public`/`app_private` verifier scope. A different Bankeban owner, extra non-Extension Function, or unreviewed Extension tuple remains BLOCKED.

## Neon Function ACL incident (historical, resolved)

Status: **RESOLVED / CLASSIFIED PROVISION AND VERIFY PASS**

The Neon-compatible provisioning script previously completed on Production, and the reader verified `neondb`, TLS, read-only mode, safe role attributes/defaults, database/schema boundaries, ledger access, zero business-table reads, zero writes, and zero sequence writes. The former global count of 37 has now been proven to contain only platform-managed pgcrypto Functions; no Function was called and no business data was read or changed.

PostgreSQL grants `EXECUTE` on newly-created Functions to `PUBLIC` by default, and privileges are additive. The reader cannot express a negative ACL against the platform's pgcrypto PUBLIC grant. The safe evidence boundary is zero execution of every Bankeban application Function plus truthful reporting of the reviewed pgcrypto limitation—not a false global zero and not a platform ACL mutation.

The corrected script exits unless the runtime is safe and has exactly four explicit application grants, all 11 Bankeban Functions exist with the reviewed owner, no extra non-Extension Function exists, and every Extension member matches the reviewed pgcrypto platform tuple. It revokes ACLs only from the 11 application signatures and changes only the object owner's future defaults. Transactional postconditions require application PUBLIC/reader zero, runtime four, and unchanged pgcrypto counts/ACLs; otherwise every change rolls back.

Do not manually revoke, alter, re-own, or drop pgcrypto objects. Do not substitute another runtime role or remove the classified fail-closed checks.

## Neon role-attribute compatibility incident (historical, resolved)

Status: **RESOLVED / SCRIPT COMPATIBILITY FIX VERIFIED BY HUMAN RUN**

The first authorized Production attempt connected to `neondb` with TLS and passed the read-only catalog preflight, then stopped on the first mutating statement because it included `ALTER ROLE ... NOSUPERUSER`. PostgreSQL 18 permits only a true PostgreSQL superuser to change the `SUPERUSER` attribute, including changing it to `NOSUPERUSER`. Neon does not provide access to that true superuser. Because `ON_ERROR_STOP` was active and this was the first mutating statement, no later `ALTER ROLE ... SET`, `GRANT`, `REVOKE`, or `ALTER DEFAULT PRIVILEGES` statement executed. No business data or schema object was modified.

The corrected script now reads `pg_roles` first and exits unless `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, and `rolbypassrls` are all false. It also exits on target-role membership, object ownership, or missing operator `ADMIN OPTION`. It never attempts to change those dangerous attributes. Only `NOINHERIT`, `CONNECTION LIMIT`, role-level read-only/timeouts, and explicit least-privilege grants/revokes remain. PostgreSQL 18 allows those role changes to a non-superuser `CREATEROLE` operator that has `ADMIN OPTION` on a non-superuser, non-replication target role.

Official basis: [Neon Postgres compatibility](https://neon.com/docs/reference/compatibility) and [PostgreSQL 18 ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html).

## Neon Production

1. Use only the approved Production direct endpoint and the `neondb` database.
2. Create the evidence role with SQL, not the Neon Console, CLI, or API. Neon documents that roles created through those platform surfaces receive `neon_superuser`; the evidence role must not receive it.
3. Create a unique password interactively with `psql` `\password`. Never place the password in a command line, chat, repository file, report, or log.
4. Ensure the approved object owner that created the SQL role retains `ADMIN OPTION` on it. Independently confirm the existing runtime is `banke_api_production` and still has explicit grants on exactly the four reviewed 0001-0008 API Functions. Run `database/operator/production-readonly-role.provision.sql` manually as that operator. Supply only the evidence role, object-owner role and runtime role names through interactive `psql` variables and type the confirmation value when prompted. Any missing/unapproved runtime grant must stop before mutation.
5. Run `database/operator/production-readonly-role.verify.sql`. The role must have `LOGIN`, `NOINHERIT`, no administrative attributes, no memberships, no object ownership, role-level read-only/timeouts, and `SELECT` only on `public.schema_migrations`. Business-table reads, writes, sequence writes, and all Bankeban application Function execution must remain zero. The separately labelled pgcrypto Extension counts are platform information and must match only the reviewed tuple.
6. Store the connection only in the approved operator secret store. Expose it to one evidence process as `DATABASE_READONLY_URL`; also set `BANK_ENV=production`, `BANK_PRODUCTION_DATABASE_HOST`, `BANK_PRODUCTION_READONLY_ROLE`, and `DATABASE_SSL=verify-full`.
7. Run `pnpm db:status:readonly`. Do not continue if host, database, role, TLS, ledger, or privilege checks fail.
8. After evidence collection, run `database/operator/production-readonly-role.disable.sql` to revoke access and set `NOLOGIN`. It intentionally does not drop the role or alter application data.

The role is metadata-only by design. PostgreSQL catalogs plus the Migration ledger are sufficient for schema evidence without exposing business rows.

## Netlify Production

Netlify personal access tokens act as the user who created them and are not inherently read-only. Automated evidence may run only when the organization can prove that the token belongs to a dedicated identity with read-only access to the exact Production site. Otherwise keep the automated result `BLOCKED` and collect approved Viewer/manual evidence outside Git.

For an authorized read-only identity, expose these process-only values:

- `BANK_PRODUCTION_NETLIFY_SITE_ID`
- `BANK_PRODUCTION_NETLIFY_TOKEN`
- `BANK_PRODUCTION_NETLIFY_READONLY_CONFIRM=CONFIRMED_READ_ONLY`

Do not export environment-variable values, deploy, change domains, roll back, or alter site settings.

## Render Production

Render Viewer is the acceptable read-only role on plans that support it. A general Render API key can mutate resources, so automated evidence must remain `BLOCKED` unless the credential is proven to be Viewer-equivalent and restricted to the approved Production service.

For authorized access, expose these process-only values:

- `BANK_PRODUCTION_RENDER_SERVICE_ID`
- `BANK_PRODUCTION_RENDER_TOKEN`
- `BANK_PRODUCTION_RENDER_READONLY_CONFIRM=CONFIRMED_READ_ONLY`

Viewer denial of sensitive environment-variable names is `NOT AUTHORIZED`, not a reason to broaden access. Do not deploy, restart, roll back, or modify the service.

## Auth0 Production

Use a dedicated Machine-to-Machine client with exactly these Management API read scopes:

- `read:attack_protection`
- `read:clients`
- `read:connections`
- `read:log_streams`
- `read:resource_servers`

Any missing or additional scope blocks the automated request. Never grant create, update, delete, rotate, or other mutation scopes. Expose only `BANK_PRODUCTION_AUTH0_DOMAIN` and `BANK_PRODUCTION_AUTH0_MANAGEMENT_TOKEN` to the evidence process. The collector stores only safe counts and booleans; it discards client IDs, connection IDs, log-stream sinks, tokens, and configuration secrets.

## Evidence re-run

Run only after all platform owners have separately authorized and provisioned the exact least-privilege access:

```powershell
pnpm production:platform:validate
pnpm production:evidence:collect
```

Every item must remain `PASS`, `FAIL`, `BLOCKED`, or `NOT AUTHORIZED` according to direct evidence. Hash only sanitized evidence. Never reuse the Sprint 33D hash manifest for a new run, and never overwrite the prior evidence timestamp unless a new authorized collection actually completes.

## Current Sprint 34 result

- Repository provisioning controls: **PASS**
- Neon SQL-created role: **PASS / ROLE SETTINGS AND LEDGER ACCESS VERIFIED**
- Neon first provisioning attempt: **BLOCKED / ROLE-ATTRIBUTE SCRIPT COMPATIBILITY DEFECT FIXED**
- Neon Function diagnostic: **PASS / 11 APPLICATION FUNCTIONS SAFE / 37 PGCRYPTO FUNCTIONS CLASSIFIED**
- Classified Function ACL correction: **PASS / HUMAN PROVISION AND VERIFY COMMITTED**
- Neon read-only evidence: **PASS**
- Production database evidence: **PARTIAL / FOUNDATION LEDGER 0001-0008 VERIFIED; CURRENT FEATURE PARITY AND RECOVERY EVIDENCE OPEN**
- Netlify read-only evidence identity: **BLOCKED**
- Render read-only evidence identity: **BLOCKED**
- Auth0 read-only M2M token: **BLOCKED**
- Neon evidence re-run: **PERFORMED BY HUMAN / PASS / HASHED**
- Full multi-platform evidence re-run: **NOT PERFORMED / BLOCKED**
- Production readiness: **70% - NOT READY**
- Production changes by Codex: **none**. The authorized human Provision changed only the dedicated evidence-role configuration/ACL; it did not modify business data, application schema, Migration, pgcrypto or deployment state.
