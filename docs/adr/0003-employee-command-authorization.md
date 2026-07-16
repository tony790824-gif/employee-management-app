# ADR 0003：Google Sheets 過渡期員工 Command Authorization

日期：2026-07-15  
狀態：Accepted（P0 過渡止血，不是目標架構）

## 背景

舊 API 允許員工上傳整份公司 snapshot，只在寫入前覆蓋少數欄位。員工仍可改動其他人的班次、出勤、休假與薪資相關資料；登入與 pull 也會收到整份公司資料。

## 比較方案

1. **繼續全量 save，只保護更多欄位**：修改少，但欄位一增加就可能再次越權，拒絕。
2. **通用 JSON Patch＋路徑 allowlist**：比全量安全，但現有單一 JSON 模型下路徑驗證複雜，容易出現 mass assignment，暫不採用。
3. **明確員工命令＋本人資料投影**：命令範圍小、可測、員工 ID 由伺服器身份決定，採用。

## 決策

- 員工不能呼叫 `save`。
- 員工只可呼叫 `employeeSaveLeave`、`employeeClockIn`、`employeeClockOut`。
- 伺服器忽略任何客戶端員工 ID，永遠使用 `identify_()` 的結果。
- 員工登入與 pull 只回傳本人必要資料，且移除 PIN hash、老闆 access、封存與薪資調整。
- 正式環境若 session 不存在，前端必須報錯，不可假裝存到雲端。

## 後果

優點：立即關閉兩個 Critical 越權面，保留既有 UI 與資料格式。  
限制：電話＋PIN hash 仍是可重播憑證；無 workspace；老闆仍全量 save；A1 snapshot、lock 與併發覆蓋仍存在。Sprint 2–3 必須以正式 session、tenant 與 relational action API 取代本方案。
