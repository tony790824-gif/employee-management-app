# 班客邦 Release Checklist

> 2026-07-18 Identity/Tenant boundary: PostgreSQL migrations 0004 through 0008 add OIDC principal mapping, revocable sessions, signed one-time tenant assertions, and controlled database functions. The runtime API role has zero business-table grants. Synthetic Local/Staging security tests are required to pass, but external Auth0 Staging PKCE and refresh-token lifecycle E2E remains a P0 release gate. Production remains untouched.

## Sprint 3 Identity release gates

- [x] RS256 access-token verification checks issuer, audience, expiration, not-before, key ID, and JWKS rotation behavior.
- [x] Unknown JWKS key ID fails closed.
- [x] Tenant context is resolved from verified issuer/subject plus live database membership, not a token workspace claim.
- [x] Direct business-table access and forged custom GUC access are denied to the runtime API role.
- [x] Session logout, suspension, membership removal, context replay, and simulated refresh-reuse revocation are covered by automated tests.
- [ ] Create the isolated Auth0 Staging tenant and configure Authorization Code + PKCE with rotating refresh tokens and reuse detection.
- [ ] Complete real Auth0 Staging E2E for login, refresh rotation/replay, logout, user suspension, membership removal, and JWKS rotation.
- [ ] Approve Identity Provider operations/runbook before any frontend cutover or Production deployment.

> 2026-07-17 Frontend isolation: Local/Staging/Production builds now have separate backend configuration, storage/session namespaces, cache prefixes, and PWA identities. Desktop Staging smoke verification passed; real phone/tablet/desktop E2E remains required and is tracked in `docs/STAGING_E2E_CHECKLIST.md`. Production was not deployed.

> 2026-07-17 Staging 證據：隔離 Apps Script 後端的核心 API、revision conflict、session 撤銷、私人備份、實際還原及還原後 readiness 已通過。尚未建立獨立 Staging 前端，也未完成真實手機／平板 E2E，因此本清單仍未全部通過，禁止正式發布。

任何一項未通過都不得發布。

## 本機閘門

- [ ] `pnpm release:check` 完整通過。
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
