# ChatGPT 對話導航器（Firefox 優先）

自製 ChatGPT Web 對話目錄與導航擴充功能，Firefox 桌面版為第一優先。

**目前有效方向（2026-10-04）：** v0.3.1 是已觀察提問快取與導航候選版本。卸載、空窗口或槽位換號不刪已看過的穩定提問；搜尋涵蓋已觀察資料。收集改成自適應重疊步進，最多240步／60秒；离屏定位先用已觀察位置，再核對重新掛載的精確訊息。只保存在當前分頁記憶體，刷新／換對話／停用後清除。正式 runtime 未接入歷史 API。Firefox 本機速度4項／快取8項通過，真實Firefox整體addon LIVE仍未完成。見 [v0.3.1修正驗證](docs/navigation-speed-v0.3.1.md)與 [DOM 快取方案](docs/observed-dom-cache-plan.md)。

**2026-10-03 真實使用失敗：** 使用者回報 v0.2.0 完整載入顯示「對話超出本次載入上限」，目錄仍隨頁面掛載數變化。完整歷史目標標記 LIVE FAIL，不能視為問題已解決。具體超限類型待取得數值證據；後續修正版必須先通過真實 Firefox 長對話驗收再交付。見[失敗與交付門檻](docs/live-history-failure.md)。

v0.2.0 是已撤回的完整歷史實驗，舊[說明](docs/full-history-v0.2.0.md)只保留作失敗紀錄，不能按其安裝步驟交付。v0.3.0 已核對真實 IAB 的解析器與快取輸入；整個 addon 尚未在真實 Firefox ChatGPT 上驗收，不能宣稱正式 LIVE PASS。

## 文件

- [開發計畫](docs/development-plan.md)：產品規格、技術決策、Firefox 與長對話驗收，以及 Git 規則。
- [能力與規格核查](docs/capability-audit.md)：保留原次檢查證據，後續狀態另註明。
- [調查背景](docs/survey.md)：對話目錄消失的公開資料調查。
- [進度與同步紀錄](docs/progress.md)：目前快照、測試狀態與雲端同步結果。
- [Firefox 安裝與驗證](docs/install-firefox.md)：原型暫時安裝、指令與限制。
- [可行性紀錄](docs/feasibility.md)：合成／真實資料来源與可承諾範圍。
- [原型驗收報告](docs/prototype-acceptance.md)：交付來源、測試結果、套件hash與未完成項目。
- [sub-agent獨立驗收](docs/acceptance-final.md)：固定快照重建、原生回歸與canonical套件核對。
- [v0.3.0 候選獨立驗收](docs/acceptance-seen-cache-v0.3.0.md)：GPT-6.1 Sol high 固定 SHA 檢查與 Firefox 本機快取重跑；真實 Firefox LIVE 尚未完成。
- [v0.3.1 候選獨立驗收](docs/acceptance-navigation-v0.3.1.md)：固定來源核心22項、Firefox本機速度4項／快取8項與正式build hash核對。

## 版本管理

主分支為 `main`，實作分支為 `feat/firefox-prototype`。未完成的程式使用 WIP commit 保存在實作分支。

每完成一個功能、修復、測試組或文件變更，或累積 30 分鐘有效開發時間，以較早者為準建立 commit；每次 commit 後 push 並核對遠端 SHA。暫停與等待不計入開發時間。不建立空 commit，不 force-push。

儲存庫保持 private。node_modules、建置產物、XPI、測試 profile、真實聊天內容、憑證與環境設定不納入 Git。

## 驗證狀態

v0.1 的歷史合成驗收包含核心12項、原生導航8組、權限／背景7組與附加元件生命週期3組，並有固定SHA獨立複驗。2026-10-03 使用者真實頁面零索引回報後，已進行v0.1.1相容修復；最新結果與前兩個修復快照的獨立FAIL見[修復紀錄](docs/bugfix-v0.1.1.md)及[新版獨立驗收](docs/acceptance-v0.1.1.md)。真實頁面修復效果、長對話與簽章仍需分別確認。

私人 GitHub 首次同步已完成。持續依每功能／30 分鐘節奏 commit、push 並核對 SHA；sub-agent 以固定 commit SHA 獨立驗收。
