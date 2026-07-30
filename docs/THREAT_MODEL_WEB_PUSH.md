# Standard Web Push threat model

## Sprint 29 release-gate hardening

- A desktop-style iPadOS user agent is treated as Apple mobile and must still be launched from
  an installed Home Screen PWA before Push activation.
- A permission-denied or unsupported activation that completes synchronously cannot retain a
  stale in-flight lock and block later controlled recovery.
- A browser subscription left after logout/account switching is never silently attached to a
  new Session; the existing controlled unregister/re-register flow is required.
- Repeated notification delivery uses a stable notification ID tag; notification click rejects
  external targets and falls back to the same-origin Notification Center.
- Windows Edge, iPhone Home Screen PWA, and iPad Home Screen PWA remain physical-device
  **PENDING USER VERIFICATION**. This does not weaken the existing Session, Workspace, provider
  allowlist, or VAPID controls.

## Trust boundaries

- Browser/PWA subscription material is untrusted input until validated by the API and controlled database function.
- Auth0 access tokens establish identity but do not select the authorized Workspace; live local Session and Membership remain mandatory.
- Notification Center rows are authoritative. Push providers and delivery acknowledgements are not authoritative business state.
- The API, migration, and Web Push worker use distinct database credentials.

## Threats and controls

| Threat | Control |
|---|---|
| Forged Workspace/User/Session | Signed tenant context plus live user, Workspace, Membership, and local Session checks. |
| Cross-tenant subscription | Composite foreign keys, endpoint ownership conflict, forced RLS, and server-resolved identity. |
| Stolen API credential | No table access; controlled functions still require a valid signed tenant context. |
| Stolen worker credential | Separate role with only claim/complete execution; no table, schema-owner, role, or RLS-bypass privilege. |
| Endpoint/key leakage | No endpoint or subscription key in logs, API responses, audit payloads, push payloads, or Git. |
| Private VAPID key leakage | Secret-only server setting; build script exposes only the public key. |
| Push payload privacy leak | 3 KiB bounded allowlist payload containing notification metadata and a same-origin path only. |
| Malicious notification click URL | Service Worker accepts only a same-origin relative path and rejects protocol-relative/external URLs. |
| Replay/duplicate command | Existing idempotency receipts and request hashes. |
| Duplicate delivery | Unique notification/subscription key plus idempotent enqueue. |
| Provider outage | Durable queue, bounded retry/backoff, Notification Center remains readable. |
| Expired subscription | HTTP 404/410 revokes endpoint; other failures are bounded to three attempts. |
| Abusive test push | Current-user/current-Session endpoint only, three requests per ten minutes. |
| Former/suspended member | Authorization is rechecked before queue claim; invalid queued work is made dead. |
| Cross-environment contamination | Staging-only Migration/role tools, approved host/database checks, environment-specific PWA cache/build, no Production settings. |

## Residual risks

- The isolated Render Staging worker and protected VAPID settings are active; Production remains inactive.
- Browser vendor delivery is best effort and may be throttled.
- iPhone/iPad requires a Home Screen web app; ordinary Safari-tab behavior is not equivalent.
- Android Chrome installed-PWA background delivery was owner-verified after 20:22 (Asia/Taipei) on 2026-07-30 using a same-device Staging test notification. iPhone/iPad Home Screen PWA and remaining cross-device release evidence remain pending.
