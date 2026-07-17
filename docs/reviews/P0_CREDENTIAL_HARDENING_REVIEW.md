# P0 Credential Hardening — Architecture Review

> 2026-07-17 修訂：原 review 對 4096 次 Apps Script HMAC 的效能判斷已被受控 Staging 實測推翻。該路徑在全域 lock 內約六分鐘後逾時並阻塞其他請求。新 credential 已改為固定成本 `hmac-sha256-v2`；舊 v1 僅供相容讀取並於成功登入後遷移。安全取捨與正式 IAM 要求見 [ADR 0009](../adr/0009-salted-pin-credentials.md) 及 [Staging Review](P0_STAGING_READINESS_REVIEW.md)。

日期：2026-07-15

## A — CTO

本次只處理最高風險的離線 PIN 破解，不改登入畫面或新增產品功能。採相容遷移，讓正確登入的舊帳號自動升級；正式 Identity Provider 仍是上線阻擋，不能把過渡方案包裝成最終架構。

## B — Senior Frontend Engineer

前端仍只傳 64 字元 prehash，既有登入、首次啟用與錯誤提示不變。檢查改善項目：輸入格式固定、PIN 不存 session、登入後只用 token、credential 不進 state、projection 不帶 secret、舊帳號無重設、錯誤流程不洩漏帳號狀態、首次啟用只用一次、重複點擊仍受限流、員工/老闆流程皆相容。

## C — Backend Architect

比較四個方案後採 server-side envelope KDF。可能 Bug 至少包括：salt 重用、pepper 外洩、pepper 靜默輪替、低迭代 credential 被接受、malformed prehash、舊 hash 錯誤遷移、遷移未寫回、啟用碼未銷毀、編輯員工清掉 credential、封存資料殘留 secret。實作與測試已逐項封堵；其中 review 發現「損壞 pepper 可能被輪替」後改成 `CREDENTIAL_CONFIG_INVALID` 並停止登入。

## D — Database Architect

新 credential 是版本化 object，舊字串欄位只作登入時遷移來源。每筆使用獨立 salt；client 全量 save 無權直接寫入 credential。仍反對把 Sheet A1 JSON 當正式 credential store：缺少 schema constraint、migration ledger、transactional key rotation、audit 與 restore drill。

## E — Security Engineer

檢查五類重大風險：離線破解、rainbow table／相同 PIN 關聯、credential replay、帳號列舉 timing、pepper 遺失或損壞。前三者以 salt＋server pepper＋session 邊界改善，列舉以 dummy KDF 與固定流程比對降低，pepper 損壞 fail closed。剩餘風險：6 位 PIN 低熵、Apps Script 執行環境、前端 prehash 可被惡意程式攔截、無 MFA、無正式密鑰輪替；因此仍不可正式上線。

## F — QA Lead

已涵蓋：舊老闆遷移、舊員工遷移、新老闆 credential、新員工啟用碼、首次啟用、錯誤 PIN、未知電話、相同 PIN 不同 salt、malformed prehash、低迭代篡改、API projection secret 清除、封存 secret 清除、pepper 不進 snapshot、pepper 損壞 fail closed、恢復 pepper 後可登入，以及全部既有授權/session/workspace/concurrency/XSS 回歸。

## G — Product Manager

使用者不需要學新流程，也不必全部重設 PIN；這可降低客服量。產品價值是避免帳號外洩與被接管，不是可見新功能。仍需提供正式的忘記 PIN 與帳號恢復流程後，才適合付費客戶。

## H — DevOps Engineer

新增 Script Property 密鑰造成營運責任。部署前需驗證 Apps Script 權限；首次建立 pepper 後須受控備份。不可把 pepper 放入 Git、Sheet、前端或一般日誌。後端版本應先部署並跑舊帳號遷移 smoke；不能只更新靜態網站。

## I — Code Reviewer

效能檢查五項：每次登入增加 4096 次 HMAC、未知帳號也執行相同成本、成功舊帳號多一次寫入、一般 session API 不執行 KDF、相同操作仍在 Apps Script lock 內。這會增加登入延遲但不影響排班/打卡；正式規模仍需基準測試與專用 auth service。UX 檢查五項：畫面不變、舊 PIN 有效、錯誤訊息一致、啟用碼只顯示一次、設定損壞提供可識別錯誤而非無限重試。

## 結論

所有角色同意本次 P0 過渡修正可合併，且沒有需要擴大功能範圍的重大反對意見。仍一致認定產品不可正式上線；下一個 P0 應處理可復原備份／發布閘門與正式身分、資料庫遷移規劃，而不是新增排班功能。
