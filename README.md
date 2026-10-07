# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.3**（2026-10-07-v033）：切換對話／F5 恢復已保存目錄，可重新尋找未掛載提問；兼容 v032 快取。收集預設最多 10 分鐘，設定可選 1–10 分鐘。

Firefox 157.0 原生 addon 合成驗收 **13/13**，純測試 **88/88**、型別／建置／lint 通過。真實 ChatGPT LIVE 待驗證。

- [本版修正與證據](docs/release-v0.3.3.md)
- [更新與使用，保留既有索引](docs/install-firefox.md)
- [獨立驗收](docs/acceptance-v0.3.3.md)
- [計畫與 Git 規則](docs/development-plan.md)

只保存於 Firefox 本機：每對話 5000 筆／500 萬正文，profile 最近 12 個對話／600 萬 JSON 字元。搜尋限已收錄資料，不使用歷史 API，不宣稱完整 session。正文／順序矛盾版本隔離，候選目標重新掛載後核對 ID／正文。

建置：npm ci → npm run typecheck → npm run build:firefox → npm run lint:firefox。
驗收：test:core、test:geometry、test:interaction、test:collection-policy、test:persistence、test:background、test:settings、test:firefox-v033、test:firefox-v032（本版回歸規格）。原生 runner 使用獨立 profile／localhost。

每功能／30 有效分鐘 commit；Git Credential Manager 停用，雲端用 GitHub 連接器 checkpoint＋原 Git bundle。一般 feature 分支 push 待恢復。
