# ADR 0017 — Standard Web Push as best-effort Notification Center delivery

## Status

Accepted for Staging implementation. Windows Chrome has prior owner delivery
evidence. Android Chrome installed-PWA background delivery was owner-verified
after 20:22 (Asia/Taipei) on 2026-07-30. iPhone/iPad Home Screen PWA and the
remaining cross-device release gate remain `PENDING USER VERIFICATION`.

## Decision

1. Keep PostgreSQL Notification Center as the authoritative notification record. Web Push is only a best-effort delivery channel.
2. Use the browser Push API, Notifications API, Service Worker, VAPID, and the maintained `web-push` Node package. Do not add Firebase, APNs SDKs, email, or SMS.
3. Add Migration `0016_web_push_subscriptions` with Workspace/User/Session-scoped subscriptions and a durable delivery queue. Both tables use composite tenant foreign keys, forced RLS, and no PUBLIC access.
4. The API Role may execute only `api_push_status` and `api_execute_push_command`; it has no direct table access.
5. A distinct non-owner Web Push worker Role may execute only the claim and completion functions. It has no table, sequence, schema-owner, role-management, or RLS-bypass capability.
6. Notification inserts enqueue minimal payloads transactionally. Payloads contain only notification ID, type, safe title/body, and a same-origin Notification Center path.
7. Registration, removal, and test delivery remain authenticated, Session-bound, Membership-authorized, idempotent Commands. Test delivery is limited to three attempts per ten minutes per recipient.
8. Delivery uses bounded batches, `FOR UPDATE SKIP LOCKED`, three attempts, delayed retry, and automatic endpoint revocation on HTTP 404/410.
9. VAPID private material and the worker database URL remain server-side secrets. Only the public VAPID key may be embedded in a Staging PostgreSQL frontend build.
10. iPhone/iPad permission may be requested only after a user gesture and only from a Home Screen web app. An ordinary Safari tab remains supported through the in-App Notification Center but is not reported as background-push capable.
11. Endpoint validation is a strict, shared provider allowlist: Google FCM
    (`fcm.googleapis.com`), Mozilla Autopush
    (`updates.push.services.mozilla.com`), Apple Push (`push.apple.com` and subdomains),
    and Microsoft WNS (`notify.windows.com` and subdomains). Registration,
    unregistration, and test delivery use the same policy; arbitrary HTTPS and lookalike
    suffixes fail closed.
12. For Chrome and Android, `fcm.googleapis.com` is the browser-created standard
    Web Push transport endpoint. This does not authorize a Firebase SDK, Firebase
    project, FCM registration token, or a second Service Worker. Browser
    subscription keys and VAPID remain the only accepted delivery contract.
13. A standalone PWA reports only its same-Origin WindowClient identity to the
    controlling Service Worker. Notification click prefers that client over an
    ordinary Browser tab, focuses it without navigation/reload, and uses one
    same-scope `openWindow` fallback only when no suitable PWA client is open.
14. Click destinations are exact local allowlist entries. Clock events open
    Attendance, shift events open Schedule, and leave/time-off events open
    Time-Off. Unknown types and malformed/external destinations fail closed to
    Notification Center; payload URLs never create an open redirect.

## Consequences

- Push service outages cannot erase or replace Notification Center records.
- A disabled/missing additive migration fails closed as an unavailable optional capability.
- Actual background delivery depends on Staging worker secrets and browser/device permission. Automated tests do not count as real-device acceptance.
- Production remains unchanged until a separate approval and release review.
