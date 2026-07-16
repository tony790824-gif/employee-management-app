# P0 Employee Authorization Review

日期：2026-07-15  
功能：停止員工全量覆寫與跨員工讀取，改為本人排假／打卡命令。  
狀態：本機原始碼與 build 已完成；正式 Apps Script 與 Netlify 尚未重新部署。

## Architecture Review（A–I）

- A／CTO：選擇最小止血，不重寫產品，也不把過渡方案誤稱正式架構。
- B／Senior Frontend：保留 state store 與既有畫面，只把三個員工 mutation 改接命令。
- C／Backend Architect：反對 employee snapshot；命令必須由伺服器衍生員工 ID。
- D／Database Architect：單一 JSON 仍有 stale write；命令只能降低越權，不能解決資料庫問題。
- E／Security Engineer：員工 response 必須 field-filter，且 `save` 要在 server 拒絕，不能只靠前端隱藏。
- F／QA Lead：覆蓋錯 PIN、全量攻擊、跨員工、額度、錯月份、重複打卡、正常老闆流程。
- G／Product Manager：不增加新流程；排假與打卡失敗要明確，不能假裝成功。
- H／DevOps：Apps Script 與靜態站是兩個部署單位，兩者都更新前不得宣稱線上完成。
- I／Code Reviewer：通用 patch allowlist 仍太寬；明確 command 可讀、可測、較不容易回歸。

## 自我 Review：10 個改善

1. 員工 `save` server-side deny：已完成。
2. 員工登入只回本人資料：已完成。
3. 員工 pull 只回本人資料：已完成。
4. 本人員工紀錄移除 `pinHash`：已完成。
5. 老闆 access 不回員工端：已完成。
6. 封存員工與薪資調整不回員工端：已完成。
7. 排假限制本月／下月、有效日期、去重、額度：已完成。
8. 打卡 ID 與時間改由伺服器產生：已完成。
9. 前端正式 session 失效不再 fallback 本機：已完成。
10. 重複按鈕以 busy/disabled 與 server guard 保護：已完成。

## Bug Review：10 個案例

1. 員工送空公司 snapshot：拒絕且 server data 不變。
2. 員工偽造其他 employeeId 打卡：忽略，使用本人 ID。
3. 員工讀到其他人電話／時薪：projection 排除。
4. 員工讀到 PIN hash／老闆 access：projection 排除。
5. 重複休假日期：server 去重。
6. 超過休假額度：server 拒絕。
7. 寫入過去／任意月份：server 拒絕。
8. 同時存在未下班紀錄再打卡：server 拒絕。
9. 沒有上班紀錄直接下班：server 拒絕。
10. 壞掉的 array/object 欄位令 API 崩潰：cleanup 加入型別正規化。

## Security Review（至少 5 項）

1. Mass assignment：員工全量 `save` 已關閉。
2. Broken object authorization：員工 ID server-derived，已止血。
3. Excessive data exposure：員工 response projection，已止血。
4. Replay／低熵 PIN hash：未解，仍是下一個 P0。
5. Tenant isolation／首次認領：未解，仍是下一個 P0。
6. Rate limit、session expiry、revoke、audit：未解，禁止正式上線。

## Performance Review（至少 5 項）

1. 員工下載資料量由公司全量降為本人資料，改善。
2. 命令 payload 小於 snapshot，改善。
3. 後端仍讀寫 A1 整份 JSON，未解。
4. 全域 Apps Script lock 仍會序列化所有請求，未解。
5. 老闆仍 15 秒全量 pull/stringify/reload，未解。
6. 員工 action 完成後仍寫本機整份本人 projection，可接受於過渡期。

## UX Review（至少 5 項）

1. 排假與打卡只有雲端成功才顯示成功，改善。
2. 儲存與打卡期間按鈕 disabled，避免重複送出。
3. session 失效顯示明確訊息，不再假裝同步。
4. 休假儲存按鈕目前位於第二頁，仍不直覺，列 P2。
5. 錯誤仍使用 `alert`，弱網重試與持久狀態未完成，列 P2。
6. 本機預覽仍保留純本機行為，方便檢查畫面，不影響正式授權。

## QA 證據

- `quality-check`：14 個前端 script、1 個 Apps Script、23 個發布資產通過。
- 自動測試：介面穩定、state recovery、登入前隔離、員工授權全部通過。
- Backend VM：正常／錯誤 PIN／越權／跨員工／額度／月份／重複點擊／老闆相容性通過。
- Browser：員工預覽 31 天、選 3 天休假、儲存成功、上班打卡成功。
- Build：23 個檔案輸出 `dist/`。

## 剩餘重大風險

- 本機修改尚未發布至 Apps Script 與 Netlify；線上版本尚未受本修復保護。
- PIN hash bearer credential、首次認領、無 workspace／rate limit／session revoke。
- 老闆全量 snapshot 仍可能覆蓋員工剛完成的 command。
- Google Sheets A1 仍不適合作正式主資料庫。
