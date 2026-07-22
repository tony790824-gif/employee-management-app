# 班客邦 Release Checklist

## Neon Staging UI bootstrap acceptance — 2026-07-22

- [x] Confirmed `BANK_ENV=staging`, the approved Neon Staging host/database and separate API/migration roles before mutation.
- [x] Confirmed migrations 0001–0008 and the active synchronized key ID `render-staging-20260722-49a11f` before applying 0011.
- [x] Applied only `0011_ui_bootstrap`; 0009 and 0010 remain intentionally pending.
- [x] Recorded checksum `0218d807d58d5b112f4095ac6ac9dfa2652793082c2a6881babd0ad9751748bf` and verified ledger/function consistency.
- [x] Reapplied the least-privilege API allowlist: zero table grants and five controlled functions.
- [x] Passed live boss/employee bootstrap, Session/Membership/role scope and cross-Workspace denial E2E.
- [x] Completed a transactional rollback, confirmed absence, reapplied 0011 and reran the E2E successfully.
- [x] Confirmed the synchronized key was neither regenerated nor changed.
- [x] Confirmed Render Staging `/v1/readiness` returns HTTP 200 and `ok: true`.
- [ ] Complete browser-side reversible Staging PostgreSQL cutover, reconciliation, weak-network and rollback acceptance before changing any frontend data source.

Production, Google Sheets, Apps Script, Auth0 and the Production frontend were not modified or deployed.

## Isolated PostgreSQL UI rehearsal gate — 2026-07-22

- [x] Authenticated read/bootstrap exists behind a controlled database function and live Session/Membership verification.
- [x] Boss and employee bootstrap payloads are scoped by the server-authorized role; the frontend cannot select the trusted tenant.
- [x] A separate `STAGING POSTGRES` build has isolated manifest, cache, storage and session namespaces.
- [x] Normal Staging and Production remain on Google Sheets; the existing Draft Preview is unchanged.
- [x] Local adapter rehearsal covers readiness, session establishment, bootstrap, state hydration and logout cleanup.
- [x] Define the approved isolated Render Staging Node API resource with automatic deploys disabled and protected Staging-only configuration.
- [ ] Create/link the Render resource, enter protected values and verify the first healthy deployment.
- [ ] Apply `0011_ui_bootstrap` and refresh the exact API function allowlist in Staging.
- [ ] Complete live boss/employee read reconciliation, reload/logout, timeout/weak-network, rollback and browser E2E.

## PostgreSQL frontend cutover gate — 2026-07-20

- [x] A single reviewed browser API transport factory is packaged in reproducible builds.
- [x] Remote HTTP, credential-bearing URLs, oversized requests/responses, invalid Workspace IDs and unknown commands fail closed.
- [x] Session-invalid responses produce a non-sensitive event and never log bearer tokens.
- [x] Local, Staging and Production committed profiles keep `postgresApiUrl` empty; Staging/Production remain on Google Sheets.
- [x] Existing Netlify Draft Preview was not rebuilt, replaced or deployed by this Sprint.
- [x] Add the reviewed Render Blueprint and secret/configuration boundary for the isolated Staging endpoint.
- [ ] Create/link the Render resource and verify its HTTPS health/readiness endpoints.
- [x] Complete the read/bootstrap API required to render both roles without Google Sheets fallback (source and local rehearsal).
- [ ] Pass reconciliation, rollback, cache isolation, weak-network and boss/employee Staging cutover E2E.
- [ ] Obtain explicit approval before any Production endpoint, frontend switch or deployment.

## Project cleanup and technical-debt gate — 2026-07-20

- [x] 正式來源、建置白名單、runtime loader、package scripts 與 Runbook 引用已交叉盤點；未發現可安全刪除的 dead source。
- [x] `pg`、`@aws-sdk/client-secrets-manager`、`fflate` 均有可追蹤的實際用途，沒有移除依賴。
- [x] 自包含的 Auth0 Staging initiation 測試已加入完整測試鏈；人工 Staging acceptance 腳本已加入語法檢查。
- [x] migration rollback 快照的內容重複已確認為刻意設計，未誤刪 migration history。
- [x] helper 重複與 ADR 編號衝突已記錄為技術債，未在清理工作中跨信任邊界重構。
- [x] 完整 `release:check`、Staging build、依賴 audit 與 tracked-file Secret scan 已於 2026-07-20 通過。

本閘門不建立 AWS/Auth0/Netlify 資源、不修改或部署 Production，也不變更架構決策。

## Lambda artifact packaging gate — 2026-07-20

