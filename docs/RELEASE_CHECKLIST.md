# 班客邦 Release Checklist

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
