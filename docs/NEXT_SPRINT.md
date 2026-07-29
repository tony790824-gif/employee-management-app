# Next unique work — Finish Sprint 27 Staging Web Push acceptance

## Current gate

Programming and Neon Staging Migration acceptance are complete. This is not Sprint 28.

## Remaining external Staging acceptance

The distinct worker credential, protected VAPID settings, enabled Render worker, HTTP 200 readiness, and public-key-only Draft are complete.

1. Add `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app/` to the existing Auth0 Staging callback and logout allowlists.
2. Add `https://6a69fc6bb498af27dd117060--steady-salmiakki-4aaa19.netlify.app` to the existing Auth0 Staging web-origin/CORS allowlists and Render `BANK_ALLOWED_ORIGINS`.
3. Complete the Windows and iPhone Home Screen PWA checks below.

## Windows Chrome — PENDING USER VERIFICATION

1. Sign in to the Draft and open Notification Center.
2. Click enable, grant notification permission, and send one test notification.
3. Confirm the first test succeeds; after three tests in ten minutes, confirm the fourth shows the Chinese safety-limit message without logout or a generic authorization error.
4. Verify foreground, background, closed-window delivery, click-to-open Notification Center, unread badge, disable, and re-register.
5. Verify another device subscription is not removed and logout/expired Session cannot receive new protected events.

## iPhone Home Screen PWA — PENDING USER VERIFICATION

1. Open the Draft in Safari, add it to the Home Screen, and launch the installed PWA.
2. Enable Push only from the in-App button, grant permission, and send one test notification.
3. Background and close the PWA, trigger a synthetic Notification Center event, verify system delivery, tap-to-open, badge/list consistency, disable, and re-register.
4. Ordinary Safari-tab use must show the Home Screen requirement and must not be reported as Push PASS.

## Stop conditions

- Stop on Production endpoint/configuration, cross-Workspace delivery, direct Role table access, sensitive payload/log, failed Migration checksum, failed readiness, or any request to expose a private key.
- Do not start Sprint 28 until the owner records available device results.

---

# Historical next work — Apply Notification Center to isolated Neon Staging

## Goal

Completed in Sprint 26: Migration `0014_notification_center` and the Notification Center runtime were proven against isolated Neon Staging without modifying Production. The next unique work is the real-device checklist appended below.

## Required controlled steps

1. Confirm the target is Neon Staging and record the existing restore/PITR condition.
2. Completed: verified `0014` as the intended feature migration while `0009`/`0010` remained excluded.
3. Completed: applied `0014` plus additive `0015`, recorded checksums, verified table/index/foreign-key/RLS/trigger/functions, and reapplied least-privilege API Role grants.
4. Verify the API Role has zero direct table access and can execute only the reviewed notification functions.
5. With synthetic Workspace A/B identities, prove recipient-only reads, cross-user/cross-Workspace denial, manager/employee targeting, idempotent read Commands, and no exposure of leave reasons.
6. Prove outbox write and notification creation are one transaction; a rejected command must create neither.
7. Exercise down migration and reapply on Staging, then verify checksum and application state.
8. Pending user verification: run real boss/employee browser E2E, Smart Polling/Service Worker notification refresh, logout cleanup, mobile layout, and accessibility on the new non-Production Draft.

## Stop conditions

- Stop on any unexpected pending migration, checksum mismatch, cross-Workspace or reason disclosure, direct API Role table privilege, rollback failure, Production endpoint, or need to weaken RLS.
- Do not add Firebase Push, APNs, email, SMS, a second polling controller, or a second notification data path.
- Do not deploy Production or apply `0014` to Production.

---

# Historical next work — Sprint 24 real-device Smart Polling acceptance

## Automated baseline

- Overall assessed completion: **91%**.
- PostgreSQL Staging uses one adaptive synchronization controller: active 2 seconds, idle 20 seconds, and background 60 seconds.
- Revision-only API reads, `X-Bootstrap-Revision` validation, cross-tab/PWA revision signals, offline recovery, request deduplication, and incremental top-level state application are covered by automated tests.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, Netlify, dependencies, and lockfiles were not changed or deployed.

## Windows — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in two separate signed-in Sessions: manager in Chrome or Edge and employee in the other browser.
2. Keep the employee request/status page visible and active.
3. Approve a synthetic scheduled-leave or ad-hoc-leave request from the manager Session.
4. Confirm the employee sees the approved state within 3 seconds without refresh, navigation reset, modal closure, form loss, duplicate notification, or full-screen flicker.
5. Leave the employee page untouched for more than 30 seconds, perform another manager update, and confirm convergence within 20 seconds.
6. Open a second employee tab, perform one manager update, and confirm both employee tabs converge without duplicate command requests.
7. Disconnect the employee device, perform one manager update, reconnect it, and confirm the next online synchronization converges without logout or data loss.
8. Verify DevTools shows no overlapping revision/bootstrap requests, no repeated Console error, and no Production or Google Sheets endpoint.

