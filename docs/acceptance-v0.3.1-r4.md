# v0.3.1 r4 固定來源獨立驗收

2026-10-06（Asia/Taipei），由獨立驗收 sub-agent 執行。固定產品來源為 `8f2daab1536ad9e30abc74479a8dfa3854766d57`，版本 `0.3.1`、revision `2026-10-06-r4`。

親自執行結果：typecheck、核心 28/28、幾何 9/9、Firefox 收集邊界 5/5、Firefox compact UI 4/4、正式建置與 lint 全部 PASS。這些是隔離 Firefox native localhost 結果，不是登入 ChatGPT 的 LIVE 驗收，也不代表所有真實站點場景已解決。

## 固定快照及隔離方式

以 `git archive --format=tar --output=artifacts/independent-r4-8f2daab/source.tar 8f2daab1536ad9e30abc74479a8dfa3854766d57` 建立固定快照，再用 `tar -xf` 展開至 `artifacts/independent-r4-8f2daab/source`，沒有使用 PowerShell binary pipe。

所有編譯／測試以 snapshot 為 cwd，使用祖先 repository 的鎖定 node_modules，建置寫入 snapshot 自己的 `dist/firefox`／`dist/fixture`。Firefox 使用 headless 隔離 profile、localhost fixture addon，不讀取或操作使用者瀏覽器、帳號或真實對話。boundary 與 UI suite 依序執行，避免 fixture 產物重建競態；未修改 source、tests、依賴或 Git history。

環境：Windows、Node.js `24.12.0`、TypeScript `7.0.2`、Firefox `157.0`、geckodriver `0.37.1`。建置、lint、隔離 Firefox 使用系統核准的 sandbox escalation，沒有遇到 approval rejection。

以 Node 檔案讀取比較原 checkout 與固定 snapshot，110 個 tracked files 在 CRLF/LF 正規化後差異為 0。PowerShell 方法呼叫比較最初受 constrained language mode 限制，未採用其結果，改由 Node 成功核對。測試前、後 HEAD 均為上述固定 SHA，產品相關 `src`、`package.json`、`manifests`、`tests`、`scripts` diff 為空。本報告在測試完成後才新增。

## 收集邊界驗收

測試：`tests/firefox-collection-boundary.mjs`。fixture 用原生 outer-shell 幾何邊緣抵達 viewport 觸發重疊窗口，沒有 page prototype hook；重複觀測不會重設已發出的延遲 renderer response。pinned tail 被刻意留在未知中段之後。

| 案例 | 實際結果 | 狀態 |
|---|---|---|
| BOUNDARY-01 第二次 older 掛載延遲 5 秒 | 實際延遲 5004 ms；精確 30 ID／順序；首個 newer 在 window 0 實際掛載之後，且距 root 0 clamp 6135 ms。總案例 22539 ms | PASS |
| BOUNDARY-02 中段 freeze | 保留原 7 題；root 上方仍有 58057 px；19845 ms 有限停止為 idle；newer 邊緣觀測 0，沒有自動反向。提示未觀察到進展／完整歷史尚未核對 | PASS |
| BOUNDARY-03 loading／slot／root／高度／viewport 改變 | 實際依序插入 placeholder、重編 slot、更換 root、改變／恢復高度、移除 loading、平移／恢復 viewport；最後變動後再 6570 ms 才 newer；精確 30 題。總案例 21843 ms | PASS |
| BOUNDARY-04 延遲 response 中取消 | cancelled 後 renderer response 確實晚到，但新增 root scroll event／邊緣觀測／高亮均為 0，位置不變；保留已看到的 15 題。總案例 6760 ms | PASS |
| BOUNDARY-05 單獨 viewport 位移 | IDs、root、outer node、extent 不變；僅在 5700 ms 平移 8 px、6100 ms 恢復，恢復後再 6649 ms 才 newer；精確 30 題。總案例 21993 ms | PASS |

第 5 案例刻意隔離幾何變動：只用 aggregate loading/root 案例會因下一個 load 自然重計六秒而掩蓋漏掉 viewport geometry key 的問題。新案例直接驗證邊界證據不能跨過單獨幾何變動延續。

上述成功完整巡覽樣本都檢查實際 window 0、physical root clamp、後續反向時間、相鄰窗口重疊與精確全集合；沒有把 scrollbar 像素變化或 scroll event 當成新訊息進展，也沒有用保留尾端跳過未知中段。取消案例允許此前已發出的 renderer response 正常掛載，驗證的是 addon 不再捲動或高亮。

## UI、核心及建置

