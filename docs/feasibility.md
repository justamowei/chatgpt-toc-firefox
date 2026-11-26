# v0.1 可行性與支援邊界

2026-10-02，Firefox 第一優先。

本輪完成資料核心、DOM adapter、Shadow DOM 介面、Firefox MV3 背景事件頁面、設定頁、建置與打包腳本。模組先維持平面 `src/core.ts`、`src/dom.ts` 等檔案；計畫中的細分目錄為後續拆分參考。

原生 Firefox 157.0 以 Selenium 實際載入測試附加元件，確認工具列 activeTab 注入、重複啟動一個實例、20 個精確目標、返回錨點、搜尋安全文字、聚焦、深淺色、窄視窗，以及合成虛擬化、取消、分支／SPA 切換與清理。首次窄視窗溢出有失敗證據，修正後回歸；腳本修正與產品缺陷分開記錄。

ChatGPT selector 假設為 `main` 內 `data-message-author-role=user` 和 `data-message-id`，須在使用者正常授權的真實 Firefox session 做 T01 觀察驗證。沒有真實頁面證據前，這只是候選 adapter。助手穩定 ID／turn slot 替換可觸發失效；同 URL 未暴露身份或分支的變化仍未能可靠證明。

正式 build 不接受 fixture 的分支標籤，沒有 page bridge、不讀 cookies、不主動呼叫聊天 API、不傳送聊天內容、沒有把聊天寫入 storage。只有設定保存在 storage.local。測試 build 才接受合成 `data-fixture-branch`；其已知分支快取不代表 ChatGPT 已支援長歷史。

完整度從不因捲到頂部或三批無進展而變成完整。尚未接入經核對的可靠分支全量來源，所以本原型不宣稱 verified-complete。真實未知分支卸載後撤銷舊历史與返回錨點，優先避免錯跳。

LIVE-01–07、Firefox 容器／工作區、ESR、正式簽章與重啟升版仍待驗證；目前可交付範圍是 T07a 實驗原型，不是解決所有長對話的正式版本。

Firefox 選用權限必須由設定頁的直接使用者操作申請；原生 grant／deny／revoke 與背景喚醒另測。[Mozilla permissions.request](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request)。測試驅動鎖定官方 [geckodriver 0.37.1](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1)。