- [x] Production dependencies are installed from the committed pnpm lockfile with scripts disabled; the local cache is preferred and only missing locked content may be retrieved.
- [x] `pg` and `@aws-sdk/client-secrets-manager` are packaged explicitly; the function does not rely on mutable runtime-included SDK versions.
- [x] Hoisted dependencies contain no pnpm symlinks or absolute store paths.
- [x] ZIP entries are sorted and use a fixed timestamp; two independent builds produce identical bytes and SHA256.
- [x] Artifact contains a deterministic manifest and CycloneDX 1.5 SBOM.
- [x] `.env`, key, certificate and pnpm metadata files are excluded or rejected.
- [x] Packaged Handler, PostgreSQL driver and AWS SDK resolve in an isolated local invocation.
- [x] Artifact output is Git-ignored and no binary artifact or Secret is committed.
- [ ] Review the generated SHA256/SBOM and upload the exact ZIP to an approved versioned Staging artifact bucket.
- [ ] Run AWS `ValidateTemplate`, review a Staging-only change set and bind the resulting immutable S3 object version.

No AWS resource or service was created or deployed by this gate.

## AWS Staging infrastructure preparation gate — 2026-07-20

- [x] CloudFormation is Staging-only and contains no credential, database URL, token or Production endpoint.
- [x] Partner rule and Lambda consumer are independently disabled by default.
- [x] Lambda artifact requires an immutable S3 object version.
- [x] EventBridge delivery failure and Lambda processing failure use separate encrypted DLQs.
- [x] SQS visibility timeout covers six Lambda timeouts plus the batch window; partial-batch handling and five-attempt redrive remain enabled.
- [x] Queue policies require TLS and restrict EventBridge sends to the exact rule ARN and AWS account.
- [x] Lambda IAM has no wildcard allow/admin policy; secret and optional customer-managed KMS access are exact-resource and context-bound.
- [x] CloudWatch alarms cover Lambda errors/throttles/duration, queue age, both DLQs and failure to write to the EventBridge DLQ.
- [x] Local structural, reference, resource-type, IAM boundary and regression checks pass.
- [x] Package and locally verify the immutable Lambda artifact and its runtime dependencies.
- [ ] Run AWS `ValidateTemplate` and inspect a Staging-only change set after explicit external approval.
- [ ] Connect and test an approved alarm notification destination.
- [ ] Create resources with both gates disabled, then follow the staged activation/E2E runbook.

No AWS/Auth0/Netlify resource was created, no database migration was applied and Production was not modified or deployed.

## Auth0 Staging security-event pipeline gate — 2026-07-19

- [x] Staging-only EventBridge -> encrypted SQS -> Lambda -> controlled PostgreSQL function IaC is reviewable and repeatable.
- [x] Handler validates exact queue/account/region/partner source/issuer/time and fails closed on missing safe correlation.
- [x] Database inbox and session mutation are transactionally idempotent and store no raw token/payload.
- [x] SQS partial-batch retry, redrive policy and DLQ are configured; EventBridge retry/DLQ is configured independently.
- [x] Event database grant script permits only the reviewed ingest function and no direct table access.
- [x] Synthetic handler, isolation, duplicate, expiry, account-revoke and IaC boundary tests pass.
- [ ] Create the external Auth0/AWS Staging resources and Staging database role/migration after explicit approval.
- [ ] Run a real Auth0 Staging event -> SQS -> Lambda -> PostgreSQL -> old access-token rejection E2E.
- [x] Define operational alarms for queue age, Lambda failures and separate delivery/processing DLQ depth in IaC.
- [ ] Create the external alarm route and execute the alarm/DLQ runbook in isolated Staging.

Production remains blocked from this pipeline. No AWS/Auth0/Netlify resource or Production deployment was created by this milestone.

## Production API database-role acceptance — 2026-07-19

Accepted alternative criterion: Neon/PostgreSQL may retain `PUBLIC CONNECT` on the platform maintenance database `postgres`. This is a known platform/default behavior and is not a Production P0 blocker. Acceptance depends on proving that this connection creates **no additional path** to `neondb` business data, tenant data, controlled functions, credentials, or privileges.

- [x] `DATABASE_API_URL` explicitly names `neondb`; Production configuration targeting any other database fails closed.
- [x] API startup checks `current_database() = 'neondb'` before opening the listener.
- [x] `banke_api_production` is not a member of `neon_superuser` or any other role and has no administrative or `BYPASSRLS` attribute.
- [x] Direct privileges on all `public`/`app_private` tables and sequences are zero.
- [x] EXECUTE is limited to the four reviewed `app_private.api_*` functions; invalid Session/Workspace context fails closed.
- [x] The role cannot create schemas, permanent tables, roles, extensions, foreign servers, or user mappings and cannot disable RLS.
- [x] Connecting to `postgres` exposes no `app_private` schema and PostgreSQL provides no direct cross-database table path into `neondb`.
- [x] `dblink`/`postgres_fdw` cannot be installed or used by the API role to create a cross-database route.
- [x] Migrator, owner, Staging API, and Production API identities/credentials remain separate; credentials stay in ignored environment files or the deployment secret manager.
- [x] TLS certificate verification remains mandatory for Production.
- [ ] Before API deployment, monitor role connection count, statement timeouts, `temp_files`, `temp_bytes`, and unusually large/long temporary workloads.

