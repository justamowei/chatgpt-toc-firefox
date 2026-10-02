# ChatGPT 對話導航器（Firefox 優先）

自製 ChatGPT Web 對話目錄與導航擴充功能，Firefox 桌面版為第一優先。

目前為 v0.1.1 修復原型。使用者回報 v0.1 在真實 ChatGPT 新舊對話皆零索引；已補上新版 turn key／user bubble 與 turn shell 的明確角色辨識、即時更新及高亮。新版合成測試與真實頁面驗證狀態見[修復紀錄](docs/bugfix-v0.1.1.md)。完整長歷史、容器／工作區與正式簽章仍待驗收。

## 文件

- [開發計畫](docs/development-plan.md)：產品規格、技術決策、Firefox 與長對話驗收，以及 Git 規則。
- [能力與規格核查](docs/capability-audit.md)：保留原次檢查證據，後續狀態另註明。
- [調查背景](docs/survey.md)：對話目錄消失的公開資料調查。
- [進度與同步紀錄](docs/progress.md)：目前快照、測試狀態與雲端同步結果。
- [Firefox 安裝與驗證](docs/install-firefox.md)：原型暫時安裝、指令與限制。
- [可行性紀錄](docs/feasibility.md)：合成／真實資料来源與可承諾範圍。
- [原型驗收報告](docs/prototype-acceptance.md)：交付來源、測試結果、套件hash與未完成項目。
- [sub-agent獨立驗收](docs/acceptance-final.md)：固定快照重建、原生回歸與canonical套件核對。

## 版本管理

主分支為 `main`，實作分支為 `feat/firefox-prototype`。未完成的程式使用 WIP commit 保存在實作分支。

每完成一個功能、修復、測試組或文件變更，或累積 30 分鐘有效開發時間，以較早者為準建立 commit；每次 commit 後 push 並核對遠端 SHA。暫停與等待不計入開發時間。不建立空 commit，不 force-push。

儲存庫保持 private。node_modules、建置產物、XPI、測試 profile、真實聊天內容、憑證與環境設定不納入 Git。

## 驗證狀態

已完成typecheck、Firefox建置、零警告lint、12項核心回歸、8組原生Firefox導航、7組權限／背景生命週期及3組原生附加元件停用／重新啟用／移除測試。GPT-6.1 Sol high已完成固定SHA獨立複驗及canonical重建，已測v0.1範圍無剩餘阻擋缺陷；真實ChatGPT長對話與簽章驗收尚未完成。

私人 GitHub 首次同步已完成。持續依每功能／30 分鐘節奏 commit、push 並核對 SHA；sub-agent 以固定 commit SHA 獨立驗收。
