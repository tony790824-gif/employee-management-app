# Production Provisioning Preflight Report — Sprint 37

Date: 2026-08-09

Status: **COMPLETE AS READ-ONLY PREFLIGHT / NO-GO**

Product completion: **98%**

Production readiness: **70% / NOT READY**

## Sprint 42 blocker closure addendum

The consolidated blocker inventory has moved to `docs/PRODUCTION_GATE_A_BLOCKER_CLOSURE_PLAN.md`. Its current statuses are evidence-derived and no external blocker was promoted to PASS.

Gate A decision remains DEFER; provisioning remains NO-GO; readiness remains 70%. Read-only Neon billing/usage, domain/operations/DR planning and schema analysis can proceed without resources, while every Auth0/Neon/Render/Netlify/DNS/Migration/deploy action remains separately approval-gated.

## Sprint 41 final cost addendum

Official public evidence confirms the pricing formulas but not the account-specific total. Minimum fixed known is US$49/month; Recommended fixed known is US$67/month; Growth remains UNKNOWN. Neon actual plan/usage, domain, recovery, monitoring/on-call, logging overage and tax remain unresolved.

Gate A remains DEFER, provisioning remains NO-GO, and readiness remains 70%. The next safe step is read-only Neon Billing/Usage evidence, not a purchase or resource operation.

## Sprint 40 Netlify cost addendum

Read-only owner evidence resolves the Netlify current-plan fact as Free / Credit-based / US$0 / 300 credits. It does not resolve capacity: current usage is 274.6 credits and deploys account for 270. `NETLIFY-01` remains NOT_CONFIGURED and `NETLIFY-03` remains BLOCKED because no approved Production Deploy or rollback history exists.

Gate A remains DEFER, provisioning remains NO-GO, and readiness remains 70%.

## Sprint 39 total-cost and authorization addendum

The Sprint 39 historical fixed planning floor was US$58/month plus Neon and unknown items. Sprint 40 supersedes it with US$49/month after owner-observed Netlify Free/US$0 evidence. No exact total is claimed; Gate A remains **DEFER**, Production provisioning remains **NO-GO**, and all billing/resource actions remain unauthorized.

The next read-only evidence gap is the existing Netlify account's actual Legacy/Credit-based billing model, plan and recent credits. Viewing this evidence does not authorize a plan change or deploy.

## Sprint 38 Gate A capacity addendum

Read-only owner evidence closes the unknown Auth0 Team capacity fact: Free permits one Tenant and is already occupied by Development; Essentials is observed at US$35/month with three Tenants. `AUTH-01` remains **BLOCKED / BILLING_REQUIRED / APPROVAL_REQUIRED** because no purchase is authorized. `AUTH-02` and `AUTH-03` remain **NOT_CONFIGURED**.

Decision: **DEFER Gate A execution now**, retain Essentials/dedicated Production Tenant as the preferred target, reject shared-Tenant Production, and keep the overall decision **NO-GO**. Production readiness remains 70%.

This report consolidates blockers before any Production resource is created. It authorizes no resource, configuration, deploy, Migration, database access/write, DNS change, Secret operation, deletion, purchase, upgrade, or traffic switch. Unproved external state remains `PARTIAL`, `BLOCKED`, `NOT_CONFIGURED`, or `UNKNOWN`.

## 1. Sprint 36 handoff audit

| Artifact | Result | Evidence |
| --- | --- | --- |
| Resource inventory | PASS (plan consistency only) | Auth0, Neon, Render, Netlify, DNS/TLS, monitoring, recovery, Secrets and rollback gaps match Sprint 35 evidence. |
| Target architecture | PASS (plan consistency only) | `Netlify Production -> Auth0 Production -> Render Production API -> Neon Production PostgreSQL`, with separate Push worker/VAPID and operations controls. |
| Approval gates | PASS | Gates A-G are single-purpose, non-transitive and require a human stop. |
| Environment isolation | PASS (repository design) / EVIDENCE_MISSING (external Production) | Staging identities/services/configuration are known; Production counterparts do not yet exist. |
| Readiness / evidence / operations / checklist | PASS for consistency | All retain 70% / NOT READY and prohibit Staging evidence from becoming Production PASS. |
| Backlog / handoff / next work | PASS for consistency | Gate A is the next human decision; no provisioning is authorized. |

