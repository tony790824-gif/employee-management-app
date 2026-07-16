# PROJECT CONSTITUTION — 班客邦 Enterprise Development Bible

本文件是班客邦專案的最高工程原則。產品必須被視為正式商業系統，而不是 Demo。

## 1. 核心責任

- 以 CTO、資深前後端工程師、資料庫架構師、資安工程師、QA、產品與 DevOps 的標準決策。
- 不猜測、不省略、不以功能表面可用取代資料正確、安全與可維護性。
- 若需求、架構或流程不合理，必須提出證據、替代方案與取捨，不盲目照做。
- 任何「完成」只代表該 Sprint 的驗收標準通過；未通過正式發布閘門不得宣稱產品可上線。

## 2. 每次工作前

先讀取所有相關程式、設定與文件，確認：

- 資料流、架構、API、資料庫與 migration。
- State management、router、權限、登入與 session。
- Business logic、第三方依賴、環境變數與部署方式。
- 影響範圍、現有測試、可回滾方式與已知風險。

不理解時先分析，不直接修改。

## 3. 開發流程

每個 Sprint／重要功能依序執行：

1. 分析現況與根因。
2. 提出至少兩個可行方案。
3. 比較安全、成本、維護、效能、UX 與商業價值。
4. 完成 Architecture Review。
5. 選定方案並記錄 ADR。
6. 修改程式與 migration。
7. Build、lint/check、test。
8. 自我 Code Review 與反對立場 Review。
9. Security、Performance、UX、QA、Business Review。
10. 修復發現的缺陷並執行回歸測試。
11. 更新 README、API、Database、Change Log 與 runbook。
12. 產出可驗證的完成摘要、剩餘風險與下一 Sprint。

任何必要步驟未完成，不得宣稱 Sprint 完成。

## 4. Architecture Review 角色

依序由以下觀點審查，合理反對意見未解決前不得正式開發：

- A：CTO
- B：Senior Frontend／Flutter Engineer
- C：Backend Architect
- D：Database Architect
- E：Security Engineer
- F：QA Lead
- G：Product Manager
- H：DevOps Engineer
- I：Code Reviewer

## 5. Code Review 最低要求

每次重要修改至少檢查：

- 10 個可改善處。
- 10 個可能 Bug／邊界案例。
- 5 個安全問題。
- 5 個效能問題。
- 5 個 UX 問題。

問題若在 Sprint 範圍內必須直接修復；跨 Sprint 問題要登錄 Backlog、分級、指定驗收方式。

## 6. Security Checklist

- OWASP Top 10、XSS、CSRF、Injection、SSRF。
- Authentication、Authorization、tenant isolation。
- Session/JWT expiry、refresh、revoke、device management。
- Rate limit、lockout、replay attack、idempotency。
- Secrets、environment separation、CSP、secure headers。
- 資料最小化、敏感資料加密、稽核與隱私保存政策。
- Dependency、SAST/DAST、權限與越權測試。

Critical 或 High security finding 未關閉，不得上線。

## 7. Database Checklist

- 正規化 schema、index、foreign key、unique/check constraint。
- Versioned migration、rollback、transaction、optimistic concurrency。
- Soft delete、server-side retention job、audit log。
- Backup、encryption、restore drill、RPO/RTO。
- 所有 business row 必須具 tenant/workspace isolation。
- Google Sheets 只可作報表／匯出整合，不作正式 primary database。

## 8. Frontend／PWA／Flutter Checklist

- Build size、memory、CPU、frame rate、loading 與錯誤狀態。
- Offline、weak network、retry、outbox、conflict handling。
- Small screen、tablet、dynamic text、dark mode、keyboard、screen reader。
- Material Design／Apple HIG 與 WCAG 2.2 AA 核心流程。
- PWA Service Worker 更新、cache、install、rollback 與跨瀏覽器驗證。
- 是否遷移 Flutter 必須由 ADR 與商業 ROI 決定，不可直接重寫。

## 9. QA 最低矩陣

- 正常、錯誤、空資料、大量資料。
- 弱網路、離線、API timeout、重試、重複點擊。
- 不同手機尺寸、平板、瀏覽器與權限。
- 登入失敗、session/token 過期、撤銷、越權。
- 快速切換、背景／前景、跨月、跨日、時區與併發衝突。

## 10. Coding Rules

正式程式禁止：

- 未綁 issue 的 `TODO`／`FIXME`。
- production fake/mock data。
- secret、環境 URL 或商業規則散落 hard-code。
- 無語意 magic number、空 function、重複程式。
- 無 validation、無 exception handling、無 structured logging。
- 以 `innerHTML` 插入未可信資料。
- 客戶端全量覆寫伺服器資料或只靠前端隱藏實作權限。

測試 fixture 可存在於測試目錄，但不可進入 production build。

## 11. Documentation

每次 Sprint 同步更新：

- `README.md`
- `docs/PRODUCT_BACKLOG.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `CHANGELOG.md`
- 相關 ADR、security、runbook 與 release checklist

## 12. 商業原則

每個功能都要回答：

- 是否提高留存或付費率？
- 是否降低老闆工時與客服成本？
- 是否讓員工更願意使用？
- 是否增加維運、雲端、法遵或資安成本？
- 能否用較簡單方案達成同等價值？

正式產品不讓客戶選底層資料庫供應商；客戶選方案與功能，平台統一維護 primary cloud，避免客服與資料一致性成本失控。

## 13. 完成回報格式

- Project Health Score
- 完成率
- 完成內容與原因
- 影響範圍與修改檔案
- 修正 Bug／新增功能
- Build/Test/Review 結果
- 是否影響其他功能
- 剩餘風險
- 下一步 Sprint

最後自問：若由 Google、Apple、Microsoft 或 OpenAI 的首席工程師審核，是否願意直接部署給十萬名使用者？若答案是否，必須明確標示「不可上線」，不可用「完成」掩蓋風險。

