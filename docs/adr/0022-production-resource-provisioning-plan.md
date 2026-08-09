# ADR 0022: Gated Production resource provisioning

- Status: Accepted as plan; provisioning not authorized
- Date: 2026-08-09

## Context

Sprint 35 proved that the Production PostgreSQL reader boundary exists but that independent Auth0, Render and Netlify Production resources are not configured. Recovery, schema parity, capacity, DNS/TLS and rollback evidence remain incomplete. Creating all resources or changing traffic in one operation would combine identity, database, runtime, frontend and DNS failure domains and would violate the project's fail-closed authorization model.

## Decision

Use the ordered, one-gate-at-a-time plan in `docs/PRODUCTION_RESOURCE_PROVISIONING_PLAN.md`. Auth0, Neon recovery/capacity, Render, Netlify, DNS/TLS, Production Migration and Production traffic each require a separate human stop/approval. Approval never carries forward to another gate.

Staging and Production use independent identity, service, database-role, origin, cache/storage, VAPID, monitoring and recovery boundaries. Protected credentials remain in platform secret stores and evidence contains only public metadata, booleans, masked identifiers, counts and fingerprints. The current Google Sheets Production path remains the rollback baseline until a separately approved traffic cutover.

## Consequences

- Sprint 36 may complete with no Production mutation and without increasing the 70% readiness score.
- Sprint 37 read-only preflight confirmed the order and recorded a NO-GO decision. Blocker classification does not authorize or provision a resource.
- Sprint 38 proved the Free Tenant-capacity limit and recorded Essentials as the preferred future minimum-capacity route. Gate A execution remains DEFERRED; this evidence does not authorize spending or identity-resource creation.
- Sprint 39 established a fixed known cost floor plus explicit usage-based/unknown items. Gate A remains DEFERRED because a cost model does not close external Production gates or authorize billing.
- Sprint 40 replaced the assumed Netlify paid-plan component with verified Free/Credit-based US$0 evidence. Capacity remains unresolved, so Gate D and Gate A remain closed despite the lower fixed cost floor.
- Sprint 41 finalized fail-closed Minimum, Recommended and Growth cost models without converting variable or unknown costs to zero. Gate A remains DEFER because account-level Neon, domain, recovery and operating-cost evidence is incomplete.
- Missing resources remain `NOT_CONFIGURED`; missing authority/evidence remains `BLOCKED` or `UNKNOWN`.
- A future operator must stop before Gates A–G and present impact, cost, rollback and exact human steps.
- No plan, checklist, repository test or Staging result may be represented as Production PASS.

## Rejected alternatives

1. Promote the existing Staging Auth0/Render/Netlify resources. Rejected because it breaks environment isolation.
2. Provision all Production resources in one Sprint. Rejected because authorization and rollback cannot be isolated.
3. Apply Production Migrations before recovery and runtime evidence. Rejected because schema changes would lack a proven recovery boundary.
4. Raise readiness for completed documentation. Rejected because readiness is evidence-based.
