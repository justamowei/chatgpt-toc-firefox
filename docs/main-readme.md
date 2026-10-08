# ChatGPT 對話導航器（Firefox 優先）

目前可測試版本 **v0.3.6 修正版（2026-10-08-v036-r2）**：空目錄session自動由底往上收集，已有任何內容不重跑；新增提問追加保存，編號不加「暫」。請切換到 [release/v0.3](https://github.com/justamowei/chatgpt-toc-firefox/tree/release/v0.3) 取得完整開發來源，或選 [本次修正快照](https://github.com/justamowei/chatgpt-toc-firefox/tree/snapshot/v0.3.6/2026-10-08-r2) 固定交付快照。main的本次更新僅含規範／版本索引，原專案基線保留。

- [版本與Git規範](docs/version-policy.md)
- [版本目錄及撤回狀態](docs/versions.md)
- [開發計畫](docs/development-plan.md)

產品仍為未簽章測試版，真實ChatGPT LIVE待驗證。v0.2.0已撤回，仅供歷史追溯。版本以固定annotatedtags標記，release/v0.3維護當前系列；每功能或30有效分鐘commit，每次交付遞增版本，不移動歷史tag。

依使用者指定維持版本0.3.6，修正底端回拉與頂端留白／loading判定；原v0.3.6 tag不移動，建置另存固定snapshot。主端111純／15原生Firefoxlocalhost通過，ChatGPT LIVE待驗證。
