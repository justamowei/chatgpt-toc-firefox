# v0.3.0 已觀察提問保留快取候選

2026-10-03。使用者允許先以 Codex 內建瀏覽器測真實 ChatGPT。此文件區分 source 修正、真實 DOM 檢查、本機 Firefox addon 回歸與尚未完成的真實 Firefox 整體驗收。

## 已實作

穩定角色／ID 的提問以純文字資料保留，不保存卸載 DOM。掛載集合、資料修訂與導航 generation 分開；正常卸載、空窗口、不重疊窗口、slot 重編不清快取。順序只取各個真實 DOM 窗口的 ID 前後關係；無法確定的區段分組顯示，禁止猜測離屏定位。正文變更（包括追加編輯）或順序矛盾隔離舊 generation，舊全文仍供搜尋。

介面顯示「已看過 X／目前掛載 Y」，分支未核對與歷史未完整明示。未知分支不能偵測只改答案的所有分支切換；離屏定位必須重掛載後核對精確角色、ID、正文、context、generation、connected 與 viewport。返回閱讀位置另核對答案或提問的 SHA-256 版本；答案使用已觀察 user 順序錨定位方向。若離屏答案沒有可核對的提問錨點，明示需手動返回、不猜方向。手動輸入／捲動、停止、換頁、停用取消晚到導航。

資料在 MutationObserver 回呼立即收集，UI 重繪延遲 120ms；仍具可信角色／ID／正文的首次卸載 subtree 可被收錄。空 user hydration 不產生假附件。SPA 換對話先排除仍在 DOM 的舊 nodes；首頁第一則建立 /c/id 可保留相同節點。

收集較早提問每步約 70% viewport，留重疊窗口、等待掛載；最多 60 秒／20 批、連續 3 次無進展停止。停止不代表完整，也不保證一次收齊長對話。快取上限 5000 筆記錄／500 萬字元，包含隔離版本；觸頂停止新增並保留既有資料。本輪不寫 browser.storage 聊天快取，不接入 session／history API。刷新、換對話、停用或關頁會清除。

## 本輪證據

- 核心 20 項測試通過；重播上一輪 56 個真實完成窗口與中間空掛載，保留 12 則精確 ID／全文／順序，沒有正常卸載 generation 重置。包含未知順序、隔離、預算、導航取消與非同步定位總期限。
- 修正版 `src/turns.ts` 編譯成純唯讀 DOM callback，直接在真實 IAB ChatGPT 自建中性測試對話執行。20 個原生 PageDown 窗口，掛載從 5 則到 2 則；將辨識結果送入本機當前 IndexStore 後保留完整預期 12 則，ID／全文／順序全部一致。沒有把 addon 注入 IAB。原始中性提問資料與重播結果見 `docs/evidence/iab-cache-fix-2026-10-03`。
- 隔離 Firefox 本機 8 項 CACHE 測試全部通過：12 則保留／槽位換號、離屏搜尋／高亮／閱讀返回、短暫卸載與空窗口、追加編輯隔離、SPA 切頁無舊對話洩漏、首頁第一則網址建立、虛擬窗口自動收集／停止、缺乏提問順序錨點的離屏答案拒絕猜測返回。第 7 項第一次超時是測試要求在無順序證據下返回；實際應拒絕，已更正測試為先驗證拒絕、供給真實 ordered window 見證後返回。沒有放寬產品順序規則來湊 PASS。
- Firefox 停用／重啟／移除 3 項回歸全部 PASS。型別、核心 20 項、正式 build、web-ext lint 通過；lint 0 errors／0 warnings／0 notices。正式 bundle 靜態檢查沒有歷史 API／accessToken／HistoryLoader 入口。
- GPT-6.1 Sol high 對固定產品 SHA `4c3d838d187b0e2771bbf58d6ba00ddc0b07a4b2` 獨立核對，並在隔離 Firefox 157.0 重跑 8 項 CACHE 全部 PASS，fixture 內容 hash 與主代理一致。詳見 [獨立驗收](acceptance-seen-cache-v0.3.0.md)。此後文件提交不改產品源碼與套件 bytes。

## 未驗收範圍

真實 Firefox chatgpt.com 上執行完整 addon 尚未完成。IAB 只允許唯讀頁面檢查，因此上述證據不能驗證正式 addon 在真網站的程式 scroll／Observer 全流程。實际新增、編輯、重新生成、各種分支、多樣容器及 10 個首中尾離屏導航仍需真實 Firefox 驗收；正式簽章亦未完成。維持候選狀態，不把本機或唯讀結果標成真實 Firefox PASS，不以新安裝包宣稱所有問題已修好。
