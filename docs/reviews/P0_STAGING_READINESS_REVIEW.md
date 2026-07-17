# P0 受控 Staging Architecture Review

日期：2026-07-17
範圍：隔離 Apps Script 後端、核心 API 驗收、備份與還原；不含正式前端發布。

## A（主工程師）

採用獨立 Sheet、bound Apps Script、Web App deployment 與合成帳號，避免驗收改動正式資料。既有 API 與 recovery functions 原樣重用，沒有建立第二套產品邏輯。直接 API 驗收可先證明 authorization、revision、session 與資料恢復；前端環境隔離留到下一個單一 Sprint。

## B（資深 Code Reviewer）

本次找出的十項缺點：Apps Script 版本同步仍手動；缺 CI deployment；缺前端 Staging config；缺真實手機；缺弱網測試；缺實際等待 8 小時 TTL；缺集中監控；單一 A1 snapshot；全域 ScriptLock；舊 v1 credential 成本高；另外 acceptance response 需解碼 Apps Script HTML wrapper，耦合平台實作。

合理反對意見已採納：Staging 驗收不能只跑 readiness function，因此增加 live API 流程與實際 restore drill；測試憑證不提供 source default，必須由環境變數注入。尚未解決的缺點列入下一 Sprint／技術債，不能宣稱 production-ready。

## C（資安工程師）

確認正式資料未被改動、備份保持 private、pepper／session／restore confirmation 未提交、員工 action 由 session identity 決定、stale revision 被拒絕、登出與 restore 撤銷 session。v2 單次 HMAC 不是正式 password KDF；6 位 PIN、Apps Script Script Properties 與缺 MFA 仍是重大上線阻擋，必須以正式 Identity Provider 取代。

## D（效能工程師）

Staging 找到 4096 次 Apps Script HMAC 在全域 lock 內逾時並造成 lock starvation。v2 將新驗證限制為單次 HMAC，回歸測試禁止數千次呼叫。舊 v1 首次登入仍可能慢，資料量、A1 JSON parse、Drive backup、併發與負載尚未基準測試；不得視為可支援大量客戶。

## E（產品經理）

使用者需要可靠登入、資料不互相覆蓋及可復原，Staging 驗收直接降低客服與薪資資料遺失風險。此工作不新增可見功能，符合本 Sprint 範圍。未完成前端 E2E 代表尚不能向老闆／員工承諾手機體驗。

## F（商業顧問）

受控 Staging 與 restore drill 是付費 SaaS 的基本信任成本，不能作為獨立收費功能。短期保留低成本 Google Sheets 過渡後端可控制驗證成本，但若繼續擴張會提高事故與客服成本；正式商業模式需要多租戶資料庫、IAM、監控、備份 SLA 與方案限制。

## 結論

所有角色同意：本次 Staging 後端驗收沒有未處理的重大阻塞，可合併；但產品仍不可正式發布。下一個唯一最高優先工作是獨立 Staging 前端設定及真實手機／平板／桌機 E2E。正式 IAM、關聯式多租戶資料庫與 observability 仍是後續 P0。
