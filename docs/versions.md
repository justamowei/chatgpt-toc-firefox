# 版本目錄

目前 **v0.3.7**，以v0.3.4修正。2026-10-10 依使用者明確授權，以新 commit 回退；v0.3.5／v0.3.6 及兩個同版本 snapshot tags 已移除。提交歷史保留，這些版本不再作交付選擇。[回退紀錄](rollback-2026-10-10.md)、[版本規範](version-policy.md)。

| tag | 交付快照 | runtime | 狀態 |
| --- | --- | --- | --- |
| v0.1.0 | [3083522](https://github.com/justamowei/chatgpt-toc-firefox/commit/30835220edef18266605ce3b897e58da0aff9e6a) | 5cf4764 | 實驗版／LIVE PENDING |
| v0.1.1 | [07137cd](https://github.com/justamowei/chatgpt-toc-firefox/commit/07137cdd811d6a32d87c14921750eac32afb84a4) | 5aa5102 | 實驗版／LIVE PENDING |
| v0.2.0 | [27ecb23](https://github.com/justamowei/chatgpt-toc-firefox/commit/27ecb23cb2d27e235734b60c387c3d9a7ceb326a) | 95c2694 | 已撤回／LIVE FAIL |
| v0.3.0 | [288f3b0](https://github.com/justamowei/chatgpt-toc-firefox/commit/288f3b0e868e0d3dfd8bc94cb717094b64ce4991) | 4c3d838 | 實驗版／LIVE PENDING |
| v0.3.1 | [99c3b06](https://github.com/justamowei/chatgpt-toc-firefox/commit/99c3b064a55e3b36707c83630dc89c59bedcd585) | f9974ec | 實驗版／LIVE PENDING |
| v0.3.2 | [5fd1d4d](https://github.com/justamowei/chatgpt-toc-firefox/commit/5fd1d4dd8dfc1c12342e0a4ccbf01dc31365f748) | 2c9d0d2 | 實驗版／LIVE PENDING |
| v0.3.3 | [5695198](https://github.com/justamowei/chatgpt-toc-firefox/commit/56951988cb7d258eafeadacfa02174226a824093) | 567dfda | 實驗版／LIVE PENDING |
| v0.3.4 | [25b46d4](https://github.com/justamowei/chatgpt-toc-firefox/commit/25b46d412e6aa7af451eb7a507b47c291a9ade66) | a1ff15a | 實驗版／LIVE PENDING |

v0.3.1 固定首次交付，r2–r5 歷史修訂保留來源，不移動原 tag。v0.2.0 實際使用失敗後撤回。詳細來源與驗收連結見 [機器可讀目錄](version-catalog.json)。當前完整來源在 release/v0.3；所有版本仍未完成正式簽章及整體 Firefox ChatGPT LIVE 驗收。

新交付v0.3.7：頂端向上單向收集、persistent邊緣anchor、可見loading核對；完整證據見[本版報告](release-v0.3.7.md)。固定交付與tag SHA由catalog交付完成後填入。
