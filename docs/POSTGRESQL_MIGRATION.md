# PostgreSQL migration runbook

## Current status

The schema, migration runner, transactional Command API, and dry-run snapshot mapper are implemented. No managed PostgreSQL instance was available in this workspace, so SQL execution against a real PostgreSQL server and Production cutover are not claimed.

## Rehearsal sequence

1. Provision an isolated Staging PostgreSQL database with encrypted storage, TLS, automated backups, PITR, and separate migrator/API credentials.
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