## iPhone Safari/PWA — PENDING USER VERIFICATION

1. Sign in to the approved `STAGING POSTGRES` Draft as the employee in Safari or the installed Staging PWA.
2. Keep the App visible and active while a manager approves a synthetic request; verify the state appears within 3 seconds.
3. Leave the App visible but untouched for more than 30 seconds; verify a later manager change appears within 20 seconds.
4. Background the App, make one manager change, then return to the App; verify foreground refresh occurs without flash, scroll reset, form loss, or Session error.
5. Repeat once across offline/online recovery and confirm the current screen is retained.

## Android Chrome and iPad Safari/PWA — PENDING USER VERIFICATION

Repeat the iPhone cases on each real device. Viewport simulation is not accepted as real-device evidence. Confirm touch targets, scrolling, standalone PWA return, timer throttling recovery, and no environment/cache crossover.

## PASS / FAIL / BLOCKED

- **PASS:** all available real-device cases meet the active/idle/background convergence windows, preserve UI state, avoid overlapping requests, and remain isolated to PostgreSQL Staging.
- **FAIL:** stale state exceeds the expected interval while online, requests overlap, UI/form/navigation state is lost, cross-tab updates duplicate work, Session handling regresses, or any Production/Google Sheets traffic appears.
- **BLOCKED:** the approved Draft, Staging identity/Membership, device, or external Staging service is unavailable.

## Stop conditions

- Stop on Production/unknown endpoint traffic, migration/database need, cross-role/Workspace data, Session fail-open, repeated mutation, data loss, or a requirement to redesign the synchronization architecture.
- Do not deploy Production or begin another feature Sprint before the owner records the available device results.

---

# Historical next work — Sprint 22 foreground-polling real-device acceptance and release decision

## Sprint 22 automated baseline

- Overall assessed completion: **89%**.
- The accepted Sprint 21 controller now runs one 15-second polling cycle only while the PostgreSQL App is authenticated, visible, and online.
- Hidden/offline/logout/Session-clear/unload stops polling; visible/pageshow/focus/online resumes one timer.
- The existing debounce, cooldown, in-flight promise, validated bootstrap, deterministic server revision, and time-off form preservation remain unchanged.
- Unchanged revisions do not replace state or render. Changed revisions use the existing bootstrap/UI path.
- Automated lifecycle, fake-timer, retry, environment-isolation, build, check, regression, release, sensitive-information, and dependency checks pass.
- Production, databases, migrations, Auth0, Google Sheets, Apps Script, Render, and Netlify architecture/configuration were not modified or deployed.

## Single goal

Collect real signed-in evidence that foreground polling shows a manager approval to an employee within 20 seconds while the employee App remains visible. Do not change code or start Sprint 23 unless the evidence exposes a reproducible defect.

## Windows — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in Windows Chrome and sign in as the manager.
2. Open a separate signed-in employee Session and submit one synthetic scheduled-leave or ad-hoc-leave request.
3. Keep the employee request/status page visible; do not refresh, switch tab, hide the window, or navigate away.
4. Approve the request in the manager Session.
5. Start timing when the manager success response appears.
6. Verify the employee status changes within 20 seconds without manual refresh.
7. Verify the employee remains on the same tab; scroll, modal, and unsent fields remain stable; no full-page flash or duplicate success message appears.
8. In DevTools, verify there is no overlapping bootstrap request, no repeated Console error, and no Production/Google Sheets endpoint.

## iPhone Safari/PWA — PENDING USER VERIFICATION

1. Open the approved `STAGING POSTGRES` Draft in Safari or the installed Staging PWA and sign in as the employee.
2. Submit one synthetic scheduled-leave or ad-hoc-leave request, then keep the request/status screen visible and the device unlocked.
3. Approve the request from a separate manager device/Session.
4. Do not refresh, background Safari/PWA, switch page, or navigate.
5. Verify the approval appears within 20 seconds.
6. Verify there is no screen flash, navigation reset, form loss, duplicate notification, logout, or Session error.
7. Repeat once after an offline/online recovery: disconnect before one cycle, reconnect, then verify a later cycle updates without clearing the current screen.

## PASS / FAIL / BLOCKED

