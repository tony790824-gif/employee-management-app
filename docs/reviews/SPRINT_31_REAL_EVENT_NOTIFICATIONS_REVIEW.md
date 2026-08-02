# Sprint 31 Real Event Notifications Review

Status: **PENDING USER VERIFICATION**
Automated/Staging database status: PASS
Overall assessed completion: **97%**

## Accepted implementation

- Employee clock-in/out → all active same-Workspace boss/manager recipients, excluding actor.
- Scheduled/ad-hoc leave submission → active reviewers only; approval/rejection → applicant only.
- Existing shift creation/direct approved leave update → affected employee only.
- Central recipient resolver, bounded metadata, same-origin destination, deterministic recipient deduplication, and clock/leave/shift preferences.
- Existing Notification Center, Badge, revision sync, durable Web Push queue, bounded retry, 404/410 cleanup, and diagnostic `push.test` remain intact.

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
5. Check system notification, Notification Center row, unread Badge, mark-read synchronization, and notification click opening/focusing the app.
6. Disable each preference category and repeat one matching event; verify no new matching row or Push while other categories and `push.test` still work.
7. Repeat one negative attempt using Workspace B and confirm no cross-Workspace notification.

Record each device as PASS/FAIL/BLOCKED. No physical-device item is currently claimed PASS by Codex.

## Scope boundaries

Production, Production database/Auth0, Google Sheets, Apps Script, and Production deployment were not touched. `0009`/`0010` remain pending. Announcement and unavailable shift update/delete Commands remain out of scope.