| 檢查 | 實際結果 |
|---|---|
| typecheck | `node ../../../node_modules/typescript/bin/tsc --noEmit`，exit 0 |
| 核心 | `node --test tests/core.test.mjs`，28/28 PASS；包含 collection／seek 個別 deadline、取消及有限無進展停止 |
| 幾何 | `node --test tests/geometry.test.mjs`，9/9 PASS；為 geometry 元件回歸，沒有表示 r4 以舊座標猜導航 |
| UI-01 | 提問 0／1／5／6／120 時，collapsed marks 為 0／1／5／5／5；120 題仍全部在目錄，rail 高度固定 137 px |
| UI-02 | 展開恢復 120 marks，收合回 5；反覆兩次不丟失任何提問 |
| UI-03 | writing mode 為 `horizontal-tb`；淺色、深色、窄視窗皆通過；500 px viewport 的 panel 左／右為 28.87／432.87 px |
| UI-04 | 收合抽樣 mark 可定位精確 `ui:120:u-60`，保留完整 120 題 |
| 正式 build | snapshot `node scripts/build.mjs`，PASS |
| 正式 lint | `node ../../../node_modules/web-ext/bin/web-ext.js lint --source-dir dist/firefox --warnings-as-errors`；0 errors／0 warnings／0 notices |

親自檢視獨立產生的 `collapsed-120-light.png` 與 `expanded-120-dark-narrow.png`：目錄兩字橫排、收合五個標記、深色面板及列背景為中性灰階，窄視窗沒有裁切面板。焦點／目前項目的 indigo accent 仍保留（light `#6366f1`、dark `#a5b4fc`），沒有將介面描述為完全無彩色。

## 產物 hash 與證據

六個正式／fixture 實際檔案都逐一計算 SHA-256，與各自 `build-info.json` 的六個 hash 相符。fixture content 也與父端提供的固定值一致。

| 檔案 | 正式 Firefox SHA-256 | localhost fixture SHA-256 |
|---|---|---|
| background.js | `bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977` | `8081a2f22c734deba874c64b5d68ac5e07814eac29efb4cc1a26e7a4e01bb7ff` |
| content.js | `875412c5be1497639c43ed650c63fdf184fc89fa925ce93ba5c4ebfb7ac9b32e` | `78506c23baa39469da1b73214001b8c418f47c3e56c58fb48ece825b2c668f70` |
| options.js | `a986be9a94429358b8a9fd6871e3ab0672cc75fdb1c020cdd1878f8076350ad4` | `febbd740915f6b41763d8549492ccb5177796dff2d6cf3477e3f2e021e419443` |
| options.html | `163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf` | `163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf` |
| host.css | `bcf154a2a27fb819ab5c8aee1a315fc2799f949b24d68d8a199d8f05ca4e3f52` | `bcf154a2a27fb819ab5c8aee1a315fc2799f949b24d68d8a199d8f05ca4e3f52` |
| manifest.json | `9ff5ae7e1f2f97c05716e0e1ee8444e73f29ea978b602fe7d4d376d077678307` | `9796621f5f92d9f5bd21be044ccac59f0cb88df18c78a4db72ad411a66505dbf` |

固定 archive SHA-256：`c3d0508fca3d5bb2888cf9e00edc0ad59c9cf668c13ae5bd2151c1e996d515d0`。

| 證據檔案 | SHA-256 |
|---|---|
| boundary/results.json | `9477b2446dc2065d2aab980acbcc7b8ca98f19ed98fb2127aa428ddd8fc6d441` |
| compact-ui/results.json | `2acdf44c1dbf3527c3bdd3ff17e7fe8577e706c0a773b318da89b6489fce030b` |
| source/dist/firefox/build-info.json | `ed63165dc0d9bdff2ec1ff7d5bd8811ff73f6a0e325c4481f94ed42d7f05a929` |
| source/dist/fixture/build-info.json | `6d4656b8e0b0cf702b0fe814da0130beed8ca60e1e42b1a3805c3a12eacc7c59` |

隔離證據保留於 `artifacts/independent-r4-8f2daab/`：

- `boundary/results.json`、`boundary/delayed-older-thirty.png`。
- `compact-ui/results.json`、`compact-ui/collapsed-120-light.png`、`compact-ui/collapsed-120-dark.png`、`compact-ui/expanded-120-light.png`、`compact-ui/expanded-120-dark-narrow.png`。
- `source/dist/firefox/build-info.json`、`source/dist/fixture/build-info.json`。
- `source.tar` 及未修改的固定來源 `source/`。

## 仍待驗證的範圍

本 agent 未執行父端的 anchor／mechanism／speed／cache 回歸，不將其結果列為自己的 PASS。真實 Firefox ChatGPT 全 addon 的固定全集／分支、所有 renderer、十個離屏目標、offset 返回及長 session 仍須分別驗收，維持 PENDING。物理可捲邊界加穩定等待不是整個對話完整性的證明。

已向父端提出的 P2 header/padding 限制仍未擴充：若第一個 live shell 上方非訊息留白大於 0.45 viewport，固定邊緣 nudge 可能反覆停在仍大於 0 的 root 位置，最終保守 idle 而不能自動巡覽後段。本輪將 mid-stall 和邊界區分，不能因此宣稱使用者真實站點所有場景已解決。