No inconsistency authorizes changing ADR 0022 or the Sprint 36 order.

## 2. Classification vocabulary

- **AUTOMATABLE:** Codex can complete the repository/read-only validation after required public metadata or approved read-only evidence exists.
- **USER_ACTION:** a human must use a platform console or make an ownership decision.
- **EXTERNAL_LIMIT:** provider/account state blocks progress.
- **BILLING_REQUIRED:** the safe option may require a paid plan/resource; the current price must be confirmed by the owner in the platform UI.
- **APPROVAL_REQUIRED:** the action would create/change a Production resource or configuration and requires explicit authorization.
- **EVIDENCE_MISSING:** no current direct evidence proves the acceptance condition.

These labels can coexist. `AUTOMATABLE` never means Codex may create or mutate a resource.

## 3. Consolidated blocker inventory

| ID | Area | Current status | Classifications | Blocker / required closure |
| --- | --- | --- | --- | --- |
| AUTH-01 | Auth0 tenant capacity | BLOCKED | USER_ACTION, EXTERNAL_LIMIT, BILLING_REQUIRED, APPROVAL_REQUIRED | Team reports Tenant limit reached. Owner must choose and approve a supported capacity path; no upgrade was attempted. |
| AUTH-02 | Production Tenant | NOT_CONFIGURED | USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Dedicated non-Development Tenant does not exist. Staging Tenant reuse is forbidden. |
| AUTH-03 | Production SPA/API | NOT_CONFIGURED | USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Production client, API, audience, signing and exact origins do not exist. |
| AUTH-04 | Auth protections/logs | NOT_CONFIGURED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | PKCE/RS256/session/refresh/protection/log evidence requires the future Production resources. |
| NEON-01 | Schema/Migration parity | PARTIAL | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Authorized reader proves only ledger `0001`–`0008`; repository application schema extends later. Gate F is not authorized. |
| NEON-02 | Role/ACL foundation | PASS | AUTOMATABLE | Sprint 34 reader and application Function ACL evidence passes. Preserve all role separation and pgcrypto classification. |
| NEON-03 | Capacity/headroom | PARTIAL | USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | Compute bounds/metrics exist, but accepted workload thresholds and headroom evidence do not. |
| NEON-04 | Backup/snapshot | PARTIAL / NOT_CONFIGURED | USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | PITR has six hours; scheduled snapshot is disabled and no independent snapshot evidence exists. |
| NEON-05 | Restore/RPO/RTO | BLOCKED | USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | No isolated restore drill proves RPO 15 minutes / RTO 60 minutes. Live-branch restore is forbidden. |
| RENDER-01 | Production API service | NOT_CONFIGURED | USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | Only `bankeban-staging-node-api` exists. It cannot be renamed/promoted as Production. |
| RENDER-02 | Runtime/build/start/deploy | NOT_CONFIGURED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Production runtime, region, commands, immutable SHA and auto-deploy policy await a separate service. |
| RENDER-03 | Protected variables/CORS | NOT_CONFIGURED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Exact Production DB/Auth0/HMAC/VAPID/origin variables cannot be validated before resources and final origin exist. |
| RENDER-04 | Health/readiness/rollback | BLOCKED | AUTOMATABLE, USER_ACTION, EVIDENCE_MISSING | No Production URL/deploy history exists; HTTP and rollback evidence are impossible. |
| NETLIFY-01 | Production frontend/deploy | NOT_CONFIGURED | USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | Project has Preview history but has never had a Production Deploy. |
| NETLIFY-02 | Build environment | NOT_CONFIGURED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Production public config, `dataBackend=postgres`, API/Auth0/VAPID and cache isolation are unproved. Private backend values are forbidden. |
| NETLIFY-03 | Rollback | BLOCKED | AUTOMATABLE, USER_ACTION, EVIDENCE_MISSING | No Production deploy history, accepted alias or immutable previous artifact exists. |
| DNS-01 | Domain ownership/records | UNKNOWN | USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Approved domain, current records and rollback values are not evidenced. |
| DNS-02 | TLS/security path | UNKNOWN | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Certificate, HTTPS redirect, HSTS and exact-origin parity cannot be validated before domain configuration. |
| MON-01 | API/frontend alerts | BLOCKED | AUTOMATABLE, USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | Repository telemetry exists, but Production dashboards, thresholds, delivery channel and named responder do not. |
| MON-02 | DB/Push/backup alerts | PARTIAL / BLOCKED | AUTOMATABLE, USER_ACTION, BILLING_REQUIRED, APPROVAL_REQUIRED, EVIDENCE_MISSING | Neon charts exist; alert delivery, Push queue/dead-letter and backup-failure response are unproved. |
| SEC-01 | Production runtime Secrets | NOT_CONFIGURED | USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Distinct API, Push, HMAC and VAPID protected values are not provisioned/evidenced. Values must never enter Git/chat. |
| SEC-02 | Production operator credentials | PARTIAL | USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Neon read-only boundary exists; exact least-privilege Netlify/Render/Auth0 read authority is not established. |
| ISO-01 | External environment isolation | PARTIAL | AUTOMATABLE, USER_ACTION, EVIDENCE_MISSING | Repository isolation passes; independent Production Auth0/Render/Netlify/VAPID/origins do not exist. |
| REL-01 | Release candidate | BLOCKED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | No immutable Production frontend/API candidate or full public evidence exists. |
| REL-02 | End-to-end rollback | BLOCKED | AUTOMATABLE, USER_ACTION, APPROVAL_REQUIRED, EVIDENCE_MISSING | Current Google Sheets path remains the baseline, but Production API/frontend/Migration rollback has not been rehearsed. |
| REL-03 | Go-live authority | BLOCKED | USER_ACTION, APPROVAL_REQUIRED | Gate G is forbidden until every preceding Blocker/High gate is direct-evidence PASS. |

