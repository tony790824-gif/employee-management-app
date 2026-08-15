# ADR 0020 — Production Security and Operations Gate

Date: 2026-08-04

Status: Accepted

## Context

Sprint 33A separated 98% product completion from 62% Production readiness. The remaining release blockers require a mixture of repository controls, isolated Staging evidence, physical-device evidence, and explicitly authorized changes to Production services. Treating repository automation as proof of an external Production change would violate the project constitution.

## Options

1. Directly create or modify Production services, apply schema, configure Auth0, and run recovery exercises in one Sprint. This could close external evidence quickly, but combines unrelated failure domains, requires new authority and credentials, risks business data, and weakens rollback control. Rejected.
2. Build a fail-closed repository gate and rehearse every safe control in Staging, then require separately approved external evidence for Production schema, Auth0, recovery, monitoring, capacity, and device gates. This preserves architecture, limits blast radius, and produces an auditable promotion sequence. Accepted.

## Decision

- Add environment-specific frontend security headers generated from the selected build profile. Production cannot allow Staging API/Auth0 origins, and PostgreSQL Staging cannot allow Google Sheets transport.
- Add bounded, authenticated per-Session rate limits. They complement rather than replace an upstream edge/WAF control.
- Add immutable build identity to health/readiness and structured per-request operational logs without subject, Session, token, cookie, payload, or personal data.
- Add a strictly read-only schema inspector that requires a distinct database credential, TLS, approved host, explicit `neondb`, and read-only transaction mode.
- Add read-only Auth0 discovery/JWKS validation, a bounded Staging capacity probe, VAPID public-key parity validation, a tracked-file sensitive scan, and a repository Production gate.
- Add a non-deploying GitHub quality workflow with read-only repository permission. Production deployment, schema apply, Auth0 mutation, and recovery mutation remain manual approval gates.
- Keep Production on its current Google Sheets path until all external gates in the Production Operations Runbook are accepted. No CI job may deploy or receive Production database credentials.

## Review

- CTO/Product: separates implemented scope from release authority and prevents a false launch claim.
- Frontend/PWA: headers are environment-derived and preserve current inline/style compatibility; stricter nonce removal is future hardening.
- Backend/Security: rate limiting is bounded and principal-scoped after verified JWT; CORS remains non-authoritative.
- Database: the status inspection uses one explicit `READ ONLY` transaction and reads only identity plus Migration ledger/checksums, never ledger creation, business rows, locks, Migration, or DDL.
- QA/DevOps: CI is deterministic and non-deploying; external Production gates remain visible and cannot be auto-passed.

## Consequences

Repository and Staging controls can pass without touching Production. Production remains blocked until the owner separately authorizes and records the external actions. This ADR does not approve a Production deploy, Migration, Auth0 change, database write, or destructive restore.
