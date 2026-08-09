# Production Operations Evidence Guide

Status: **NEON READ-ONLY EVIDENCE PASS / OTHER EXTERNAL PLATFORM EVIDENCE BLOCKED**

## Sprint 42 blocker-closure operating boundary

- Use `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md` as the current blocker and order authority.
- Work may proceed only inside its `Zero-resource closure` list until the owner provides a new exact authorization.
- Gate A approval, if later granted, applies only to the stated Auth0 action. Gates B-G, restore, Migration, deployment, DNS and traffic always require separate stops.
- Keep a blocker `PARTIAL`, `BLOCKED`, `NOT_CONFIGURED` or `UNKNOWN` until direct current evidence meets every acceptance criterion.
- No Production or billing operation was performed in Sprint 42.

## Sprint 41 cost-control boundary

- Gate A remains DEFER and provisioning remains NO-GO; no Production runbook step is authorized by the cost model.
- Before any future purchase, record the exact account quote, billing cycle, included usage, overage/spend-control behavior, cancellation/downgrade impact and named owner.
- Neon cost alerts must cover compute CU-hours, database/branch storage, restore-history storage, snapshot storage and network transfer. UNKNOWN values must not be normalized to zero.
- Netlify deployment credit thresholds remain 70% warning, 75% stop non-essential deploys and 85% release freeze; Free exhaustion can pause projects.
- Minimum monitoring may use provider and external Free tiers only after alert delivery and responder ownership are proven. Paid on-call/log retention remains an independent Gate.

## Sprint 40 Netlify billing operating state

- Current Netlify fixed cost is Free / US$0 with 300 monthly credits; capacity remains unresolved at 274.6 credits used.
- Normal Production deployment target is at most 4 per billing period; management cap 8 including emergencies. Warn at 70%, stop non-essential deploys at 75%, freeze at 85% unless separately approved emergency work.
- These are operational recommendations only. Do not modify Netlify plan, credits, payment, settings or deploy context.
- Gate A remains DEFER, readiness 70% / NOT READY, Production NO-GO.

## Sprint 39 cost and Gate A operating state

- Sprint 39's US$58/month baseline is historical. Sprint 40's current authority is **US$49/month fixed known floor plus Neon and unknowns**; do not present US$64/month as exact because it includes a published typical Neon example.
- Gate A remains **DEFER**. Do not upgrade Auth0, add payment, buy a plan, or create Production resources.
- The historical Netlify Billing / Plan inspection was completed read-only in Sprint 40. The next allowed operator step is only a read-only Neon Billing / Usage inspection; do not upgrade, alter compute or retention, create snapshots/branches, or execute SQL.
- Production readiness remains 70% / NOT READY and Production remains NO-GO.

## Sprint 38 Gate A operating state

- Auth0 capacity/pricing evidence is recorded in `docs/AUTH0_PRODUCTION_CAPACITY_GATE_A.md`; it contains no account, billing or Secret identifier.
- Current decision is **DEFER**. Do not upgrade, add payment, purchase, create a Tenant/Application/API, or change Auth0.
- Essentials is only the preferred future target architecture. Its observed US$35/month quote is not a total Production-cost estimate and must be rechecked before any later authorization.
- The next allowed work is total-cost and authorization-package preparation only. Production remains NO-GO and Gates B-G remain closed.

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
