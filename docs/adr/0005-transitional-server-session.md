# ADR 0005：Google Apps Script 過渡期短效工作階段

日期：2026-07-15  
狀態：Accepted（過渡方案，不代表正式 IAM 已完成）

## 問題

舊版在登入後仍把電話與 `pinHash` 存在 `sessionStorage`，每次讀寫都重送。任何一次 XSS 或瀏覽器資料外洩，都會把長期 PIN 雜湊變成可重播的 API 密碼；6 位數 PIN 也沒有伺服器端嘗試次數限制。

## 決策

- PIN 雜湊只允許出現在登入請求。
- 登入成功由 Apps Script 產生 256-bit 隨機 bearer token，有效 8 小時。
- Script Properties 只保存 token 的 SHA-256 索引，不保存原始 token。
- 連續 5 次登入失敗後，該電話鎖定 15 分鐘。
- 頁面恢復前必須向伺服器驗證工作階段；過期、登出、員工被移除時立即失效。
- 老闆與員工 PIN／啟用碼雜湊不得回傳瀏覽器；老闆畫面只接收 `credentialState`。

## 取捨與限制

這可阻止 PIN 雜湊長期重播並降低線上暴力嘗試，但仍不是商業產品最終身份系統：Script Properties 無裝置管理、refresh token、完整稽核與企業級配額；帳號鎖定也可能被用來做暫時性阻斷服務。正式上線前仍需遷移到具備 Argon2id／bcrypt、租戶隔離、稽核與撤銷能力的後端。

