# Sprint 30 Offline First — Staging acceptance

## Status

Implementation and automated gates are complete. Physical-device results remain
**PENDING USER VERIFICATION**. This checklist is restricted to the isolated `STAGING POSTGRES`
Draft; it is not Production approval.

## Implemented boundary

- Cached reads: bootstrap, employees, shifts, time-off requests, and notifications.
- Queueable writes: clock in/out, monthly leave replacement, schedule/time-off submit/cancel, and
  existing shift creation.
- Delivery: one retained idempotency key, exact-input de-duplication, sequential drain, bounded
  exponential backoff, and automatic retry after `online`.
- Conflict safety: queued base revision must match the current server revision. A mismatch stops
  replay and requires explicit user review/discard.
- Account safety: cache/queue is bound to a one-way Session identity and cleared on logout or
  account switch. Tokens, cookies, raw Session IDs, email, and secrets are excluded.

## Intentional limitations

1. A cold start while entirely offline cannot establish Auth0 or the Bankeban App Session. The
   user must first load and authenticate online; offline mode never bypasses authorization.
2. The backend has no `shifts.update` or `shifts.delete` Command, so those operations are not
   queued or simulated.
3. A conflict is not auto-merged. The user discards the queued operation, receives current server
   truth, and performs the intended action again.

## Windows Chrome / Edge

1. Open the current `STAGING POSTGRES` Draft online and sign in.
2. Open schedule, time-off, employee, and Notification Center views once.
3. In DevTools Network, select Offline. Expected: cached data remains readable and the UI shows
   an offline state without logout or a blank screen.
4. Perform one clock action and one time-off submission. Expected: each reports safe local pending
   status; double-clicking does not add or send a duplicate.
5. If the account is a manager, create one synthetic Staging shift. Expected: it is queued, not
   falsely shown as server-persisted.
6. Restore Online. Expected: queued Commands send once in order, pending status clears, canonical
   bootstrap refreshes, and reload retains the server result.
7. Repeat with a queued action, but change the same Workspace from a second authenticated client
   before reconnecting. Expected: replay stops with a conflict; no overwrite occurs.
8. Choose the explicit discard action. Expected: no write is sent, server truth reloads, and the
   conflict disappears.
9. Logout, then sign in as the other synthetic user. Expected: the prior user's cached data and
   pending queue are not visible.

## iPhone / iPad Home Screen PWA and Android PWA

1. Install/open the existing Staging PWA while online and sign in.
2. Visit schedule, time-off, and Notification Center, then enable airplane mode.
3. Return to each view. Expected: last verified data remains visible; the app does not claim that
   it is current server data.
4. Queue one supported employee operation. Expected: a clear pending/offline message appears and
   repeated taps create only one pending operation.
5. Disable airplane mode without reloading. Expected: recovery runs automatically and the server
   result appears after canonical bootstrap refresh.
6. Background and reopen the PWA during recovery. Expected: no duplicate Command, no lost pending
   state, no logout, and no full-page reset.
7. Logout and switch accounts. Expected: no prior-user data or pending action is displayed.

## PASS / FAIL / BLOCKED

- **PASS:** every applicable step completes with one server write per intent, correct post-recovery
  data, no cross-account exposure, and no console error containing sensitive data.
- **FAIL:** duplicate server writes, silent data loss, false success before replay, stale cache after
  successful recovery, unauthorized cross-account data, or an automatic overwrite on conflict.
- **BLOCKED:** device/network tooling cannot reproduce offline/online transitions, Staging service
  is unavailable, or the required synthetic account lacks an existing supported operation.

Record only device/browser/PWA version, PASS/FAIL/BLOCKED, safe HTTP status/error code/request ID,
and observation time. Do not record tokens, cookies, Session IDs, credentials, or complete request
payloads.
