# ChatGPT 對話導航器（Firefox 優先）

**目前候選：v0.3.1 r4（2026-10-06-r4）**。修正收集過早反向；縮小目錄最多 5 個標記，展開保留全部提問，標題橫排並改用灰白／炭灰與淡靛色。見 [r4 修正與限制](docs/boundary-compact-v0.3.1-r4.md) 及 [獨立驗收](docs/acceptance-v0.3.1-r4.md)。真實 ChatGPT Firefox addon LIVE 尚未完成；下文早期候選資訊保留作歷史紀錄。

自製 ChatGPT Web 對話目錄與導航擴充功能，Firefox 桌面版為第一優先。

**目前有效方向（2026-10-05 r3）：** 使用者回報r2仍失敗，改採反覆選取當前連續掛載窗口邊緣訊息，以原生scrollIntoView觸發下一批掛載。收集向前再向後巡覽，最多5分鐘／2400步；離屏导航沿同樣錨點尋找。revision=`2026-10-05-r3`。真實IAB已觀察到錨點帶動更早掛載，完整addon的Firefox LIVE仍未完成。見[r3方案](docs/anchor-walk-v0.3.1-r3.md)。下方r2紀錄為歷史候選。

**目前有效方向（2026-10-05）：** v0.3.1 r2 是已觀察提問快取與導航候選版本。收集先反覆移至頁首確認掛載，再以重疊步進掃描至原閱讀訊息附近，最多240步／60秒。離屏定位加入實測提問間距的高度鏈估算、精確重掛載與有限重試，返回亦等待偏移穩定。只保存在當前分頁記憶體，刷新／換對話／停用後清除；未接入歷史 API。診斷revision為`2026-10-05-r2`，舊候選保留為歷史版本。真實Firefox整體addon LIVE仍未完成。見 [r2修正與驗證](docs/scroll-mechanism-v0.3.1-r2.md)與 [DOM 快取方案](docs/observed-dom-cache-plan.md)。

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
- [v0.3.1 r2 修正](docs/scroll-mechanism-v0.3.1-r2.md)：使用者實際失敗、頁首掃描、捲動容器、掛載重試與高度鏈。
- [v0.3.1 r2 獨立驗收](docs/acceptance-v0.3.1-r2.md)：GPT-6.1 Sol high 對最後產品提交的獨立核心、高度鏈與原生 Firefox 本機回歸。
- [v0.3.1 r3 錨點巡覽](docs/anchor-walk-v0.3.1-r3.md)與[獨立驗收](docs/acceptance-v0.3.1-r3.md)：目前候選方案，沿掛載訊息觸發相鄰窗口、向前後收集；真實Firefox LIVE未完成。

## 版本管理

主分支為 `main`，實作分支為 `feat/firefox-prototype`。未完成的程式使用 WIP commit 保存在實作分支。

每完成一個功能、修復、測試組或文件變更，或累積 30 分鐘有效開發時間，以較早者為準建立 commit；每次 commit 後 push 並核對遠端 SHA。暫停與等待不計入開發時間。不建立空 commit，不 force-push。

儲存庫保持 private。node_modules、建置產物、XPI、測試 profile、真實聊天內容、憑證與環境設定不納入 Git。

## 驗證狀態

v0.1 的歷史合成驗收包含核心12項、原生導航8組、權限／背景7組與附加元件生命週期3組，並有固定SHA獨立複驗。2026-10-03 使用者真實頁面零索引回報後，已進行v0.1.1相容修復；最新結果與前兩個修復快照的獨立FAIL見[修復紀錄](docs/bugfix-v0.1.1.md)及[新版獨立驗收](docs/acceptance-v0.1.1.md)。真實頁面修復效果、長對話與簽章仍需分別確認。

私人 GitHub 首次同步已完成。持續依每功能／30 分鐘節奏 commit、push 並核對 SHA；sub-agent 以固定 commit SHA 獨立驗收。
