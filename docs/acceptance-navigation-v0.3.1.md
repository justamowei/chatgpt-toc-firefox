# v0.3.1 收集與離屏導航：獨立本機驗收

2026-10-04（Asia/Taipei）。使用者指定 GPT-6.1 Sol high 獨立驗收，執行者 `/root/cache_candidate_acceptance`。固定來源：**f9974ec368d81e4a25cc9e2583ebf6e55dbcb63d**。

**獨立 typecheck、核心 22／22、原生 Firefox 速度 4／4、快取 8／8 通過。** 本次執行的是隔離 profile 的 headless Firefox 157.0、localhost 合成頁；沒有在真實 ChatGPT 網站執行 addon，沒有操作使用者 profile／帳號。使用者回報已見資料快取正常，與本輪新速度功能的 LIVE 驗證分開；下列時間不能當作真網站性能承諾。

## 實際執行與來源核對

原生測試開始前與全部完成後，以下命令皆無 source／test 差異，exit 0：

`git diff --exit-code f9974ec368d81e4a25cc9e2583ebf6e55dbcb63d -- src tests scripts package.json package-lock.json manifests`

本代理沒有修改 runtime、test、Git 或 v0.3.0 的歷史報告；tracked 變更僅本文件。測試重建 ignored fixture dist、產生 ignored artifacts，並使用隔離測試工作資料。兩個 Firefox suite 依序執行，前一個關閉後才啟動下一個，未與主代理 build／Firefox 並行。重建與 headless helper 經批准執行，沒有把未執行案例寫成 PASS。

