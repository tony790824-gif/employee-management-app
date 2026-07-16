# Project Cleanup Architecture Review — 2026-07-16

## 範圍

只審查既有程式去重、發布資產、備份匯入與老闆雲端提交；不新增產品功能，不變更 API／資料 schema。

## A–I Review

- **A CTO：** 選擇小步整併而非重寫，保留使用者流程與回滾能力。
- **B Frontend：** 唯一事件入口消除載入順序、雙重 submit 與 `stopImmediatePropagation` 依賴。
- **C Backend：** Apps Script action 未變；正式 command API 仍是下一個架構 Sprint，不能因前端整理而延後。
- **D Database：** snapshot schema 未變，避免在未做線上備份與 migration drill 前觸碰正式資料。
- **E Security：** 移除未啟用雲端草稿、集中 endpoint、限制 SW fallback；正式 IAM／tenant 隔離仍阻擋上線。
- **F QA：** 加入 cleanup 回歸；12 組測試、build、release gate 與雙角色 smoke 通過。
- **G Product：** 整理不增加介面步驟，但降低同步失敗與客服成本。
- **H DevOps：** 25 檔白名單建置可重現；正式 Apps Script readiness 與跨裝置 E2E 尚未完成。
- **I Reviewer：** 接受現行整併；要求禁止平行 handler、散落 endpoint、資產失敗回 HTML 與未等待提交就 reload 的回歸。

## 自我審查清單

### 10 個改善／Bug 面向

1. 重複員工 submit。2. 重複班次 submit。3. 重複出勤 submit。4. 事件攔截順序。5. 儲存中重複送出。6. reload 前未等待雲端。7. 非衝突失敗未回滾。8. 衝突草稿遺失。9. endpoint 散落。10. 非導覽資產錯誤回 HTML。

### Security（5）

未啟用雲端設定誤部署、敏感備份覆蓋 access、API URL 重複漂移、Service Worker MIME 混淆、衝突時意外覆蓋遠端。前四項在本次範圍內關閉；正式 IAM／授權仍列 P0。

### Performance（5）

重複 handler、重複 render、重複 network save、無效模組下載、資產失敗造成重載。本次已去重；大量資料與弱網效能仍待正式 E2E。

### UX（5）

取消對話框、重複點擊、錯誤提示、衝突草稿保留、角色畫面隔離均完成 smoke；正式網路錯誤復原與手機矩陣仍待後續。

## 結論

本次整理沒有新增重大問題，可作為新的本機穩定基準；產品整體仍不可正式上線，直到 Apps Script 線上 readiness、真實跨裝置 E2E 與 P0 正式後端工作完成。
