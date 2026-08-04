# ADR 0021: Fail-closed Production platform validation

- Status: Accepted
- Date: 2026-08-04

## Context

Sprint 33B established repository controls, but Production readiness still depended on external Netlify, Render, Neon, Auth0, DNS/TLS, monitoring and recovery evidence. Validation must not become an implicit deploy or use privileged credentials merely because they are available.

## Decision

Use one fail-closed validator requiring `BANK_ENV=production` and explicit `--production --read-only`. Public services are inspected only with bounded `GET`/`HEAD` requests. PostgreSQL inspection requires a distinct SELECT-only connection, enables transaction read-only mode and reads only schema/migration metadata. Reports distinguish `PASS`, `FAIL`, `BLOCKED` and `NOT_CONFIGURED`, redact sensitive material, and never raise readiness for unavailable evidence.

Platform dashboard evidence remains a human read-only gate. Deployment, Migration, restore, Auth0 mutation, configuration change, traffic change and real notification are outside this decision.

## Alternatives rejected

1. Use Owner/Migrator credentials or management API tokens for convenience. Rejected because their authority and blast radius violate read-only evidence collection.
2. Treat repository configuration or Staging success as Production PASS. Rejected because it fabricates external evidence.
3. Build one-off platform-specific scripts. Rejected because status/redaction/no-write rules could drift.

## Consequences

- Missing protected configuration produces an actionable blocked status instead of a false PASS.
- Production readiness remains 70% until direct external evidence is collected under explicit authorization.
- A separate Production release operation is still required after every validation gate passes.
