# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.5**（2026-10-08-v035）：重建只清空目前對話目錄，先到底、再往上收集，到頂自動停止。保存提問編號，F5／SPA／搜尋維持編號，後續新增延續。

Firefox157.0.1原生localhost合成5/5，純103/103、typecheck／build／lint通過；真實ChatGPT LIVE待驗證。

- [本版修正與證據](docs/release-v0.3.5.md)
- [更新與使用，保留既有索引](docs/install-firefox.md)
- [獨立驗收](docs/acceptance-v0.3.5.md)
- [版本與Git規範](docs/version-policy.md)
- [歷史版本目錄](docs/versions.md)
- [開發計畫](docs/development-plan.md)

只保存於Firefox本機：每對話5000筆／500萬正文，profile最近12個對話／600萬JSON字元。搜尋限已收錄資料，不使用歷史API、不宣稱伺服器完整session；正文／顺序矛盾隔離，目標掛載後核對ID／正文。

建置：npm ci → npm run typecheck → npm run build:firefox → npm run lint:firefox。純驗收：test:core／geometry／interaction／collection-policy／persistence／background／settings；原生本版：test:firefox-v035（独立profile／localhost）。歷史runner保留原版流程，不能沿用舊PASS冒稱本版結果。

每功能或30有效分鐘commit；每次交付遞增版本及固定annotated tag。本機Git Credential Manager／網路Git禁用，雲端以原始bundle同步並核對refs。
