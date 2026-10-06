# Firefox v0.3.2 安裝與使用

使用 sibling outputs/Firefox-測試版-v0.3.2/manifest.json，或 dist/firefox/manifest.json。version 0.3.2，頁面診斷 revision 2026-10-07-v032。舊 v0.3.1 資料夾是歷史副本。

1. Firefox about:debugging →「這個 Firefox」→「載入暫時附加元件」，選上述新版 manifest；同一 ID 只保留一份。已指向新版資料夾時可用「重新載入」。
2. 安裝／更新時允許 chatgpt.com 網站權限；若 Firefox 仍設定逐站允許，從附加元件權限頁允許 ChatGPT。
3. 重新整理已開啟 ChatGPT。新開啟且載入完成的 ChatGPT 頁面預設顯示入口，不需每頁點工具列。
4. 點「目錄」或輸入框外 Shift + O 開啟；Esc 收合。縮小格子只代表當前掛載可定位提問，完整列表保留已收錄提問。
5. 收集先向上，確認穩定物理邊界後才向下，最多 5 分鐘／2400 輪。Alt 不停止；可按「停止」。
6. scope 顯示「已儲存於本機」後，F5 可恢復已保存資料。未核對分支的上次提問僅供搜尋，重新觀察相同 ID／正文後去重與恢復。

本機保存每對話 5000 筆／500 萬正文，總共最近使用 12 個對話／600 萬 JSON 字元。設定可停用自動啟用或清除本機索引，清除儲存不清除已開分頁記憶體。無痕頁面不啟用／保存。

本版是未簽章開發測試版；暫時附加元件在重啟 Firefox 後移除，不能當作已正式日常安裝。卸載可能清除附加元件儲存。F5 保存已實測，不承諾卸載後仍保有索引。

Firefox 157.0 原生合成驗收 18 項 PASS；真實 ChatGPT LIVE／ESR／Android 未完成。見 [本版報告](release-v0.3.2.md)。