- **PASS:** both real Windows and iPhone cases update within 20 seconds and all UI/network/security expectations hold.
- **FAIL:** stale state exceeds 20 seconds while online/visible, requests overlap, UI rerenders unnecessarily, form/navigation state is lost, Console floods, or Session/environment isolation regresses.
- **BLOCKED:** the approved Draft, valid Staging identities/Memberships, required device, or external Staging service is unavailable.

## Stop conditions

- Stop on Production/unknown endpoint traffic, migration/database need, cross-role/Workspace data, Session fail-open, repeated mutation, data loss, or a requirement to redesign the synchronization API.
- Do not deploy Production or begin Sprint 23 before the owner records both real-device results.

---

## Historical Sprint 21 acceptance record

## Sprint 21 acceptance baseline

- Overall assessed completion: **88%**.
- PostgreSQL foreground refresh is implemented for visible `visibilitychange`, `pageshow`, and focus.
- Event bursts are debounced and deduplicated; only one bootstrap request may be in flight.
- The browser rerenders only when the deterministic server-issued revision changes.
- Time-off reads refresh without clearing unsent employee forms.
- Automated build, check, full regression, release gate, environment isolation, sensitive-information scan, and production dependency audit pass.
- Production, migrations, databases, Auth0, Google Sheets, and Apps Script were not modified or deployed.

## Single goal

Complete evidence-based signed-in Staging acceptance for foreground synchronization. Do not add features or change the synchronization architecture.

## Windows acceptance

1. Sign in as an employee on the new `STAGING POSTGRES` Draft and submit scheduled leave.
2. Leave that employee page open or put it in the background.
3. In a separate browser/Session, sign in as a manager and approve the request.
4. Return to the employee page without manual reload.
5. Verify the approved state appears automatically.
6. Verify the current tab and unsent forms remain, no full-page flash occurs, Network shows one effective foreground refresh, and Console has no error.

## iPhone Safari/PWA acceptance

1. Sign in as an employee and submit scheduled leave.
2. Put Safari/PWA in the background.
3. Approve the request from a separate manager Session.
4. Reopen Safari/PWA without manual refresh.
5. Verify the approval appears automatically without navigation reset, form loss, flicker, or repeated requests.

## PASS / FAIL / BLOCKED

- **PASS:** both signed-in scenarios update automatically and all UI/network expectations hold.
- **FAIL:** stale data remains, requests duplicate, UI resets/flickers, a form is lost, or a Console/security error occurs.
- **BLOCKED:** Draft origin is not allowlisted, test identities are unavailable, or the required real device/browser cannot be operated.

## Stop conditions

- Stop on Production access, migration/database change, Auth0 Production change, tenant leakage, Session regression, persistent UI loss, or a need to redesign the API.
- iPhone results remain **PENDING USER VERIFICATION** until performed on the actual device.

## Historical time-off UI Sprint record (completed)

- Baseline commit: `a3da8c39e0f7b012a24c47fd21073b8b4da1bec3`.
- Overall completion: **87%**.
- Neon Staging migration: `0013_time_off_requests`; it is not applied to Production. Migrations `0009`／`0010` were not changed or applied.
- Existing contracts only: `GET /v1/time-off-requests`; `schedule-leave-requests.submit`, `schedule-leave-requests.cancel`, `leave-requests.submit`, `leave-requests.cancel`, `time-off-requests.approve`, and `time-off-requests.reject`.
- Production, Auth0, Google Sheets, and Apps Script were not modified in Phase 1.
- Phase 1 completed only the data model and controlled read/Command API. No feature-specific Draft or iPhone UI acceptance exists yet.

## Single goal

Connect the existing employee and manager frontend to the already accepted `0013_time_off_requests` read/command boundary. Do not create a second API, change the eight-day quota, convert legacy leaves, or apply a new migration unless a reproducible backend contract gap proves it necessary.

## Employee acceptance

- Separate “我的排休” and “我要請假” entry points.
- Show own draft/local edits, pending, approved, rejected, and cancelled statuses.
- Scheduled leave shows the existing eight-day used/remaining quota.
- Ad-hoc leave supports a single day or bounded date range, type, and private reason.
- Show coworkers' approved scheduled-leave names/dates only, plus minimal approved ad-hoc coverage without reasons.
- Employee may submit/cancel only their own requests.

## Manager acceptance

- Separate pending scheduled-leave and ad-hoc-leave queues.
- Show processed history and same-store approved scheduled-leave overview.
- Confirm approve/reject actions and prevent duplicate submission.
- Never expose another Workspace.
- Build a new non-Production Draft and complete the approved iPhone workflow only after the role-scoped UI is ready.

