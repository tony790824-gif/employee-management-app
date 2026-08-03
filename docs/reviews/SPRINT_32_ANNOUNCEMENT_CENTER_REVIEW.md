# Sprint 32 Announcement Center Review

Status: **PENDING USER VERIFICATION**

Engineering completion: **98%**

Date: 2026-08-03

## Completed

- Staging-only Migration `0022_announcement_center`; checksum `e5056c193598a4dcabcee961ce924caf428ca1207d059ed4448ae85dc9cfc8d3`.
- Manager/boss create, update, soft delete; employee audience-filtered read; list/detail/read endpoints.
- Existing Notification Center, Web Push, badge, revision sync, subscription priority/fallback, and notification click integration.
- Safe list/detail UI with newest-first ordering, unread styling, and Manager editor.
- Neon Staging apply/rollback/reapply and synthetic Workspace A/B E2E with fixture cleanup.
- API Role direct table denial and exact controlled function grants.

## Automated/Staging evidence

- `ALL`, `MANAGER`, and `EMPLOYEE` visibility: PASS.
- Employee mutation denial and unknown/cross-Workspace failure: PASS.
- Idempotent publication/read, optimistic update/delete, and soft-delete hiding: PASS.
- One Notification Center row per recipient, Badge/read consistency, and safe destination: PASS.
- Build, Check, complete tests, Release Gate, environment isolation, dependency audit, sensitive scan, and `git diff --check`: PASS.

## Physical-device gate

Windows installed PWA, Android installed PWA, iPhone Home Screen PWA, and iPad Home Screen PWA remain **PENDING USER VERIFICATION**. For each device verify list/detail, role controls, audience, read/unread badge, system Push, click with app open/closed, and no Session reload. Do not report COMPLETE until evidence is recorded.

## Safety

Production, Production database/Migration/Auth0, Google Sheets, Apps Script, and Production deployment were not modified. `0009` and `0010` remain intentionally pending.
