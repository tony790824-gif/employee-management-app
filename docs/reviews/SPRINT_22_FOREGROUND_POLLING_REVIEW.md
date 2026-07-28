# Sprint 22 Architecture Review — Foreground Polling Synchronization

Date: 2026-07-28
Scope: PostgreSQL Staging frontend polling extension only

## A — CTO

The product needs approval changes to appear while an employee keeps the App in the foreground. Extending the accepted Sprint 21 controller is the smallest reversible design and avoids new infrastructure, protocols, APIs, or authorization paths.

## B — Senior frontend engineer

The implementation uses one poll timeout plus the existing debounce timer and shared in-flight promise. It preserves navigation, forms, modal state, scroll position, and the established bootstrap rendering path. Hidden/offline/unload/logout lifecycle cleanup prevents orphaned timers.

## C — Backend architect

No endpoint or contract is added. The existing authenticated bootstrap remains the authoritative revision transport, and the existing time-off read refresh remains responsible for request status. A future revision-only endpoint may reduce payload cost, but adding it here would exceed the approved scope.

## D — Database architect

No schema, migration, query, transaction, role, RLS, or data change is required. The server-issued deterministic revision remains the only data-change signal used by the frontend.

## E — Security engineer

Polling does not bypass Auth0, Session, Membership, Workspace, role, API-role, or RLS enforcement. It runs only for an authenticated PostgreSQL view, stops after Session clearing, and logs only safe error metadata. Google Sheets and Production paths do not install the listeners.

## F — QA lead

Fake-timer tests cover visible start, hidden stop, foreground resume, one timer, in-flight deduplication, unchanged/changed revisions, failure retention, warning suppression, offline/online recovery, unload/logout cleanup, and Google Sheets/Production isolation. Real Windows and iPhone acceptance remains pending and cannot be inferred.

## G — Product manager

Fifteen seconds keeps the approval result within the required 20-second window without high-frequency traffic or a distracting loading state. The user remains on the current screen and does not need to understand refresh mechanics.

## H — DevOps engineer

The change needs no infrastructure, paid service, deploy topology, environment variable, CORS, Auth0, Render, Netlify, or Production configuration change. Existing Staging deployment procedures remain valid.

## I — Code reviewer

Reviewed duplicate timers, overlapping requests, hidden/offline races, logout during an in-flight request, page-cache restoration, network failure streaks, stale responses, revision equality, and non-PostgreSQL isolation. No major issue remains within the Sprint scope.

## Self-review inventory

### Ten improvement decisions

1. Centralize the 15-second interval: implemented as one named constant.
2. Reuse the existing controller: implemented; no second state machine.
3. Separate debounce and poll timer ownership: implemented for deterministic cleanup.
4. Use self-scheduling timeout instead of interval: implemented to avoid overlap.
5. Share the existing in-flight promise: implemented.
6. Stop work outside visible/online/authenticated state: implemented.
7. Resume through existing lifecycle signals: implemented.
8. Preserve revision-based no-render behavior: implemented.
9. Suppress repeated failure warnings: implemented per failure streak.
10. Keep real-device evidence separate from automation: documented as pending.

### Ten potential defects reviewed

1. Duplicate timer after focus bursts: prevented and tested.
2. Poll plus lifecycle request overlap: prevented by the shared promise and tested.
3. Hidden page continuing traffic: timers stop and are tested.
4. Offline request storm: scheduling stops and online recovery is tested.
5. Logout leaving a timer: all timers stop and are tested.
6. Unload/page-cache timer leak: `pagehide`/`beforeunload` stop and `pageshow` resumes.
7. Unchanged revision causing UI flicker: state write/render remains skipped and is tested.
8. Changed revision remaining stale: polling uses the accepted bootstrap path and is tested.
9. Network failure clearing UI: current state is retained and tested.
10. Google Sheets/Production listener installation: early environment gate prevents it and is tested.

### Security checks

- No client role, Workspace, Membership, or authorization source was added.
- Protected requests still require the existing Session and server checks.
- Session clearing stops future scheduled protected requests.
- Logs remain limited to safe error code/status/request identifier metadata.
- No Secret, Token, Cookie, credential, endpoint, or environment setting was added.

### Performance checks

- The interval is 15 seconds, not high-frequency polling.
- Only one scheduled poll and one in-flight request are allowed.
- Hidden and offline pages generate no polling traffic.
- Unchanged revision produces no state replacement or full render.
- Repeated failures do not create an unbounded retry loop or Console flood.

### UX checks

- No full-page reload or blocking loading screen is introduced.
- Current navigation, scroll, modal, and unsent form state remain untouched.
- Unchanged data causes no visible refresh.
- A transient failure retains the last good screen and retries later.
- Real Safari/PWA timer behavior remains explicitly pending owner verification.

## Decision

The design is accepted for Staging. Automated acceptance can complete the implementation, but Sprint 22 remains partial until the owner verifies Windows and iPhone Safari/PWA with a real manager approval appearing within 20 seconds and no reload, flicker, duplicate request, form loss, or Session regression.
