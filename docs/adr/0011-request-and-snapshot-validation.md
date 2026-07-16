# ADR 0011：Request 與 A1 Snapshot 值驗證

- 日期：2026-07-16
- 狀態：Accepted（過渡後端止血）

## Context

Google Apps Script 目前以隱藏 form 接收整份 request，Google Sheet A1 保存整份 JSON snapshot。既有邊界只驗證 JSON、top-level allowlist 與 collection 形狀，仍可能接受過大 request、錯誤電話、非有限金額、寬鬆日期或不合法 credential 表示。正式資料庫與 command API 尚未完成，本次不能重寫架構或新增 schema 欄位。

## Decision

1. `doPost` 在 JSON parse 與 API 呼叫前，以 `e.postData.contents` 的 UTF-8 bytes 檢查 1 MiB 上限；raw body 不可取得或為空時，以已解碼 `payload` 的 UTF-8 bytes fallback。超限回 `REQUEST_PAYLOAD_TOO_LARGE`。
2. A1 讀取、老闆 save、第一次初始化、備份驗證與最後寫入防線共用同一組值驗證。
3. 電話沿用既有 8–15 位數字規則；PIN 前端沿用 6 位純數字。A1 只保存 64-hex prehash 或版本化 credential，後端驗證其表示，無法從不可逆 hash 證明原始 PIN 字元。
4. 現行一次性啟用碼沿用已投入使用的 8 碼大寫英數字母表。需求中的「純數字」與既有正式規格衝突；為避免尚未啟用帳號失效，本次不變更規格。
5. `employees[].rate` 與薪資調整金額只接受 safe integer。既有負數扣款可讀且只可原樣保留；新建、修改或複製負數扣款一律拒絕。
6. 日期只接受 `YYYY-MM-DD`，班次時間只接受 `HH:mm`，timestamp 只接受精確 UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`；均以欄位 round-trip 驗證，不使用寬鬆 `Date.parse` 接受模糊格式。
7. 缺少可選欄位仍可讀；缺少、`null` 或空陣列的舊 `payrollAdjustments` 維持轉為空 object map 的既有行為。

## Consequences

- 優點：在現有架構下減少記憶體／解析濫用、NaN／Infinity 污染、模糊日期與無效 snapshot 覆寫；所有寫入路徑具共同防線。
- 限制：Apps Script raw body 是 URL-encoded form transport，大小可能高於解碼後 JSON；fallback 無法還原 transport bytes。A1 仍無 schema version、migration ledger、transaction、index 或 row-level constraint。
- 相容差異：舊負數扣款只允許原樣保留，現有 UI 若嘗試新增負數扣款會得到驗證錯誤；正式薪資模型必須將扣款改為非負 amount＋明確 type，而非繼續使用 signed amount。

## Rejected alternatives

- 只在前端驗證：可被直接呼叫 API 繞過，拒絕。
- 以 JavaScript 字元數限制：多位元 UTF-8 會低估，拒絕。
- 本次直接改成 relational schema：超出單一 Sprint，且需要 migration、staging 與 rollback，拒絕。
- 立即把啟用碼改成純數字：會讓既有待啟用帳號失效，拒絕。
