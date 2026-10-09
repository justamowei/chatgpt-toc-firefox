# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.3.5**（2026-10-10-v035），以v0.3.4修正：向上收集不反覆拉回同一提問，到穩定頂端直接結束，保留目錄。

[本版修正與驗收](docs/release-v0.3.5.md)、[安裝／更新](docs/install-firefox.md)、[版本規範](docs/version-policy.md)、[版本目錄](docs/versions.md)。完整來源在release/v0.3。

同root、可見首訊息、ID窗口與幾何六秒穩定、無可見loading、兩次間隔clamp才結束。超高未知頂端spacer仍保守等待，可按停止或到時限；不把只有scrollTop=0當完整歷史。保存、SPA/F5、導航、Shift+O及10分鐘設定沿用034；不新增自動重建、編號或清目錄。

原生Firefox localhost合成測試與ChatGPT LIVE分別記錄；真實ChatGPT LIVE仍PENDING，未簽章測試版。
