# Sprint 24 Real-time Sync v2 Review

Date: 2026-07-29

Scope: PostgreSQL Staging browser synchronization only

Source baseline: `0516803b2d7fbcf9bffc0e8bc8296a728dccab29`

## Decision

Extend the existing revision controller instead of introducing WebSocket, SSE, another state store, or another synchronization controller.

- Active: 2 seconds
- Idle: 20 seconds after 30 seconds without activity
- Background: 60 seconds
- One timer, one debounce, one cooldown, and one in-flight request
- Lightweight revision check first; full bootstrap only after a changed revision
- Changed-section merge and affected-listener rendering
- Environment-scoped revision-only BroadcastChannel, storage, and Service Worker messages

## Architecture review

### A — CTO

The design keeps the accepted Session, Workspace, Membership, role, deterministic revision, and command boundaries. It improves perceived freshness without committing the product to a stateful real-time platform before Production operations are ready.

### B — Senior Frontend Engineer

The main risks were competing timers, duplicate lifecycle listeners, UI resets, and unsent-form loss. Keeping one controller and sending section metadata through the existing bootstrap event minimizes these risks. Listeners remain backward compatible when event metadata is absent.

### C — Backend Architect

`X-Bootstrap-Revision` is transport metadata, not authorization. The browser validates it against the response body, and the server still rebuilds the revision from role-visible authorized data. Commands and bootstrap contracts are unchanged.

### D — Database Architect

No schema or Migration is needed. The revision continues to derive from authorized data. The client-side changed-section merge does not alter database consistency or transaction semantics.

### E — Security Engineer

Cross-context signals contain only revision and emission time. They contain no token, Session ID, Workspace ID, user data, or bootstrap payload. Malformed or mismatched revision headers fail closed. Environment-specific channel, storage, manifest, and cache namespaces prevent cross-environment synchronization.

### F — QA Lead

Automated coverage must prove active/idle/background timing, lifecycle recovery, timer/request deduplication, changed/unchanged revisions, cross-tab/PWA signals, offline recovery, Session stop, response-header validation, Service Worker marker handling, and Google Sheets/Production isolation. Real devices remain pending because fake timers cannot validate mobile throttling.

### G — Product Manager

The change directly reduces the need for manual refresh after manager approval while avoiding disruptive page reloads. No unrelated UI or business behavior is introduced.

### H — DevOps Engineer

No cloud resource, dependency, environment variable, Migration, or Production deployment is required. Existing build and release gates remain authoritative.

### I — Code Reviewer

The accepted implementation has one synchronization owner, stable public events, optional response headers for backward compatibility, no sensitive logs, and focused listener filtering. Remaining improvement candidates are server-side delta payloads and push transport, but neither is justified in this Sprint.

## Remaining risks

- Mobile browsers may throttle the 60-second background timer; foreground lifecycle events remain the convergence fallback.
- BroadcastChannel availability varies; storage events provide the compatible fallback.
- A changed revision still downloads one complete bootstrap before applying changed sections. A true server delta contract is a future API design and is intentionally not introduced here.
- Windows, iPhone, Android, and iPad behavior is **PENDING USER VERIFICATION**.

## Release decision

Automated acceptance may pass, but Production release remains blocked until real-device evidence is recorded. No Production, database, Migration, Auth0, Google Sheets, Apps Script, Render, or Netlify operation is authorized by this review.
