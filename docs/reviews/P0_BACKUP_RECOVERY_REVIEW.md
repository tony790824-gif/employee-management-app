# P0 Backup, Restore & Release Gate — Architecture Review

## 2026-07-16 snapshot 欄位形狀增補 Architecture Review

- **A／CTO：** 將檢查放在 `readData_`／`readDataStrict_` 共用的讀取邊界，確保登入、同步、清理、備份與寫回都先經過同一守門；不修改產品流程，也不建立第二套 state schema。
- **B／Senior Flutter/PWA Engineer：** 反對在前端再正規化一次後假設雲端安全，因損壞資料可能由舊版本或人工修改產生。接受後端 fail closed，且本次不碰已驗收畫面。
- **C／Backend Architect：** 反對只檢查 JSON root；已改為集中驗證已知 array、object map、巢狀 record 與 revision。完整 request schema、版本 migration 與 command API 仍屬 Sprint 3，不能在此假裝完成。
- **D／Database Architect：** Google Sheet A1 仍不是正式資料庫；本次只能防止「錯誤型別被清空後寫回」，不能提供 foreign key、unique、transaction、row revision 或 PITR。
- **E／Security Engineer：** 已檢查惡意 array/object 互換、`null` record、錯誤 map value 與負 revision；全部在權限或資料操作前失敗，且錯誤不洩漏 snapshot 內容。request payload allowlist 尚待下一個工作。
- **F／QA Lead：** 新增 11 種欄位損壞、備份拒絕、缺欄位相容與 A1 原文不變案例；既有空白新表與舊版空薪資調整相容流程保留。
- **G／Product Manager：** 使用者不需要新按鈕；此修正直接降低雲端資料遭人工修改或舊版本破壞後被覆蓋的客服與復原成本。
- **H／DevOps Engineer：** 來源、測試與 Runbook 已同步，但依本次限制沒有更新線上 Apps Script，也沒有宣稱真實環境已受保護。
- **I／Code Reviewer：** 反對要求所有舊欄位必須存在，因會中斷現有資料；採「缺少可相容、已存在但形狀錯誤就停止」。剩餘重大問題是完整值域 schema、request allowlist 與正式資料模型，已列入 backlog。

結論：本次單一 P0 防覆寫項目可提交；所有角色同意沒有需要擴大本次修改的重大問題。產品仍不可正式上線。

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

涵蓋正常備份、驗證、最新備份發布檢查、資料變更／超過 24 小時／錯來源、錯誤確認、成功復原、safety backup、寫後驗證失敗 rollback、session revoke、checksum 篡改、公開檔案、未允許 property、跨 workspace、損壞 pepper、空白資料表災難復原、日誌脫敏、公開新資料夾／檔案清理、損壞來源 JSON，以及舊版空 `payrollAdjustments` 陣列的無損相容與非空未知陣列的 fail-closed 行為。

## G — Product Manager

使用者畫面與流程完全不變；價值是降低資料遺失、帳號全部失效與人工客服風險。這項能力不直接收費，但它是付費產品可信度的必要成本。

## H — DevOps Engineer

發布分成兩道閘門：本機 `pnpm release:check` 驗證程式、測試、建置與白名單；線上 Apps Script 在最新資料上建立私人備份並執行 readiness。缺少任何一道都不得發布。runbook 記錄授權、備份、復原、回滾與驗證步驟。

## I — Code Reviewer

10 項改善檢查：strict JSON、格式版本、大小限制、property allowlist、PRIVATE ACL、checksum、一次性 confirmation、pre-restore backup、rollback、post-restore verify。5 項效能檢查：只由管理員按需執行、不進一般 API、單次 JSON parse/stringify、Drive quota、5 MB 防護。5 項 UX 檢查：無 APP 新按鈕、操作結果寫入執行記錄、錯誤碼可診斷、確認值可複製、空白目標可復原。

## 結論

所有角色同意本次過渡 P0 可合併；review 發現的空白目標、非私人殘留與舊版空薪資調整格式問題已先修正並加回歸。未知的非空舊格式仍停止備份，必須人工遷移，不能用清空資料換取 readiness 通過。產品仍不可正式上線，下一步是正式身分／多租戶資料庫遷移與自動化營運平台。

## 2026-07-16 一般 API fail-closed 追蹤審查

- **A／CTO：** 一般 API 與維運備份必須採相同的「損壞資料不可視為空白」原則；本次不藉機增加產品功能或發布版本。
- **B／Senior Engineer：** 沿用 `parseJson_`、`operationalError_` 與既有 API catch，不建立第二套解析器；空白 A1 保留新公司初始化相容性。
- **C／Security Engineer：** 檢查無效 JSON、`null`、array、primitive、錯誤碼洩漏、未授權請求、重複請求與原始資料改寫；根節點不合法一律在驗證 session 前停止，錯誤訊息不含資料內容。
- **D／Performance Engineer：** 每次請求仍只有一次 A1 讀取與一次 JSON parse，沒有額外 I/O、迴圈或網路請求；全域 lock 與 snapshot 成本仍是正式資料庫遷移項目。
- **E／Product Manager：** 使用者不需要新畫面；明確停止操作比靜默建立空公司更能降低資料遺失與客服成本。
- **F／QA Lead：** 已覆蓋損壞 JSON、array root、domain code、A1 不變與既有備份錯誤碼；空白初始化與欄位級舊資料相容性仍由既有測試保護。
- **G／Database Architect：** 本修正只保護解析／根節點，不能宣稱 schema 已完成；下一階段仍需版本化 migration、欄位約束與關聯完整性。
- **H／DevOps Engineer：** 新錯誤已加入 Runbook；因本 Sprint 明確禁止正式發布，Apps Script 線上版本與真實復原演練保持阻塞。
- **I／Code Reviewer：** 反向檢查至少十項邊界後未發現需要擴大本次修改的重大問題；可合併，但不可因此提高產品完成率或上線判定。
