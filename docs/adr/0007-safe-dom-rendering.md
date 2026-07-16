# ADR 0007 — 不可信資料只能以 DOM 純文字渲染

日期：2026-07-15  
狀態：Accepted（P0 過渡止血）

## 背景

員工姓名、職稱、電話、班次備註、出勤類型與備註會從 Google Sheets snapshot 回到瀏覽器。舊版將這些欄位拼進 `innerHTML`，任何可寫入資料的人都可能植入 stored XSS，並在老闆登入後竊取短效 session token 或修改班表。

## 比較方案

1. 每個字串手動 HTML escape：修改小，但 attribute、URL、事件等 context 不同，容易遺漏；拒絕。
2. 導入通用 HTML sanitizer：仍允許應用把資料當 HTML，增加第三方供應鏈與設定風險；本產品沒有富文字需求，拒絕。
3. 動態資料一律用 `textContent`、文字節點、`.value`、`.dataset` 與事件監聽器；接受。

## 決策

- 新增 `dom-safety.js`，只建立 DOM 節點，不解析 HTML 字串。
- 所有 authenticated scripts 禁止 `innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write` 與行內事件標記。
- 動態按鈕使用 closure 綁定事件，不再把員工 ID 拼入 `onclick`。
- 自動測試掃描所有 authenticated scripts，並以攻擊字串驗證 helper 只產生文字。
- 使用者欄位資料契約為 plain text；目前不支援 rich text。

## 後果

- stored XSS 的主要 DOM 注入面被移除，畫面功能與資料結構不變。
- 未來若要支援富文字，必須另立 ADR、使用經審核 sanitizer 與嚴格 CSP，不能繞過本決策。
- 這不取代伺服器 validation、輸出 CSP、CSV formula injection 防護或正式權限模型。