## Mobile and failure acceptance

- Minimum 44px touch targets, no horizontal overflow, bounded long names/reasons.
- Success refreshes bootstrap/read state without full-page reload.
- Failures keep the form/draft, show a safe actionable message, and do not log out for ordinary business errors.
- Run iPhone Safari and Android Chrome acceptance on an isolated non-Production Draft.

## Stop conditions

- Stop on a missing backend contract, privacy leak, Workspace leak, Session regression, unexpected legacy-data conversion, need for Production access, or need for a new migration.

## Prohibited

- Production deploy/migration; Auth0 redesign; Google Sheets/Apps Script changes; shifts update/delete; employees update; PWA work; unrelated refactoring; inclusion of `.codex`, `.netlify`, build outputs, or untracked `0010_commission_rules`.

---

## Historical next-sprint record (superseded; does not override the 87% baseline above)

## 唯一目標

在不新增產品功能、不修改資料庫、不套用 Migration、不部署 Production 的前提下，使用真實手機、平板與桌機瀏覽器，驗證目前 Google Sheets `STAGING` 固定 Draft 的核心老闆／員工流程、響應式畫面、觸控、可及性、PWA／Cache、Session／Membership 失效與環境隔離。

若另行明確核准重驗 PostgreSQL 資料層，必須使用既有隔離 `STAGING POSTGRES` Draft 與可回復 runbook；不得在本 Sprint 中自行切換資料層。

## 基準與限制

- 產品程式基準：本文件所在 Commit（上一個驗收 Commit：`701169468407df9a9965e9b9e325ecef1d120326`）。
- 專案完成度基準：86%。
- 固定 Draft 目前狀態：Google Sheets `STAGING`。
- Production 前端、API、Auth0、PostgreSQL、Netlify 與資料不得修改、連線作業或部署。
- Migration `0009`／`0010` 不得套用；不得新增或修改 Migration。
- 不得重新產生 tenant context key、建立真實使用者、使用 Production 資料或輸出任何 Secret／Token／Session ID／密碼。
- 不得用 viewport 模擬、裝置模擬器或自動化結果冒充真實裝置 PASS；可用於輔助定位，但證據必須標明來源。
- 發現缺陷時記錄最小重現證據並依停止條件中止；不得在同一 Sprint 順便新增功能或大規模重構。

## 2026-07-25 目前矩陣狀態

| 編號 | 狀態 | 已完成證據 | 尚缺證據 |
|---|---|---|---|
| D1 iPhone Safari／PWA | BLOCKED | 390×844 輔助 viewport 無水平溢位 | 真機 Safari、觸控、PWA、VoiceOver、Session 與核心流程 |
| D2 Android Chrome／PWA | BLOCKED | 360×800 輔助 viewport 無水平溢位 | 真機 Chrome、觸控、PWA、TalkBack、離線與核心流程 |
| D3 iPad Safari | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Safari、旋轉／Split View、PWA、VoiceOver 與核心流程 |
| D4 Android Tablet Chrome | BLOCKED | 768×1024 輔助 viewport 無水平溢位 | 真機 Chrome、旋轉／分割畫面、PWA、TalkBack 與核心流程 |
| D5 Windows Chrome | BLOCKED（首次載入、PKCE、Claim PASS） | 真 Chrome 首次／重新載入均為 Google Sheets `STAGING`；Manifest 正確、Console error 0；Auth0 allowlist 後真實 PKCE、Session Claim 與 `sid` 一致性通過；Provider Session 可重用 | 完整老闆／員工產品 UI、PWA 安裝、登出、多分頁及可及性人工驗收 |
| D6 Windows Edge | BLOCKED（首次載入、PWA 儲存 PASS） | 真 Edge 隔離設定檔首次／第二次載入均為 `STAGING`；Manifest、Service Worker、Cache Storage、Script Cache 有證據 | 互動式 Auth0、PWA 安裝、追蹤防護、Narrator、高對比與完整核心流程 |
| D7 macOS Safari | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Safari、ITP、PWA／Dock、VoiceOver、登入後流程 |
| D8 macOS Chrome | BLOCKED | 共用自動回歸與靜態隔離測試 | 真 macOS Chrome、PWA、VoiceOver、多分頁及登入後流程 |

PWA Cache 修正輪次的品質檢查 PASS、自動回歸 29／29 PASS；同 origin 舊 PostgreSQL Worker 控制下，Google Sheets Staging 第一次載入、重新整理、Worker 更新與離線回復均為 PASS。2026-07-25 續驗亦確認 Draft 僅含 Google Sheets Staging 設定，Chrome 與 Edge 首次載入均未再出現 `STAGING POSTGRES`。D1–D8 尚未全部取得真實裝置 PASS，因此真實裝置矩陣 Sprint **尚未完成**，專案完成度維持 86%。

