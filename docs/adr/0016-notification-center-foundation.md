# ADR 0016 — Notification Center Foundation

## Status

Accepted for implementation; Staging database acceptance pending.

## Context

Bankeban needs an in-App inbox for schedule and time-off changes. The current platform already has transactional outbox events, live Session/Membership/Workspace authorization, controlled PostgreSQL functions, deterministic bootstrap revision synchronization, cross-tab signals, and a Service Worker revision message. Adding a separate realtime or push architecture would duplicate these boundaries and increase failure modes.

## Decision

1. Store notifications in one additive `notifications` table scoped by both `workspace_id` and `recipient_user_id`.
2. Project supported existing outbox events into notifications in the same database transaction. A failed business command therefore cannot leave a successful notification behind.
3. Never copy leave reasons, review notes, email addresses, phone numbers, tokens, Session IDs, or credentials into notification content.
4. Keep the API Role off the table. It may execute only the reviewed list, revision, and read-state command functions.
5. Resolve recipients from live Workspace Membership or the Time-Off request's employee mapping, never from client-supplied recipient data.
6. Keep read state idempotent and revision-protected through the existing Command API.
7. Include the authenticated recipient's notification revision summary in the existing deterministic bootstrap revision.
8. Reuse Smart Polling, BroadcastChannel/storage, and Service Worker revision signals. Do not add WebSocket, SSE, Firebase Push, APNs, email, or SMS in this foundation.
9. Bound the initial inbox to 100 recipient rows and sort unread first, then newest.
10. Treat an absent additive `0014` function as an unavailable optional capability so an automatic Staging code deploy cannot break the already accepted bootstrap before the controlled Migration Sprint. Reads return an empty `available: false` result, mutations fail closed, and all other database errors remain failures.

## Consequences

- Cross-Workspace and cross-recipient access fail closed through live authorization, function filters, and forced RLS.
- The application gains no direct table privilege and no second sync controller.
- Notification generation depends on reviewed outbox event contracts.
- Migration `0014_notification_center` must pass isolated Neon Staging apply/down/reapply, least-privilege, dual-Workspace, privacy, and browser/device acceptance before any Production consideration.
