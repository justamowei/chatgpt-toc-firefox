# 開發與 Git 同步紀錄

時間皆為 Asia/Taipei。

## 2026-10-02 18:30：建立版本管理

- 使用者授權：建立 GitHub 私人儲存庫，帳號 `justamowei`，專案名稱 `chatgpt-toc-firefox`。
- 功能開發：維持暫停；本輪僅建立 Git／雲端與更新文件。
- `main`：專案設定、依賴鎖檔、manifest、規格與進度文件的初始快照；來源核心與背景程式另外保存於開發分支。
- `feat/firefox-prototype`：保存暫停前的 `src/core.ts` 與 `src/background.ts` WIP。
- 測試：本輪檢查 Git 排除規則、文件與檔案範圍；功能測試未執行，未宣稱程式通過驗收。
- 建置／導航 UI／DOM adapter／測試腳本仍未完成。
- commit SHA 與遠端 SHA：首次提交及 push 後追加核對結果。
- 雲端：建立與首次推送進行中；完成核對前 GIT-00 維持 PENDING。
- 下一步：確認私人狀態與兩分支 SHA，再等待使用者恢復功能開發。

## 2026-10-02 18:35：首次雲端同步完成

儲存庫：https://github.com/justamowei/chatgpt-toc-firefox  
GitHub visibility：private；預設分支 main。origin 使用無內嵌憑證的 HTTPS URL。

| 分支 | 本機 commit SHA | 核對的遠端 SHA | 結果 |
|---|---|---|---|
| main（初始基線） | bdfb2e00a99964407b945067355f807585558db1 | bdfb2e00a99964407b945067355f807585558db1 | push PASS、upstream 已設定 |
| feat/firefox-prototype（WIP） | 3c5dbac8b67ec3cb77f5f162a76b1d767c8bdd79 | 3c5dbac8b67ec3cb77f5f162a76b1d767c8bdd79 | push PASS、upstream 已設定 |

- Git 身份：沿用既有身份並固定於 repo-local config，email 為 GitHub noreply；未修改全域身份。
- GIT-01／02：PASS。已檢查獨立根目錄、排除規則、兩分支、私人 origin 與首次 SHA 一致。
- GIT-03／04：本次快照與逐次推送 PASS；後續每功能／30 分鐘節奏需在恢復開發後持續執行。
- GIT-05：PENDING。尚未交付已建置版本給 sub-agent，功能驗收仍未執行。
- Git 檢查：預期檔案清單、source diff 格式、Markdown 的既有硬換行格式、忽略規則與工作目錄檢查通過。typecheck／lint／build／功能測試均 NOT RUN。
- 首次 main push 在沙箱外因 Git 目錄由沙箱帳號建立而被 ownership 檢查攔下；以僅該命令、僅本專案路徑的 safe.directory 設定重試成功，未修改全域信任設定。
- 不使用 force-push。首次同步後沒有待推送的程式快照；本段文件將另建 docs commit 推送 main，再將該文件更新合併及推送至開發分支。
- 後續文件／合併 commit 的完整 SHA 與最後遠端核對結果記於 outputs 的《GitHub 建立結果.md》，Git log 亦可核對，避免文件把自身 commit SHA 寫成不存在的值。
- 功能開發維持暫停。下一步為等待使用者恢復開發，再依固定 commit 提供 sub-agent 驗收。

## 2026-10-02 18:45：恢復功能開發，核心第一組修正

- 分支：feat/firefox-prototype；使用者已授權恢復功能開發。
- 修正：未知分支不保留卸載歷史、增量文字更新保留其他提問、順序與明確分支失效、完整度證據撤銷、強制單批／總逾時，以及取消後丟棄晚到結果。
- 驗證：npm run typecheck PASS；npm run test:core 11/11 PASS。CORE-04 合成 1,000 提問，20 次，p95 3.05 ms，0 次失敗。
- 首次沙箱核心測試因 esbuild 父目錄讀取被拒失敗；核准環境重跑成功。這是環境限制，原失敗保留於當輪執行紀錄。
- sub-agent：對固定 0e8d6a0 快照做了獨立審查及 scratch probe；本組修正尚待新 SHA 的獨立回歸。
- 推送：本組完成後立即 commit／push 並比對遠端 SHA，確切 SHA 以 Git log 與雲端紀錄核對。
- 下一步：Firefox 建置、DOM adapter、Shadow DOM 目錄、選用權限設定與原生附加元件 fixture。LIVE／REL 保持 PENDING。