## 4. Platform preflight

### Auth0 Production

Current evidence remains: one US-5 `DEVELOPMENT` Tenant, Bankeban Staging SPA, no Production Tenant/SPA/API, and **Tenant Limit Reached**.

Safe options, without taking action:

1. **Preferred:** owner reviews the Auth0 Team plan and approves capacity for a dedicated Production Tenant. This may require billing and must preserve the Development Tenant.
2. Owner may evaluate a separately governed Auth0 Team/account/subscription for Production. Ownership, recovery, billing and access control must be approved before use.
3. **Rejected:** reuse the Development Tenant as Production. This violates isolation.
4. **Rejected:** delete the Development Tenant to free capacity. It risks Staging and is explicitly forbidden.
5. **Safe default:** defer Gate A and keep Production NO-GO.

No exact price or entitlement is asserted. The owner must read the current quote in Auth0; viewing it does not authorize purchase.

### Neon Production

- Existing `neondb` and Sprint 34 read-only/ACL foundation must be preserved; a duplicate database is not the default.
- Before Gate B/F: record accepted capacity thresholds, approve recovery retention/snapshot approach, prove isolated restore, reconcile tracked Migration manifest with ledger, and approve backward-compatible apply/rollback or forward-fix.
- Required distinct roles remain Owner, Migrator, API, Push worker and read-only evidence. No credential may substitute for another.
- Gate B may configure recovery/capacity only after approval. Gate F is a later, separate Migration approval.

### Render Production

- The existing Staging service remains Staging. The future Production service needs a distinct identity, URL, protected variables and logs.
- Expected configuration derives from the existing Node architecture: `BANK_ENV=production`, exact OIDC/JWKS/audience/session claim, exact `BANK_ALLOWED_ORIGINS`, immutable build SHA, dedicated API/Push DB roles, tenant-context key/key ID, Production VAPID pair, health and readiness.
- Default first-release auto-deploy decision remains OFF until the owner approves otherwise.
- Preflight cannot validate runtime, CORS, readiness, rollback or provider delivery because no Production service exists.

