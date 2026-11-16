# ChatGPT 對話導航器（Firefox 優先）

目前開發版本已回退到 **v0.3.5**（2026-10-10-v035）。依使用者 2026-10-15 指示，v0.4.0／v0.4.1 全部撤回；快速導航与診斷候選不再作為當前版本。原始 commits、歷史 tag 與驗收文件保留。

目前來源：release/v0.3／fix/rollback-v035-20261015。有效安裝入口為 outputs/Firefox-測試版-v0.3.5/manifest.json。

v0.3.5 使用掛載邊緣逐段導航，本機保存已看過目錄，向上收集至穩定頂端後結束；Shift+O、Alt 不停止與 1–10 分鐘收集設定沿用原版。

[回退紀錄](docs/rollback-v04-2026-10-15.md) · [安裝](docs/install-firefox.md) · [v0.3.5 報告](docs/release-v0.3.5.md) · [版本規範](docs/version-policy.md) · [版本目錄](docs/versions.md)

此為未簽章測試版。恢復專案檔案不代表已替換個人 Firefox 正在執行的附加元件；請手動改載入 v0.3.5。真正 Firefox ChatGPT LIVE 仍未完成整體驗收。

日常開發：在 Firefox 驗收本次功能；不例行全套測試或子代理驗收。每個功能／修正或 30 分鐘有效開發提交 Git 並同步私人 GitHub。詳見[現行開發流程](docs/development-plan.md)。
