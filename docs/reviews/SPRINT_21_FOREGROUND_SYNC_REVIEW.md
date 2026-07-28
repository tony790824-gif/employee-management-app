# Sprint 21 Architecture Review — Foreground Synchronization

Date: 2026-07-28
Scope: PostgreSQL Staging frontend foreground refresh only

## A — Main engineer

The existing PostgreSQL bootstrap remains the authoritative data source. Browser lifecycle signals schedule one guarded refresh; the server revision decides whether state replacement and render are necessary. Time-off request data uses its existing read route and preserves unsent form state.

## B — Senior code reviewer

Reviewed event duplication, concurrent requests, stale Session results, unchanged revision behavior, listener cleanup, active-tab preservation, form preservation, Google Sheets isolation, retry behavior, and command visibility. Regression tests cover each identified risk. No material maintainability blocker remains in this Sprint scope.

## C — Security engineer

No new authorization source was introduced. Auth0, Session, Membership, Workspace, role, API-role, and RLS boundaries remain server-enforced. Logs contain only safe error metadata. Logout stops foreground protected calls. No Secret, Token, Cookie, personal identifier, or connection credential is added.

## D — Performance engineer

There is no polling. A 250 ms debounce, 1 second cooldown, and a shared in-flight promise limit foreground traffic. Unchanged revisions do not replace state or render. Time-off payloads use a stable fingerprint to avoid redundant UI work.

## E — Product manager

The change directly addresses a real acceptance failure: an already-open employee view did not show a manager's approval until manual reload. The interaction remains passive and preserves the user's current tab and unsent forms.

## F — Business advisor

Automatic low-noise synchronization reduces confusion and support requests without adding infrastructure or recurring polling cost.

## Decision

No reviewer identified a major issue requiring redesign. Automated acceptance is complete. Windows signed-in and iPhone Safari/PWA foreground acceptance remain pending and must be recorded as user verification, not inferred from simulation.
