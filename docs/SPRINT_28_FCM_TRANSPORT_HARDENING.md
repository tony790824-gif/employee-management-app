# Sprint 28 — FCM standard Web Push transport hardening

## Decision boundary

ADR 0017 remains authoritative. Chrome and Android use the standard browser Push
API subscription whose provider hostname is `fcm.googleapis.com`. Bankeban sends
through VAPID and `web-push`; it does not use the Firebase SDK, a Firebase project,
an FCM registration token, or a second Service Worker.

## Automated and Staging evidence

- Exact FCM host accepted for Windows Chrome and Android subscription payloads.
- Arbitrary HTTPS and lookalike provider hosts rejected.
- Subscription created, updated in place, removed through the controlled Command,
  and re-registered without duplicate active rows.
- Synthetic Neon Staging HTTP 404 and 410 completion paths make the delivery dead
  and revoke only the affected subscription.
- Background Push renders one bounded system notification.
- Notification click focuses an existing same-origin client and opens Notification
  Center; it opens a same-origin window only when no suitable client exists.
- Browser-managed subscription changes notify the existing App to re-register.
- Foreground Notification Center and unread badge continue to refresh through the
  existing bootstrap revision path.
- Live Session, User, Membership, Workspace, endpoint ownership, RLS, API Role, and
  worker Role boundaries remain unchanged and cross-Workspace attempts fail closed.

All database evidence uses disposable synthetic Staging fixtures and removes them
after the test. No Production connection, Migration, schema change, or business
data operation is part of this Sprint.

## Real-device status

- Windows Chrome standard Web Push system delivery: prior owner evidence exists.
- Android Chrome / installed PWA: **PENDING USER VERIFICATION**.

Automated FCM endpoint tests do not substitute for a real Android device. Follow
the exact Android checklist at the top of `docs/NEXT_SPRINT.md`.
