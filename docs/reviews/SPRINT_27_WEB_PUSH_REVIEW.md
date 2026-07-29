# Sprint 27 Architecture Review — Standard Web Push

## A — 主工程師

以 Notification Center 為唯一權威來源，Web Push 僅作傳送。資料庫 outbox/notification transaction、既有 Session/Membership/Workspace 驗證與 Command 冪等邊界全部沿用。

## B — 資深 Code Reviewer

已檢查並處理：重複資料路徑、前端私鑰外洩、訂閱跨帳號衝突、重複 timer、重複送達、無界 payload、無界 retry、失效 endpoint、錯誤 URL、未支援瀏覽器、iOS 非 PWA、按鈕連點、Migration 不可回滾、舊 Migration 被誤套用。

## C — 資安工程師

訂閱與 delivery 強制 RLS；API/worker 使用不同最小權限 Role；即時重查 Session/User/Workspace/Membership；不記錄 endpoint/key/token；通知點擊只接受 same-origin 相對路徑；私鑰只允許 Secret；未知或撤銷授權 fail closed。

## D — 效能工程師

採 durable queue、小批次、`SKIP LOCKED`、固定 5 秒 worker interval、三次上限與索引化 pending queue；不新增前端輪詢控制器，也不把 push payload 放入 bootstrap cache。

## E — 產品經理

使用者仍可在通知中心查到完整紀錄；推播關閉、瀏覽器不支援或服務故障都不會讓通知消失。UI 僅增加啟用、停用、重新註冊與測試通知。

## F — 商業顧問

標準 Web Push 不增加 Firebase/APNs 平台綁定或每則訊息成本，符合目前 PWA 商業階段；原生推播與付費通道留待真實留存／轉換數據證明必要後評估。

## 結論

沒有需要重新設計的重大問題。程式與 Staging Migration 可進入自動化／資料庫驗收；Windows 與 iPhone PWA 真實背景送達仍必須由使用者驗證。