Known low-risk limitation: PostgreSQL's inherited `PUBLIC TEMPORARY` capability may allow the role to create session-local temporary objects in a database it can connect to. It grants no persistent-schema, business-table, cross-tenant, or cross-database permission. Existing limits (`CONNECTION LIMIT 20`, 10-second statement timeout) reduce exposure; deployment monitoring and platform resource limits remain a P1 operations item, not a P0 authorization failure.

> 2026-07-19 Production database role: `banke_api_production` is isolated from the migrator and Staging roles, owns no objects, has no administrative/RLS-bypass capability, has zero direct table privileges, and can execute only four controlled functions. Production business data remains empty; API/frontend deployment is still blocked.

> 2026-07-18 Identity/Tenant boundary: PostgreSQL migrations 0004 through 0008 add OIDC principal mapping, revocable sessions, signed one-time tenant assertions, and controlled database functions. The runtime API role has zero business-table grants. Synthetic Local/Staging security tests are required to pass, but external Auth0 Staging PKCE and refresh-token lifecycle E2E remains a P0 release gate. Production remains untouched.

## Sprint 3 Identity release gates

- [x] RS256 access-token verification checks issuer, audience, expiration, not-before, key ID, and JWKS rotation behavior.
- [x] Unknown JWKS key ID fails closed.
- [x] Tenant context is resolved from verified issuer/subject plus live database membership, not a token workspace claim.
- [x] Direct business-table access and forged custom GUC access are denied to the runtime API role.
- [x] Session logout, suspension, membership removal, context replay, and simulated refresh-reuse revocation are covered by automated tests.
- [x] Create the isolated Auth0 Staging tenant and configure Authorization Code + PKCE with rotating refresh tokens and reuse detection.
- [x] Complete real Auth0 Staging browser acceptance for PKCE login, refresh rotation/replay, token-family revocation, session-claim binding and provider logout.
- [x] Prove in Staging PostgreSQL that user suspension, membership removal, compromised/revoked sessions and refreshed access tokens cannot bypass live authorization.
- [ ] Deliver Auth0 refresh-reuse/account-disable events to a public isolated Staging endpoint and automatically revoke/compromise the matching local PostgreSQL session.
- [ ] Approve Identity Provider operations/runbook before any frontend cutover or Production deployment.

> 2026-07-17 Frontend isolation: Local/Staging/Production builds now have separate backend configuration, storage/session namespaces, cache prefixes, and PWA identities. Desktop Staging smoke verification passed; real phone/tablet/desktop E2E remains required and is tracked in `docs/STAGING_E2E_CHECKLIST.md`. Production was not deployed.

> 2026-07-17 Staging 證據：隔離 Apps Script 後端的核心 API、revision conflict、session 撤銷、私人備份、實際還原及還原後 readiness 已通過。尚未建立獨立 Staging 前端，也未完成真實手機／平板 E2E，因此本清單仍未全部通過，禁止正式發布。

任何一項未通過都不得發布。

## 本機閘門

- [x] `pnpm release:check` 完整通過（2026-07-20 Project Cleanup）。
- [x] 13 組 P0/state/cleanup 回歸全部通過（2026-07-17）。
- [ ] `dist/` 僅包含發布白名單檔案，且與來源逐檔一致。
- [ ] 老闆／員工本機 smoke 無登入遮罩、白畫面或 console error。
- [ ] CHANGELOG、README、API、Database、Backlog、ADR 與 Runbook 已同步。

## Apps Script 線上閘門

- [x] Staging `createOperationalBackup()` 回傳 `ok: true`（2026-07-17）。
- [x] Staging Drive 備份資料夾與檔案為「受限制／只有自己」（2026-07-17）。
- [x] Staging `verifyLatestOperationalBackup()` checksum、workspace、revision 正確（2026-07-17）。
- [x] Staging `runReleaseReadinessCheck()` 回傳 `ok: true`（2026-07-17）。
- [x] Staging 備份建立時間未超過 24 小時（2026-07-17）。
- [x] Staging 實際 restore、session 撤銷及 restore 後 readiness 通過（2026-07-17）。
- [ ] 已記錄前一個 Apps Script 部署版本與 Netlify deploy，能立即回滾。

## 發布後

- [ ] 老闆既有 PIN 登入成功。
- [ ] 測試員工既有 PIN／首次啟用流程成功。
- [ ] 員工只看到本人資料。
- [ ] 排假儲存、打卡、老闆讀取與 revision 正常。
- [ ] 登出後 session 失效。
- [ ] 發布後沒有新的錯誤率、同步衝突或權限異常。
