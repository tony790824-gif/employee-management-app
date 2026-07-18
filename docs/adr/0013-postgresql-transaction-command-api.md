# ADR 0013 — PostgreSQL transaction and multi-tenant command foundation

- Date: 2026-07-18
- Status: Accepted for implementation; cutover not approved

## Context

The application currently persists an A1 JSON snapshot through Apps Script and Google Sheets. It cannot provide relational constraints, durable command idempotency, row-level tenant isolation, or an auditable transaction boundary suitable for SaaS operation.

## Decision

Adopt PostgreSQL using versioned SQL migrations. Every tenant business row carries `workspace_id`; FORCE RLS reads the transaction-local tenant context. API code first verifies JWT claims, then verifies active workspace membership inside the same database transaction before executing a command.

Mutations use explicit commands, strict input allowlists, idempotency receipts, optimistic revision checks where applicable, audit records, and an outbox event in one transaction. The first supported commands are employee creation, shift creation, monthly leave replacement, employee clock-in/out, and attendance-hour approval.

Google Sheets remains active during strangler migration. Snapshot import validates and maps existing data but never imports legacy PIN or activation secrets. Identity records require reenrollment.

## Rejected alternatives

- Continuing whole-snapshot writes: insufficient constraints and concurrency safety.
- Client-supplied tenant filters without RLS: one missing predicate could disclose another tenant.
- Direct frontend database access: couples authorization to clients and cannot enforce transactional commands.
- Importing existing credential hashes: unsafe and incompatible with a formal Identity Provider.

## Consequences

This adds a separate Node API and PostgreSQL runtime dependency. Operational cutover now requires a managed database, external Identity Provider, live migration rehearsal, monitoring, backup/restore proof, and E2E acceptance. Existing Production behavior is unchanged until those gates pass.
