# v0.3.1 r3 固定來源獨立驗收

日期：2026-10-05（Asia/Taipei）。執行者：獨立驗收 sub-agent。固定產品來源 `535a4ffe0fbde463b97c687e4e8dab93f7814bf0`，版本 `0.3.1`、revision `2026-10-05-r3`。本報告只記錄本 agent 親自執行的固定來源檢查、核心測試與隔離 Firefox localhost 案例；不將父端測試或真實 IAB 觀察列為本 agent 的 PASS。

## 固定快照與環境

以 `git archive 535a4ffe0fbde463b97c687e4e8dab93f7814bf0 --format=tar --output=artifacts/independent-anchor-535a4ff.tar` 保存固定來源，再以 `tar -xf` 展開至 `artifacts/independent-anchor-535a4ff-source`。沒有透過 PowerShell binary pipe，也沒有修改 snapshot source 或依賴。使用祖先 repository 已鎖定的 node_modules；所有測試、fixture 建置及 Firefox profile 由獨立 snapshot 工作目錄執行，沒有覆寫父端 dist。

- Windows；Node.js `24.12.0`、TypeScript `7.0.2`、Firefox `157.0`、geckodriver `0.37.1`。
- archive 的 99 個 tracked files 與原 checkout 比較，僅 CRLF/LF byte 差異；正規化換行後差異為 0。測試前、後原 repository HEAD 都為上述固定 SHA，執行測試後 `git status --short` 無變更。本文件新增在上述檢查之後。
- Firefox 使用 headless 隔離 profile、實際 MV3 fixture addon 與 localhost synthetic conversation，不讀取或操作使用者瀏覽器、登入帳號或真實 ChatGPT 對話。
- 初次 sandbox fixture 建置因 esbuild 掃描祖先目錄遭 Access denied 而停止，尚未啟動 Firefox；獲准於隔離 snapshot 升權後重新建置及執行，下表為實際完成結果。typecheck 首次 launcher 誤用舊 `tsc.js` 路徑，修正為鎖定套件的 `bin/tsc` 後成功；不是產品測試失敗。

## 親自執行結果

| 案例 | 結果 | 實際證據 |
|---|---|---|
| TypeScript typecheck | PASS | snapshot 中 `node ../../node_modules/typescript/bin/tsc --noEmit`，exit 0 |
| 核心 | PASS 28/28 | `node --test tests/core.test.mjs`；包含 collection 300000 ms/2400 steps、seek 60000 ms/60 steps 與取消／deadline 邊界 |
| 幾何 | PASS 9/9 | `node --test tests/geometry.test.mjs`；保留為 geometry 元件回歸，不表示 r3 使用估算座標導航 |
| ANCHOR-01 冷尾窗口 | PASS | 起始 7 題，實際窗口 `23,19,15,11,7,3,0,4,8,12,16,20,24,25`；精確保留全部 30 ID、順序一致，12.094 秒 |
| ANCHOR-02 已見離屏雙向導航 | PASS | 目標 `anchor:u-3`、`anchor:u-24` 都重新掛載並精確高亮；合計 5.028 秒 |
| ANCHOR-03 冷中窗口＋保留尾端 | PASS | 起始窗口 12–16＋保留尾端 28/29，逐窗口覆蓋未知中段，精確 30 題，10.789 秒；沒有跨 disjoint pinned tail 跳轉 |
| ANCHOR-04 renderer 不前進 | PASS | freeze 後保留原 7 題，6.818 秒有限停止為 idle；提示「兩端連續未觀察到進展。完整歷史尚未核對」 |
| ANCHOR-05 中途取消 | PASS | cancelled 後等待，無新增 root scroll event、位置變化或高亮；已看到的 11 題保留 |

新 fixture 使用實際 `content-visibility:auto` 外層 turn shell、長回答與非捲動外層 marker；renderer 只在外 shell 邊緣實際抵達 conversation viewport 時掛載下一個有重疊的窗口。這使直接到 scrollbar 頂端無法跳過尚未掛載的邊緣。沒有覆寫 page prototype 來假裝攔到 addon method，避免 Firefox content-script Xray 隔離造成誤判。結果 JSON 的 `nativeShellCalls`／`outerCalls`／`lateAnchorCalls` 歷史欄名實際表示幾何邊緣抵達觀測，不能當成對 native API 呼叫的攔截紀錄。

## 可核對 hash 與證據

SHA-256：

| 檔案 | hash |
|---|---|
| 固定 git archive tar | `b3b1e0a2b2448a30af8f13111ad6511a9fb2f3fd07cce98a3b9c750dc84dec66` |
| snapshot tests/firefox-anchor-walk.mjs（canonical LF） | `5285dfab6e84b2e730e8b8d17ea28dd139908d34402afb0d95381f7e2fd24786` |
| fixture content.js | `974bcf84877947f9d0a36484c5387f1e71617d69134c5ae2e2586df64c82dfed` |
| fixture background.js | `8081a2f22c734deba874c64b5d68ac5e07814eac29efb4cc1a26e7a4e01bb7ff` |
| fixture manifest.json | `9796621f5f92d9f5bd21be044ccac59f0cb88df18c78a4db72ad411a66505dbf` |
| 獨立 results.json | `8915016a02f95fe2675b62a6ae0ea7fda53fe9ad88fa8659f235a6c3f80d7237` |
| 獨立 fixture build-info.json | `df4154514c8b4e0ed15e1585a12343fef530f23881571afc252ab6ed38f0b9c4` |

獨立原始结果與 screenshot：`artifacts/independent-anchor-535a4ff-results/results.json`、`anchor-collected-thirty.png`。固定建置 metadata：`artifacts/independent-anchor-535a4ff-source/dist/fixture/build-info.json`。以上 artifacts 保留在工作目錄，沒有把 profile、真實訊息或依賴納入 Git。

結案時主代理核對獨立results hash與fixture hash後，收進Git的[獨立結果副本](evidence/anchor-walk-2026-10-05/independent-anchor.json)；[證據範圍](evidence/anchor-walk-2026-10-05/README.md)列出父端與獨立執行歸屬，GitHub讀者可使用這些副本。

## 範圍與剩餘門檻

本次獨立固定來源核心 28、幾何 9、新 anchor native 5 全部 PASS；未見阻擋此 localhost anchor traversal 合同的 P1。對 frontier 連續窗口、slot stride、adjacent pair/global successor 再核對、epoch/dispose 清理及取消前 context/epoch 檢查作唯讀審查。

兩端無進展仍不能證明完整歷史。實际超大型 session、不同 lazy renderer、真實 Firefox ChatGPT 全 addon 的固定全集／分支、十個離屏目標與 offset 返回仍未由本 agent 驗收，維持 PENDING；本報告不宣稱使用者問題已解決或正式 LIVE PASS。父端既有 native regression suite、正式 package/XPI hash 與其親自取得的真實 IAB 證據另行記錄。
