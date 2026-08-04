# Production Readiness Report — Sprint 33A

Date: 2026-08-04

Baseline: `bae183e10399e476910508aee1677133e5fd179d`

Scope: evidence-only Production readiness audit plus documentation-only low-risk corrections.

Production operations performed: **none**.

## Executive decision

**Release decision: NOT READY FOR PRODUCTION.**

- Product engineering completion remains **98%**. This measures implemented product scope and Staging acceptance; it is not Production approval.
- Evidence-weighted Production readiness is **62%**. Security and database foundations are strong, but the current Production runtime is intentionally still the Google Sheets path and does not run the latest PostgreSQL/Auth0/notification/announcement stack.
- Staging evidence is healthy: the public Node API `/v1/health` and `/v1/readiness` returned HTTP 200, and the isolated `STAGING POSTGRES` Draft returned HTTP 200 during this audit.
- No Production deployment, database connection/write, Migration, Auth0 change, Google Sheets change, Apps Script change, or cloud-resource creation occurred.

## Evidence reviewed

- Environment profiles, ignored environment files, Render IaC, Netlify routing, build and release scripts.
- Auth0/OIDC discovery, RS256/JWKS verifier, Session claim, tenant-context signer, CORS and request validation.
- PostgreSQL tracked Migrations, checksum ledger, rollback pairs, RLS, controlled functions, least-privilege role tests, backup/restore tests and runbooks.
- Bootstrap revision, Smart Polling, incremental state application, offline cache/queue, Service Worker lifecycle, Web Push, badge and notification navigation.
- Structured API/worker logging, readiness endpoints, operational documents and release checklist.
- Full local Build, Check, test suite, Release Gate, secret scan and Production dependency audit recorded in the verification section below.

## Verified controls

### Security

- Only `.env.example` is tracked; `.env`, `.env.production` and other real environment files are Git-ignored.
- Production environment metadata is labelled `production`, requires TLS and has distinct migrator/API targets. The one-process Production Migration confirmation switch is absent by default.
- Access tokens are restricted to RS256 with exact issuer/audience, bounded JWKS, signature, expiry, not-before, subject and namespaced Session-claim checks.
- Client-provided Workspace claims in tokens are rejected. Every protected request additionally requires a valid App Session and live Workspace Membership.
- API request bodies are capped at 1 MiB, responses are `no-store`, CORS uses an exact Origin allowlist, and command inputs/idempotency keys are validated.
- Tenant tables use composite Workspace relationships, forced RLS and controlled `SECURITY DEFINER` functions; API and Push roles have separate least-privilege tests.
- Web Push endpoints are provider-allowlisted, payloads are bounded, and provider failure logging redacts credentials.

### Infrastructure and database

- `render.yaml` is explicitly Staging-only, uses Singapore, a separate Staging host allowlist, a readiness path and external secret values.
- Staging health and readiness returned HTTP 200 during the audit.
- The tracked repository contains 21 additive Migration pairs (`0001`–`0022`, with the intentionally untracked/unapplied `0010` excluded). Every tracked up Migration has a down partner.
- Static schema evidence includes 26 table declarations, 30 index declarations, 47 foreign-key references, 124 checks, and 12 tables with both enabled and forced RLS. Automated Migration and role-grant tests remain authoritative over these static counts.
- Migration tooling validates the target host, direct endpoint, TLS, checksum ledger, order, advisory lock and transaction boundaries.
- Staging backup/restore, rollback/reapply and synthetic Workspace A/B tests exist and clean up fixtures.

### Performance and PWA

- Revision checks avoid downloading and rendering an unchanged bootstrap. Changed payloads merge only changed top-level sections.
- One timer and one in-flight promise control Smart Polling: 2 seconds active, 20 seconds idle and 60 seconds background.
- Offline cache and Command queue are bounded, owner-scoped, idempotent and use bounded exponential backoff with revision conflict protection.
- Service Worker install/activate uses an environment-specific cache, `skipWaiting`, `clients.claim`, old-cache cleanup and safe same-origin notification navigation.
- Push, badge, read state and Notification Center share one notification pipeline.

