# ChatGPT 對話導航器（Firefox 優先）

目前 **v0.4.0**（2026-10-14-v040）加入已觀察區段的快速導航。首次讀取仍沿掛載邊緣收集；之後用實測距離直接跳到目標附近，掛載後核對 ID、內容與可見性再標亮。幾何失效時回退逐段導航。

[設計與限制](docs/plan-v0.4.0.md) · [交付與驗收](docs/release-v0.4.0.md) · [安裝](docs/install-firefox.md) · [版本規範](docs/version-policy.md) · [版本目錄](docs/versions.md)

主程式在 release/v0.4／v0.4.0 tag；v0.3.5 原有交付保留。目錄資料繼續儲存在 Firefox 本機；幾何資料只用於當次頁面，不跨 F5 或 SPA 套用。維持 Shift+O、手動停止、1–10 分鐘收集設定與現有資料格式。

Firefox localhost 驗收與真正 ChatGPT LIVE 分別記錄；此版是未簽章測試版，LIVE 待核對，不宣稱完整 session 已經經伺服器結構驗證。