| 本代理實際執行 | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:core` | 22／22 PASS，0 fail／skip，exit 0 |
| `node tests/firefox-navigation-speed.mjs` | SPEED-01–04 PASS，exit 0 |
| `node tests/firefox-seen-cache.mjs` | CACHE-01–08 PASS，exit 0 |

兩個原生命令均指定 `TOC_TEST_EXECUTOR=GPT-6.1 Sol high independent /root/cache_candidate_acceptance`。原始產物目錄為 `artifacts/independent-navigation-speed-f9974ec` 與 `artifacts/independent-seen-cache-f9974ec`；主代理另保存以下證據，本代理已核對兩份副本 SHA-256 與原始 JSON 各自相同：

- [獨立速度 JSON](evidence/navigation-speed-2026-10-04/independent-speed.json)，timestamp `2026-10-04T15:34:53.770Z`。
- [獨立快取 JSON](evidence/navigation-speed-2026-10-04/independent-cache.json)，timestamp `2026-10-04T15:35:45.244Z`。

這些是本代理產生的獨立結果，沒有借用主代理的數字。JSON 所記 source 分別為 localhost synthetic virtual renderer，以及真實 IAB 快照在 localhost 重建；後者明示 `liveChatGptAddon=false`。本輪沒有重新擷取 IAB DOM。

## 獨立速度結果

| 案例 | 真正核對的條件 | 本代理結果 |
|---|---|---|
| SPEED-01 | 從頁尾 4 則收集；40 則確定預期 ID 全部有序；長答案約 60,000 px；每次捲動先清空窗口，500 ms 後掛載 | 40／40，**31,192 ms、43 次捲動**；有超過 50,000 px 的答案內跳過，順序無待核對標記 |
| SPEED-02 | 返回頁尾後選已見、離屏的 `speed:u-3`；重掛載後精確高亮 | **1,408 ms、2 次捲動**，精確 ID 命中 |
| SPEED-03 | 增加 18,000 px 幾何間隙，使既有位置提示過期，再選 `speed:u-25` | **4,256 ms、6 次捲動**，精確 ID 命中 |
| SPEED-04 | 遠距導航中停止；掛載延遲提高至 2,000 ms；再等待 2,300 ms | 保留 40 則、state=cancelled；沒有新增晚到捲動，也未高亮目標 `speed:u-1` |

fixture 的長答案是具有明確 assistant marker 的本機 DOM 節點及固定 CSS 高度，不是 60,000 字真實回答。頁面會真的卸載節點、保留尾端兩輪、設定固定座標與空掛載延遲，addon 則透過原生 Firefox 執行。這是有意針對幾何及等待流程的模型，不能代表所有真實 virtualizer 行為。

SPEED-01 在已收齊預期 40 則後由測試按「停止」；沒有把到頂或停止推論成完整歷史證明。已查看 [獨立截圖](../artifacts/independent-navigation-speed-f9974ec/collected-40.png)：合成測試頁明示「已看過 40／目前掛載 0」、歷史未完整、當前分支未完整核對與已停止導航。空窗口時目錄仍保留，但該截圖不是 ChatGPT LIVE。

## 快取回歸與核心範圍

CACHE-01–08 全部獨立通過：精確 12 IDs／全文／順序保留、slot 換號、尾窗口目前掛載 2 則時離屏搜尋與返回、短暫首次卸載及空窗口、追加編輯隔離、SPA 舊 DOM 排除、首頁首提問建立 `/c/id`、收集保留 20 則／未知順序拒絕返回／提供實際順序見證後可返回／停止保留，以及離屏答案缺提問錨點時拒絕猜測捲動。

核心 22 項另核對 stable／transient 身分、非重疊順序區段、正文與順序矛盾隔離、資料預算、精確已完成 IAB 窗口重播、取消與 supersession、async locate 總期限，以及新增的 collection 240 步／seek 60 步和 exact targetId 參數。NFKC 1,000 則搜尋 20 次的本機 p95 約 1.94 ms；不是整個 addon 或真網站性能量測。

## 唯讀實作審查與先前問題處理

- hints 只有 numeric y／extent，不保存卸載 DOM；merge 後 epoch 改變便清 hints／seek。每個新 navigate／restore 重置 seek；提示只供加速嘗試，不能直接報 located。
- 目標定位先嘗試一次依 extent 比例修正的已見座標，再依有序提問的實際 y 修正範圍。保留在畫面外的尾端提問可在其**實測座標**建立界線，不能把它的 rank 放在目前 scrollTop。這也讓空白幾何間隙中的 seek 能繼續修正，而不要求目標窗口一定已進入 viewport。
- extent 明顯改變或已觀察節點的 y 改變超過 8 px 時，丟棄舊 lower／upper 與 attempted coordinate keys；互相矛盾的界線會撤銷。數字提示仍是近似資料，不能證明所有動態版面都可一跳完成。
- 收集的快速 settle 需可見訊息見證；空掛載不因集合變化就於 240 ms 前進。seek 的 settle 可使用已掛載提問窗口作實際座標見證，這不等於證明 viewport 覆蓋或收集完整。
- 只有明確 assistant DOM body、目前已掛載且沒有其他辨識訊息與跳過區間相交，才跳過其內部長段，保留邊緣 overlap；其他情況以約 85% viewport 前進。該保守檢查不能發現解析器完全未辨識的網站新型訊息，仍需真網站回歸。
- 精確 stable ID、user role／正文、答案 role／SHA-256 版本、context／epoch、connected／viewport 的 located 核對保留。未知順序或缺答案錨點仍明確拒絕；没有按相似文字替代目標。
- collection 240／seek 60 步仍共享 60 秒總期限，batch 上限 8 秒、連續 3 次無進展會停止。核心使用 activeDeadline 分開總期限與 batch timeout，修正工作版本曾出現的 timer rounding 分類失敗；最終 22 項重跑通過。取消、切頁、停用、手動干預的 token／AbortSignal 邊界未撤除。

在本次已審查與實跑範圍內，未發現阻擋候選本機驗收的未處理 P1／P2。這不表示真網站所有 DOM／幾何變體已驗證。

## 正式與 fixture 建置歸屬

直接核對 `dist/firefox/content.js` SHA-256 為：

**1d0d8cd1ca057ca0e53ac5179c4a55e522c178d9b5e501336d967b2d4fd85e84**

與固定候選的 [source-build.json](evidence/navigation-speed-2026-10-04/source-build.json) production build-info 相同，原生測試前後皆未改變。兩次獨立 fixture 重建及 results.json 的 content hash 都為：

**1910298695341b3b6d20b17b89356a12d5c759da52a3c799c69b652cc2ef794e**

另直接核對 `dist/fixture/content.js` 相同。fixture=true、localhost permissions／branch 見證與正式 bundle 有差異，不混用雜湊或將 fixture PASS 稱為正式 host LIVE。

正式 bundle 仍為 FIXTURE=false；source imports 與 bundle 搜尋未接入 full-index／history API，沒有 backend-api、auth/session、fetch／XMLHttpRequest 路徑。browser.storage.local 僅保存 settings，沒有聊天快取持久化。本代理沒有獨立重建正式 bundle、跑 lint、簽章或包裝；主代理的正式 build／lint 結果不是本代理實跑。

## 結論與實際限制

接受最終固定 SHA 的本機速度／快取候選：獨立核心 22、原生速度 4、原生快取 8 均通過，可支持本機模型中的長答案收集、已見離屏快速嘗試、過期幾何修正與停止保留。

真實 Firefox chatgpt.com addon 的新收集／導航速度尚未由本代理 LIVE 驗收；IAB 原生 PageUp／唯讀高度研究沒有執行 addon，也不計入本輪速度 PASS。真網站實際長對話、DOM 新變體、編輯／重新生成／分支、容器及十個首中尾定位／返回仍需相應結果。自動收集只能保留網站掛載過的提問，達期限／步數／無進展也不證明完整；目前未知分支與不持久化的限制沒有改變。
