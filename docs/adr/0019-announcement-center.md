# ADR 0019: Announcement Center extends the existing Notification pipeline

Status: Accepted for Staging on 2026-08-03.

## Context

Bankeban needs Workspace announcements with audience filtering, read state, Web Push, and badge behavior. The product already has a transactional outbox, recipient-scoped Notification Center, durable Push queue/worker, bootstrap revision synchronization, subscription priority/fallback, and safe click navigation.

## Decision

Use `announcement` as the authoritative content table and `announcement_read` as the caller-scoped read marker. Both are Workspace-scoped, use composite tenant foreign keys, forced RLS, and soft delete. Boss/manager mutations run only through controlled SECURITY DEFINER functions; employees have audience-filtered reads only.

Publishing inserts `ANNOUNCEMENT_CREATED` into the existing outbox transaction. A narrow projection creates one notification per matching active Workspace member. Existing notification and push tables, Badge, delivery worker, deduplication, retry, PWA priority/fallback, and click handling remain authoritative.

Only exact same-origin `/announcements` and `/announcements/{uuid}` destinations are permitted. Read marking updates the Announcement marker and corresponding Notification Center read state in one controlled operation.

## Consequences

- There is no second Notification Center, Push worker, badge store, or Service Worker.
- API Role direct table access remains zero; public execution is revoked.
- Manager audiences are visible only to boss/manager; employees see `ALL` and `EMPLOYEE`.
- Soft-deleted announcements disappear from reads but remain auditable.
- Production adoption requires a separate explicit Migration/release decision after physical Staging acceptance.
