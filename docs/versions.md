# 版本目錄

依2026-10-07新增規範補建歷史annotatedtags；tag指向原始交付提交，沒有重新編號、重寫歷史或把舊版變成現在才驗收的新版。精確SHA與證據見 [機器可讀目錄](version-catalog.json)、[版本規範](version-policy.md)。

| tag | 交付快照 | 產品runtime | 狀態 | 驗收 |
| --- | --- | --- | --- | --- |
| v0.1.0 | [3083522](https://github.com/justamowei/chatgpt-toc-firefox/commit/30835220edef18266605ce3b897e58da0aff9e6a) | 5cf4764 | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/30835220edef18266605ce3b897e58da0aff9e6a/docs/acceptance-final.md) |
| v0.1.1 | [07137cd](https://github.com/justamowei/chatgpt-toc-firefox/commit/07137cdd811d6a32d87c14921750eac32afb84a4) | 5aa5102 | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/07137cdd811d6a32d87c14921750eac32afb84a4/docs/acceptance-v0.1.1.md) |
| v0.2.0 | [27ecb23](https://github.com/justamowei/chatgpt-toc-firefox/commit/27ecb23cb2d27e235734b60c387c3d9a7ceb326a) | 95c2694 | 已撤回，LIVE FAIL | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/27ecb23cb2d27e235734b60c387c3d9a7ceb326a/docs/acceptance-v0.2.0.md) |
| v0.3.0 | [288f3b0](https://github.com/justamowei/chatgpt-toc-firefox/commit/288f3b0e868e0d3dfd8bc94cb717094b64ce4991) | 4c3d838 | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/288f3b0e868e0d3dfd8bc94cb717094b64ce4991/docs/acceptance-seen-cache-v0.3.0.md) |
| v0.3.1 | [99c3b06](https://github.com/justamowei/chatgpt-toc-firefox/commit/99c3b064a55e3b36707c83630dc89c59bedcd585) | f9974ec | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/99c3b064a55e3b36707c83630dc89c59bedcd585/docs/acceptance-navigation-v0.3.1.md) |
| v0.3.2 | [5fd1d4d](https://github.com/justamowei/chatgpt-toc-firefox/commit/5fd1d4dd8dfc1c12342e0a4ccbf01dc31365f748) | 2c9d0d2 | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/5fd1d4dd8dfc1c12342e0a4ccbf01dc31365f748/docs/acceptance-v0.3.2.md) |
| v0.3.3 | [5695198](https://github.com/justamowei/chatgpt-toc-firefox/commit/56951988cb7d258eafeadacfa02174226a824093) | 567dfda | 實驗／測試版，LIVE PENDING | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/56951988cb7d258eafeadacfa02174226a824093/docs/acceptance-v0.3.3.md) |

v0.3.1固定首次交付；其後r2～r5是過去重用版本號的修訂，另保留各來源／報告，不移動v0.3.1。r5原生UI7項當時PENDING。此例外不再延續。v0.2.0於實際使用失敗後撤回，tag僅供追溯；撤回紀錄見[歷史失敗](https://github.com/justamowei/chatgpt-toc-firefox/blob/5c035c30b223886201adaa88433a7fbb8019b041/docs/live-history-failure.md)。

目前適合繼續測試的版本是v0.3.3；同系列維護在release/v0.3。所有版本皆未完成正式簽章與整體Firefox ChatGPT LIVE驗收，不能將合成PASS當作完整session保證。

同步結果以GitHub refs及另外的交付同步報告核對；Git bundle雲端備份成功不等於正常refs已同步。
