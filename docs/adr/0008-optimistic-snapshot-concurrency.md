# ADR 0008 — Snapshot optimistic concurrency control

日期：2026-07-15  
狀態：Accepted（Google Sheets 過渡期 P0 止血）

## 背景

員工排假與打卡已改為伺服器 action，但老闆仍上傳完整 snapshot。若老闆頁面停留在 revision 4，員工將雲端更新為 revision 5，老闆仍可能把 revision 4 的整份內容寫回，造成員工資料靜默消失。Apps Script lock 只能排隊，不能識別 stale snapshot。

## 方案比較

1. Last-write-wins：操作簡單但會遺失薪資、出勤與休假資料；拒絕。
2. 客戶端自動合併整份 JSON：陣列刪除、薪資調整、PIN 重設與同欄位修改無可靠通用合併規則；拒絕。
3. Server-managed monotonic revision＋compare-and-swap：版本相同才接受，衝突時拒絕並回傳最新版本；採用。
4. 全面改成關聯式 command API：長期最佳方案，但超出本次 P0 止血範圍；保留為 Sprint 3。

## 決策

- Snapshot 增加 server-managed `sync.revision`，舊資料從 0 開始。
- 每次員工排假、打卡、首次啟用與成功老闆儲存都遞增 revision。
- 老闆 `save` 必須帶 `baseRevision`；缺少、過期或重播一律拒絕。
- 衝突回應為 `REVISION_CONFLICT`，包含最新的安全老闆 projection。
- 前端停止後續自動儲存，保存 attempted/remote 到本機衝突備份並提示先匯出現有備份，再重新整理重做。
- 任何衝突都不做猜測性合併，不可局部寫入。

## 後果

- 多裝置操作不再靜默覆蓋；使用者可能遇到必須重做一次修改的明確衝突。
- 完整 snapshot、單一 Sheet 儲存格與缺少 command-level idempotency 仍是架構負債。
- 前端與 Apps Script 必須協調部署；舊前端沒有 `baseRevision` 時伺服器會 fail closed。
