# ChatGPT 對話導航器（Firefox 優先）

自製 ChatGPT Web 對話目錄與導航擴充功能，Firefox 桌面版為第一優先。

目前為開發初期快照，功能開發暫停。尚無可使用的完整擴充功能；導航介面、DOM adapter、建置／打包腳本與測試尚未完成。package.json 內部分命令指向待建立的檔案，不能視為可執行交付。

## 文件

- [開發計畫](docs/development-plan.md)：產品規格、技術決策、Firefox 與長對話驗收，以及 Git 規則。
- [能力與規格核查](docs/capability-audit.md)：保留原次檢查證據，後續狀態另註明。
- [調查背景](docs/survey.md)：對話目錄消失的公開資料調查。
- [進度與同步紀錄](docs/progress.md)：目前快照、測試狀態與雲端同步結果。

## 版本管理

主分支為 `main`，實作分支為 `feat/firefox-prototype`。未完成的程式使用 WIP commit 保存在實作分支。

每完成一個功能、修復、測試組或文件變更，或累積 30 分鐘有效開發時間，以較早者為準建立 commit；每次 commit 後 push 並核對遠端 SHA。暫停與等待不計入開發時間。不建立空 commit，不 force-push。

儲存庫保持 private。node_modules、建置產物、XPI、測試 profile、真實聊天內容、憑證與環境設定不納入 Git。

## 驗證狀態

目前僅確認原生 Firefox 能渲染隔離的本機頁面。未完成 typecheck、擴充功能 lint、建置、核心測試、Firefox 附加元件驗收或真實 ChatGPT 長對話驗收。

恢復功能開發前必須先完成私人 GitHub 儲存庫首次同步。之後依計畫逐項開發與驗收；sub-agent 以固定 commit SHA 獨立驗收。
