# Next Sprint — Staging 真實裝置矩陣驗收

## 唯一目標

在不新增產品功能、不修改資料庫、不套用 Migration、不部署 Production 的前提下，使用真實手機、平板與桌機瀏覽器，驗證目前 Google Sheets `STAGING` 固定 Draft 的核心老闆／員工流程、響應式畫面、觸控、可及性、PWA／Cache、Session／Membership 失效與環境隔離。

若另行明確核准重驗 PostgreSQL 資料層，必須使用既有隔離 `STAGING POSTGRES` Draft 與可回復 runbook；不得在本 Sprint 中自行切換資料層。

## 基準與限制

- 產品程式基準 Commit：`24e82a9886b95aa8077cf86fe2e1426458dd6cbc`。
- 專案完成度基準：85%。
- 固定 Draft 目前狀態：Google Sheets `STAGING`。
- Production 前端、API、Auth0、PostgreSQL、Netlify 與資料不得修改、連線作業或部署。
- Migration `0009`／`0010` 不得套用；不得新增或修改 Migration。
- 不得重新產生 tenant context key、建立真實使用者、使用 Production 資料或輸出任何 Secret／Token／Session ID／密碼。
- 不得用 viewport 模擬、裝置模擬器或自動化結果冒充真實裝置 PASS；可用於輔助定位，但證據必須標明來源。
- 發現缺陷時記錄最小重現證據並依停止條件中止；不得在同一 Sprint 順便新增功能或大規模重構。

## 2026-07-24 目前矩陣狀態

| 編號 | 狀態 | 已完成證據 | 尚缺證據 |
|---|---|---|---|
| D1 iPhone Safari／PWA | BLOCKED | 390×844 輔助 viewport 無水平溢位 | 真機 Safari、觸控、PWA、VoiceOver、Session 與核心流程 |
| D2 Android Chrome／PWA | BLOCKED | 360×800 輔助 viewport 無水平溢位 | 真機 Chrome、觸控、PWA、TalkBack、離線與核心流程 |
| D3 iPad Safari | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Safari、旋轉／Split View、PWA、VoiceOver 與核心流程 |
| D4 Android Tablet Chrome | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Chrome、旋轉／分割畫面、PWA、TalkBack 與核心流程 |
| D5 Windows Chrome | FAIL（可回復） | 真 Chrome 首頁、按鈕、重新整理、Console、1280×800 版面；29 組回歸通過 | 首次開啟曾顯示舊 `STAGING POSTGRES` 快取；需人工登入後流程及既有 PWA 更新驗證 |
| D6 Windows Edge | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 Edge、安裝、追蹤防護、Narrator、登入後流程 |
| D7 macOS Safari | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Safari、ITP、PWA／Dock、VoiceOver、登入後流程 |
| D8 macOS Chrome | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Chrome、PWA、VoiceOver、多分頁及登入後流程 |

本輪品質檢查 PASS、自動回歸 29／29 PASS、追蹤檔敏感資訊掃描 0 命中、瀏覽器 Console 0 error／warning。D1–D8 尚未全部取得真實裝置 PASS，因此本 Sprint **未完成**，專案完成度維持 85%。

## 最少人工真機驗收步驟

每一個 D1–D8 必須獨立執行並記錄裝置、OS、瀏覽器版本與不含敏感資訊的畫面證據：

