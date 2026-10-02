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

## 2026-10-02 19:13：Firefox 可操作原型快照

- 分支：feat/firefox-prototype；索引核心、Shadow DOM 目錄、搜尋、定位／高亮、返回、有限載入／取消、頁面與分支失效、設定頁與背景清理已實作。
- Typecheck／正式 build／web-ext 零警告 lint／12 個核心回歸均 PASS；原生 Firefox 157.0 實際工具列注入合成頁面，7 組主要流程 PASS。
- 原生合成 FF-02：20/20 目標精準且可見，0失敗；定位20次p95 147.75ms，返回同一u-6錨點最大偏移0px。
- FF-04：搜尋、同文字不同ID、HTML文字、键盤、深淺色、500px實際窄視窗 PASS。初次窄視窗產品溢出 FAIL，調整寬度後重跑上述關聯案例 PASS；未隱藏該次失敗。
- 早期fixture腳本的 WebDriver clear 不觸發input、JS字串與ShadowRoot Promise呼叫錯誤，保留run1–3失敗資料後修正測試呼叫，未改固定20目標或通過門檻。
- FF-03：合成虛擬化收錄20、停止後無晚到捲動、branch／SPA失效 PASS；不標記完整。真實ChatGPT不採用合成分支信號。
- FF-01：實際按鈕啟動／重複一個根節點／停用後觀察器不重新啟動／重新注入 PASS。
- FF-05：原生選用權限 grant／deny／revoke／reload／背景喚醒仍 PENDING，下一組測試補齊。LIVE-01–07／REL-01 PENDING。
- sub-agent 已獨立指出核心單批逾時signal與舊promise返回結果缺陷，已修正並加入第12個測試；本快照將交固定SHA重新驗收。
- 本組立即 commit／push 並核對SHA；node_modules、build、測試profile與原始artifact均忽略，使用者交付包另放outputs。

## 2026-10-02 19:27：SPA 更新修正與原生權限回歸

- sub-agent 在 fc02d697 固定快照獨立重建：typecheck／build／lint、核心12/12與原生主要7組 PASS；獨立20次定位p95 351.42ms，返回最大偏移0px。額外邊界probe為2 PASS、1 FAIL：對話切換取消刷新計時器後未清除handle，新訊息不再更新。
- 已修正該handle，新增 FF-03 pending-refresh-route 原生案例：切換後目錄20→21，PASS。修正後主要8組全PASS；20次定位p95 212.71ms，0失敗，返回0px。
- FF-05 原生5組PASS：直接點Firefox權限拒絕／允許、重新載入自動注入、背景 stopped→runtime訊息→running且設定與註冊保留、撤銷後兩個無activeTab頁面立即清理、未知／額外訊息欄位拒絕。
- 權限測試早期Chrome上下文shadow API／moz-button scroll錯誤是測試操作FAIL；改為真實WebDriver指標點擊可見按鈕中心後通過，未以預先授權替代原生權限視窗。失敗artifact保留。
- 背景測試使用Firefox自身測試用terminateBackground，僅作用隔離profile本附加元件；自然閒置與整個Firefox重啟仍未驗證。
- 已支援TOC_TEST_EXECUTOR，獨立測試結果不再固定標為primary-agent。
- 本組修正／測試完成後立即commit、push、核對遠端SHA，交sub-agent固定新快照。LIVE-01–07／REL-01保持PENDING。
