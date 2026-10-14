# 版本目錄

2026-10-15：使用者回報 v0.4.0 遠距離導航始終逐段移動，實際頁面未達快速跳轉目標。已在 fix/fast-eligibility-v041 修復兩個可重現的拒絕／距離覆寫缺口，產品 0.4.1 為診斷候選，尚未選定交付 tag、尚未確認使用者頁面根因；0.4.0 的原 tag／包與驗收快照保持不變。最新選定歷史仍是 0.4.0，候選由 version-catalog.json 的 workingCandidate 明確另列。

目前 **v0.4.0** 加入本次頁面已觀察區段的快速導航；既有 v0.3.5 與九個歷史 tags 保留。主程式在 release/v0.4，交付由 annotated v0.4.0 固定。此版仍是未簽章測試版，真正 Firefox ChatGPT LIVE 待核對。

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
| v0.3.5 | [58cdfd6](https://github.com/justamowei/chatgpt-toc-firefox/commit/58cdfd67e5631cbb464e2a2724ce2fc0c925359c) | f3cc436 | 實驗版／LIVE PENDING |
| v0.4.0 | [7cfe8c3](https://github.com/justamowei/chatgpt-toc-firefox/commit/7cfe8c3fbec7b2b68eb6b9bb6c9bc8652fe32892) | c1e0186 | 測試版；暖區段快速導航；LIVE PENDING |

v0.3.1 固定首次交付，r2–r5 歷史修訂保留來源，不移動原 tag。v0.2.0 實際使用失敗後撤回。詳細來源與驗收連結見 [機器可讀目錄](version-catalog.json)。已選定的 0.4 完整來源在 release/v0.4；診斷候選在 fix/fast-eligibility-v041。所有版本仍未完成正式簽章及整體 Firefox ChatGPT LIVE 驗收。

歷史交付v0.3.5：依使用者明確指定，更正先前誤標v0.3.7。相同頂端停止修正，未恢復舊0.3.5程式。固定交付與tag身份由[機器可讀目錄](version-catalog.json)記錄。