## 下一輪最小人工操作

1. 先用 iPhone Safari、Android Chrome、iPad Safari、Android Tablet Chrome、macOS Safari／Chrome 各開啟核准 Draft；記錄裝置、OS、瀏覽器版本及第一次／重新載入結果。
2. 在支援裝置安裝 PWA，驗證 Staging 名稱、standalone 啟動、Service Worker 更新、離線／重連與 Cache 不跨環境。
3. 在 Windows Chrome／Edge 補完整產品老闆／員工流程、登出、多分頁、PWA 安裝與可及性；不得只以 Auth0 驗證頁視為產品 UI PASS。
4. 每個裝置獨立記錄 PASS／FAIL／BLOCKED；任何 Production request、錯誤環境、跨 Workspace 或資料不一致立即停止。

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
# Next unique Sprint — Sprint 23 real-device synchronization acceptance

## Automated baseline

- The browser checks `GET /v1/bootstrap/revision` every 15 seconds only while PostgreSQL Staging is authenticated, visible, and online.
- The unified server revision includes the caller's bootstrap and role-visible Time-Off state.
- Unchanged revisions do not fetch the full bootstrap or rerender. Changed revisions use the existing validated bootstrap path.
- Debounce, cooldown, one timer, one in-flight request, offline/hidden suspension, Session invalidation, form preservation, and Google Sheets/Production isolation remain covered automatically.
- No Production, database, migration, Auth0, Google Sheets, Apps Script, Render, or Netlify operation is authorized by this acceptance.

## Required manual matrix — PENDING USER VERIFICATION

For each available device, use separate employee and manager Staging Sessions:

1. **Windows Chrome/Edge:** employee submits scheduled leave; manager approves; keep employee App visible and verify the status/calendar updates within 20 seconds without reload. Repeat for clock-in and manager approved-hours updates in the opposite direction.
2. **iPhone Safari/PWA:** repeat approval and clock-in flows while the employee App remains foreground. Verify no flash, navigation reset, form loss, logout, duplicate request, or Console-visible failure.
3. **Android Chrome/PWA:** repeat the same flows on a real Android device; viewport simulation is not acceptance evidence.
4. **iPad Safari/PWA:** repeat the same flows and verify tablet layout, current tab, scroll position, modal/form state, and automatic convergence.

Also verify one shift creation from a manager Session appears on another already-open authorized device. Shift update/delete are not currently accepted commands and must not be represented as completed.

## PASS / FAIL / BLOCKED

- **PASS:** every available required real device converges within 20 seconds, retains the active UI state, and shows no duplicate/overlapping request or environment/role leak.
- **FAIL:** stale state exceeds 20 seconds while online and visible; full bootstrap is fetched on unchanged revision; UI flashes/resets; forms are lost; requests overlap; or Session/environment isolation regresses.
- **BLOCKED:** a required real device, approved Draft, valid synthetic identity/Membership, or Staging service is unavailable.

## Stop conditions

- Stop immediately on Production traffic, cross-Workspace/role leakage, mutation duplication, data loss, migration need, Auth0 architecture change, or a requirement to alter accepted business logic.
- Record actual Windows/iPhone/Android/iPad results before starting another feature Sprint.

---
## Next unique Sprint — Notification Center real-device acceptance

Goal: accept the Staging-only Notification Center on Windows Chrome/Edge and iPhone Safari/PWA after the new Draft origin is allowlisted. Do not modify Production, databases, migrations, Auth0 architecture, Google Sheets, or Apps Script.

1. Add the exact new Draft callback/logout/origin to Auth0 Staging and its origin to Render CORS.
2. Sign in as an employee, submit scheduled leave and ad-hoc leave, and keep the employee App open.
3. Sign in as boss in a separate browser/device; confirm one unread notification per submission and open the related Time-Off review screen.
4. Approve one request and reject the other; confirm the employee receives the corresponding notifications through existing Smart Polling/cross-client revision sync without reload.
5. Verify unread badge count, unread-first/newest-first order, mark-one, mark-all, navigation, logout cleanup, refresh persistence, mobile touch targets, and no Console error.
6. Confirm Workspace B and unrelated users receive no Workspace A notification or private reason.
7. Record each Windows/iPhone result as PASS/FAIL/BLOCKED; do not infer device PASS from automated tests.
