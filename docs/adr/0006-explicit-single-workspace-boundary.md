# ADR 0006：Google Sheets 過渡後端的明確單一工作區邊界

日期：2026-07-15  
狀態：Accepted（P0 過渡隔離，不是正式多租戶平台）

## 背景

目前每個 Apps Script 部署只保存一份公司資料，但資料快照、工作階段與 API 回應都沒有不可變的公司識別碼。只依賴「同一份試算表」作為隱含邊界，無法偵測部署複製、錯誤匯入、工作階段屬性殘留或未來多公司擴充造成的資料歸屬錯誤。

## 比較方案

1. **維持隱含單一公司**：修改最少，但無法驗證資料與登入階段是否屬於同一家公司，拒絕。
2. **由瀏覽器傳入 workspace ID**：容易實作，但攻擊者可以竄改，拒絕。
3. **Apps Script 產生不可變 workspace ID，資料與 session 都綁定並逐次核對**：可在現有架構中建立可信邊界，接受為 P0 過渡方案。
4. **立即改成正式多租戶 PostgreSQL／IAM**：是目標架構，但會跨越本次單一 P0 工作項目，留在 Sprint 3。

## 決策

- 伺服器第一次成功驗證使用者時產生 `ws_<random>` 工作區 ID。
- ID 同時保存於 Script Properties 與 Sheet 快照；兩者不一致時停止所有資料操作並回報 `WORKSPACE_MISMATCH`，禁止自動覆蓋。
- 每個 server session 必須綁定 workspace ID；每次授權都核對 session、Script Properties 與資料快照。
- 瀏覽器只保存伺服器回傳的 workspace ID，並在每次回應時核對；不得自行指定工作區。
- 老闆全量儲存不得修改或刪除 workspace 欄位；舊資料會在首次成功登入時安全補上工作區 ID。

## 限制

此方案讓「一個 Apps Script 部署＝一個工作區」成為可驗證規則，但仍不能在同一部署安全服務多家公司。正式商業多租戶仍需具備 `workspace_id` 外鍵、資料列級授權、交易、稽核與正式 session store 的後端。
