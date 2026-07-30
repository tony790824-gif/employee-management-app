# Sprint 29 — Windows Edge and Apple Home Screen PWA Web Push release gate

## Status

**PARTIAL / PENDING USER VERIFICATION** as of 2026-07-30.

Starting baseline: `27ccc0aac2b1977365163874c2ed56459e9b4cd0`.
Current assessed project completion remains **95%** until the real-device matrix below is recorded.

Sprint 28 and the Android installed-PWA background-delivery evidence remain accepted.
Sprint 29 does not add another Push transport, Service Worker, API, database object,
Migration, Firebase project, APNs path, email path, or SMS path.

## Automated release-gate coverage

- Windows Edge and Chromium capability detection keeps the existing standard Web Push path.
- Desktop-style iPadOS user agents (`MacIntel` with touch support) are classified as
  `ipados`, not macOS.
- iPhone/iPad Push activation is accepted only from Home Screen standalone mode.
- A synchronously completed denied/unsupported activation cannot leave the Push operation
  lock permanently active.
- Repeated activation shares the existing in-flight operation and cannot create a duplicate
  browser subscription request.
- Disabling Push calls the controlled server unregister Command before browser unsubscribe.
- A stale browser subscription after logout/account switch is not silently rebound to the
  next Session; controlled re-registration is required.
- Notification click focuses a same-origin App client, opens the Notification Center, and
  fails closed from an external target to the same-origin Notification Center.
- Repeated delivery of one notification uses the stable notification ID as its system
  notification tag.
- Mark-all-read keeps the Notification Center unread count and PWA badge in agreement.
- Existing Session, Membership, Workspace, endpoint-provider, idempotency, RLS, and
  least-privilege boundaries remain unchanged.

## Windows Edge PWA — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in a clean Edge profile and sign in with a
   synthetic Staging account.
2. Install and launch the PWA. Confirm the environment label is `STAGING POSTGRES`.
3. Open Notification Center and select **啟用推播**. Expected: the permission flow completes,
   status becomes enabled, and one active device is shown.
4. Select **啟用推播** again if the control is available. Expected: no duplicate subscription
   and no duplicate active-device count.
5. Send one test notification while the PWA is foregrounded, then repeat while backgrounded
   or closed. Expected: Notification Center and the Windows system notification refer to the
   same item and do not duplicate it.
6. Click the system notification. Expected: the existing signed-in PWA is focused when
   available; otherwise one PWA window opens at Notification Center without an unnecessary
   login while the Session remains valid.
7. Compare the system notification, badge, unread count, list item, and target record. Mark it
   read and confirm the badge/unread count updates consistently.
8. Disable Push and send another test from another authorized Staging Session. Expected: the
   disabled device receives no system Push.
9. Re-enable Push and repeat the test. Expected: delivery resumes with one active subscription.
10. Log out, sign in as the other synthetic role, and open Notification Center. Expected: the
    previous account's subscription is not silently rebound and no cross-Workspace or
    cross-user notification is exposed.

## iPhone Home Screen PWA — PENDING USER VERIFICATION

1. In Safari, open the approved Draft, add it to the Home Screen, close the Safari tab, and
   launch only from the Home Screen icon. A Safari-tab test is not acceptance evidence.
2. Sign in with a synthetic Staging employee and enable Push from Notification Center.
3. Repeat the foreground, background, fully closed, notification-click, badge/list/read,
   disable, and re-subscribe checks from the Edge checklist.
4. Confirm notification click returns to the same Home Screen PWA and opens Notification
   Center without losing a still-valid Session.
5. Log out and switch synthetic accounts. Confirm no old subscription, notification, or badge
   is attributed to the new user.

## iPad Home Screen PWA — PENDING USER VERIFICATION

Repeat the iPhone checklist on a real iPad. Also confirm that the desktop-style Safari user
agent is still treated as iPadOS, ordinary Safari-tab activation shows the Home Screen
instruction, portrait/landscape layouts remain usable, and no duplicate subscription appears.

## Result rules and safe diagnostics

- **PASS:** every listed step for that physical device succeeds and the user records the
  device/browser version and observation time.
- **FAIL:** a listed result is reproducibly wrong. Record only the step, `Notification.permission`,
  safe capability booleans, HTTP status, safe API error code, and request ID.
- **BLOCKED / PENDING USER VERIFICATION:** the physical device, allowed Draft origin, or
  synthetic account is unavailable. Automation and viewport simulation never substitute for
  a real device.

Never record an Access Token, Cookie, Session ID, complete Push endpoint, subscription keys,
VAPID private key, password, database URL, or real personal data.

## Safety boundary

Production, Production database, Production Migration, Production Auth0, Google Sheets,
Apps Script, and Production deployment are not operated by this Sprint. All manual evidence
must use the isolated `STAGING POSTGRES` Draft and synthetic Staging identities.