1. 以固定 Draft HTTPS URL 開啟，先確認畫面只顯示紫色 `STAGING`；若出現 `STAGING POSTGRES`、Production 或 Local，立即停止並記錄。
2. 既有安裝／曾開啟過的裝置先直接開啟一次，再重新整理一次；確認兩次都不載入錯誤資料來源。另以乾淨瀏覽器或清除「僅此 Staging 網域」的網站資料重測。
3. 使用合成 Staging 老闆登入，驗證員工、班次、排假、出勤、工時核定、頁面返回／重新整理及登出；不得記錄密碼、Token 或 Session ID。
4. 使用合成 Staging 員工登入，驗證當月／次月日曆、額度內排假、打卡、工時／收入、重新整理及登出。
5. 使用第二 Workspace 合成身分嘗試目標 Workspace，確認 Read／Command 皆拒絕；再驗證 Session 過期或 Membership 失效後 fail closed。
6. 直向／橫向或 100%／125% 縮放重跑核心頁面，確認無溢位、遮擋、軟鍵盤覆蓋、無法點擊或連續點選跳頁。
7. 安裝 PWA（支援時），驗證名稱含 Staging、關閉重開、背景／前景、離線／重連、Service Worker 更新及 Cache namespace；不得與 Local／Production 共用 Session 或資料。
8. 檢查 Console／Network：不得有未捕捉錯誤，不得出現 Production／未知後端；完成資料對帳與合成測試資料恢復後，為該裝置標記 PASS／FAIL／BLOCKED。

## 目標裝置與瀏覽器

| 編號 | 真實裝置 | 瀏覽器 | 必測方向 |
|---|---|---|---|
| D1 | iPhone | Safari | 直向、橫向 |
| D2 | Android Phone | Chrome | 直向、橫向 |
| D3 | iPad | Safari | 直向、橫向、Split View（可用時） |
| D4 | Android Tablet | Chrome | 直向、橫向 |
| D5 | Windows | Chrome | 100%／125% 縮放、鍵盤 |
| D6 | Windows | Edge | 100%／125% 縮放、鍵盤 |
| D7 | macOS | Safari | 一般視窗、較窄視窗、鍵盤 |
| D8 | macOS | Chrome | 一般視窗、較窄視窗、鍵盤 |

每個編號必須分別產出 PASS／FAIL／BLOCKED；不得以另一個瀏覽器或作業系統代替。

## 驗收前置

- [ ] 記錄 Commit、固定 Draft HTTPS URL、日期、裝置型號、OS 與瀏覽器版本。
- [ ] 畫面清楚顯示 `STAGING`，網址與 PWA 名稱不含 Production 身分。
- [ ] 確認 Network 只連向核准的 Staging 來源，沒有 Production API／Auth0／資料庫請求。
- [ ] 確認 Google Sheets Staging readiness／備份與可回復基線；不得記錄憑證或個資。
- [ ] 準備合成的 Staging 老闆、員工及第二 Workspace 身分與有效測試 Membership。
- [ ] 記錄初始員工、班次、排假、出勤、薪資可見資料與 revision，供操作後對帳及恢復。
- [ ] 確認 Service Worker、Cache Storage、localStorage 與 Session namespace 為 Staging 專用。

## 共通驗收清單

### 身分與權限

- [ ] 老闆登入成功；錯誤憑證、取消登入與過期 Session 顯示可理解錯誤，不出現無限轉圈。
- [ ] 員工登入成功，且只看見本人允許的班表、排假、出勤與收入資料。
- [ ] 登出清除 Staging 認證狀態；返回、重新整理或重新開啟 PWA 不可恢復舊 Session。
- [ ] Session 撤銷、帳號停權或 Membership 移除後，即使頁面未關閉也必須 fail closed。
- [ ] 第二 Workspace 身分不可讀取、建立、修改或刪除目標 Workspace 資料。
- [ ] 前端隱藏不作為授權依據；任何錯誤角色操作由後端拒絕。

### 核心老闆／員工流程

- [ ] 老闆可查看員工、班次、排假、出勤與允許的薪資摘要。
- [ ] 員工可查看當月／次月日曆、選擇額度內休假並儲存；老闆同步後結果一致。
- [ ] 員工上班／下班打卡後，老闆出勤畫面顯示正確狀態；老闆核定工時後員工收入一致。
- [ ] 新增員工／班次的既有流程可以完成或顯示已知限制，不產生重複資料。
- [ ] 重複點擊登入、儲存、打卡、登出與導覽不造成雙重 mutation、重複畫面或卡死。
- [ ] Revision conflict 顯示明確訊息，不會靜默覆寫另一裝置資料。
- [ ] 操作後依初始記錄完成員工、排假、出勤、工時與 revision 對帳，並恢復合成測試資料。

