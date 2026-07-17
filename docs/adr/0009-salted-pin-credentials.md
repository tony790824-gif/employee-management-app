# ADR 0009：Google Sheets 過渡期 PIN credential

日期：2026-07-15；2026-07-17 修訂
狀態：Accepted（限過渡期；正式版仍須 Identity Provider）

## 背景

瀏覽器將 6 位 PIN 先做 SHA-256，但快速 prehash 不能直接作為伺服器儲存憑證。初版 `iterated-hmac-sha256-v1` 在 Apps Script 內執行 4096 次 HMAC。2026-07-17 受控 Staging 實測證明，此作法在全域 ScriptLock 內會執行約六分鐘並逾時，期間其他請求也被阻塞，無法營運。

## 決策

- 新 credential 使用 `hmac-sha256-v2`。
- 每筆 credential 仍使用獨立 128-bit salt。
- Apps Script Script Property `SHIFT_APP_CREDENTIAL_PEPPER` 為 server-only secret，不得寫入 Sheet、前端、日誌或 Git。
- v2 對 `v2:<client-prehash>:<salt>` 執行一次 HMAC-SHA256，藉由版本字串作 domain separation。
- 舊 `iterated-hmac-sha256-v1` 只供相容讀取；成功驗證後立即改存 v2。未知 scheme、錯誤 iteration、malformed salt/hash 一律 fail closed。
- 舊 `bossPinHash`、`pinHash`、`activationCodeHash` 只作一次相容遷移來源，成功後移除。
- API projection、移除員工封存與一般 save 不得回傳或覆寫 credential。

## 取捨

v2 解決 Apps Script 的確定性逾時與全站 lock starvation，但它不是記憶體困難的 password KDF。攻擊者若同時取得 Sheet 及 pepper，6 位 PIN 的離線空間仍很小。保留 server pepper、登入限流、短效 session、撤銷與 fail-closed 是過渡風險控制，不代表已達正式 IAM 標準。

## 後續必要工作

正式商業版必須移轉到受管理的 Identity Provider 或專用 auth service，使用成熟的密碼雜湊／無密碼登入、refresh／revoke、裝置管理、MFA／恢復、稽核、密鑰輪替與監控。完成遷移後移除 v1 verifier 與 Google Sheets credential store。
