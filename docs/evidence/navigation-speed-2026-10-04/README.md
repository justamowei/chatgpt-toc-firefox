# v0.3.1 證據範圍

固定產品來源 `f9974ec368d81e4a25cc9e2583ebf6e55dbcb63d`。日期以客戶端2026-10-04 Asia/Taipei為準；JSON保留執行器UTC時間。

- primary-speed.json：原生Firefox157.0、localhost合成40題虛擬頁面，4項PASS。實際安裝fixture addon，真實捲動事件量測；不是ChatGPT LIVE。
- primary-cache.json：原生Firefox157.0、真實IAB快照在localhost重建及合成生命週期窗口，8項PASS。不是在真實ChatGPT上執行addon。
- independent-speed.json／independent-cache.json：GPT-6.1 Sol high固定SHA獨立複跑，速度4項／快取8項全部PASS；executor明示独立代理。
- source-build.json：正式與fixture有不同權限、hash；正式副本fixture=false、version0.3.1，六檔核對SHA-256。
- iab-geometry-anonymized.json：真實ChatGPT在Codex IAB的原生鍵盤／唯讀DOM幾何觀察，已去掉真實訊息ID，未記錄正文或帳號。Control+Home沒有到首輪；向上捲動時高度10792→12840且top1497→2882。沒有執行addon，不能當作Firefox或定位速度驗收。

真實頁面截圖僅留在本機artifacts，不提交Git。独立結果與來源另見 ../../acceptance-navigation-v0.3.1.md。
