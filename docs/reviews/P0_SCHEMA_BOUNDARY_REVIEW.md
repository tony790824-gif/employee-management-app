# P0 Request / Snapshot Schema Architecture Review

日期：2026-07-16  
範圍：1 MiB request 邊界、A1 現有欄位值驗證、舊資料相容；不含正式部署或新產品功能。

## A — CTO

採用「單一驗證器＋多個既有邊界重用」，因為現況仍是 A1 全量 snapshot。`doPost` 必須在解析前限流；A1 讀取、save、初始化、備份與寫入前必須使用相同規則，避免某條路徑成為旁路。這是過渡止血，不將 Google Sheets 誤稱為正式資料庫。

## B — Senior Frontend Engineer

反對點與改善清單：

1. login 曾會刪除 PIN 非數字字元，可能把錯誤輸入轉成有效 PIN；已改為 raw trim＋嚴格六碼。
2. phone 的 UI 正規化與 server canonical 規則必須一致；已共用 8–15 位數字契約。
3. 啟用碼規格與新需求衝突；本次保留既有八碼英數，避免現有帳號失效。
4. hidden form 必須帶獨立 `requestId`，否則超限時尚未 parse JSON 無法解除 Promise；已補上。
5. `form.append` 對既有 WebView／測試不相容；回歸測試發現後改用 `appendChild`。
6. 薪資 UI 仍提示負數扣款，但後端不再接受新負數；需後續產品／schema Sprint 統一。
7. 前端驗證只改善 UX，不能取代 server validation；server 已補防線。
8. 目前錯誤仍以 alert 為主，不利無障礙與錯誤復原；列 P2。
9. 未在實際低階 Android WebView 測試 1 MiB request；列 staging 驗收。
10. PWA 快取需更新，否則舊 login validator 可能殘留；cache 已升 v44。

## C — Backend Architect

- 原始 body 上限在 JSON parse／lock／Sheet 之前，符合 fail-fast。
- 共用 validator 避免 read、backup、save、write 規則漂移。
- Apps Script 無法保證每次提供 raw body；fallback 只能量 decoded payload，已明確記錄限制。
- `api()` 全域函式仍不是正式 command endpoint，未具 HTTP status、idempotency key 或結構化 telemetry；列 P0/P1 遷移。

## D — Database Architect

- A1 仍缺 schema version、migration ledger、foreign key、index、transaction 與 audit。
- 缺欄相容與空 payroll 相容合理，但不能永久取代 migration。
- 舊 signed deduction 的相容例外是短期必要；正式模型應使用非負 amount＋`kind` enum。
- 本次沒有新增、刪除或改名資料欄位，資料 migration 風險可控。

## E — Security Engineer

- 已封堵 oversized parse 與非法值寫入，錯誤不包含 credential 或 payload。
- A1 只保存不可逆 prehash／credential，server 無法由 hash 證明原始 PIN 或啟用碼字元；必須依前端規則與未來正式 IdP 解決。
- 1 MiB 是應用程式邊界，不等於平台 WAF、IP rate limit 或總流量保護。
- Google Sheets／Apps Script 仍不符合正式多租戶 authorization、secret rotation、audit 與 OWASP ASVS 要求。
- error response 保留 requestId，但不得把 request payload 寫入 log；目前未新增 payload logging。

## F — QA Lead

已驗證：小於／等於／超過 1 MiB、多位元 UTF-8、空 raw fallback、合法／非法電話、PIN、現行啟用碼、金額、日期、時間、舊缺欄、空 payroll、舊負數原樣相容、新負數拒絕，以及驗證失敗不寫入／不推進 revision。13 組既有回歸與 build 全數通過。尚缺 staging Apps Script 真實 form encoding、弱網、不同裝置與負載測試。

## G — Product Manager

這項工作不增加新畫面，但可降低資料毀損與客服成本，屬上線必要基礎。使用者不應看到技術代碼；下一個 UX Sprint 應將 schema error 轉成可採取行動的欄位提示。啟用碼不可在無 migration 的情況下改格式。

## H — DevOps Engineer

本次只 commit/push 原始碼與測試，不部署 Apps Script 或 Netlify。正式 rollout 必須先在 staging 建立版本、備份、readiness、真實 transport 邊界與 rollback 證據；監控需記錄 code 與 requestId，不記錄 payload／credential。

## I — Code Reviewer

已修正兩個本輪發現：測試 VM 讀不到 top-level `const` 導致假邊界，以及 `form.append` 相容回歸。剩餘可重構但本次不修改：把 validator 拆成純模組、集中欄位 path/error catalog、用 canonical serialization 取代 legacy deduction 的 `JSON.stringify` signature、將 credential input 契約移至正式後端 IAM。

## Consensus

所有角色同意：在不重寫架構與不破壞舊資料的限制下，本設計沒有本 Sprint 範圍內的重大未處理問題；但未經 staging／實際裝置驗收，且正式 IAM、關聯式資料庫與 command API 未完成，因此不得正式上線。