### Monitoring

- API and Push worker produce structured JSON diagnostics with request ID, status and bounded error code.
- `/v1/health` verifies the process and `/v1/readiness` verifies PostgreSQL connectivity.
- Provider failures are classified into retry/dead/expired outcomes and sanitized before logging.

## Findings

### Blocker

| ID | Finding | Evidence and release condition |
|---|---|---|
| B-01 | Current Production does not run the latest application stack. | The committed Production frontend remains `PWA -> Apps Script -> Google Sheets`; `render.yaml` is Staging-only and no Production Node API/Auth0/frontend cutover has been deployed. Create and approve the Production services, secrets and reversible traffic plan before release. |
| B-02 | Production PostgreSQL is not at current feature parity. | Project records show only the earlier Production foundation was applied, while UI bootstrap, current user, time-off, notifications, Web Push, real-event delivery and announcements remain Staging-only. Perform a separately approved Production readiness/status check, backup, Migration plan and controlled apply before cutover. |
| B-03 | Auth0 security events are not connected to the local Session revocation boundary. | The EventBridge/SQS/Lambda implementation and IaC exist, but the external Staging pipeline has not been created and accepted. Refresh-token reuse/account-disable events therefore lack proven automatic Production Session revocation. Deploy and prove the isolated Staging pipeline before Production approval. |
| B-04 | Production recovery and cutover rollback are not proven for the current schema/application. | Staging rollback/reapply and restore tests exist, but no current Production restore drill, approved RPO/RTO, full data reconciliation or current-schema cutover rollback evidence exists. |
| B-05 | Required physical-device release evidence is incomplete. | Windows/Android/iPhone/iPad Announcement/Web Push acceptance remains `PENDING USER VERIFICATION`; the corrected Staging VAPID build also requires subscription recreation and delivery proof. Automation cannot close this gate. |

### High

| ID | Finding | Required remediation |
|---|---|---|
| H-01 | The frontend has no deploy-time CSP/security-header policy. | Add and test a Netlify `_headers` policy for CSP, frame protection, `nosniff`, Referrer Policy, Permissions Policy and HSTS. This requires a dedicated Staging compatibility Sprint because Auth0, Apps Script and PWA resources must be allowlisted without weakening the policy. |
| H-02 | The Node API has no general abuse-rate limit or upstream WAF/API gateway. | Keep the existing `push.test` limit, then add bounded per-principal/IP protection for login/session/read/command routes and alerting. Do not rely on CORS as an authorization control. |
| H-03 | No repository CI workflow enforces Build, Check, tests, Release Gate, audit and environment isolation before merge/deploy. | Add protected-branch CI and an approval-gated, immutable Production artifact promotion flow; retain manual Production approval. |
| H-04 | Production observability is not ready. | Structured logs and readiness exist, but there is no accepted centralized error-rate/latency metric, SLO, uptime alert, queue-depth/dead-delivery alarm, database saturation alert or incident escalation runbook. |
| H-05 | Capacity and load behavior are unproven. | Active clients check revision every 2 seconds, and the revision endpoint still derives its value through controlled role-visible reads. Run realistic concurrency/load tests and establish a capacity budget before choosing Production compute/database plans. |
| H-06 | Current Render Free Staging behavior is unsuitable evidence for Production availability. | Cold starts and a single web process that also runs the Push dispatcher can delay API and delivery. Select paid Production sizing, isolate failure domains where justified, and prove graceful shutdown/recovery. |
| H-07 | VAPID configuration promotion is manual and has already drifted once. | Add a release check that compares the frontend public-key fingerprint with the server-authoritative public key, documents rotation, invalidates/recreates old subscriptions and blocks mismatched artifacts. Never expose the private key. |
| H-08 | Production backup protection is below an accepted business RPO/RTO. | Provider history alone and Staging restore evidence are insufficient. Define retention, independent backup, encryption, restore ownership and a timed Production-safe restore rehearsal before launch. |

