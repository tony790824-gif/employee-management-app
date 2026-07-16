# P0 Stored XSS Containment — Architecture Review

日期：2026-07-15

## A — CTO

選擇「資料永遠不是 HTML」作為預設安全邊界。產品不需要富文字，原生 DOM API 是風險與維護成本最低的方案。

## B — Senior Frontend Engineer

檢查 10 項改善：集中建節點、移除重複 option HTML、移除 inline handler、按鈕 type 明確、空表列共用、title 走 DOM property、dataset 走 DOM API、靜態面板改節點、動態金額改文字、載入順序固定。以上均已納入。

## C — Backend Architect

反對只在 server 清洗後保存，因不同輸出 context 無法由一次清洗解決。保留原始純文字、在輸出端安全渲染是較可維護的契約；正式 API 仍須 schema validation。

## D — Database Architect

資料庫欄位維持 plain text，不保存 HTML。正式 migration 應為姓名、職稱、備註設定長度與 Unicode 規則；本次不改 snapshot schema。

## E — Security Engineer

檢查 stored/reflected/DOM XSS、inline event、attribute breakout、惡意 ID、script/svg/img payload、session token 竊取。Authenticated scripts 的 HTML parsing sinks 已清零並建立防回歸測試。剩餘安全風險：缺正式 CSP、快速 PIN hash、CSV formula injection、snapshot 併發覆寫與 Apps Script 平台限制。

## F — QA Lead

列出 10 個 Bug 風險並驗證：空員工、惡意姓名、惡意職稱、惡意班次備註、惡意出勤備註、惡意出勤類型、惡意員工 ID、空班次、空出勤、封存員工。自動測試確認攻擊字串保持文字，既有八組回歸與 build 全通過。

## G — Product Manager

本修復不增加使用步驟、不改畫面，不影響 50 歲以上使用者；能避免帳號遭接管與班表被篡改，屬正式營運必需而非可選功能。

## H — DevOps Engineer

`dom-safety.js` 已列入發布白名單與 Service Worker v39。品質閘門會在任何 authenticated script 重新出現 HTML parsing sink 時失敗。

## I — Code Reviewer

效能檢查 5 項：DOM 建立成本、重排、事件數、日曆節點數、薪資表更新。資料量為單月人員表，原生 fragment-like `replaceChildren` 成本可接受；本次沒有新增輪詢或網路請求。UX 檢查 5 項：文字顯示、空狀態、按鈕行為、日曆、手機畫面，均維持原流程。結論：此 P0 修復沒有重大阻擋，可合併；產品整體仍不可上線。
