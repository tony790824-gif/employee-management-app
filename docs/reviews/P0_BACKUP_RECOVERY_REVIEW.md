# P0 Backup, Restore & Release Gate — Architecture Review

日期：2026-07-15

## A — CTO

這是上線阻擋的營運能力，不是新產品功能。採管理員專用流程，避免增加老闆與員工操作。正式資料庫仍是必要遷移，不能把 Drive JSON 備份宣稱為企業級災難復原。

## B — Senior Frontend Engineer

前端零變更，Web App 不包含備份函式、pepper property 名稱或復原格式。發布閘門逐檔比對 `dist/` 與白名單來源，並禁止後端復原識別字進入前端資產。

## C — Backend Architect

檢查至少 10 個可能 Bug：空白目標被 safety backup 阻擋、損壞來源被當空資料、跨 workspace 復原、錯誤確認值、確認值重播、復原中途失敗、rollback 本身失敗被誤報成功、復原後 session 仍有效、舊 pepper 損壞無法復原、最新備份指標錯誤、非目前 Sheet 的備份被拿去發布。均以 strict read、一次性確認、rollback、獨立 rollback failure、session revoke、workspace/source/revision 驗證與測試處理。

## D — Database Architect

復原包含明確 format、workspace、revision、來源、時間與 checksum。非空資料復原前建立 safety backup，寫入後重新驗證。仍缺 row-level transaction、PITR、immutable retention、backup catalog 與自動 migration，列為正式資料庫 P0。

## E — Security Engineer

檢查六類安全問題：復原能力暴露到 Web API、Drive 公開分享、session/限流秘密被備份、跨 tenant 復原、pepper 外洩、一次性復原確認值進入 execution log。函式未接 API；Drive item 必須 PRIVATE；property allowlist 排除 ephemeral keys；workspace mismatch fail closed；維運日誌採固定欄位白名單；文件明確把私人 Drive 視為高敏感邊界。剩餘風險是 Google 帳號接管與缺少 Secret Manager。

## F — QA Lead

涵蓋正常備份、驗證、最新備份發布檢查、資料變更／超過 24 小時／錯來源、錯誤確認、成功復原、safety backup、寫後驗證失敗 rollback、session revoke、checksum 篡改、公開檔案、未允許 property、跨 workspace、損壞 pepper、空白資料表災難復原、日誌脫敏、公開新資料夾／檔案清理與損壞來源 JSON。

## G — Product Manager

使用者畫面與流程完全不變；價值是降低資料遺失、帳號全部失效與人工客服風險。這項能力不直接收費，但它是付費產品可信度的必要成本。

## H — DevOps Engineer

發布分成兩道閘門：本機 `pnpm release:check` 驗證程式、測試、建置與白名單；線上 Apps Script 在最新資料上建立私人備份並執行 readiness。缺少任何一道都不得發布。runbook 記錄授權、備份、復原、回滾與驗證步驟。

## I — Code Reviewer

10 項改善檢查：strict JSON、格式版本、大小限制、property allowlist、PRIVATE ACL、checksum、一次性 confirmation、pre-restore backup、rollback、post-restore verify。5 項效能檢查：只由管理員按需執行、不進一般 API、單次 JSON parse/stringify、Drive quota、5 MB 防護。5 項 UX 檢查：無 APP 新按鈕、操作結果寫入執行記錄、錯誤碼可診斷、確認值可複製、空白目標可復原。

## 結論

所有角色同意本次過渡 P0 可合併；review 發現的空白目標與非私人殘留問題已先修正並加回歸。產品仍不可正式上線，下一步是正式身分／多租戶資料庫遷移與自動化營運平台。
