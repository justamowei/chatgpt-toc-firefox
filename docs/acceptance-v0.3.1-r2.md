# v0.3.1 r2：固定來源獨立本機驗收

2026-10-05（Asia/Taipei）。執行者：GPT-6.1 Sol high，`/root/navigation_retry_v031`。固定來源：**31608f2c3766d282f66c65a6d15ab63ceaf894a1**；revision：`2026-10-05-r2`。

**獨立 typecheck、核心 26／26、geometry 9／9、原生 Firefox 捲動機制 7／7、速度 4／4、已見快取 8／8 全部通過。** 本輪使用隔離 profile 的 headless Firefox 157.0 與 localhost 測試頁。接受固定候選的本機驗收；真實 Firefox chatgpt.com 完整 addon 尚未 LIVE 驗收，不能據此宣稱使用者當次問題的根因已由真網站實證。

## 固定來源與執行歸屬

全部原生測試開始前、完成後，本代理各執行一次：

`git diff --exit-code 31608f2c3766d282f66c65a6d15ab63ceaf894a1 -- src tests scripts manifests package.json package-lock.json`

兩次皆無差異輸出、exit 0；開始時 HEAD 亦為固定 SHA。本代理沒有修改 source、tests、scripts、manifest、package 或 Git；本階段只新增本報告及測試產生的 ignored artifacts，沒有修改舊驗收報告。最終 SHA 固定後，typecheck、核心、geometry 和三組 native suite 全部重新獨立執行；先前 97924b3 的結果只是歷史候選資料，未算入本報告的最終 PASS。

Native 三組依序執行，前一組 exit 0 並關閉後才啟動下一組。每組皆設定 `TOC_TEST_EXECUTOR=GPT-6.1 Sol high independent /root/navigation_retry_v031`，以及下列各自的新 artifacts 目錄。

先前 97924b3 候選的一次 sandbox 命令在 fixture build 階段因 esbuild 讀取 ancestor directory 被拒而失敗，當時尚未啟動 Firefox。這是環境失敗，未計為 native PASS。本輪最終來源的 fixture build 與隔離 headless Firefox 依批准範圍在 sandbox 外執行，三組均實際完成；沒有把主代理結果、舊候選結果或未執行案例當作本代理的 PASS。

