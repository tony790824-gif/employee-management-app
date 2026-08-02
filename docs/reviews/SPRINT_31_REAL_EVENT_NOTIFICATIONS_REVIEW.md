# Sprint 31 Real Event Notifications Review

Status: **PENDING USER VERIFICATION**
Automated/Staging database status: PASS
Overall assessed completion: **97%**

## Final duplicate-delivery hardening

- Staging-only Migration `0020_push_subscription_priority` adds validated `client_mode` (`pwa` or `browser`) to the existing subscription model. Older callers safely default to Browser.
- Recipient delivery selects all active PWA subscriptions for the Workspace/User. Browser subscriptions are used only when there is no active PWA, so multiple legitimate installed PWA devices remain reachable while Browser fallback does not duplicate them.
- The signal comes from the existing standalone display-mode check, not User Agent alone. No fingerprint, Firebase token, second Service Worker, or second Notification Center record was added.
- Checksum and least-privilege inspection plus synthetic Windows/Android/iOS priority, Browser fallback, Workspace isolation, deduplication, Badge, and notificationclick regression pass. Windows physical duplicate-notification verification remains pending.

## Accepted implementation

- Employee clock-in/out → all active same-Workspace boss/manager recipients, excluding actor.
- Scheduled/ad-hoc leave submission → active reviewers only; approval/rejection → applicant only.
- Existing shift creation/direct approved leave update → affected employee only.
- Central recipient resolver, bounded metadata, same-origin destination, deterministic recipient deduplication, and clock/leave/shift preferences.
- Existing Notification Center, Badge, revision sync, durable Web Push queue, bounded retry, 404/410 cleanup, and diagnostic `push.test` remain intact.
- The notification-click hotfix records only the installed PWA client identity, prefers that client over a Browser tab, focuses it without navigation/reload, and uses one in-scope `openWindow` fallback only when no suitable PWA client is open.
- Click destinations are an exact local allowlist: clock events → Attendance, shift events → Schedule, and leave/time-off events → Time-Off. External, protocol-relative, `javascript:`, `data:`, extra-query, hash, and unknown destinations fail closed to Notification Center.

## Database evidence

- Migration: `0019_real_event_notifications`
- Checksum: `34ea99054d2e4484884ff0f8f89a4348dd0a8bed9fcaf8b57aceef03664b05d6`
- Neon Staging apply/down/reapply: PASS
- API Role direct notification/preference table access: DENIED
- Controlled-function allowlist and PUBLIC revocation: PASS
- Synthetic Workspace A/B fixtures: cleaned after E2E

## Automated evidence

Manager fan-out, actor exclusion, applicant/affected-employee targeting, preference suppression, idempotent replay, cross-recipient/cross-Workspace denial, private-reason exclusion, badge/revision refresh, multi-device delivery uniqueness, bounded retry, and 404/410 cleanup pass. Existing test notification remains independent.

## Physical-device checklist

For Windows and each installed iPhone/iPad/Android PWA:

1. Enable Push for boss/manager and employee devices.
2. Perform employee clock-in and clock-out; verify only reviewer devices receive one event each.
3. Submit scheduled and ad-hoc leave; verify reviewers receive the submissions. Approve one and reject one; verify only the applicant receives results.
4. Create a shift for the employee; verify only that employee receives the schedule event.
5. Check system notification, Notification Center row, unread Badge, mark-read synchronization, and notification click focusing the installed PWA (not a Browser tab): clock → Attendance, shift → Schedule, leave/time-off → Time-Off.
6. Close the installed PWA, keep a same-Origin Browser tab open, click another notification, and verify one installed PWA window opens at the allowlisted destination without forcing a valid Session to log in again.
7. Disable each preference category and repeat one matching event; verify no new matching row or Push while other categories and `push.test` still work.
8. Repeat one negative attempt using Workspace B and confirm no cross-Workspace notification.

Record each device as PASS/FAIL/BLOCKED. No physical-device item is currently claimed PASS by Codex.

## Scope boundaries

Production, Production database/Auth0, Google Sheets, Apps Script, and Production deployment were not touched. `0009`/`0010` remain pending. Announcement and unavailable shift update/delete Commands remain out of scope.
