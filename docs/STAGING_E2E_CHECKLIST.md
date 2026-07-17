# Staging Cross-device E2E Acceptance Checklist

This checklist is for the next manual acceptance stage and was not executed in the frontend-isolation Sprint.

## Preparation

- [ ] Record the Git commit and Staging frontend URL.
- [ ] Confirm the `STAGING` badge and a non-Production origin.
- [ ] Confirm Network requests target only Staging Apps Script.
- [ ] Create and verify a fresh Staging backup.
- [ ] Prepare Staging-only boss and employee accounts.

## Devices

- [ ] Desktop Chrome and Edge/Safari as applicable.
- [ ] Android phone Chrome, portrait and landscape.
- [ ] iPhone Safari, portrait and landscape.
- [ ] Android/iPad tablet, portrait and landscape.
- [ ] Narrow viewport, browser zoom, and larger text.

## Core flows

- [ ] Boss login; invalid PIN and expired session fail safely.
- [ ] Employee activation and subsequent login.
- [ ] Employee add, edit, removal, and recovery.
- [ ] Schedule create/edit and employee visibility.
- [ ] Employee leave save and boss synchronization.
- [ ] Employee clock in/out and boss hour adjustment.
- [ ] Revision conflict prevents silent overwrite.
- [ ] Logout clears only the Staging session.

## PWA and isolation

- [ ] Installed name clearly identifies Staging.
- [ ] Staging installation does not replace or open Production.
- [ ] Offline reload uses only the Staging app shell.
- [ ] Reconnection does not duplicate commands.
- [ ] Clearing Staging site data does not affect Production.
- [ ] No Production cache, storage key, session, account, or data appears.

## Recovery and exit

- [ ] Run readiness, backup verification, restore drill, and post-restore readiness.
- [ ] Confirm no uncaught Console errors; export Network log and screenshots.
- [ ] Restore Staging to the agreed clean snapshot and verify session invalidation.
- [ ] Record failures as blockers; do not deploy Production.