| 本代理實際執行 | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:core` | 26／26 PASS，0 fail／skip，exit 0 |
| `npm run test:geometry` | 9／9 PASS，0 fail／skip，exit 0 |
| `node tests/firefox-scroll-mechanism.mjs` | 7／7 PASS，exit 0 |
| `node tests/firefox-navigation-speed.mjs` | 4／4 PASS，exit 0 |
| `node tests/firefox-seen-cache.mjs` | 8／8 PASS，exit 0 |

本輪獨立原始 JSON：

- [捲動機制](../artifacts/acceptance-31608f2-mechanism/results.json)，UTC `2026-10-04T16:37:12.816Z`。
- [速度](../artifacts/acceptance-31608f2-speed/results.json)，UTC `2026-10-04T16:38:17.167Z`。
- [快取](../artifacts/acceptance-31608f2-cache/results.json)，UTC `2026-10-04T16:38:56.949Z`。

這些為本代理新產生的本機測試 artifacts。快取資料明示 `liveChatGptAddon=false`，來源為既有真實 IAB 快照在 localhost 重建；沒有在真實網站執行 addon，也没有重新擷取 IAB DOM。

結案時主代理將三份結果逐一核對並收進 Git：[機制 JSON](evidence/scroll-mechanism-2026-10-05/independent-mechanism.json)、[速度 JSON](evidence/scroll-mechanism-2026-10-05/independent-speed.json)、[快取 JSON](evidence/scroll-mechanism-2026-10-05/independent-cache.json)。上方原始 artifacts 與截圖只保留在本機，GitHub 閱讀者可使用這三份副本與[證據範圍](evidence/scroll-mechanism-2026-10-05/README.md)。

## 獨立原生捲動機制

| 案例 | 本代理實際核對 |
|---|---|
| MECH-01 | 外層不捲動 marker 包住內層 hidden viewport；moving root 到 top 0，2 次實際 scroll／卸載事件 |
| MECH-02 | 頁首後掃描中段，18／18 精確 ID 與順序保存；自然到 idle，44 次 scroll／卸載，UI 仍明示歷史尚未完整 |
| MECH-HEIGHT | 遠距 `mechanism:u-7` 使用 `measured-turn-spans`，精確高亮；36 個 measured turns、18 個 answers、17 個 spans |
| MECH-03 | 等前次捲動穩定後才 arm；記錄 1 次 arming 後的 root replacement，導航最終精確高亮 `mechanism:u-2` |
| MECH-04 | 等前次捲動穩定後才 arm；記錄 1 次 arming 後的非同步 eviction，最終精確高亮 `mechanism:u-1` |
| MECH-06 | 返回同一答案 `mechanism:a-17`，最後 offset 捲動後 remount；等待穩定後量測 **-406 → -406 px** |
| MECH-05 | 經過替換、eviction 及返回後，末輪再次跳轉仍為 **`measured-turn-spans`**，17 spans 保留；診斷不含 fixture 訊息 ID 或正文 |

已實際查看 [18 則收集截圖](../artifacts/acceptance-31608f2-mechanism/collected-18-nested.png)：頁面明示 Firefox 原生附加元件合成測試；面板顯示已看過 18／目前掛載 3、歷史尚未完整、當前分支未完整核對，掃描自然結束於原閱讀訊息附近。截圖不是 ChatGPT LIVE。

此模型使用 650 px 高的 nested hidden viewport、350 ms 卸載／掛載延遲、實際 scroll events，以及一次性的 root replacement／eviction。MECH-03 核對替換後精確恢復，不宣稱量測所有 detached-root writes；這項模型延遲也不能代表網站所有非同步行為。

## 獨立速度與已見快取

| 速度案例 | 本代理結果 |
|---|---|
| SPEED-01 | 從 4 則收至 40／40，精確順序一致，**33,273 ms／43 步**；跨過 60,000 px 模型答案內部，500 ms 空掛載延遲 |
| SPEED-02 | 已見離屏 `speed:u-3`：**1,405 ms／2 次 jump commands**，精確高亮 |
| SPEED-03 | 插入 18,000 px 版面間隙後 `speed:u-25`：**1,426 ms／2 次 commands**，精確高亮 |
| SPEED-04 | 導航中停止後 state=cancelled，保留 40 則，沒有晚到 scroll 或目標 highlight |

時間為本機合成頁量測，不能轉用為真網站性能承諾。長答案是明確 assistant 節點的固定 CSS 高度；收齊模型 40 則不等於產品證明完整歷史。

CACHE-01–08 全部獨立通過：12 個已完成快照提問的精確 ID／正文保存、slot 換號、離屏搜尋與返回、空窗口及首次 removed subtree 保存、prefix edit 舊版本隔離搜尋、SPA 舊 DOM 排除、新對話 URL 指派保留同一首提問、disjoint 20 則窗口保留但未知順序拒絕離屏返回、實際 ordered bridge 後允許恢復、取消保留，以及答案缺提問錨點拒絕猜測捲動。

CACHE-07 先以實際捲動卸載原閱讀提問，再核對未知順序拒絕；提供同時掛載的 20 則實際顺序見證後，再從離屏狀態檢查恢復。這與 r2 掃描結束於原閱讀錨點附近的行為相符，未移除順序守門。

核心 26 項包含 `locate(false)` 後初始掛載／load 掛載目標的有限重試、永久 false 的 batch／stalled 結果、最後一次 load 的精確驗證機會、取消與 supersession、總／批期限，以及忽略 abort 的晚到結果。1,000 則 NFKC 搜尋的 20 次本機 p95 為 **2.7065 ms**，不是 addon 端到端量測。

Geometry 9 項包含實測 user spans、不同答案高度與留白、缺 span 拒估、逐 link 的 width tolerance、cached successor 核對、矛盾座標拒估、短鏈 anchor、固定資料預算、純 scalar 保存，以及 global ambiguity 期間記錄 window-local span、較完整局部觀察取代 pinned-tail 過長 span。估算只供 seek 嘗試，不代替精確訊息驗證。

## 限定 P1／P2 審查

先前指出的取消與恢復 P2，以及後續幾何保鏈問題均已核對解決：

- `locate()` 每次 `refresh()` 後重新檢查 signal、context 與 epoch，再決定是否重新捲動，取消或版本重置不再穿過這個寫入邊界。
- 返回位置的最後 offset 調整採最多 3 次寫入、2,400 ms settle bound；在 SHA-256 驗證的 await 後重新取得 connected 的精確 ID／role／text 節點，再首次寫入。缺掛載、node identity 或 root 變更、offset 超過 24 px 或 top 變動超過 2 px 會重置穩定計時，持續 600 ms 才報恢復成功；poll 的 refresh 後同樣重查取消、context／epoch。
- 當 global order 尚未確認，height caller 用實際 DOM user order 收集局部 span；當 global order 已確認，改用 cache order，只有全局相鄰且同窗存在的 endpoints 可更新 span。這避免正常卸載形成的 gappy `8→16` 覆寫已實測 `8→9`，estimate 仍逐當前 cached successor 核對。末輪 MECH-05 的 `measured-turn-spans` 斷言實際通過。

在本次限定 wrong-highlight、unknown-coverage、取消、geometry 與 root 的審查範圍內，未發現仍未解決的 P1／P2。精確 ID、role／正文、答案版本、context／epoch、connected／viewport 驗證仍保留。頁首見證及掃描完成均不提升為完整歷史。

## Bundle 歸屬與限制

全部 native 測試前、後直接計算的正式 `dist/firefox/content.js` SHA-256 相同：

**4e74710ce1c34f69313886eb6973612b3ed183c0f1e9262e3f820339e84f492b**

測試前、三次 fixture build 輸出與最後直接計算的 `dist/fixture/content.js` 均相同：

**2675b598be58e8c4d954bdf622b1b08f8a41a03511bf8317931496afb2b42098**

三份獨立 JSON 的 build-info 亦記錄該 fixture hash、fixture=true 及 revision=`2026-10-05-r2`。正式與 fixture bundle 不混用。本代理沒有重建正式 bundle、執行正式 lint、簽章或包裝，不把主代理的建置結果列為自己的測試。

本輪支持固定候選的本機行為。真實 Firefox chatgpt.com 完整 addon、實際對話的動態 root／高度／閱讀錨定、編輯／重新生成／分支、首中尾定位與返回仍需 LIVE 結果。網站從未掛載的提問不能由已見快取保證收齊；到頁首、自然掃描結束、期限／步數／無進展停止均不證明完整歷史。
