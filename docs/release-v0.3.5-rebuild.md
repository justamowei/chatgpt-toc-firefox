# v0.3.5 重新開發交付

runtime 95a74670e26a930c6cadc3c4a29a9d40eb5a7d43；產品0.3.5／2026-10-08-v035-rebuild。依使用者指示由v0.3.4重做，舊035/36及036-r2棄用。新固定快照snapshot/v0.3.5/2026-10-08-rebuild與舊canonical v0.3.5區分，舊tag完整保留。

1. 原「收集整段對話」保留快取只向上，到穩定頂端停止，不再反向巡覽。
2. 新「建立完整目錄」只重設當前對話，numeric根捲動到底部後向上到頂，不自動F5。
3. 成功確認已保存active+quarantine全空，等stable user mount後auto由底往上；有任何內容、拒絕讀取都不auto。
4. 後續新提問自動追加并保存；F5/SPA恢復有序可尋找候選，重新核對落點後高亮。

必要取消/遲到回覆/跨session保存race已修復。對話完整性仍未由網站API核對；不用API、不上傳聊天內容。Firefox優先，沿用034簡約UI、Shift+O、Alt不停止與1–10min設定。

驗收：主端/獨立111純PASS，原生Firefox独立11PASS，12建置hash匹配，两份lint0/0/0；ChatGPT LIVE PENDING。[詳細驗收](acceptance-v0.3.5-rebuild.md)、[規格](redevelopment-v0.3.5.md)。原生是localhost掛載模型，已保留原始真失敗及harness錯誤證據。

交付資料夾outputs/Firefox-測試版-v0.3.5-重新開發/manifest.json；未簽章zip chatgpt-toc-firefox-0.3.5-2026-10-08-rebuild.zip，SHA256 477ebba9e637e6173fe6c7912c72452c0ec69635697aaf25ff007d15379f53a9。不要用棄用資料夾的重新載入來測新版。

每功能checkpoint原始提交同步私人GitHub，無本機networkgit/GCM。交付與tag同期同步後另外產出refs/tag/tree逐一核對報告；沒有核對前不標SYNC_VERIFIED。
