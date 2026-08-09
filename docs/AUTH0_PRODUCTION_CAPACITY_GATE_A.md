# Auth0 Production Capacity Evidence and Gate A Proposal

Date: 2026-08-09

Status: **EVIDENCE RECORDED / EXECUTION DEFERRED / PRODUCTION NO-GO**

Production readiness: **70% / NOT READY**

## Sprint 39 final cost-package addendum

The total-cost model in `docs/PRODUCTION_TOTAL_COST_GATE_A.md` confirms that Auth0's US$35/month is only one component. Sprint 40 corrects the known fixed planning floor to US$49/month plus Neon actual usage and unknown items after Netlify Free/US$0 evidence. Because recovery, domain, monitoring/alerting, overage and Netlify capacity remain open, the final Gate A recommendation remains **DEFER**.

Essentials remains the preferred future minimum-capacity candidate. No purchase, payment, upgrade, Tenant/Application/API creation or other Gate A execution is authorized.

This document records owner-observed, read-only Auth0 Team subscription and Tenant-capacity evidence. It is a decision proposal only. It does not authorize a plan upgrade, payment method, purchase, Tenant/Application/API creation, Auth0 configuration change, Secret access, deployment, Migration, database operation, DNS change, or traffic switch.

## 1. Evidence boundary

The owner inspected the Auth0 Team console without changing it and reported:

| Evidence | Observed state | Gate status |
| --- | --- | --- |
| Current plan | Free | PASS (capacity evidence only) |
| Current monthly Auth0 charge | US$0 | PASS (point-in-time evidence only) |
| Team Tenant entitlement | 1 Tenant | PASS (capacity evidence only) |
| Existing Tenant environment | Development | PASS (Staging identity only) |
| Additional Tenant creation | Console reports Tenant limit reached and requires an upgrade | BLOCKED |
| Independent Production Tenant | Not configured | NOT_CONFIGURED |
| Essentials quote | US$35/month, 500 MAU, 3 Tenants, up to 10 Actions, 1,000 M2M Tokens | PASS (point-in-time owner evidence) |
| Professional quote | US$240/month, 1,000 MAU, 12 Tenants, up to 15 Actions | PASS (point-in-time owner evidence) |
| Enterprise quote | Contact sales | UNKNOWN |

No screenshot containing account, billing, Tenant, owner, or personal identifiers is stored in the repository. The sanitized evidence is hashed in `docs/PRODUCTION_EVIDENCE_HASHES.json`. Prices and plan entitlements can change and must be rechecked in Auth0 immediately before any later purchase authorization.

## 2. Required identity boundary

A dedicated Production Tenant remains required by the accepted environment-isolation policy. Separate Applications or APIs inside the existing Development Tenant can reduce some accidental configuration overlap, but they do not provide an independent issuer, Tenant-wide configuration, connection, Action, log, administrator, rate-limit, incident, or blast-radius boundary.

The existing Development Tenant and Bankeban Staging resources must therefore remain Staging-only. Unknown or incomplete Production identity configuration stays fail-closed and cannot be substituted with Staging evidence.

## 3. Options

| Option | Capacity | Security / architecture | Cost and delivery | Decision |
| --- | --- | --- | --- | --- |
| A. Upgrade to Auth0 Essentials | The observed 3-Tenant entitlement can accommodate Development, Staging, and Production isolation | Matches the dedicated Production Tenant requirement, subject to later PKCE, RS256, refresh, Actions, connections, allowlists, logs and security-event validation | Observed quote US$35/month or US$420/year; Auth0 cost only | **Preferred target architecture; execution DEFERRED** |
| B. Stay Free and add Production SPA/API to the Development Tenant | Fits the single existing Tenant but not the independent Tenant requirement | Shared issuer/Tenant settings, connections, Actions, logs, administrators, rate limits and incident blast radius; non-compliant with ADR 0022 isolation | No additional Auth0 subscription cost, but unacceptable security coupling | **REJECT** |
| C. Replace Auth0 with another identity provider | Unknown until a separate vendor and capacity audit | Requires a new identity architecture, JWT/JWKS contract review, frontend/backend changes, Google login and user migration design, operations and security revalidation | Unknown migration and long-term operating cost | **REJECT for current gate; do not start migration** |
| D. Defer Production identity provisioning | Staging continues on the existing Development Tenant; Production identity remains absent | Preserves the current safety boundary and avoids a shared-Tenant shortcut | Delays Production provisioning and leaves Gates C-D dependent on missing public identity values | **APPROVE as current temporary state** |

The quoted US$35/month is not the total Production cost. Neon recovery/capacity, Render, Netlify, domain/DNS, monitoring/alerting, backup/restore, and operating ownership remain separate open cost and evidence items.

## 4. Gate A proposal answers

1. **Is a dedicated Production Tenant necessary?** Yes, under the current accepted isolation architecture.
2. **Is the Free plan sufficient?** No. The observed one-Tenant limit is already occupied by the Development Tenant.
3. **Is Essentials the minimum observed sufficient capacity?** Yes for Tenant count: the observed three-Tenant entitlement can separate Development, Staging, and Production. Feature and security acceptance still require later direct validation.
4. **Should US$35/month be spent now?** No. Production remains NO-GO and the remaining platform, recovery, monitoring, DNS, schema, rollback, and total-cost gates are not closed.
5. **What is the Gate A recommendation?** **DEFER execution now.** Retain Option A as the approved target architecture to reconsider after the broader Production cost envelope and release timeline receive owner approval.
6. **What happens if no upgrade is made now?** Staging continues unchanged; Production Tenant/SPA/API remain NOT_CONFIGURED; Production remains NO-GO; Gates requiring stable Production issuer/audience/client values cannot execute.
7. **Is rollback possible after a later approved Gate A execution?** Before traffic, disable the newly created Production Application/API and retain an audit record. Plan downgrade, Tenant retention/deletion, export, and billing effects must be rechecked with Auth0 before purchase; none is assumed here.

## 5. Authorization boundary

`DEFER` is the current recommendation. Even a later proposal-level `APPROVE` would authorize neither platform execution nor spending. A separate user instruction must explicitly authorize the exact Auth0 plan action and must restate:

- current quote and billing impact;
- Tenant ownership and administrator recovery;
- Staging and Production impact;
- intended Production Tenant/Application/API names without Secrets;
- rollback/disable and billing cancellation constraints;
- acceptance evidence and stop conditions.

No Gate B-G action inherits authority from Gate A.

## 6. Current result

- Capacity/pricing evidence: **PASS (point-in-time, read-only evidence)**
- Free plan for dedicated Production Tenant: **FAIL / INSUFFICIENT CAPACITY**
- Independent Production identity: **NOT_CONFIGURED**
- Gate A execution: **DEFERRED / NOT AUTHORIZED**
- Production provisioning: **NO-GO**
- Production readiness: **70% / NOT READY**
- Production mutation: **NONE**

The next Sprint should close the remaining Production cost envelope and Gate A authorization package without purchasing, creating, deploying, migrating, or changing Production.
