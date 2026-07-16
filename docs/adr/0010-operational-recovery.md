# ADR 0010 — Google Sheets 過渡期營運備份與復原

日期：2026-07-15  
狀態：Accepted（過渡期 P0；正式資料庫仍是上線前必要工作）

## 背景

現行資料位於綁定 Google Sheet 的單一 JSON snapshot，credential pepper 位於 Apps Script Script Properties。只複製 Sheet 不能恢復 PIN；只保存 pepper 也不能恢復排班、出勤與薪資資料。部署前沒有可驗證備份，錯誤發布或密鑰遺失可能造成整間公司停用。

## 方案比較

1. 只複製 Google Sheet：不包含 Script Properties，無法恢復 credential；拒絕。
2. 把 pepper 寫入 Sheet：備份簡單，但破壞密鑰隔離；拒絕。
3. 公開 APP 下載／還原按鈕：容易造成全公司資料與 pepper 外洩或誤操作；拒絕。
4. 管理員在 Apps Script 編輯器執行，建立私人 Google Drive 復原包：可同時保存 snapshot 與必要 properties，不暴露給 Web App；採用作過渡方案。
5. 正式資料庫 PITR＋Secret Manager：長期最佳；列入正式後端遷移，不在本次重寫產品。

## 決策

- 備份、驗證、復原與 readiness 函式不接入 `api()`、`doGet()` 或 `doPost()`，只能由 Apps Script 專案管理員執行。
- 復原包格式 `banke-recovery-v1`，保存來源 Spreadsheet ID、workspace、revision、snapshot、建立時間、原因與必要 Script Properties。
- 只允許 `SHIFT_APP_WORKSPACE_ID`、`SHIFT_APP_OWNER_PHONE`、`SHIFT_APP_CREDENTIAL_PEPPER` 進入復原包；session、登入限流與一次性復原確認值不得備份。
- 復原包與專用資料夾必須是 Google Drive `PRIVATE`；權限不符時停止並清理剛建立的項目。
- 每個復原包含 SHA-256 checksum，用於偵測意外損壞；Google Drive ACL 是現階段的授權邊界。
- 復原前必須先驗證檔案，並把輸出的 `RESTORE:<checksum-prefix>:<workspace>` 設為一次性 Script Property。
- 非空目標復原前建立 safety backup；跨 workspace 一律拒絕。空白新資料表允許災難復原。
- 復原後再次比對 snapshot 與 properties，失敗則回滾；所有既有 session 與登入限流狀態會被撤銷。
- 發布前本機必須通過 `pnpm release:check`，線上 Apps Script 必須在 24 小時內建立備份並通過 `runReleaseReadinessCheck()`。

## 後果與限制

- pepper 會存在私人 Drive 復原包，因此 Drive 帳號與分享設定成為高敏感安全邊界；禁止分享備份資料夾或檔案。
- checksum 防止非惡意損壞，不是獨立數位簽章；擁有 Drive 與 Apps Script 編輯權的管理員本來就能讀取及修改系統資料。
- 手動備份無法達到正式 RPO/RTO、跨區、不可變備份、保留政策與自動演練要求。
- 正式上線前仍須遷移至具備 point-in-time recovery、Secret Manager、稽核與自動化 restore drill 的正式平台。