### 響應式、觸控與可及性

- [ ] 直向／橫向／視窗縮放後，登入、日曆、頁籤、按鈕、對話框與表格不水平溢位或互相遮擋。
- [ ] 觸控目標可點、沒有 hover-only 操作、日曆連續點選不跳頁或失去選擇。
- [ ] 軟體鍵盤不遮住帳號、PIN、錯誤訊息或主要按鈕；關閉鍵盤後版面恢復。
- [ ] 200% 文字／系統較大字級時核心操作仍可完成。
- [ ] 鍵盤可依合理順序導覽，焦點可見，Esc／Enter 行為安全；頁籤狀態可辨識。
- [ ] VoiceOver／TalkBack／桌面螢幕閱讀器可讀出欄位名稱、按鈕、狀態與錯誤；不可只靠顏色表達。

### 弱網、離線與錯誤恢復

- [ ] 慢速網路時顯示 loading／disabled，沒有重複送出或無限 spinner。
- [ ] API timeout 顯示明確重試選項；不得靜默 fallback 至另一資料層。
- [ ] 離線開啟只使用 Staging app shell，不顯示 Production 或其他環境舊資料。
- [ ] 重新連線後不重複排假、打卡或其他命令；畫面回到 authoritative state。
- [ ] 錯誤訊息不含 Token、Session ID、資料庫資訊、完整個資或 stack trace。

### PWA、Service Worker、Cache 與環境隔離

- [ ] 安裝名稱、圖示與啟動畫面清楚標示 Staging；不得覆蓋或開啟 Production。
- [ ] 首次安裝、更新、關閉重開、返回前景與硬重新整理載入同一核准版本。
- [ ] Service Worker 更新後舊 cache 可安全淘汰，不發生舊 HTML＋新 JS／CSS 混用。
- [ ] 清除 Staging site data 只影響 Staging，不影響其他環境。
- [ ] Cache Storage、localStorage、Session 與帳號資料不存在 Local／Production namespace 污染。
- [ ] Console 無未捕捉 JavaScript error；Network 無 Production、未知後端或未授權 origin。

## 裝置專屬驗收項目

### D1 — iPhone Safari

- 驗證 Safari 返回／前進、分頁重新載入、背景至少數分鐘再返回及低電量模式下狀態。
- 驗證「加入主畫面」、standalone 啟動、safe-area、瀏海／Dynamic Island 與底部工具列不遮擋控制項。
- 驗證 Service Worker 更新及 Safari Cache 清除後可取得新版本，不留無限舊 cache。
- 使用 VoiceOver、系統較大字級與軟體鍵盤完成登入、排假、打卡及登出。

### D2 — Android Phone Chrome

- 驗證安裝提示／加入主畫面、standalone 啟動、返回鍵與背景／前景恢復。
- 使用 TalkBack、系統較大字級、鍵盤自動填入及縮放完成核心流程。
- 驗證 Chrome offline／重新連線及 Service Worker 更新不重複 mutation。

### D3 — iPad Safari

- 驗證直向、橫向與可用時的 Split View；日曆七欄、表單與對話框不裁切。
- 驗證觸控、外接鍵盤（可用時）、VoiceOver、較大字級與 PWA standalone。
- 驗證 Safari 分頁記憶體回收或背景恢復後 Session／Cache 行為安全。

### D4 — Android Tablet Chrome

- 驗證直向／橫向、分割畫面（可用時）、觸控與外接鍵盤（可用時）。
- 驗證寬畫面不錯誤放大手機控制列，日曆、表格與對話框維持清楚層級。
- 驗證安裝、更新、離線／重連與 TalkBack。

### D5 — Windows Chrome

