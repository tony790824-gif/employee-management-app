# Sprint 2 Managed Staging PostgreSQL Review

Date: 2026-07-18
Scope: isolated Managed Staging PostgreSQL validation only. No Production or frontend cutover.

## Evidence

- Engine: Neon PostgreSQL 18.4, isolated Staging project/database.
- Migrations: 0001–0003 applied with matching SHA-256 ledger; second run applied nothing.
- Safety: per-migration transaction rollback, advisory lock contention/release, fixed Staging host, direct migrator endpoint, pooled runtime endpoint.
- Import: non-sensitive fixture dry-run, apply, checksum replay, and record reconciliation passed.
- Tenant isolation: two synthetic workspaces; positive visibility and negative direct/cross-tenant read, insert, update, delete, and composite-FK tests passed without disabling RLS.
- Commands: employee create, shift create, month leave replace, clock-in, clock-out, hours approval, and employee list passed on the real engine.
- Backup/restore: PostgreSQL 18 custom-format dump restored into `banke_restore_sprint2`; migration/data reconciliation, 11 FORCE RLS tables, and tenant-isolated API reads passed.
- Performance: employee lookup used `employees_workspace_id_phone_key`; monthly shift lookup used `shifts_workspace_date_idx`. No evidence justified a new index.
- Regression: quality check, full automated suite, build, release gate, repeated live integration, and production-dependency audit passed.

## Architecture Review

### A — CTO

The existing migration path was retained. Managed Staging remains isolated and Google Sheets remains the active Production path, which provides a reversible boundary while database evidence is gathered.

### B — Senior Flutter/Frontend Engineer

No frontend adapter or UI was changed. This is correct for the Sprint boundary, but the current application is Vanilla JavaScript rather than Flutter; a later adapter must preserve environment and PWA cache isolation.

### C — Backend Architect

Separate migrator and runtime URLs, tenant transactions, idempotent commands, and a pooled API role are appropriate. Missing Identity Provider and incomplete read endpoints remain hard cutover blockers.

### D — Database Architect

Versioned migrations, checksums, advisory locking, forced RLS, composite foreign keys, audit/outbox, and restore reconciliation are sound. Provider PITR and retention-policy evidence remain outstanding.

### E — Security Engineer

The API role is `NOINHERIT`, non-superuser, cannot bypass RLS, cannot read the migration ledger, and has only required DML/function privileges. TLS remains `verify-full`; secrets stayed in ignored `.env`. Fixed Staging host validation was added to reduce environment-mislabel risk. A read-only adversarial test confirmed that possession of the shared DB credential can forge custom GUC tenant context; formal identity must add signed context or a trusted connection proxy before Production.

### F — QA Lead

The live suite covers positive and negative tenant boundaries and all implemented commands. A stateful leave test was initially non-repeatable; it was corrected and passed twice consecutively. Real-device E2E and load/chaos tests remain outside this Sprint.

### G — Product Manager

No user-facing feature was added. The work lowers data-loss and tenant-leak risk but does not create user value until formal identity and frontend cutover are completed.

### H — DevOps Engineer

The rehearsal is repeatable and protected by explicit Staging environment, host, and destructive confirmation gates. Official client tools are used and temporary dumps/CA bundles are removed. Managed backup retention, PITR alerting, and CI execution remain future work.

### I — Code Reviewer

Dynamic identifiers come only from internal constants; the restore target is fixed; no secrets are logged. Remaining refactoring candidates are shared PostgreSQL URL/host helpers, reusable fixture seeding, and extracting the stateful live test into disposable database setup.

## Decision

Managed Staging migration/import/API/restore evidence is complete within this Sprint's bounded goal. This does **not** approve Production: the forged-GUC trust boundary is a P0 cutover blocker, and formal IAM, full API coverage, frontend adapter, observability, load testing, provider PITR/RPO/RTO, cross-device E2E, and a separately approved cutover plan are still required.
