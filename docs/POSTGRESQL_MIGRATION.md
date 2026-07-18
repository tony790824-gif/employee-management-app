# PostgreSQL migration runbook

## Current status

The schema, migration runner, transactional Command API, and snapshot mapper are implemented. On 2026-07-18 an isolated Neon PostgreSQL 18.4 Staging environment passed migrations 0001–0003, import/replay reconciliation, two-workspace RLS, all implemented Command API flows, query-plan checks, and an official `pg_dump`/`pg_restore` rehearsal. Production cutover is not claimed and the existing Google Sheets frontend remains active.

Staging commands require both `BANK_ENV=staging` and an exact `BANK_STAGING_DATABASE_HOST`. Migration/import uses the direct owner endpoint; runtime tests use a separate pooler endpoint and `NOINHERIT` least-privilege role. The restore rehearsal additionally requires `BANK_STAGING_RESTORE_CONFIRM=RESTORE_BANKE_STAGING_BACKUP` and recreates only `banke_restore_sprint2`.

Security boundary: current RLS trusts tenant/user custom GUC values set by the backend transaction. It blocks missing context and cross-tenant SQL issued after binding a legitimate principal, but possession of the shared API database credential can forge those GUC values. Production cutover is prohibited until formal identity is paired with a signed/externally verified database context or a trusted connection proxy.

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
10. Complete Identity Provider reenrollment and API E2E before any frontend cutover.

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
