# v0.3.1 r5 固定來源獨立驗收

2026-10-06（Asia/Taipei），由獨立驗收 sub-agent 執行。固定本機來源 `992757435d30459be80586ee4e2682a3abc99f39`，版本 `0.3.1`、revision `2026-10-06-r5`。

本 agent 親自完成 default sandbox 的 typecheck、核心 28/28、幾何 9/9、正式／fixture 建置、正式 lint 及兩組各六個實際檔案 hash 核對，全部 PASS。最新 Firefox native UI 7 項為 **PENDING（環境阻礙）**，不是 PASS；沒有沿用 r4 的 UI 結果。

## 固定快照與執行範圍

以本機 `git archive --format=tar --output=artifacts/independent-r5-9927574/source.tar 992757435d30459be80586ee4e2682a3abc99f39` 保存固定來源，再以 `tar -xf` 展開到 `artifacts/independent-r5-9927574/source`。沒有使用 PowerShell binary pipe，也沒有執行網路 Git 操作。

所有驗收以 snapshot 為 cwd，使用祖先 repository 已鎖定 node_modules，產物寫入 snapshot 自己的 `dist/firefox`／`dist/fixture`，不修改主工作目錄產物、source、tests、依賴或 Git history。本輪沒有啟動 Firefox、GCM 或其他 runner，也沒有呼叫 `require_escalated`。環境為 Windows、Node.js `24.12.0`、TypeScript `7.0.2`。

以 Node 檔案讀取比較固定快照與原 checkout，123 個 tracked files 在 CRLF/LF 正規化後差異為 0。驗收前、後 HEAD 都為上述來源，產品相關 `src`、`package.json`、`manifests`、`tests`、`scripts` diff 為空。本文在驗收完成後新增。

## 最新功能規則的唯讀核查

- 右側 rail 開啟／收合都依當前 `store.mounted` 的原始 DOM 順序，從當前 generation 的 entry 中取 `adapter.canLocate` 成立者。**沒有固定五格上限或歷史快取抽樣**：目前可定位掛載 6 題即 6 格，空窗口即 0 格。
- `canLocate` 仍核對 stable ID、當前 route、connected node、user role 與已保留正文；未識別提問不進 rail。文字列表仍使用全快取 `store.search`，保留搜尋與離屏導航；rail 不受搜尋 query 篩選。
- `Shift+O` 由已啟用 content instance 的 document keydown 處理，只開啟及聚焦搜尋，不切換收合。未啟用／已 dispose 的頁面沒有這個 listener；原 manifest `_execute_action` 的 `Alt+Shift+O` 啟動備援保持。
- handler 在真正開啟之前排除 input、textarea、select、contenteditable、role token textbox／combobox，使用 composedPath 支援祖先及 open shadow editor；也排除 Ctrl／Alt／Meta、repeat、isComposing、IME 229、已 preventDefault 事件。Esc 原本的 shadow handler 保留。
- `events.abort()` 在 dispose 移除快捷鍵 listener。list 與 rail 使用不同資料範圍，沒有因為掛載卸載而縮減已看過全文目錄。
- 新 build plugin 僅解析 local TypeScript，posix normalize 後要求 `src/`，由 Node 讀取 workspace source、用當前 tsconfigRaw 編譯。此為檔案解析修改，沒有修改 Firefox sandbox／profile 或繞過瀏覽器程序隔離。新 namespace 會改變 bundle module 標記，因此不沿用 r4 的建置 hash。

上述是來源核查，**不是原生鍵盤／UI 動作的實測 PASS**。尚未證明 closed shadow editor 的所有輸入情境；composedPath 無法取得 closed shadow 內部節點。真實 ChatGPT 的渲染與快捷鍵互動仍待驗證。

## 親自執行結果

