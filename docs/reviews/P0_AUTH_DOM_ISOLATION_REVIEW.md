# P0 Auth DOM Isolation Review

日期：2026-07-15  
功能：登入成功前不載入或渲染公司管理資料。  
狀態：此單一 P0 功能完成；Sprint 1 與正式 Auth 尚未完成。

## Architecture Review（A–I）

- A／CTO：只修前端曝露根因，不在此 Sprint 重寫後端。
- B／Senior Frontend：以單一 sequential loader 保持既有 script 執行順序，避免大規模 module 改寫。
- C／Backend Architect：前端隔離不能取代 server session；API 風險必須保留為 P0。
- D／Database Architect：登入前不建立新資料模型；登出只清 Google Sheets 快取，不破壞無關設定。
- E／Security Engineer：反對 CSS-only；未登入不得執行 `app.js`，載入失敗也要 purge DOM 與 cache。
- F／QA Lead：必測未登入、錯誤輸入、老闆、員工、session 不一致、重複點擊與 console error。
- G／Product Manager：維持單一登入頁，不新增流程；載入時顯示明確狀態。
- H／DevOps：動態載入檔仍納入發布白名單，Service Worker cache 必須升版。
- I／Code Reviewer：loader 必須 idempotent；員工 session 缺 ID 或角色不一致時拒絕恢復。

## 10 個改善檢查

1. 管理模組移出初始 HTML script：已完成。
2. 管理程式增加未授權啟動 guard：已完成。
3. 管理 shell 預設隱藏：已完成。
4. Sequential loader 保留相依順序：已完成。
5. Loader 使用單一 Promise 防重複：已完成。
6. 登入按鈕與欄位 busy lock：已完成。
7. 員工登入缺 employeeId 時拒絕：已完成。
8. session 角色／員工 ID 一致性：已完成。
9. 載入失敗 purge DOM/cache：已完成。
10. 發布 cache 升版與回歸測試：已完成。

## 10 個 Bug／邊界案例

1. 未登入就 render 公司資料：已修復。
2. CSS overlay 下仍有敏感 DOM：已修復。
3. 空白登入載入管理程式：測試確認不會。
4. 快速重複點登入：以 busy lock 阻止。
5. 管理 script 中途失敗留下資料：已 purge 並清 Google Sheets 快取。
6. 員工 session 缺 employeeId：已拒絕。
7. 損壞 session JSON：已安全清除。
8. session role 與雲端 role 不一致：已拒絕。
9. 重複恢復載入兩次 app.js：單一 Promise 與瀏覽器測試確認只載入一次。
10. 登出殘留 v1/v2/corrupt backup：`clearSensitive()` 全部清除且保留無關設定。

## Security Review

1. 登入前 DOM 曝露：已修復。
2. 前端 session 可被裝置使用者修改：未解，下一個正式 Auth P0。
3. sessionStorage 保存可重播 PIN hash：未解，下一個正式 Auth P0。
4. Google Sheets `save` 仍接受全量資料：未解，下一個 authorization P0。
5. 多處 `innerHTML` 仍有 stored XSS：未解，P1；正式上線前必須關閉。

## Performance Review

1. 未登入不再解析與 render 全量公司資料，首屏工作量下降。
2. 驗證後新增 7 個 sequential request；同源＋Service Worker cache 可降低成本，但仍需量測。
3. 管理模組只載入一次，避免重複 handler 與記憶體成長。
4. 員工定時 render 只在登入並載入模組後啟動。
5. 全量 state parse/stringify 與 Google Sheets pull 仍是後續瓶頸。

## UX Review

1. 登入畫面不再露出背景管理頁：已完成。
2. 登入期間顯示「正在驗證並載入」：已完成。
3. 重複點擊已停用：已完成。
4. script 載入錯誤仍以 alert 呈現：待統一錯誤元件。
5. 390px 實機／瀏覽器矩陣仍需正式 E2E；本次未宣稱完成跨裝置驗收。

## QA 證據

- 初始頁只載入 6 個登入必要 script；`app.js` 未載入。
- 未登入：管理 shell `display:none`、員工卡片與班表列數為 0。
- 無效輸入：沒有載入管理 script。
- 不一致的預覽 session：正式頁拒絕恢復並回登入畫面。
- 老闆預覽：管理模式正確，`app.js` 只載入一次。
- 員工預覽：31 天日曆、連續選取至 8 天、畫面未跳轉。
- 瀏覽器 console warning/error：0。

## 未改動範圍

沒有修改 Google Apps Script API contract、PIN 規則、排班、工時、薪資、休假商業規則或雲端資料格式。
