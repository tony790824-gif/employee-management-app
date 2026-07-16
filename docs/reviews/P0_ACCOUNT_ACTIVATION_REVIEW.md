# P0 首次帳號啟用 Architecture Review

日期：2026-07-15

## A — CTO

以 server-side owner phone 阻止空白雲端遭搶先初始化；員工採一次性啟用碼，是不引入簡訊費用下能保留「員工自行選 PIN」的最小安全邊界。此方案明確標示 temporary containment，不把 Apps Script 誤當正式 IAM。

## B — Senior Frontend Engineer

反對把永久 PIN 顯示給老闆；密碼應不可逆。啟用碼只顯示一次，PIN 仍由員工設定。共用 `account-security.js` 避免新增、重設與登入各自產生不同正規化／hash 規則。發現編輯員工會掉 credential，已修成 merge existing record。

## C — Backend Architect

反對在 `identify_` 內產生 credential，因讀取身份函式不應有 side effect。首次啟用拆為 `loginEmployee_`，明確驗證 activation 後才寫入。既有 `save` snapshot 仍是重大架構問題，列入 Sprint 3。

## D — Database Architect

一次性碼只保存 hash，成功後刪除。Google Sheet A1 無 unique、transaction/revision 與 audit，因此只能作止血。電話唯一性目前只在前端正規化，正式 unique constraint 待 relational migration。

## E — Security Engineer

提出 Critical：first-claim、啟用碼重播、敏感 hash 回傳、client reload 中斷寫入。均已修正與測試。仍反對正式上線：6 位 PIN 無 slow salted hash、無 rate limit/session/revoke、XSS 可竊取 bearer hash。

## F — QA Lead

驗證未設定 owner、錯 owner、正 owner、既有 owner、缺啟用碼、錯碼、正確碼、重播、舊資料、敏感欄位、亂數格式與全部既有回歸。瀏覽器 smoke 驗證老闆／員工預覽角色隔離。

## G — Product Manager

一次性碼增加首次登入一步，但比「老闆知道員工永久 PIN」更符合信任與忘記密碼處理。文案只在首次需要時顯示欄位，避免既有員工困惑。未加入簡訊、Email 或多雲等非本 Sprint 功能。

## H — DevOps Engineer

部署 runbook 必須加入 `SHIFT_APP_OWNER_PHONE`；程式碼更新本身不會自動部署 Apps Script 或 Netlify。Service Worker 升為 v36，build 白名單包含安全模組。尚缺 CI、staging、environment separation。

## I — Code Reviewer

找到並修正：同步中變更被丟棄、0.6 秒 reload 中斷新增員工雲端寫入、編輯掉 credential、電話格式繞過重複檢查、employee projection 洩漏 activation hash、錯誤無 machine code。審查後對「過渡期 first-claim 止血」無未解重大問題；對整體正式上線仍有 Critical/High 阻斷。
