# PostgreSQL migration runbook

## Isolated UI bootstrap rehearsal

The source now includes a least-privilege `app_private.api_bootstrap` function, authenticated `GET /v1/bootstrap` route and a separate `dist-staging-postgres/` frontend. This is an opt-in Staging rehearsal and does not alter the committed normal Staging or Production profiles.

The approved hosting definition is the isolated Render service in `render.yaml`; its operating and rollback procedure is documented in `docs/STAGING_NODE_API_HOSTING.md`. Configure it with the existing Staging PostgreSQL API credential, Auth0 OIDC/JWKS settings, tenant-context signing key, exact allowed frontend origin, `BANK_ENV=staging`, and `BANK_API_BIND_HOST=0.0.0.0`. Secrets belong only in the provider secret store. Creating the service does not authorize a frontend switch or database change. Apply migration `0011_ui_bootstrap` only in a later explicitly approved Staging step, refresh the least-privilege role grants, then build with credential-free `BANKE_STAGING_POSTGRES_API_URL` and `BANKE_STAGING_WORKSPACE_ID` values. Never place a database credential in the browser build.

Acceptance requires both boss and employee identities to load only their live membership-scoped data, logout/reload to fail closed, Production to remain on Google Sheets, and rollback to the unchanged normal Staging build. Until the public endpoint, migration and browser E2E are completed, deployment is not claimed.

## Current status

The schema, migration runner, transactional Command API, and snapshot mapper are implemented. On 2026-07-18 an isolated Neon PostgreSQL 18.4 Staging environment passed migrations 0001–0003, import/replay reconciliation, two-workspace RLS, all implemented Command API flows, query-plan checks, and an official `pg_dump`/`pg_restore` rehearsal. Production cutover is not claimed and the existing Google Sheets frontend remains active.

Staging commands require both `BANK_ENV=staging` and an exact `BANK_STAGING_DATABASE_HOST`. Migration/import uses the direct owner endpoint; runtime tests use a separate pooler endpoint and `NOINHERIT` least-privilege role. The restore rehearsal additionally requires `BANK_STAGING_RESTORE_CONFIRM=RESTORE_BANKE_STAGING_BACKUP` and recreates only `banke_restore_sprint2`.

Production preparation requires `BANK_ENV=production`, verified TLS, an exact `BANK_PRODUCTION_DATABASE_HOST`, a direct migrator URL, and a separate pooled API URL targeting the same approved database. Configuration is rejected before opening a connection if the host or database identity differs. Applying Production migrations remains separately gated and is not implied by configuring or checking the target.

Sprint 3 adds migrations 0004 through 0008. The runtime role has no direct business-table or sequence privileges and may execute only four controlled `app_private.api_*` entry points. Each entry point verifies a short-lived HMAC assertion, resolves the OIDC issuer/subject to an internal user, consumes a one-time nonce, and rechecks the live user, workspace, membership, role, and revocable session before an internal transaction may set RLS context. A caller who only possesses the runtime database credential cannot read business tables, call the verifier directly, or gain access by setting a custom GUC.

The external Auth0 Staging tenant is still a release gate. Until it is configured and its Authorization Code + PKCE, rotating refresh-token, reuse-detection, logout, suspension, and membership-removal flows pass real Staging E2E, the local synthetic issuer tests do not constitute formal Identity Provider acceptance.

## Rehearsal sequence

1. Provision an isolated Staging PostgreSQL database with encrypted storage, TLS, automated backups, PITR, and separate migrator/API credentials. *(Managed engine and credential separation verified; provider PITR restore remains a future operational acceptance item.)*
2. Configure secrets from `.env.example` in the hosting secret store.
3. Run `pnpm db:status`, then `pnpm db:migrate`; retain the migration output.
4. Export a validated Apps Script recovery snapshot.
5. Run `pnpm db:import` without `--apply` and review counts/warnings.
6. Take a database backup, then rerun with `--apply`.
7. Reconcile employees, archived employees, shifts, attendance, leave dates, payroll adjustments, revision, and checksum.
8. Verify a second identical import reports replay and a different import is blocked.
9. Execute RLS tests using two workspaces and two separate members.
10. Follow `docs/AUTH0_STAGING_SETUP.md`; complete Identity Provider reenrollment and API E2E before any frontend cutover.

## Rollback

Before cutover, rollback means discarding the isolated Staging database; Google Sheets remains active. After a future approved cutover, rollback must follow a separately approved forward-recovery plan and reconciliation window. Production down migrations are prohibited.

## Migration mappings

| Snapshot | PostgreSQL |
|---|---|
| `workspace` | `organizations`, `workspaces` |
| `employees` | `users`, `workspace_members`, `employees` |
| `removedEmployees[].employee` | archived `employees` plus membership |
| `shifts` | `shifts` |
| `attendance` | `attendance_records` |
| `leaves` | `leave_selections` |
| `payrollAdjustments` | `payroll_adjustments` |
| legacy credentials | not imported; `reenrollment_required` |
