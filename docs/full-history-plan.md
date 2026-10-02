# 完整對話索引方案（2026-10-03）

## 結論與已確認原因

有可行方向，但 v0.1.1 尚無完整歷史來源，不能靠調高一個顯示筆數設定解決。使用者已確認 v0.1.1 能抓取真實對話，目前約 6–7 題；這是辨識修復的使用者回饋，不等同完整索引、分支或遠距定位驗收。

程式沒有七題上限。正式 DomAdapter 的 branch 為 null；IndexStore 遇到卸載會撤銷舊歷史，僅保留目前可確認訊息。DomAdapter.load 直接捲至頂／底，也可能跳過中間待掛載內容。這組保守策略避免跨分支混資料，卻無法支援完整目錄。

目前現象較符合頁面虛擬化，而非模型 context window 限制。尚未讀取使用者實際 DOM，故不把 renderer 變體當作已確認事實。[conversation-overview 作者說明](https://github.com/boabab/conversation-overview)指出部分頁面只保留 turn 殼，且程式捲動未必觸發內容掛載。

## 目標與建議方案

預設目標是目前一段對話的完整提問目錄與提問全文搜尋。若使用者選擇回答全文也納入，資料模型及搜尋模式另外擴充；目前沒有自動把回答當成目錄提問。

建議增加使用者主動點擊的「載入完整目錄」，讀取目前分頁同來源的對話歷史，取得順序、分支和分頁邊界。完整清單保留在該頁記憶體；Firefox 的畫面仍按需掛載，避免長對話 DOM 同時展開。

原開發計畫 §4.2 已允許探索正常登入狀態的同來源唯讀請求，並要求可停用 adapter、無憑證保存及不繞過存取限制。這不是取得任意帳號資料的授權；範圍限目前 URL 對應對話，且不會自動讀取全部帳號對話。

公開的[ChatGPT Copy Entire Chat 原始專案](https://github.com/sguzman/script-monkey/blob/main/userscripts/chatgpt.com/chatgpt-copy-entire-chat/README.md)採用有分頁的網站歷史來源，以及舊 mapping/current_node 路徑。這是可研究的候選協定，並非 OpenAI 公開 API 或跨版本保證。[Mozilla MV3 content script 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#xhr_and_fetch)說明 Firefox MV3 的 fetch 使用頁面來源，適合優先探索 content 端同來源請求，無需先建立接收任意 URL 的特權 bridge。

## 實作規格

1. **明確啟動與資料界線：** 點擊完整目錄入口才開始讀取。只對 chatgpt.com 固定路徑發出 GET，URL ID 來自目前對話；正常登入憑證僅供本次請求，不寫 storage、log、診斷、匯出或 Git。聊天內容只留頁面記憶體，不送外部服務。不接收頁面提供的任意 URL、腳本或特權指令。
2. **分頁來源：** 驗證 messages／page_info 的型別與穩定 ID；循序讀取早期頁，必須明確到達 has_previous_page=false。缺 cursor、重複 cursor、無進展、頁面缺失、版本變更或超限都拒絕完整結果。分頁過程核對 conversation 與 revision，避免混入載入中改變的分支。
3. **樹狀來源：** 若使用 mapping，必須從 current_node 沿 parent 走到真實 root；缺父節點、循環或重複識別即失敗。只取目前分支，排除其他編輯分支、hidden/system/tool 與內部內容。不可遍歷 mapping 後把所有 user 訊息拼成單一路徑。
4. **獨立索引：** 伺服器快照、已掛載 DOM 和導航狀態分開。完整快照不因正常卸載而縮回 6–7 題；DOM 只負責已掛載狀態、定位與畫面核對。未知資料來源不得冒充 verified-complete。
5. **目前畫面與伺服器分支：** 核對可觀測穩定 ID、角色與順序；無法確認畫面分支時明示「伺服器分支／畫面尚未核對」，避免完整快照暗中對應錯誤畫面。換對話、編輯、重新生成、新提問及分支切換均更新 epoch、取消舊請求與清除過期目標。
6. **未掛載定位：** 優先用可驗證 turn 殼定位，再逐 viewport 等待內容；無殼時使用有限、重疊步進，避免直接跳頂／底漏中段。無法由程式觸發掛載時，明示請使用者手動捲動或標示未定位，不能送 synthetic wheel 並宣稱是真實使用者操作。完整目錄與可靠跳轉分別驗收。
7. **失敗與取消：** 有總時間、每頁時間、頁數、訊息數與資料大小上限。429 尊重 Retry-After；401／403 明示登入／存取失敗，不繞過限制。停止、換頁、停用及撤權後晚到結果不得更新 UI、索引或捲動。失敗保留可用的掛載模式，顯示完整歷史未核對；不把超時當作讀完。
8. **隱私與生命週期：** 不複製 Firefox profile、cookies 或登入資料到工作目錄；測試只用隔離 profile 和合成回應。頁面停用清除完整快照與相關任務。沒有新的自動背景全帳號同步。

## 驗收門檻

| 案例 | 固定期待 |
|---|---|
| FULL-01 | 合成 200 題、初始僅掛載 7 題，完整 API 後 expected ID／順序／總數完全一致 |
| FULL-02 | 中間頁遺漏、錯 cursor、重複／無進展或頁數超限不能標完整 |
| FULL-03 | mapping 多分支只選 current_node 路徑，missing parent／cycle 明確失敗 |
| FULL-04 | 正常卸載／remount 後完整清單與全文搜尋保持；無可信來源仍採保守掛載模式 |
| FULL-05 | 加入提問、編輯、重新生成、SPA 換頁與同 URL 分支變更撤銷過期快照 |
| FULL-06 | 停止／撤權／dispose 後晚到 HTTP 結果不得更新新頁面，也不保存憑證 |
| FULL-07 | 原生 Firefox 真實載入 MV3，驗證同來源請求、實際 cookie/session 流程；合成登入資料不可冒充真實登入通過 |
| FULL-08 | 權限不變或新增權限須列明；請求不能訪問任意 URL／其他對話或外部服務 |
| FULL-09 | HTML 字串只作 textContent，未知 schema／過大回應拒絕，不默默截斷 |
| FULL-10 | 可靠完整索引與未掛載導航分開計數；固定十個遠距目標涵蓋首、中、尾並記錄失敗 |
| FULL-11 | 使用者 Firefox 157 實際長對話核對整個 expected 提問集合、順序與分支；抽查首中尾不足以通過完整度 |
| FULL-12 | 舊導航、搜尋、取消、返回、權限、背景休眠與停用回歸；sub-agent 固定 SHA 獨立驗收 |

## 本次狀態

使用者要求執行後，已接入完整歷史來源與 v0.2.0 實驗版 UI：明確啟動、分頁耗盡／legacy root 路徑、head 核對、獨立快照及完整提問搜尋；合成驗收與固定 SHA 狀態另記 acceptance-v0.2.0.md。原有「載入較早訊息」仍是有限 DOM 探索，不表示全部收錄。

真實網站協定／登入与長對話 expected 全集合仍待驗收（FULL-07 真實登入、FULL-11，其他 LIVE gate），不發布已保證全量的正式版。實驗版只標「伺服器分支」及掛載核對數，未把子集匹配當作整個畫面分支證明。只有來源、全文 coverage 與目前分支核對通過後，才能顯示「目前分支共 N 則提問」。
