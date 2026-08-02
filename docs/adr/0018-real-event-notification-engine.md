# ADR 0018: Transactional real-event notification engine

## Decision

Extend the existing `outbox_events → notifications → push_deliveries` path. Business Commands never call Web Push directly and browsers never create server notifications. The outbox insert and notification projection share the successful business transaction; provider delivery remains asynchronous.

Recipients are resolved by one database function from the current actor, active Workspace, live Membership role, affected employee mapping, and recipient preferences. Browser-supplied recipient IDs or roles are not accepted. The actor is excluded from manager notifications.

Supported events are clock-in, clock-out, leave submission, leave approval/rejection, and the existing schedule-create/direct-leave update paths. Unimplemented shift update/delete and announcement Commands are not simulated.

Each recipient row keeps the immutable source event plus a deterministic SHA-256 deduplication key. Each active Subscription still receives at most one durable delivery through the existing unique index. Metadata is an allowlisted, bounded object and never contains leave reasons, contact data, tokens, Session IDs, keys, or credentials.

## Consequences

- Notification Center remains the source of truth; Push is best-effort transport.
- Per-user clock/leave/shift settings suppress future matching rows and therefore both in-app and Push delivery for that category.
- Existing Smart Polling, Badge, read state, Service Worker click behavior, retries, and expired-subscription cleanup remain unchanged.
- Migration `0019_real_event_notifications` is additive, Staging-only, and has a guarded rollback that refuses silent loss of new event rows.
