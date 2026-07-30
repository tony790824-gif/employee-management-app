# ADR 0017 — Standard Web Push as best-effort Notification Center delivery

## Status

Accepted for Staging implementation. Windows and iPhone PWA delivery remain `PENDING USER VERIFICATION`.

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

## Consequences

- Push service outages cannot erase or replace Notification Center records.
- A disabled/missing additive migration fails closed as an unavailable optional capability.
- Actual background delivery depends on Staging worker secrets and browser/device permission. Automated tests do not count as real-device acceptance.
- Production remains unchanged until a separate approval and release review.
