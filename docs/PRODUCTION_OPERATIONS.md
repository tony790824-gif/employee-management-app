# Production Operations Evidence Guide

Status: **NEON READ-ONLY EVIDENCE PASS / OTHER EXTERNAL PLATFORM EVIDENCE BLOCKED**

## Sprint 37 NO-GO operating state

- `docs/PRODUCTION_PROVISIONING_PREFLIGHT_REPORT.md` consolidates every current blocker and confirms Production provisioning is NO-GO.
- No automated check may cross from validation into resource creation, billing, configuration, deploy, Migration, DNS, Secret or traffic operations.
- The only current human task is to view Auth0 Team plan/Tenant-capacity information and report non-secret entitlement/quote data. Do not purchase, create, delete or modify anything.
- A future Gate A request must still stop and restate cost, Staging/Production impact, rollback and exact human steps. Approval cannot carry to Gates B-G.

## Sprint 36 gated provisioning boundary

- Use `docs/PRODUCTION_RESOURCE_PROVISIONING_PLAN.md` as the only approved order for future resource work.
- Stop before each Gate A-G. Record action, reason, platform, possible cost, Staging impact, Production impact, rollback and exact human steps.
- Approval is single-gate and non-transitive. Resource creation, configuration, deploy, Migration, DNS and traffic remain forbidden until their own approval.
- Preserve the current Google Sheets Production path as rollback baseline until Gate G is separately accepted.

## Sprint 35 operating state

The repository inventory and fail-closed collectors were rerun without protected platform credentials. They made no Production request. Neon safe evidence is recorded. Netlify has no Production Deploy. Render has no independent Production API. Auth0 has only a Development Tenant/Staging SPA and the Team Tenant limit is reached. All currently safe read-only platform inventory is complete; the next step is an owner authorization decision, not a platform mutation.

1. Review the Sprint 35 evidence summary and decide whether to authorize a separate **Production Resource Provisioning Plan** Sprint.
2. The plan must address, in order: Auth0 Tenant capacity and dedicated Production identity, independent Render Production API, Netlify Production deploy/domain, DNS/TLS, monitoring/alerts, scheduled backup and isolated restore.
3. This decision does not authorize creating or changing any resource. Each mutation/deploy/migration step requires a later explicit approval and rollback plan.

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
