# 班客邦營運 Runbook（Google Sheets 過渡期）

本文件只供 Apps Script 專案管理員使用。不要把備份連結、復原確認值或 Script Properties 提供給員工或一般老闆帳號。

## 發布前必要步驟

1. 在專案目錄執行 `pnpm release:check`，必須全部通過。
2. 把最新版 `google-sheets-backend.gs` 更新到 Apps Script，但先不要切換正式流量。
3. 在 Apps Script 編輯器選擇 `createOperationalBackup` 並執行。第一次會要求 Google Drive 權限；確認使用正確的專案擁有者帳號。
4. 在「執行記錄」確認結果為 `ok: true`，並記錄 `fileId`、`workspaceId`、`revision`。
5. 到 Google Drive 確認「班客邦系統復原備份」資料夾與新 JSON 檔案的存取權是「受限制／只有自己」。禁止分享。
6. 在 Apps Script 執行 `runReleaseReadinessCheck`；必須回傳 `ok: true`，且 backup 不超過 24 小時、revision 與目前資料相同。
7. 依 [Release Checklist](RELEASE_CHECKLIST.md) 完成 smoke、部署與回滾確認。

## 驗證最新備份

1. 執行 `verifyLatestOperationalBackup`。
2. 確認執行記錄中的 `workspaceId`、`revision`、`createdAt` 與預期一致。
3. 複製 `restoreConfirmation`；只有真的要復原時才使用。

## 復原最新備份

1. 停止發布與資料修改，通知操作人員暫停使用。
2. 執行 `verifyLatestOperationalBackup`，確認 workspace、revision 與時間。
3. 在「專案設定 → 指令碼屬性」新增或更新：
   - 屬性：`SHIFT_APP_RESTORE_CONFIRMATION`
   - 值：上一步輸出的完整 `RESTORE:...` 字串
4. 執行 `restoreLatestOperationalBackup`。
5. 成功結果會包含 `restoredBackupFileId` 與 `safetyBackupFileId`。確認 `ok: true`；確認值會自動刪除，所有既有登入 session 會失效。
6. 再執行 `runReleaseReadinessCheck`。若資料已復原到較舊版本，先建立一份新的 `createOperationalBackup`，再重新檢查。
7. 用老闆與測試員工重新登入，驗證排班、休假、打卡與 revision。

## 復原較舊或災難備份

- 若要使用較舊檔案，先在私人備份資料夾找到正確 JSON，將其 Drive 檔案 ID 設到 Script Property `SHIFT_APP_LAST_BACKUP_FILE_ID`，再依標準復原流程操作。
- 空白的新 Google Sheet／Apps Script 可復原；需先讓新 Script 專案取得該私人備份檔案的存取權，並設定 `SHIFT_APP_LAST_BACKUP_FILE_ID`。
- 非空目標若 workspace 不同會被拒絕，不得關閉這項檢查。

## 失敗處理

- `DATA_SOURCE_INVALID`：一般 APP API 偵測到 A1 不是有效 JSON object。立即停止 APP 操作，保存 A1 原始內容與 execution log；不要清空 A1、不要重新登入或重複儲存。先驗證私人備份，再依復原流程處理。
- `BACKUP_NOT_PRIVATE`：立即檢查 Drive 分享權限；不要繼續發布。
- `BACKUP_CHECKSUM_INVALID`：檔案損壞或被修改，改用另一份已驗證備份。
- `BACKUP_SOURCE_INVALID`：來源 Sheet JSON 損壞，或包含無法安全轉換的舊資料格式。空的舊版 `payrollAdjustments` 陣列會自動按空 object map 備份；若陣列含資料，先保留原始 A1 內容並人工確認資料對應，禁止直接清空重試。
- `BACKUP_WORKSPACE_MISMATCH`：選錯公司／工作區，停止操作。
- `RESTORE_ROLLED_BACK`：程式已嘗試回復操作前狀態；使用結果中的 safety backup 或前一份備份，並保留錯誤記錄。
- `RESTORE_ROLLBACK_FAILED`：復原與自動回滾皆失敗。立即停止 APP 寫入、保存 execution log，依錯誤物件的 `safetyBackupFileId` 找到復原前備份，再由管理員進行人工災難復原。
- `RELEASE_BACKUP_OUTDATED`／`RELEASE_BACKUP_STALE`：重新建立備份，再執行 readiness。

## 權限與保存

- 私人復原包包含公司完整資料與 credential pepper，敏感度最高。
- 禁止用公開連結、共用資料夾、電子郵件附件或聊天軟體傳送。
- Google 帳號必須啟用兩步驟驗證；人員離職時立即移除 Apps Script、Sheet 與 Drive 權限。
- 過渡方案尚無自動保留政策；正式平台必須提供不可變備份、PITR、稽核與定期 restore drill。
