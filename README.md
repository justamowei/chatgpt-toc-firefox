# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.2**（2026-10-07-v032）。本版改善面板開關效能及慢掛載收集，Alt 不再停止，F5 恢復本機目錄，ChatGPT 頁面預設啟用。完整列表保留已收錄資料；右側格子只提供目前掛載提問的快速跳轉。

Firefox 157.0 的實際 addon 原生合成驗收 **18/18**、純測試 **74/74**、型別／建置／lint 通過，獨立 agent 核對固定來源與產物。真實 ChatGPT LIVE 未完成。

- [本版修正與驗收](docs/release-v0.3.2.md)
- [安裝與使用](docs/install-firefox.md)
- [獨立驗收](docs/acceptance-v0.3.2.md)
- [計畫與 Git 規則](docs/development-plan.md)
- [歷史進度](docs/progress.md)

資料只存於 Firefox 擴充功能本機儲存。每對話 5000 筆／500 萬正文，全 profile 最近 12 個對話／600 萬 JSON 字元；未知分支的上次提問保留搜尋，重新核對同 ID／正文才恢復定位。未掛載資料仍須收集，不使用歷史 API，不宣稱完整 session。

建置：npm ci → npm run typecheck → npm run build:firefox → npm run lint:firefox。

驗收：npm run test:core、test:geometry、test:interaction、test:collection-policy、test:persistence、test:background、test:firefox-v032、test:firefox-collection-boundary、test:firefox-anchor-walk。原生 suite 使用獨立 profile 與 localhost，不讀取使用者的瀏覽器 profile。

舊 firefox-permissions 是 optional-permission 歷史流程，不能用作本版 required-host 驗收；目前權限／設定由 background.test 與 firefox-v032 驗證。v0.3.1 的 collapsed-list DOM 假設亦為舊規格，以本版 suite 為準。

Git Credential Manager 已因記憶體錯誤停止，一般 push 待恢復；GitHub 連接器備份來源及原始 Git bundle，明細另附交付報告。
