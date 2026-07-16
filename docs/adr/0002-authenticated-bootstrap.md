# ADR 0002 — 驗證成功後才啟動管理功能

日期：2026-07-15  
狀態：Accepted（前端 P0 止血方案）

## 問題

原本 `app.js` 在 `login.js` 前執行，未登入就把員工、出勤與薪資資料寫入 DOM。登入 overlay 只是視覺遮罩，不是資料隔離。

## 比較方案

1. 只用 CSS 遮住管理畫面：成本最低，但敏感資料仍在 DOM，拒絕。
2. 新增獨立登入 HTML／route：隔離清楚，但目前無 router，會複製 PWA 與登入啟動邏輯，超出本 Sprint。
3. 分階段啟動：初始只載入登入必要程式；驗證成功後依序載入管理模組。影響小且真正避免登入前 render，採用。

## 決策

- `index.html` 不再靜態載入管理模組。
- `login.js` 在驗證成功後，以單一 Promise 依序載入管理模組。
- `app.js` 拒絕未具 `SHIFT_AUTHORIZED` 的直接啟動。
- 未登入時管理 shell 完全隱藏；載入成功後才加上 `app-authenticated`。
- Google Sheets 模式登出與載入失敗會清除本機敏感 state。

## 限制

這不是正式 authentication boundary。前端旗標與 sessionStorage 可由裝置擁有者修改；localStorage 仍是客戶端資料。正式方案必須由後端簽發短效 session，逐 action 驗證使用者、角色與 workspace。
