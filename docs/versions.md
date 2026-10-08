# 2026-10-08 現行版本與棄用決策

使用者指定以 v0.3.4 重新開發產品 **0.3.5**；revision **2026-10-08-v035-rebuild**，新固定快照 `snapshot/v0.3.5/2026-10-08-rebuild`。舊 `v0.3.5`、`v0.3.6`、`snapshot/v0.3.6/2026-10-08-r2` **棄用**；SHA/tag/當時測試證據全部保留，不移動 canonical tag。新版本不讀取棄用版本的保存格式。新交付驗收狀態將與歷史紀錄分開，ChatGPT LIVE 仍 PENDING。

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
| v0.3.4 | [25b46d4](https://github.com/justamowei/chatgpt-toc-firefox/commit/25b46d412e6aa7af451eb7a507b47c291a9ade66) | a1ff15a | 實驗／測試版，LIVE PENDING；保存排序修正 | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/25b46d412e6aa7af451eb7a507b47c291a9ade66/docs/acceptance-v0.3.4.md) |
| v0.3.5 | [ba101b8](https://github.com/justamowei/chatgpt-toc-firefox/commit/ba101b8b446f1be554c484027fce7acdcf8d029f) | 6497a1b | 已棄用；此列保留歷史交付／驗收 | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/ba101b8b446f1be554c484027fce7acdcf8d029f/docs/acceptance-v0.3.5.md) |
| v0.3.6 | [5aa5b4e](https://github.com/justamowei/chatgpt-toc-firefox/commit/5aa5b4e6ddae39cd8d33b8de8abd25c997ac9150) | c32e8e9 | 已棄用；此列保留歷史交付／驗收 | [報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/5aa5b4e6ddae39cd8d33b8de8abd25c997ac9150/docs/acceptance-v0.3.6.md) |

v0.3.1固定首次交付；其後r2～r5是過去重用版本號的修訂，另保留各來源／報告，不移動v0.3.1。r5原生UI7項當時PENDING。此例外不再延續。v0.2.0於實際使用失敗後撤回，tag僅供追溯；撤回紀錄見[歷史失敗](https://github.com/justamowei/chatgpt-toc-firefox/blob/5c035c30b223886201adaa88433a7fbb8019b041/docs/live-history-failure.md)。

目前重新開發版本為 v0.3.5（2026-10-08-v035-rebuild），功能基準 v0.3.4；舊 v0.3.5、v0.3.6（含 r2）已依使用者指示棄用。舊表格是當時交付紀錄，不能當作現行可用版本推薦。維護線 release/v0.3 保留所有原始提交並向前接上回復基準與新實作。所有版本皆未完成正式簽章與整體Firefox ChatGPT LIVE驗收，不能將合成PASS當作完整session保證。

同步結果以GitHub refs及另外的交付同步報告核對；Git bundle雲端備份成功不等於正常refs已同步。

## 使用者指定的同版本修正建置

原v0.3.6 tag維持最初交付。本次依使用者「修改好的也是 v0.3.6 版」指示，manifest仍0.3.6，以建置revision與不可移動snapshot區分；完整來源可從release/v0.3取得。

| 版本／建置 | 固定快照 | runtime | 狀態／驗收 |
| --- | --- | --- | --- |
| 0.3.6／2026-10-08-v036-r2 | [snapshot/v0.3.6/2026-10-08-r2](https://github.com/justamowei/chatgpt-toc-firefox/tree/snapshot/v0.3.6/2026-10-08-r2) · [77ca0d1](https://github.com/justamowei/chatgpt-toc-firefox/commit/77ca0d14d8963aadede76ed3b4f7235dd0c190cb) | 5f1479c | 已棄用；歷史主端及獨立111純／15原生Firefoxlocalhost PASS，LIVE PENDING；[報告](https://github.com/justamowei/chatgpt-toc-firefox/blob/77ca0d14d8963aadede76ed3b4f7235dd0c190cb/docs/acceptance-v0.3.6-r2.md) |

重新開發版本0.3.5／2026-10-08-v035-rebuild：runtime95a7467，111純／独立原生11PASS、12hash匹配，LIVE PENDING；新snapshot交付識別與精確SHA以catalog的sameVersionRevisions核對。

新固定交付 [7003c51](https://github.com/justamowei/chatgpt-toc-firefox/commit/7003c51c74add79754c22457913c403e8b6b776d)，snapshot tagObject776b509cbec05b389827019ff095c0f7e9d2aabb；旧canonical v0.3.5仍指原ba101b8，不作本次下载识别。
