# ADR 0009 — Google Sheets 過渡期 PIN credential hardening

日期：2026-07-15  
狀態：Accepted（過渡期 P0 止血，不代表正式 IAM）

## 背景

舊版把瀏覽器產生的 64 字元 SHA-256 PIN prehash 直接存進 Sheet。6 位 PIN 的可能組合很少；只要 Sheet 外洩，攻擊者可離線快速嘗試全部組合。相同 PIN 也會產生相同 hash，容易進行帳號關聯與批次破解。

## 方案比較

1. 維持無 salt SHA-256：相容但無法抵抗離線破解；拒絕。
2. 只在瀏覽器執行 PBKDF2：伺服器仍會把客戶端輸出當可重播 verifier；拒絕。
3. Apps Script 以每筆隨機 salt、server-only pepper 與反覆 HMAC-SHA256 包裝 prehash：可在不要求使用者重設 PIN 的情況下立即降低 Sheet 單獨外洩的風險；採用作過渡方案。
4. 立即遷移至正式 Identity Provider＋Argon2id：長期最佳，但需要正式後端、資料遷移與裝置/session 管理；列入後續 P0，不在本次小範圍止血重寫產品。

## 決策

- 新 credential 格式為 `iterated-hmac-sha256-v1`，包含獨立 128-bit salt、迭代次數與 256-bit hash。
- KDF 使用 4096 次 HMAC-SHA256；pepper 只存於 Apps Script Script Property `SHIFT_APP_CREDENTIAL_PEPPER`，不得寫入 Sheet 或 API response。
- 老闆 PIN、員工 PIN 與一次性啟用碼使用同一安全封裝，但每筆都產生不同 salt。
- 舊 `bossPinHash`、`pinHash`、`activationCodeHash` 在正確登入／啟用時自動升級；錯誤憑證不遷移，不要求使用者重設 PIN。
- 新舊 credential 都不得回傳瀏覽器；封存員工資料必須移除 credential。
- 比對採固定流程字元比較；不存在帳號或電話不符時執行等價 KDF，降低明顯的帳號列舉時間差。
- malformed prehash、credential 或 pepper 一律 fail closed。已存在但格式損壞的 pepper 不得自動輪替，避免所有帳號永久失效。

## 後果

- Sheet 單獨外洩時，攻擊者缺少 pepper，且每筆 credential 都需獨立運算；風險顯著低於舊版。
- 這不是 Argon2id，也不取代正式 Identity Provider。Apps Script 的 CPU、Script Properties、備份與營運可觀測性仍不適合大規模正式身分驗證。
- `SHIFT_APP_CREDENTIAL_PEPPER` 成為必要密鑰；部署與災難復原必須以受控方式備份，遺失後無法驗證既有 PIN。
- 前端 request contract 暫時維持 `pinHash`／`activationHash` 64 字元 prehash，以避免本次 P0 引入 UI 行為變更；它們只可用於登入，不可作 session。

## 退出條件

正式上線前，遷移至具備正式帳號生命週期、記憶體困難密碼雜湊、短效 access token、refresh/revoke、裝置管理、稽核與密鑰輪替的身分服務，並完成遷移與復原演練。
