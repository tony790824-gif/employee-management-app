# Production Read-only Access Provisioning

Status: **REPOSITORY READY / EXTERNAL PROVISIONING BLOCKED**

Date: 2026-08-08

This runbook prepares Sprint 34 evidence access without changing Production. Missing access remains `BLOCKED`; Owner, Migrator, API, Push, Staging, or other privileged credentials must never be substituted.

## Neon Production

1. Use only the approved Production direct endpoint and the `neondb` database.
2. Create the evidence role with SQL, not the Neon Console, CLI, or API. Neon documents that roles created through those platform surfaces receive `neon_superuser`; the evidence role must not receive it.
3. Create a unique password interactively with `psql` `\password`. Never place the password in a command line, chat, repository file, report, or log.
4. Run `database/operator/production-readonly-role.provision.sql` manually as the approved object owner. Supply only the role name and current object-owner name through interactive `psql` variables and type the confirmation value when prompted.
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
- Neon read-only credential: **BLOCKED**
- Netlify read-only evidence identity: **BLOCKED**
- Render read-only evidence identity: **BLOCKED**
- Auth0 read-only M2M token: **BLOCKED**
- Evidence re-run: **NOT PERFORMED**
- Production readiness: **70% - NOT READY**
- Production changes: **none**
