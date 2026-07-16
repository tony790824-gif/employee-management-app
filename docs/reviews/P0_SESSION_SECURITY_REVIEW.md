# P0 Session Security — Architecture Review

日期：2026-07-15

## A–I 角色審查

- **A CTO**：不接受 `pinHash` 當永久 bearer credential；本 Sprint 僅做可部署的過渡封堵。
- **B Senior Flutter Engineer**：目前是 PWA 而非 Flutter；介面不得在遠端驗證前載入已登入程式。
- **C Backend Architect**：選擇伺服器發行短效 token，拒絕只在前端計數的假限流。
- **D Database Architect**：工作階段與限流暫存 Script Properties；要求容量上限、過期清理及未來移轉正式資料表。
- **E Security Engineer**：要求 PIN 僅登入送一次、原始 token 不落後端、登出／刪除員工撤銷、回應移除 credential hashes。
- **F QA Lead**：要求錯誤第 5 次鎖定、到期、偽造、舊憑證重播、角色越權、重複登出與刪除員工案例。
- **G Product Manager**：不新增裝置管理畫面；先避免員工無法登入與帳號遭猜測。
- **H DevOps Engineer**：Apps Script 與 Netlify 必須成套發布；只更新其中一端會使舊登入協定失效。
- **I Code Reviewer**：要求遠端 pull 不觸發 save、弱網登出不得卡 25 秒、失效工作階段須清除本機敏感快取。

結論：所有角色同意此方案足以作為 P0 過渡封堵；所有角色同時反對把它標示為正式 IAM 完成。

## 自我 Code Review

### 10 個已改善項目

1. PIN 雜湊不再保存於 `sessionStorage`。
2. 後續 API 不再重送電話與 PIN 雜湊。
3. 工作階段有 8 小時到期時間。
4. 後端只保存 token hash。
5. 第 5 次失敗登入鎖定 15 分鐘。
6. 重新開啟頁面先做伺服器驗證。
7. 登出撤銷伺服器工作階段。
8. 移除員工撤銷其所有工作階段。
9. 遠端資料套用不再觸發自動回寫。
10. 老闆回應不再含任何 PIN／啟用碼雜湊。

### 10 個已測試的 Bug 風險

1. 第 5 次失敗未鎖定。
2. 鎖定後正確 PIN 可繞過。
3. 偽造 token 可讀取。
4. 舊 phone + pinHash 可重播 pull。
5. 過期 token 仍有效。
6. 登出後 token 仍有效。
7. 重複登出拋錯。
8. 員工 token 可呼叫 boss save。
9. 老闆 token 可呼叫員工打卡。
10. 員工被刪除後舊 token 仍可讀取。

### 仍存在的安全風險（至少 5 項）

1. PIN 仍是低熵 6 位數，後端仍用快速 SHA-256 驗證。
2. XSS 仍可竊取短效 bearer token。
3. Apps Script 無成熟的 refresh/device/session 管理。
4. 無 workspace/tenant 隔離。
5. 無不可竄改 audit log 與安全告警。

### 效能檢查（至少 5 項）

1. 每次登入會讀寫 Script Properties。
2. 每次 API 仍鎖整份 JSON snapshot。
3. 15 秒 pull 對大量員工無法擴充。
4. Script Properties 清理是 O(n)。
5. 全量 snapshot 序列化仍是主要瓶頸。

已修正的效能回歸：遠端 pull 不再引起 boss save；工作階段與限流紀錄有容量與過期清理。

### UX 檢查（至少 5 項）

1. 弱網登出最多等待 3 秒。
2. 過期時自動回登入頁，不留假登入畫面。
3. 恢復登入時顯示處理狀態。
4. PIN 不正確仍使用一致錯誤，避免帳號枚舉。
5. 老闆仍能看到員工「PIN 已設定／待啟用」，但看不到秘密本身。

