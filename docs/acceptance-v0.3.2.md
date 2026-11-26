# v0.3.2 固定來源獨立驗收

本驗收從 runtime commit `2c9d0d2aa9f95336c449981d58d4360bc7d16d3f` 的 Git archive 展開獨立來源，未修改產品來源，未 commit。版本為 `0.3.2`，revision 為 `2026-10-07-v032`。

## 來源與產物

- Archive：`artifacts/independent-v032/source.tar`。
- Archive SHA-256：`7ba6d30cb5993a85715f8c71508d94c93be8eed4201b06f6729afb982e88cc57`。
- 以 `git get-tar-commit-id` 驗證 archive 的完整來源 SHA；136 個 tracked files 與該 commit 的 Git blob 逐位元一致。
- 獨立建置目錄：`artifacts/independent-v032/source/dist/firefox` 與 `artifacts/independent-v032/source/dist/fixture`。
- 正式與 fixture 各 6 個產物的 SHA-256 都與主工作區最後 `dist` 一致，合計 12/12。亦驗證各自 `build-info.json` 所記載的 hash 與實際檔案一致。
- 原始命令、工作目錄、exit code、輸出與完整 hash：`artifacts/independent-v032/results.json`；逐來源檔案驗證：`artifacts/independent-v032/verification.json`。

## 實際執行結果

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | PASS，exit 0 |
| core / geometry / interaction / collection-policy / persistence / background | 74 PASS，0 fail / cancelled / skipped，exit 0 |
| 正式版 build | PASS，exit 0 |
| fixture build | PASS，exit 0 |
| 正式版 web-ext lint | 0 errors / notices / warnings，exit 0 |
| fixture web-ext lint | 0 errors / notices / warnings，exit 0 |
| 來源 blob 一致性 | 136/136 |
| 與主工作區建置產物一致性 | 12/12 |

使用既有 ancestor `node_modules`，未安裝相依套件。兩次 lint 的驗證本身成功；web-ext 在驗證後另印出 updater 無法存取本機設定的訊息，原樣保存在 raw output，未提升權限修正。

最初 Windows Git archive 受 `core.autocrlf=true` 影響，文字檔轉成 CRLF，因此第一次逐位元來源比對 exit 1。重新以 `git -c core.autocrlf=false archive` 匯出同一完整 SHA 後，全數來源 byte 比對通過，再執行上述型別、74 tests、兩組 build/lint；初次失敗與修正後的 raw output 均保留。

## 驗收邊界與工作區差異

本 verifier **未啟動 Firefox，未執行 native Firefox 或 LIVE ChatGPT 測試**。單元測試包含 synthetic/mock 以及既存匿名化資料的本機 replay；這不代表本次已在真實 ChatGPT 網站驗證。父端另行執行的 native 證據應由父端文件記載，不列為本 verifier 的實測結果。未執行 GCM、Git 網路操作或權限提升。

最後來源比對時，主工作區對固定 runtime commit 的 tracked 差異僅為 `package.json` 新增 `test:background` 執行入口、`tests/firefox-v032.mjs` 新增未知分支 native 測試；均屬 test setup。`src/`、manifest 與建置來源未變，本 verifier 新增的文件僅本頁。
