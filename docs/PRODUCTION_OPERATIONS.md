# Production Operations Evidence Guide

Status: **NEON READ-ONLY EVIDENCE PASS / OTHER EXTERNAL PLATFORM EVIDENCE BLOCKED**

The detailed procedure remains `docs/PRODUCTION_OPERATIONS_RUNBOOK.md`. This guide defines how Sprint 33C evidence is collected without changing Production.

Sprint 34 Neon least-privilege Provision/Verify passed through an authorized human operator. The remaining evidence commands still require separately authorized, proven read-only Netlify, Render and Auth0 access.

## Read-only validation

1. Use an approved operator workstation and protected environment variables. Never paste values into chat, logs, reports, tests, source files, or Git.
2. Configure only credential-free public origins and public Auth0 metadata plus a distinct SELECT-only `DATABASE_READONLY_URL`.
3. Run `pnpm production:platform:validate` for public/schema validation, then `pnpm production:evidence:collect` for platform evidence and SHA-256 records. Both require explicit Production/read-only flags internally and emit sanitized JSON.
4. Record the candidate Commit, evidence timestamp, status and non-sensitive counts. Store platform screenshots/exports in the approved evidence system, not the repository when they contain identifiers.
5. Treat `BLOCKED` and `NOT_CONFIGURED` as open gates. Never reinterpret them as PASS.

## Stop conditions

Stop immediately on an unexpected host/database/role, checksum mismatch, TLS failure, Staging/Draft/Local marker, insecure cookie/header, unexpected CORS origin, missing restore evidence, secret-like output, or any request requiring write authority.

Production deployment, Migration apply, Auth0 mutation, platform-resource creation, traffic change, restore, real notification and data write each require separate explicit authorization.
