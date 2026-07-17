# P0 Frontend Environment Isolation Review

Date: 2026-07-17

## A — CTO

Use one existing frontend and generate environment-specific assets at build time. This avoids three drifting codebases while keeping Staging backend, PWA identity, cache, browser storage, and session boundaries explicit.

## B — Senior Frontend Engineer

Accepted after requiring the environment script to load before cloud modules, preserving Production storage keys for backward compatibility, and keeping authenticated modules lazy-loaded. A separate Staging codebase was rejected because it would duplicate fixes and create release drift.

## C — Backend Architect

Staging has exactly one generated Apps Script URL. The cloud adapter still owns all remote calls; no second API path was introduced. Static tests reject any Production endpoint embedded in Staging assets.

## D — Database Architect

No database or snapshot schema changed. Browser storage namespaces prevent a Staging snapshot from being interpreted as Production state. Production keeps its existing keys to avoid an unplanned migration.

## E — Security Engineer

Cache cleanup is restricted by environment prefix, session/local keys are namespaced, and the visible badge reduces operator mistakes. Remaining control: Staging and Production must use separate origins because Service Worker registrations are origin/scope based.

The prior `?preview=` login bypass is now accepted only by the Local build profile; URL parameters cannot put Staging or Production into preview mode.

## F — QA Lead

Accepted with a generated-asset isolation test, the existing 13 regression suites, desktop browser Console/endpoint verification, and a separate manual cross-device checklist. Full real-device E2E is explicitly deferred to the next acceptance stage.

## G — Product Manager

The badge is useful only outside Production and does not add product flow. It lowers acceptance mistakes without changing employee or boss behavior.

## H — DevOps Engineer

Repeatable commands produce `dist-local/`, `dist-staging/`, and `dist/`. Generated outputs remain ignored. No deployment command is included and Production was not deployed.

## I — Code Reviewer

The implementation reuses current files, keeps Production behavior compatible, and centralizes environment values. Follow-up improvement: introduce CI artifact naming and immutable Staging hosting after the manual E2E gate; it is outside this Sprint.

## Decision

No unresolved major issue remains within this Sprint. Approval is conditional on hosting Staging on a dedicated non-Production origin and completing the documented real-device E2E checklist before any Production release.
