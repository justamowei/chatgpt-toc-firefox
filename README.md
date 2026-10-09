# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.4**（2026-10-08-v034）：F5／切換對話直接恢復已保存目錄與排序，不因未重新掛載而降級；兼容 v032/v033 快取，未掛載目標仍可尋找。收集預設最多 10 分鐘，設定可選 1–10 分鐘。

Firefox 157.0.1 原生 addon 合成驗收 **13/13**，純測試 **94/94**、型別／建置／lint 通過。真實 ChatGPT LIVE 待驗證。

- [本版修正與證據](docs/release-v0.3.4.md)
- [更新與使用，保留既有索引](docs/install-firefox.md)
- [獨立驗收](docs/acceptance-v0.3.4.md)
- [版本與 Git 規範](docs/version-policy.md)
- [歷史版本目錄](docs/versions.md)
- [計畫與 Git 規則](docs/development-plan.md)

只保存於 Firefox 本機：每對話 5000 筆／500 萬正文，profile 最近 12 個對話／600 萬 JSON 字元。搜尋限已收錄資料，不使用歷史 API，不宣稱完整 session。正文／順序矛盾版本隔離，候選目標重新掛載後核對 ID／正文。

建置：npm ci → npm run typecheck → npm run build:firefox → npm run lint:firefox。
驗收：test:core、test:geometry、test:interaction、test:collection-policy、test:persistence、test:background、test:settings、test:firefox-v034、test:firefox-anchor-walk（本版回歸）。原生 runner 使用獨立 profile／localhost。

每功能／30有效分鐘commit；每次交付新版本与固定annotatedtag。Git Credential Manager本機禁用，雲端備份与正常refs同步分開核對；來源与同步規則見版本規範。

2026-10-10：依使用者授權，以新 commit 回退 v0.3.4；v0.3.5／v0.3.6 的交付物、專用 refs 已移除。[回退與移除狀態](docs/rollback-2026-10-10.md)。目前 Firefox 中執行的插件尚未核對。
