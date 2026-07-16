# ADR 0004：Google Sheets 過渡期帳號啟用

- 狀態：Accepted（temporary containment）
- 日期：2026-07-15

## 問題

舊流程以「第一次輸入電話＋PIN」直接建立老闆或員工 credential。知道電話號碼的第三人可搶先設定 PIN，造成帳號接管。

## 比較方案

1. 維持電話 first-claim：零步驟，但無法證明使用者獲授權，拒絕。
2. 老闆替員工設定永久 PIN：可止血，但違反員工自行選 PIN，且增加老闆看到／傳遞密碼的風險，拒絕。
3. 付費簡訊 OTP：電話 ownership 較好，但目前產品要求免費，且 Apps Script 原型不應先承擔簡訊成本，暫緩。
4. 老闆預登記＋一次性啟用碼：老闆初始化由 server-side property 限制；員工由老闆授權一次性碼並自行設定 PIN，採用作過渡止血。

## 決策

- 空白雲端第一次 `bossLogin` 必須符合 Script Property `SHIFT_APP_OWNER_PHONE`。
- 新增／重設員工時產生 8 碼、32 字元 alphabet 的安全亂數碼；只保存 hash。
- 員工第一次登入須同時提交自選 PIN hash 與啟用碼 hash。
- 啟用成功後刪除 `activationCodeHash`；重播無法改 PIN。
- 已設定 credential 的既有帳號維持相容。

## 後果與限制

- 不使用簡訊且保留員工自行選 PIN。
- 老闆需安全交付一次性碼；遺失後只能重設。
- 仍使用 6 位 PIN hash 作 bearer credential，沒有 session、rate limit、audit、workspace 或 slow hash；不可正式上線。
- 後續 Sprint 2 必須以正式身份、session 與 recovery 取代此方案。
