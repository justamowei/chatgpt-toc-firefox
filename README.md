# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.6**（2026-10-08-v036）：編號移除「暫」；成功讀取後確認沒有保存目錄的session，自動由底往上收集。已有任何目錄就不自動重跑；新增提問自動追加保存，F5／SPA保留。

Firefox157.0.1原生localhost合成8/8、純111/111、typecheck／build／嚴格lint通過，GPT-6.1 Sol high獨立驗收通過；ChatGPT LIVE待驗證。

- [本版修正與證據](docs/release-v0.3.6.md)
- [更新與使用，保留既有索引](docs/install-firefox.md)
- [獨立驗收](docs/acceptance-v0.3.6.md)
- [版本與Git規範](docs/version-policy.md)
- [歷史版本目錄](docs/versions.md)
- [開發計畫](docs/development-plan.md)

只保存於Firefox本機：每對話5000筆／500萬正文，profile最近12個對話／600萬JSON字元。搜尋限已收錄資料，不使用歷史API、不宣稱伺服器完整session；正文／順序矛盾隔離，目標掛載後核對ID／正文。未核對起點時數字表示已收錄目錄的順序。

建置：npm ci → npm run typecheck → npm run build:firefox → npm run lint:firefox。純驗收：test:core／geometry／interaction／collection-policy／persistence／background／settings／auto-collection；本版原生：test:firefox-v036（獨立profile／localhost）。歷史runner保留原版流程，不能沿用舊PASS冒稱本版結果。

每功能或30有效分鐘commit；每次不同runtime交付遞增版本及固定annotated tag。本機Git Credential Manager／網路Git禁用，雲端以原始bundle同步並核對refs。
