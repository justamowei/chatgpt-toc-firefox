# Firefox 對話導航器 v0.1：暫時安裝

這是可操作的實驗原型。已在Firefox 157.0合成頁面驗證；真實ChatGPT長歷史與正式簽章仍待驗收。

1. 在Firefox輸入 `about:debugging`，選「這個Firefox／This Firefox」。
2. 點「載入暫時附加元件／Load Temporary Add-on」。
3. 選擇同一outputs資料夾內 `Firefox-原型-v0.1/manifest.json`。若使用ZIP，先解壓再選manifest.json。
4. 在一般視窗開啟ChatGPT對話，從Firefox附加元件選單點「ChatGPT 對話導航器」。右側「目錄」可展開。
5. 搜尋已收錄提問、選取定位並高亮；「回到剛才位置」返回閱讀錨點。「載入較早訊息」為實驗功能，可隨時停止。
6. 要自動啟用，點目錄內「設定」，選「啟用」，在Firefox原生視窗授予ChatGPT網站權限，重新載入ChatGPT分頁。拒絕權限仍可使用手動按鈕；撤銷自動啟用會清理既有頁面。

Tab／Enter／方向鍵可操作；Esc停止導航並收合。啟動以附加元件按鈕為準，目前啟動快捷鍵尚未通過原生實測。

只搜尋已收錄內容，沒有穩定ID的提問不能精準跳轉。真實ChatGPT的DOM與分支訊號仍待觀察；找不到或返回失敗時，應以畫面提示為準。此原型不保證整段長對話完整索引。

Firefox重啟後暫時附加元件會移除；未簽章ZIP不能當作一般Firefox永久安裝版。移除可到about:debugging處理，再重整原ChatGPT分頁。停用／移除會隱藏目錄與高亮，重整會清掉隱藏的舊DOM；重新啟用也會清理舊節點，僅建立一個新目錄。單頁停止用「停用此頁」。

來源：[私人GitHub開發分支](https://github.com/justamowei/chatgpt-toc-firefox/tree/feat/firefox-prototype)。完整實測與未完成項目见同資料夾的 `Firefox-原型驗收報告.md`。
