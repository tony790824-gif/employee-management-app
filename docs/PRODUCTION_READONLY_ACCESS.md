# Production Read-only Access Provisioning

Status: **REPOSITORY READY / EXTERNAL PROVISIONING BLOCKED / NEON FUNCTION ACL RE-RUN REQUIRED**

Date: 2026-08-08

This runbook prepares Sprint 34 evidence access without changing Production. Missing access remains `BLOCKED`; Owner, Migrator, API, Push, Staging, or other privileged credentials must never be substituted.

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