| 檢查 | 指令／實際結果 | 狀態 |
|---|---|---|
| TypeScript | `node ../../../node_modules/typescript/bin/tsc --noEmit`，exit 0 | PASS |
| 核心 | `node --test tests/core.test.mjs`，28 tests／28 pass／0 fail | PASS |
| 幾何 | `node --test tests/geometry.test.mjs`，9 tests／9 pass／0 fail | PASS |
| 正式 build | `node scripts/build.mjs`，default sandbox exit 0 | PASS |
| Fixture build | `node scripts/build.mjs --fixture`，default sandbox exit 0 | PASS |
| 正式 lint | `node ../../../node_modules/web-ext/bin/web-ext.js lint --source-dir dist/firefox --warnings-as-errors`；0 errors／0 warnings／0 notices，exit 0 | PASS |
| 實際檔案 hash | 正式 6／fixture 6 逐一計算 SHA-256，與各自 build-info 相符；兩個 content 均匹配指定固定值 | PASS |
| 最新 native UI | 最新 7 項沒有由本 agent 執行；不能用 core/build/hash 代替 | PENDING |

lint 完成後有附帶 `web-ext update check failed`／本機 update config store 存取提示；沒有把它當成驗證 warning，沒有依提示升權、改設定或重試。原始 stdout 與各指令 exit code 已保存。

## 產物 SHA-256

| 檔案 | 正式 Firefox | Localhost fixture |
|---|---|---|
| background.js | `cea06bc4c27a2fd0a93c3835f4ff0e992f42776c1f5dd09eaa5fae209e2ed4ff` | `07eae504d50a8ca596b840d6ebceab8b19eed271c1d09cf76c9603d44198e149` |
| content.js | `e3e54d445b2789bbd3be31c4e2f7e64e680dd4a802a5e89d9f5712dcdb2a7df9` | `48a3ac02cfd1d8151084e3a1c24208d0a4893c8028474806b2a8211a586916d1` |
| options.js | `4e94acce189adb4caafac6c34979f9afe005149e6485d87e1175f5a113b112d8` | `516b2d6bdd051df9ad32b887b04b87576f4d471239a1c92b8fbcb3ac44f02b5d` |
| options.html | `163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf` | `163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf` |
| host.css | `bcf154a2a27fb819ab5c8aee1a315fc2799f949b24d68d8a199d8f05ca4e3f52` | `bcf154a2a27fb819ab5c8aee1a315fc2799f949b24d68d8a199d8f05ca4e3f52` |
| manifest.json | `9ff5ae7e1f2f97c05716e0e1ee8444e73f29ea978b602fe7d4d376d077678307` | `9796621f5f92d9f5bd21be044ccac59f0cb88df18c78a4db72ad411a66505dbf` |

固定 archive SHA-256：`36c684cd1b599cc3cbe7a8c6826b995ea4ebcf00f8b3b65595738f3b33ed8f68`。

獨立原始 stdout／exit code：`artifacts/independent-r5-9927574/static-results.json`，SHA-256 `0808f3e4fa3ee8336204c15017fe3ec809c62d6a0b7cea113bd828c910826af3`。固定來源及兩組建置 metadata 在同目錄的 `source/`、`source/dist/firefox/build-info.json`、`source/dist/fixture/build-info.json`；沒有本 agent 本輪產生的 Firefox screenshot。

## 原生驗收環境與剩餘狀態

父端回報 default sandbox 可啟動 Firefox parent，但 tab 子程序在 `SB::LA::SpawnTarget` 階段失敗，導致 `NoSuchWindow`；`require_escalated` 亦被 `Granular sandbox_approval=false` 明確拒絕。本 agent 遵守停止範圍，沒有重試沙箱外、其他 runner 或瀏覽器程序。**UI 7 項維持 PENDING，阻礙是執行環境，而非已取得功能通過結果。**

父端 IAB localhost＋runtime shim 的操作屬另一種環境，本 agent 沒有執行或核對，不將它列為自己的 PASS，也不能當成 Firefox addon UI 7 的替代。雲端同步狀態由父端另文記錄，本報告只核對本機固定來源，不表示這個 local commit 已同步遠端。

本輪未重新驗收 collection boundary／anchor／mechanism／speed／cache 原生 suite。r4 的舊 PASS 是歷史記錄，不是 r5 產品驗收。真實 Firefox ChatGPT 全 addon、完整對話集合／分支、所有離屏及鍵盤場景仍為 PENDING；目前只可交付誠實標示範圍的候選修正。
