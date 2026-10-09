# v0.3.7 驗收

固定產品 runtime：0a069e08a7893a55b48d061ce7dbb8a9fc0f9b64。後續提交僅調整測試隔離、文件和版本目錄，不修改產品。2026-10-10。

| 驗證 | 結果 | 證據 |
| --- | --- | --- |
| TypeScript typecheck | PASS | 固定來源獨立審查 |
| 純測試 | 94/94 PASS，無跳過 | [輸出](evidence/v0.3.7/pure-tests.txt) |
| 版本規範 | 7/7 PASS | tests/version-governance.test.py |
| 正式與 fixture build / 嚴格 lint | PASS，各 0 errors / notices / warnings | [正式 hashes](evidence/v0.3.7/production-build.json)、[fixture hashes](evidence/v0.3.7/fixture-build.json) |
| 頂端／loading／取消 | 6/6 原生 Firefox PASS | [結果](evidence/v0.3.7/native-top.json) |
| 慢掛載／幾何重置／head-only | 6/6 原生 Firefox PASS | [結果](evidence/v0.3.7/native-boundary.json) |
| 保存／SPA／F5／雙向導航／設定 | 8/8 原生 Firefox PASS | [結果](evidence/v0.3.7/native-recovery.json) |
| GPT-6.1 Sol high 子代理 | PASS，無產品阻擋 | [固定來源審查](evidence/v0.3.7/independent-review.json) |
| 登入 ChatGPT LIVE | PENDING | 本次未完成 |

原生測試使用獨立 Firefox profile，localhost 合成 ChatGPT renderer 及 fixture 權限；不代表真實 ChatGPT LIVE，也未檢查或變更個人 Firefox 插件。子代理自行執行純測試／typecheck，讀取主代理的 Firefox 證據，沒有自行執行 Firefox。

頂端測試包括：0px 與 450px 頁首完成、完成後無延遲捲動、隱藏 loader 不誤阻止、可見 busy 延遲 9 秒後仍需穩定確認、未知 950px 留白保守等待且可停止、中段冻结不誤完成。邊界測試包含 25 秒延遲掛載、loading、節點及幾何變化會重置頂端穩定證據，不向下補收。保存測試涵蓋收集 30 筆、A→B→A、空掛載 SPA 恢復、F5 多次保留順序、離屏雙向定位、旧快取遷移、時間設定及已變更內容取消導航。

## 失敗證據與測試修正

[原 v0.3.4 症狀重現](evidence/v0.3.7/baseline-reproduction.json) 保留。第一輪 harness 也曾在腳本註冊完成前讀取面板、共用 route 快取、在導航尚未進入 loading 時等待完成，以及沿用向下 sweep 的 30 筆期待；這些失敗保留在本機 artifacts 原路徑，未當作 PASS。後續改為等待腳本註冊、每案例獨立 route、先等 loading、從中段或頂端依 head-only 契約核對收錄範圍。

[原 empty SPA 超時](evidence/v0.3.7/original-recovery-failure.json) 發現混合 A／B 目錄識別值。測試頁只等筆數而未等 route 身份，freeze 也未取消已排程的掛載；修正 harness 後，產品 content.js hash 完全相同，8/8 回歸 PASS，空掛載時恢復 30 筆。尚未證明原次失敗的唯一原因，不表述成已確認的環境原因。

正式產物僅匹配原有 ChatGPT 網域；未新增 fixture host 權限。對話快取、背景保存與導航內容核對路徑保持 v0.3.4，獨立審查確認產品非相關路徑無改動。
