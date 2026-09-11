# Bankeban 核心功能正式環境啟用套件

目前僅完成本機／一次性 PostgreSQL 驗證。**本文件不是正式資料庫操作授權；尚未連線或套用正式環境。**

## 1. 一次啟用範圍與順序

以已核對的既有 0001–0009、0011–0022 為起點，只依序套用以下三個檔案：

| 版本 | Repository 檔案 | 用途 |
| --- | --- | --- |
| 0023 | `database/pending/0023_employee_management.up.sql` | 員工編輯、停用／離職、既有同店登入帳號連結與停用一致性 |
| 0024 | `database/pending/0024_payroll.up.sql` | 每月固定底薪／時薪模式、具名加扣項編輯／作廢、月佣金、應付薪資 |
| 0025 | `database/pending/0025_overnight_shifts.up.sql` | 跨日班次、編輯版本檢查、前後日重疊檢查 |

0010 永久排除。既有已套用 migration 內容及 checksum 不變；不重跑 0009–0022。

三個檔案目前刻意保留在 `database/pending/`，不會被既有自動 migration 清單載入。**不要直接使用舊 Production event runner 或掃描整個 migrations 目錄執行本套件**；舊 event runner 只支援原本 13 版，且本機還有未核准的 0010 檔案。

取得一次明確授權後，使用既有 PostgreSQL client 依上述精確檔案清單操作：先核對最新 ledger／checksum、目標與 operator，確認當次可用的復原點並暫停寫入。每版 SQL、該檔原始位元組 SHA-256 與對應 `schema_migrations(version,name,checksum)` 記錄須在同一 transaction 內提交；任何失敗立即停止，不跳版或重試。不得只執行 SQL 而漏記 ledger。

還需在同次授權中，僅將下列五個新函式的 EXECUTE 授予既有 API runtime role（現行預期 `banke_api_production`，執行前核對，不新增 role）：

- `app_private.api_employee_administration(text,text,text)`
- `app_private.api_execute_employee_command(text,text,text,text,jsonb,text,text,text)`
- `app_private.api_payroll_month(text,text,text,text)`
- `app_private.api_execute_payroll_command(text,text,text,text,jsonb,text,text,text)`
- `app_private.api_execute_shift_command(text,text,text,text,jsonb,text,text,text)`

新函式不授權 PUBLIC，不授予 API 直接讀寫資料表的權限，不改 Auth0 或其他既有帳號／ACL。正式登入帳號的建立、實際員工連結與實際薪資輸入不包含在 schema 啟用中。

## 2. 資料影響

- 0023 新增員工任職狀態與連結停用標記。唯一既有資料回填：`status='archived'` 的員工，新 `employment_status` 欄位設為 `inactive`；不刪除歷史員工、出勤或帳號。之後透過 APP 停用員工時，才停用該店對應登入權限；重新啟用員工不會自行解除獨立的安全停權。
- 0024 新增 `payroll_monthly`，在既有 `payroll_adjustments` 新增名稱與有效／作廢欄位。舊正負金額保留，不轉移或清空既有薪資資料。作廢保留原金額與備註；同一筆加扣項不可移到其他員工／月份。
- 0025 只把班次時間限制由「結束必須晚於開始」改為「起訖不能相同」，並新增受控寫入函式。既有班次日期／時間不改写；較早的結束時間代表次日，開始日決定班表月份。
- 無 DROP TABLE、員工刪除、銀行匯款、報稅、外部帳號建立或正式業務資料批次改寫。

## 3. 計算規則

應付薪資 = 底薪 + 有效加項 + 月佣金 − 有效扣項。固定底薪模式取當月輸入金額；時薪模式沿用「該月出勤工時 × 員工目前時薪」，四捨五入至整元，兩種底薪不重複累加。金額以新臺幣整元輸入。

月佣金沿用每員工每月一筆的操作概念，直接整合到月薪資設定；不啟用未核准的 0010 佣金規則／外部收入系統。此 MVP 是可修改的月薪資計算，**不是鎖帳或歷史薪率快照制度**；管理者修改時薪／工時會重算時薪模式月份。固定薪資按月設定，未設定時仍沿用既有時薪模式。

跨日打卡保留開始日及既有工時計算規則；9 月 30 日 22:00 到 10 月 1 日 06:00 為 8 小時，歸屬 9 月出勤薪資，不重複計入 10 月。

## 4. 回滾方式

- 單版提交前失敗：ROLLBACK 該 transaction，該版結構與 ledger 都不留下部分變更；已完成前版保留，停止後先依實際 ledger 決定恢復方式。
- 提交後尚未使用：優先停止新功能寫入、保留新增欄位／資料並回復前一版 APP；必要時只撤回上述新入口權限。不盲目刪除資料表或歷史 ledger。
- 已使用後：保留員工停用紀錄、薪資加扣項與佣金，不以整庫還原覆蓋新的業務資料。資料相容的修正版優先；真正需要還原時，須由 Owner 明確確認復原點與資料損失範圍。
- 已存在跨日班次時，不能直接恢复舊 `start_time < end_time` 限制或舊不支援跨日的寫入功能；先停用班次編輯並保留新結構，再向前修正。不得自動刪除或拆分跨日班次。
- 不以回滾重新啟用已停權帳號。

## 5. 套用後必要驗證

1. 最新 ledger／checksum：只增加 0023、0024、0025，0010 不存在；五個受控函式與既有 API identity 可用。
2. 主管編輯員工；測試員工停用後失去該店存取，重新啟用不自動恢復獨立停權；只可連結既有同店可用帳號。實際帳號／資料寫入另需 Owner 核准的測試範圍。
3. 一名核准測試員工：固定底薪 30000 + 加項 1000 + 佣金 2000 − 扣項 500 = 32500；編輯／作廢後重算正確，其他月份／店家不受影響。
4. 員工只能讀自身薪資，不能操作薪資／班次管理；主管可查看停用或離職員工的結算資料。
5. 新增與編輯 22:00 → 次日 06:00；相鄰 06:00 班可用，次日 05:00 重疊班拒絕。跨月底顯示、跨日打卡與薪資歸屬正確。
6. 本機已通過上述合成資料測試。正式驗證先唯讀；任何新建測試資料、打卡、帳號連結或薪資變更，必須包含在 Owner 的明確驗證授權中，不自行使用真實員工資料。

資料庫啟用之外，仍需完成單一正式 API 路由與桌機／手機實機驗收；不把本機測試 PASS 宣稱為正式環境已上線。
