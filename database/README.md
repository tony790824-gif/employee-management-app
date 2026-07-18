# PostgreSQL migration and snapshot import

`database/migrations/` is the executable source of truth for the formal PostgreSQL schema. `docs/schema.sql` remains a historical design reference only.

## Safety gates

- Migration/import commands require a direct `DATABASE_MIGRATOR_URL`; the runtime API requires a separate least-privilege `DATABASE_API_URL`. Secrets are never stored in Git.
- Staging and Production require verified TLS (`DATABASE_SSL=require`).
- Production migrations additionally require `BANK_ALLOW_PRODUCTION_MIGRATIONS=APPLY_BANKE_PRODUCTION_MIGRATIONS`.
- Down migrations are disabled in Production. Local/Staging rollback additionally requires `BANK_ALLOW_DESTRUCTIVE_MIGRATIONS=ALLOW_BANKE_DESTRUCTIVE_ROLLBACK`.
- Every migration runs in its own transaction under a process-wide advisory lock and is recorded with a SHA-256 checksum.

Migrations 0004–0008 add the Staging identity/tenant boundary: OIDC principal mapping, revocable sessions, signed context keys/nonces and the four controlled database functions. The runtime role receives no business-table or sequence privilege. The signed context key must come from a secret manager/environment and be installed by the migrator; it must never be committed.

## Commands

```powershell
pnpm db:status
pnpm db:migrate
pnpm db:rollback -- --to=0001
pnpm db:import -- --file=backup.json --workspace-id=ws_0123456789abcdef0123456789abcdef
pnpm db:import -- --file=backup.json --workspace-id=ws_0123456789abcdef0123456789abcdef --apply
pnpm db:grant-api
pnpm db:backup-restore:staging
```

The backup/restore rehearsal is staging-only and requires `BANK_STAGING_RESTORE_CONFIRM=RESTORE_BANKE_STAGING_BACKUP`. It uses PostgreSQL 18 `pg_dump`/`pg_restore`, recreates only the fixed `banke_restore_sprint2` database, reapplies the least-privilege API grants, and verifies migration checksums, row counts, forced RLS, and tenant-isolated API reads. It never accepts a Production environment.

Snapshot import is dry-run by default. Apply mode is single-use and idempotent for the same checksum. A different snapshot cannot be silently imported into an initialized workspace.

Legacy PIN/activation credentials are deliberately not imported. Imported memberships receive `reenrollment_required`; Auth0 Staging enrollment and token-lifecycle E2E must complete before cutover.

## Cutover rule

The existing Google Sheets path remains the active application path. Do not set Production traffic to the PostgreSQL API until a managed PostgreSQL instance, external Identity Provider, live migration rehearsal, reconciliation report, rollback drill, and cross-device E2E have all passed.
