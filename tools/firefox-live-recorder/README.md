# Firefox 真實 ChatGPT 實測

此工具是獨立的本機診斷附加元件，與目錄產品 v0.3.5 並存，不更換產品、不清除已存目錄。工具 manifest 的 0.1.0 是記錄器版本，並非目錄產品的新版本。

## 使用方法

1. Firefox 開啟 `about:debugging#/runtime/this-firefox`，選「載入暫時附加元件」，選這個資料夾的 `manifest.json`。
2. 回到要測試的 ChatGPT 長對話，F5 一次。原本目錄插件需仍啟用；頁面左下角會新增「Firefox 實測記錄器」。
3. 等原本目錄完成還原，按左下角「開始記錄」，再按原本目錄的「收集整段對話」。保持這個分頁在前景。
4. 讓問題出現：到頂後若開始上下跳，繼續記錄至少 20 秒。按原本目錄的「停止」，再按記錄器的「停止記錄」及「下載紀錄」。若收集正常結束，也照樣下載。
5. 將下載的 `toc-firefox-live-trace.json` 放入專案資料夾或附加到本次聊天。另告知 Firefox 版本、是否已到真正的第一筆，以及你看到的結果。版本與「真正到頂」需由測試者核對，記錄器不自行宣稱。

不需要操作開發者主控台、改瀏覽器安全設定或另外登入。記錄最長 10 分鐘，切換 SPA 對話時自動停止。記錄中若 F5／關閉分頁，尚未下載的資料會消失；請先停止並下載。再次「開始記錄」會開啟新的紀錄，請先下載上一份。完成後在 about:debugging 移除此記錄器；Firefox 重啟也會移除暫時附加元件。

## 可以判斷什麼

每 250ms 記錄各候選滾動容器的位置／高度、已掛載 shell 的幾何與節點替換，每秒刷新原插件「頁面診斷」並僅保留指定數值／狀態欄位。會保留收集／停止／跳轉按鈕的操作時間、頂端 physical/stableMs/probes/loading/rendering/confirmed，以及最後一次導航請求的 before/requested/after。

同筆項目的匿名代號與 DOM 節點代號分開，可觀察「同一訊息重新掛載」和「掛載視窗換了內容」。匿名代號只代表本次觀察身份，不是 session 的訊息編號。缺少穩定鍵時只記錄節點身份。最多採樣 300 個 shell，超過會明示截斷；巢狀 shell 可能重複，所以 totalShells 也不是實際提問總数。

這是使用者操作 Firefox 真實頁面、由開發者分析下載紀錄的協作實測，沒有遠端控制入口。紀錄提供時間線，但無法單獨證明所有 JS 呼叫來源、完整 session 總數或視覺效果。得到現場紀錄後，應據此修正與建立回歸案例，再請使用者依相同步驟驗收。不得把 localhost 測試當成 ChatGPT LIVE 通過。

## 資料與效能

紀錄不包含聊天文字、真實訊息 ID、網址、帳號、Cookie 或 Token。訊息鍵僅在記憶體中映射成流水代號；匯出診斷採欄位白名單。工具不發出網路請求、不上傳、不保存到 browser.storage。JSON 由你按下載後存於本機；是否分享由你決定。

診斷刷新會同步執行原插件既有的計數與幾何檢查，可能有少量額外成本；它會還原原診斷框的內容與顯示狀態。若頁面上有大量掛載節點，這份紀錄不能當成零負擔的效能測試。

## 方法調查與驗證（2026-10-10）

- 原生 Computer Use 能列出 Firefox，但擷取視窗被工具停止：Windows 瀏覽器的 URL policy enforcement 尚不支援。不能改用其他截圖／控制通道繞過這次阻擋。
- 當前瀏覽器工具清單只有內建瀏覽器與 MCP Apps；插件搜尋 Firefox／Selenium／WebDriver 未找到可用的 Firefox 連接器。
- 官方瀏覽器整合頁列 Chrome、Edge、Brave、Opera、Vivaldi，未列 Firefox：[OpenAI 官方文件](https://learn.chatgpt.com/docs/chrome-extension)。這不代表未來或所有環境永遠不能支援。
- Firefox content script 能讀取 DOM 與其變化：[Mozilla DOM access](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#dom_access)。暫時載入附加元件不需要停用簽章檢查：[Mozilla about:debugging](https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/index.html#loading-a-temporary-extension)。
- 專案現有 Selenium／geckodriver 可啟動隔離 Firefox，適合 localhost 回歸。這次已以独立記錄器 content script 在原生 Firefox localhost 通過三項：滾動／掛載／診斷／下載、輸出白名單、切换 SPA 停止。命令 `node tests/firefox-live-recorder.mjs`；結果 `docs/evidence/firefox-live-recorder/results.json`。
- 一般 shell 沙箱曾阻擋測試 Firefox 分頁子程序啟動（SpawnTarget / Browsing context discarded）；經自動審核允許後，在隔離測試設定檔執行通過。沒有操作使用者現有 Firefox、複製個人設定檔或登入憑證。這不能解除原生 Computer Use 對真實 Firefox 的控制限制。
- **真正 ChatGPT Firefox 現場驗證：PENDING，需取得上方使用者操作的現場紀錄。**