- 驗證 100%／125% 縮放、窄視窗、鍵盤全流程、焦點順序與螢幕閱讀器基本可讀性。
- 驗證 Install App、桌面捷徑啟動、Service Worker 更新、DevTools Network／Console 及 cache namespace。
- 驗證多分頁 revision conflict 與登出後其他分頁立即失效。

### D6 — Windows Edge

- 重複 Chrome 的核心流程，另驗證 Edge 安裝、Application Cache／Service Worker 與追蹤防護不破壞 Auth0／Staging 請求。
- 驗證 Windows 高對比模式與 Narrator 基本流程。
- 驗證多分頁、返回／前進與重新開啟已安裝 PWA 的 Session 清除。

### D7 — macOS Safari

- 驗證 Safari Intelligent Tracking Prevention 條件下 Auth0 返回、登出與重新登入。
- 驗證窄視窗、系統縮放／較大文字、鍵盤、VoiceOver、背景／前景與 Cache 更新。
- 驗證安裝／加入 Dock（瀏覽器支援時）及 standalone 不共用錯誤環境資料。

### D8 — macOS Chrome

- 驗證 PWA 安裝、鍵盤、VoiceOver、縮放、多分頁 revision conflict 與登出同步。
- 驗證 DevTools Network／Console、Service Worker lifecycle 與 cache/storage namespace。
- 驗證 Chrome／Safari 之間不共享 Staging Session，且皆不出現 Production cache／資料。

## 判定標準

### PASS

- 該裝置的所有適用共通與專屬項目皆符合預期。
- 無資料遺失、重複 mutation、跨角色／跨 Workspace 洩漏、錯誤後端、Production request、未捕捉 JavaScript error 或不可恢復 cache 問題。
- 操作後資料對帳一致且合成測試資料已恢復。
- 具備裝置／OS／瀏覽器版本、步驟與不含敏感資訊的證據。

### FAIL

- 具備可重現步驟的功能、權限、資料一致性、環境隔離、PWA、響應式、觸控或可及性缺陷。
- 測試人員可完成必要操作，但實際結果不符合既有需求或安全邊界。
- FAIL 必須建立單一缺陷紀錄、嚴重度與最小重現證據；本 Sprint 不順便重構。

### BLOCKED

- 缺少指定真實裝置／瀏覽器、合法 Staging 帳號／Membership、核准 Draft／origin、Render 授權或必要外部服務可用性。
- 任何只以模擬器、viewport 或未授權請求取得的結果。
- BLOCKED 不等同 PASS，也不得降低矩陣範圍來宣稱 Sprint 完成。

## 立即停止條件

- 任一請求、登入、Cache、Session 或資料指向 Production 或未知環境。
- 出現跨 Workspace／跨角色資料、直接資料表存取或授權 fail-open。
- 出現 Secret、Token、Session ID、密碼、完整連線字串或真實個資外洩。
- 發生非預期資料寫入、資料對帳不一致、重複 mutation、revision 靜默覆寫或無法恢復合成測試資料。
- 固定 Draft 無法回復 Google Sheets `STAGING`，或環境／Service Worker cache 發生污染。
- 驗收需要套用 Migration、修改 Production、降低安全檢查、重建 tenant context key 或改變已驗收架構。
- 發現 P0／P1 安全或資料完整性問題；立即停止受影響矩陣，保留不含敏感資訊的證據並回報。

## 完成條件與輸出

- D1–D8 均有明確 PASS／FAIL／BLOCKED，且不得遺漏版本與證據。
- 共通、裝置專屬、PWA／Cache、弱網、權限、資料對帳與 rollback 結果全部彙整。
- 任何 FAIL／BLOCKED 已分級並列出下一個最小安全修復工作；不得在本 Sprint 自動開始修復或下一 Sprint。
- 再確認 Production 未修改／部署，Migration `0009`／`0010` 未套用，固定 Draft 最終為核准的 Google Sheets `STAGING` 狀態。