### Medium

| ID | Finding | Required remediation |
|---|---|---|
| M-01 | Service Worker cache revision is manually advanced. | Generate or validate the cache revision from the immutable release artifact so a missed manual bump cannot retain stale assets. |
| M-02 | Offline business data is stored in browser local storage. | It is owner-scoped, bounded and cleared on logout, but remains readable at rest on a compromised/shared browser profile. Add shared-device policy, retention expiry and privacy acceptance. |
| M-03 | API security headers are narrower than the eventual public frontend policy. | The JSON API has CSP, `no-store`, `nosniff` and no-referrer; verify platform HSTS and add an explicit Production proxy/header contract. |
| M-04 | Migration `status` is not a strictly read-only command. | The generic runner initializes the ledger and takes an advisory lock, and Production configuration requires the Migration confirmation switch even for status. Add a separately reviewed read-only inspection command before operational handoff. |
| M-05 | Deployment identity is not exposed through readiness. | Operators must inspect Render/Netlify dashboards to identify a commit. Return a non-sensitive build SHA/version from readiness or an immutable deployment manifest. |
| M-06 | Data-retention operations are not complete. | Define bounded retention/cleanup for audit, outbox, notification, delivery and soft-deleted announcement records with compliance-safe evidence preservation. |
| M-07 | Performance budgets are not automated. | Record compressed/uncompressed frontend budgets, bootstrap response limits, API latency targets and regression thresholds in CI. |

### Low

| ID | Finding | Resolution |
|---|---|---|
| L-01 | Architecture documentation described the PostgreSQL browser path as inert everywhere. | Corrected in Sprint 33A: it is active and accepted only in isolated Staging, while Production remains Google Sheets. |
| L-02 | Current health/backlog documents did not distinguish feature completion from Production readiness. | Corrected in Sprint 33A with separate 98% product completion and 62% Production-readiness measures. |

## Category assessment

| Category | Readiness | Summary |
|---|---:|---|
| Security | 68% | Strong identity, Session, tenant and least-privilege foundations; blocked by missing provider-event delivery, frontend headers, general abuse controls and key-promotion automation. |
| Infrastructure | 45% | Healthy isolated Staging, but Production services, CI promotion, sizing and rollback are not instantiated or accepted. |
| Database | 72% | Strong schema/Migration/RLS tests; current Production feature parity and recovery rehearsal remain incomplete. |
| Performance | 60% | Efficient revision/render behavior, but no load evidence or production capacity budget for 2-second active polling. |
| PWA | 82% | Install/update/offline/push/click foundations are broad; final device and VAPID re-subscription gates remain. |
| Monitoring | 35% | Structured logs and readiness exist; metrics, alerts, SLOs and incident operations do not. |

## Verification

Sprint 33A verification completed with these results:

- `git diff --check`: PASS
- `pnpm run build`: PASS — 39 Production-profile assets built locally; nothing deployed
- `pnpm run check`: PASS — 25 frontend scripts, one Apps Script and 39 release assets
- `pnpm test`: PASS — complete repository test command
- `pnpm run release:check`: PASS — release allowlist and operational-document gate
- tracked-file sensitive-information scan: PASS — zero credential patterns; real environment files remain ignored
- `pnpm audit --prod`: PASS — no known Production dependency vulnerabilities

Live read-only audit probes:

- Render Staging `/v1/health`: HTTP 200
- Render Staging `/v1/readiness`: HTTP 200
- isolated `STAGING POSTGRES` Draft root: HTTP 200

## Sprint 33B recommendation

**Sprint 33B — Production Security & Operations Gate (Staging-only implementation and rehearsal).**

Implement and validate the frontend security-header policy, general API abuse protection, deployment build-SHA/VAPID parity gate, centralized metrics/alerts and protected CI Release Gate entirely in Staging. Do not create or deploy Production resources in that Sprint unless a later instruction explicitly authorizes the external Production gate.