### Netlify Production

- Deploy Preview evidence is not Production evidence. The current Project has no Production Deploy.
- A future candidate may contain only public Production frontend settings: Production API URL, public Auth0 configuration, Workspace scope, build SHA and VAPID public key. It must contain no database URL, private key or management token.
- Candidate acceptance requires Production cache/storage/manifest identity, security headers, deep-route behavior, `dataBackend=postgres`, no Staging/placeholder/Google Sheets transport, immutable commit and rollback artifact.
- Domain/DNS/TLS and traffic remain later independent approvals.

## 5. Verified provisioning order

The project-specific order remains ADR 0022, not the generic database-first example:

1. **Governance precondition:** owner decisions for provider ownership, budget, final naming/origins and one-gate authority.
2. **Gate A — Auth0 capacity and Production identity.** The external Tenant limit is the first administrative blocker. Reserve final frontend origin/audience names; finalize exact allowlists after the frontend origin exists.
3. **Gate B — Neon recovery and capacity readiness.** Preserve the existing Production database and role model; no Migration.
4. **Gate C — Render Production API/Push boundary.** Requires Auth0 public identity and Neon protected-role readiness.
5. **Gate D — Netlify Production candidate.** Requires stable Render API and Auth0 public configuration; no traffic.
6. **Gate E — DNS/TLS and exact origin closure.** Finalize Auth0 callbacks/web origins and Render CORS only for the approved Production origin.
7. **Monitoring/alerting and backup/restore evidence closure.** Must be operational before schema or traffic risk.
8. **Gate F — Production Migration.** Separate explicit approval after schema diff/checksum/recovery evidence.
9. **Production evidence + repository Release Gate.** Every Blocker/High item must pass.
10. **Gate G — traffic.** Separate go/no-go with immediate rollback to the accepted prior path.

Auth0 and Neon planning can be analyzed independently, but mutations must remain serial and separately approved. No step may use Staging credentials or resources as Production.

## 6. Production Provisioning Authorization Gate

Current decision: **NO-GO**.

GO is allowed only when all conditions below are directly evidenced:

- provider ownership, budget and exact human approval for the next single gate;
- dedicated Auth0 Production Tenant/SPA/API and exact public/security configuration;
- Neon capacity, backup/restore/RPO/RTO and schema/Migration plan accepted;
- distinct Render Production service, least-privilege variables, health/readiness, logging and rollback accepted;
- immutable Netlify Production candidate, headers/cache/environment isolation and rollback accepted;
- domain/DNS/TLS and exact origin parity accepted;
- monitoring/alerts and named responders accepted;
- Production Secrets exist only in approved stores, with role/key separation and evidence by presence/fingerprint;
- full Production evidence validator, repository gates, device matrix and rollback rehearsal PASS;
- Gate G owner authorization recorded separately.

Any missing item produces NO-GO. Planning completion never produces GO.

## 7. Safely automatable work remaining

Codex can safely complete the following only after inputs/resources exist and read-only authority is proven:

- repository manifest and environment-variable-name validation;
- public Auth0 discovery/JWKS and public frontend/API HTTP/TLS/header validation;
- SELECT-only Neon schema/ledger inspection through the approved reader;
- artifact/config/cache/placeholder/Secret scans;
- readiness build-SHA, CORS rejection, VAPID fingerprint and sanitized evidence hash checks;
- Build, Check, tests, Release Gate, Production Repository Gate and dependency audit.

Codex cannot use this list to create resources or infer external PASS.

## 8. Sprint 37 decision

Sprint 37 is complete as a read-only Preflight and blocker consolidation. Production provisioning is **NO-GO** and readiness remains **70% / NOT READY**.

The next single human action remains **Gate A capacity decision only**: open Auth0 Team billing/subscription and Tenant-capacity views, read the current non-secret entitlement and quote, do not purchase or create anything, and report whether dedicated Production Tenant capacity is available and whether the owner approves a paid-capacity proposal for a later separately authorized action.
