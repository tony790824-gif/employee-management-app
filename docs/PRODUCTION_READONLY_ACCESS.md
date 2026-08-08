# Production Read-only Access Provisioning

Status: **REPOSITORY READY / EXTERNAL PROVISIONING BLOCKED / FUNCTION OWNER DIAGNOSTIC REQUIRED**

Date: 2026-08-08

This runbook prepares Sprint 34 evidence access without changing Production. Missing access remains `BLOCKED`; Owner, Migrator, API, Push, Staging, or other privileged credentials must never be substituted.

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

Status: **BLOCKED / MANUAL READ-ONLY DIAGNOSTIC REQUIRED**

The human re-run used `banke_production_readonly`, `neondb_owner`, and `banke_api_production`. It stopped before `BEGIN` with `A PUBLIC-executable Function has a different owner`; no verification or manual ACL statement followed. The owner guard intentionally examines every PUBLIC-executable Function in `public` and `app_private`, not only Bankeban Functions. Migration 0001 runs `CREATE EXTENSION IF NOT EXISTS pgcrypto`, so Neon/platform-owned or previously installed pgcrypto Functions in `public` are a plausible source of the mismatch. This is not confirmed until the catalog diagnostic identifies the exact rows.

Run `database/operator/production-function-owner.diagnostic.sql` manually with the four exact confirmation/role variables documented in that file. It sets read-only transaction mode and returns only schema, routine name, identity arguments/signature, owner, extension name, PUBLIC EXECUTE, runtime effective/direct EXECUTE, reader EXECUTE, expected source and owner-match metadata. It never reads a Function body or business row and executes no DDL/DML. Do not run `provision.sql` again until this output has been reviewed.

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

Migration 0001 also requests `pgcrypto`; its exact Function inventory and owner depend on the installed PostgreSQL/Neon extension state and are not asserted from repository SQL. PostgreSQL built-ins in `pg_catalog` are outside the current `public`/`app_private` verifier scope. A different Bankeban owner, an Extension owner, or an unclassified Function must remain BLOCKED until its metadata is reviewed; do not ignore it or revoke it manually.

## Neon Function ACL incident

Status: **BLOCKED / PUBLIC EXECUTE DEFECT FIXED / HUMAN RE-PROVISION AND VERIFY REQUIRED**

The corrected Neon-compatible provisioning script completed on Production, and the reader then verified `neondb`, TLS, read-only transaction mode, safe role attributes, role defaults, database/schema boundaries, ledger access, zero business-table reads, zero writes, and zero sequence writes. The remaining blocker was `function_execute_privilege_count = 37`. No Function was called and no business data was read or changed.

PostgreSQL grants `EXECUTE` on newly-created Functions to `PUBLIC` by default. Effective privileges are additive, so `REVOKE ... FROM banke_production_readonly` cannot override an `EXECUTE` grant inherited from `PUBLIC`; PostgreSQL has no per-role negative ACL. The evidence role therefore cannot reach effective zero without removing `PUBLIC EXECUTE` from the existing Bankeban Functions. Official basis: [PostgreSQL 18 CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html), [PostgreSQL 18 REVOKE](https://www.postgresql.org/docs/18/sql-revoke.html), and [PostgreSQL 18 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).

The repository correction does not weaken the zero-Function requirement. Before changing `PUBLIC`, the manual script now exits unless the Production runtime role is a safe login with no memberships or ownership and has explicit `EXECUTE` grants on exactly the four reviewed 0001-0008 API entry points. It also exits unless every currently PUBLIC-executable Function in `public` and `app_private` is owned by the approved object owner, which retains its inherent owner capability. It then revokes current `PUBLIC EXECUTE` and the object owner's global future-Function PUBLIC default. Transactional postconditions require the evidence role and PUBLIC to have zero effective Function execution and the runtime role to retain exactly its four-function allowlist; otherwise every change rolls back.

This is a global Function ACL hardening required by PostgreSQL's additive privilege model, not a role-specific deny. Do not run it until the object owner and `banke_api_production` names are independently verified. Do not substitute another runtime role or remove the fail-closed checks.

## Neon role-attribute compatibility incident

Status: **BLOCKED / SCRIPT COMPATIBILITY DEFECT FIXED / HUMAN RE-RUN REQUIRED**

The first authorized Production attempt connected to `neondb` with TLS and passed the read-only catalog preflight, then stopped on the first mutating statement because it included `ALTER ROLE ... NOSUPERUSER`. PostgreSQL 18 permits only a true PostgreSQL superuser to change the `SUPERUSER` attribute, including changing it to `NOSUPERUSER`. Neon does not provide access to that true superuser. Because `ON_ERROR_STOP` was active and this was the first mutating statement, no later `ALTER ROLE ... SET`, `GRANT`, `REVOKE`, or `ALTER DEFAULT PRIVILEGES` statement executed. No business data or schema object was modified.

The corrected script now reads `pg_roles` first and exits unless `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, and `rolbypassrls` are all false. It also exits on target-role membership, object ownership, or missing operator `ADMIN OPTION`. It never attempts to change those dangerous attributes. Only `NOINHERIT`, `CONNECTION LIMIT`, role-level read-only/timeouts, and explicit least-privilege grants/revokes remain. PostgreSQL 18 allows those role changes to a non-superuser `CREATEROLE` operator that has `ADMIN OPTION` on a non-superuser, non-replication target role.

Official basis: [Neon Postgres compatibility](https://neon.com/docs/reference/compatibility) and [PostgreSQL 18 ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html).

## Neon Production

1. Use only the approved Production direct endpoint and the `neondb` database.
2. Create the evidence role with SQL, not the Neon Console, CLI, or API. Neon documents that roles created through those platform surfaces receive `neon_superuser`; the evidence role must not receive it.
3. Create a unique password interactively with `psql` `\password`. Never place the password in a command line, chat, repository file, report, or log.
4. Ensure the approved object owner that created the SQL role retains `ADMIN OPTION` on it. Independently confirm the existing runtime is `banke_api_production` and still has explicit grants on exactly the four reviewed 0001-0008 API Functions. Run `database/operator/production-readonly-role.provision.sql` manually as that operator. Supply only the evidence role, object-owner role and runtime role names through interactive `psql` variables and type the confirmation value when prompted. Any missing/unapproved runtime grant must stop before mutation.
5. Run `database/operator/production-readonly-role.verify.sql`. The role must have `LOGIN`, `NOINHERIT`, no administrative attributes, no memberships, no object ownership, role-level read-only/timeouts, and `SELECT` only on `public.schema_migrations`. Business-table reads, writes, sequence writes, and function execution must all remain zero.
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
- Neon SQL-created role: **EXISTS / ROLE SETTINGS AND LEDGER ACCESS VERIFIED**
- Neon first provisioning attempt: **BLOCKED / ROLE-ATTRIBUTE SCRIPT COMPATIBILITY DEFECT FIXED**
- Neon second verification: **BLOCKED / 37 EFFECTIVE FUNCTION EXECUTE PRIVILEGES THROUGH PUBLIC**
- PUBLIC Function ACL correction: **REPOSITORY PASS / PENDING HUMAN RE-PROVISION AND VERIFY**
- Neon evidence: **BLOCKED**
- Netlify read-only evidence identity: **BLOCKED**
- Render read-only evidence identity: **BLOCKED**
- Auth0 read-only M2M token: **BLOCKED**
- Evidence re-run: **NOT PERFORMED**
- Production readiness: **70% - NOT READY**
- Production changes by this repository correction: **none** (the prior authorized human provisioning changed only evidence-role configuration/ACL; it did not modify business data, schema or Migration)
