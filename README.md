# ChatGPT 對話導航器（Firefox 優先）

現行重新開發版本 **v0.3.5（2026-10-08-v035-rebuild）**，以 v0.3.4 功能為基準。舊 v0.3.5、v0.3.6（含修正版）已依使用者指示棄用，歷史tag與交付證據保留。

新增「建立完整目錄」只清當前對話，由底向上到頂停止；原收集按鈕保留已有目錄向上補收。快取全空session才自動建立，有任何保存內容不自動重跑；後續新提問持續追加。預設10min，設定可選1–10min。依使用者指示不相容讀取棄用035/36資料。

完整來源在 [release/v0.3](https://github.com/justamowei/chatgpt-toc-firefox/tree/release/v0.3)，工作分支 [feat/v035-rebuild-from-v034](https://github.com/justamowei/chatgpt-toc-firefox/tree/feat/v035-rebuild-from-v034)。[重新開發規格](https://github.com/justamowei/chatgpt-toc-firefox/blob/release/v0.3/docs/redevelopment-v0.3.5.md)、[版本規範](docs/version-policy.md)、[版本目錄](docs/versions.md)、[開發計畫](docs/development-plan.md)。本分支保存完整開發與驗收來源。

未簽章測試版。原生Firefox localhost虛擬掛載與真實ChatGPT LIVE分開驗收，LIVE PENDING；版本號不能代表完整歷史保證。
