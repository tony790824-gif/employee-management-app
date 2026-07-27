# Staging UI bootstrap acceptance

## Scope and final state

On 2026-07-22, migration `0011_ui_bootstrap` was applied only to the approved Neon Staging `neondb` database. Production, Google Sheets, Apps Script, Auth0, the Production frontend and Production traffic were not connected, modified or deployed.

The migration source SHA256 recorded in `schema_migrations` is:

`0218d807d58d5b112f4095ac6ac9dfa2652793082c2a6881babd0ad9751748bf`

Migrations `0009` and `0010` remain intentionally pending. The normal sequential migration command was not used because it would have applied those unapproved migrations. `database/staging-ui-bootstrap.mjs` manages only version `0011`, verifies the ledger/function state, requires the fixed synchronized key ID `render-staging-20260722-49a11f`, and uses an advisory lock plus a database transaction.

## Least-privilege result

- Runtime E2E requests used the existing `banke_staging_api` role.
- The role has zero direct table grants and cannot read `public.employees` or `app_private.auth_sessions`.
- The role can execute the five reviewed API functions, including `app_private.api_bootstrap(text,text,text)`.
- The role cannot directly execute `app_private.verify_tenant_context(text,text,text,text,boolean)`.
- The fixed tenant-context key was read for the controlled test signer and was not regenerated, changed or deleted.

The migration credential was used only for schema migration, exact grant convergence, fixture identity setup/cleanup and privilege auditing. It was not used by the Node API runtime or bootstrap calls.

## E2E evidence

The live Node API-to-Neon Staging test proved:

- boss bootstrap returns only the selected Workspace data;
- employee bootstrap returns only that employee and employee-scoped shifts, attendance, leave and payroll adjustment data;
- live Session, Membership, Workspace status and role determine authorization;
- boss and employee cross-Workspace requests fail closed with `WORKSPACE_ACCESS_DENIED`;
- the API role cannot bypass the controlled function with direct table queries;
- the approved key ID remains active and unchanged after the test;
- synthetic identity principals and sessions are removed and modified membership auth state is restored after each run.

## Rollback drill

The rollback required the one-process confirmation `BANK_ALLOW_STAGING_UI_BOOTSTRAP_ROLLBACK=ROLLBACK_BANKE_STAGING_UI_BOOTSTRAP`. It removed only the 0011 ledger row and `app_private.api_bootstrap(text,text,text)` in one transaction. The status check confirmed both were absent. Migration 0011 was then reapplied, least-privilege grants were reconverged, and the complete boss/employee isolation E2E passed again.

Final expected state:

- 0011 ledger row present with the approved checksum;
- bootstrap function present;
- 0009 and 0010 still pending;
- runtime API role has only the reviewed function allowlist;
- Render Staging `/v1/readiness` returns HTTP 200 with `ok: true`;
- no frontend data-source switch has occurred.

## Repeatable commands

Use only an ignored Staging environment file and never print its values.

```powershell
pnpm db:ui-bootstrap:staging status
pnpm db:ui-bootstrap:staging up
pnpm db:grant-api
pnpm test:ui-bootstrap:staging
```

Rollback is Staging-only and requires explicit approval. Do not add its confirmation value to a shared environment file, Render, Git or documentation automation.

## Current-user contract extension — 2026-07-27

Controlled migration `0012_current_user_bootstrap` was applied only to Neon Staging after the `0011` boundary had been verified. It adds nullable `workspace_members.display_name` and a backward-compatible `currentUser` bootstrap object. Employee names are resolved from `employees.name`; manager names are resolved from the authorized Workspace Membership. Unknown roles fail closed.

The recorded SHA256 checksum is:

`c81a450b5e0633d2b7efc3b2e7dc4f4d37ef87d9bde62ad408243455de911797`

The Staging validation proved:

- a manager receives the formal name stored on that manager's Membership;
- an employee receives the name from the employee record already visible in that employee's scoped bootstrap;
- a nullable manager name returns `null` without failing the bootstrap;
- neither Workspace can observe the other Workspace's manager name;
- legacy bootstrap fields remain present;
- the runtime API role still has zero direct employee/session table access and only executes the approved bootstrap function;
- the synchronized tenant-context key remains unchanged.

The rollback rehearsal used only the explicit one-process confirmation for `0012`, restored the exact `0011` function, removed the new column and ledger row, verified absence, then reapplied `0012` and reran the complete live E2E. Migrations `0009` and `0010` remain deliberately pending.

Repeatable Staging-only commands:

```powershell
pnpm db:current-user-bootstrap:staging status
pnpm db:current-user-bootstrap:staging up
pnpm test:ui-bootstrap:staging
```
