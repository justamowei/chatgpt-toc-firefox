# v0.3.1 r5：掛載目錄與 Shift + O

日期 2026-10-06，版本仍為 0.3.1，revision `2026-10-06-r5`。固定程式／測試來源 `992757435d30459be80586ee4e2682a3abc99f39`；建置修正在父 commit `f7c8c4f`。本輪最新使用者要求取代 r4 的五格抽樣規則。

## 介面規則

右側跳轉格子在展開與收合時，都只列出當前 DOM 掛載且已核對可定位的提問，依本次掛載順序顯示。六筆可定位提問顯示六格、零筆顯示零格；不加入已卸載的歷史快取，也不以固定五格抽樣代替掛載窗口。網站保留於 DOM 的尾端提問也屬於掛載資料；不等於只列出 viewport 內可見訊息。沒有穩定 ID 或正文未核對的提問不進入快捷格子。

展開文字列表與搜尋仍保留全部已收錄提問。搜尋條件不改變右側掛載格子；未掛載提問仍可透過完整列表沿原有導航流程尋找。灰白／炭灰與靛色、橫排「目錄」沿用 r4。

## 快捷鍵規則

已啟用此頁的目錄後，頁面非編輯區按 `Shift + O` 直接開啟，並聚焦搜尋欄；按鍵不是切換開關。`Esc` 在目錄內收合。一般 input、textarea、select、contenteditable 與 role textbox／combobox，以及搜尋欄內的 Shift + O，保留正常輸入。

事件檢查 composedPath 的編輯區祖先、其他修飾鍵、repeat、IME／229 與已被處理的事件，僅有效開啟時攔截按鍵。closed shadow 編輯器的内部焦點不一定可由事件路徑取得，本輪沒有宣稱其全場景已驗證。

手動模式的新分頁仍需先按附加元件按鈕啟用，或事先在設定授權自動啟用。Firefox manifest 的字母快捷鍵需主修飾鍵，不能只用 Shift，因此保留 `Alt + Shift + O` 作首次啟動備援；`Shift + O` 由已啟用頁面的事件處理。[Mozilla commands 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands)

## 已完成與待驗收

- 主流程 typecheck、核心 28、幾何 9、正式建置與 lint 通過，lint 為 0 errors／0 warnings／0 notices。web-ext 的更新設定存取提示不等於 lint 檢查失敗。
- 內建瀏覽器 localhost 實際使用固定 fixture bundle 與最小 browser.runtime shim，觀察 120 筆快取 → 六筆掛載 → 零筆 → 五筆；完整快取仍在、離屏搜尋 119 正確、掛載格子精確定位 `iab:u-24`。實際 Shift + O 開啟並聚焦搜尋、Esc 收合，input 與 contenteditable 內正常輸入 O。證據見 [本機介面紀錄](evidence/mounted-rail-2026-10-06/iab-results.json)。這不是 Firefox addon，也不是 ChatGPT LIVE。
- 固定 SHA 獨立 core／geometry／typecheck／建置／lint 與實際六檔指紋見 [獨立驗收](acceptance-v0.3.1-r5.md)。沒有將父端 IAB 動作列為獨立 agent 的 PASS。
- 原生 Firefox UI 7 項 **PENDING**。在目前 Windows 執行沙箱中，Firefox tab 子程序啟動失敗並回報 NoSuchWindow。沙箱外測試被 `sandbox_approval=false` 政策拒絕；沒有降低 Firefox 隔離設定、重試相同升權或改用其他 runner 繞過。

Windows esbuild 父層目錄掃描被限制，因此建置改用 Node 讀取專案 src 內 TypeScript，拒絕非本地或越界 runtime import。沒有變更瀏覽器的安全設定。不同 namespace 使所有 JS 指紋改變，r4 hash 不可當作 r5 憑證。

## Git 與候選

本機 commits 已保留。一般 Git HTTPS 同步在 credential-manager 階段退出，使用者確認其出現「記憶體不能 read」，因此不再呼叫該 helper。GitHub 連接器已成功唯讀核對原 `feat/firefox-prototype` 遠端 head 為 `16b2009b32c856426140cfaf53cd9b8c9e418da5`。雲端備份採獨立 checkpoint 分支與完整 Git bundle，保存原始本機 commit objects；既有 feature 分支尚未完成一般 push，不能宣稱 remote SHA 等於本機 HEAD。

候選位於 sibling `outputs/Firefox-測試版-v0.3.1-r5/manifest.json`。這是已建置、完成部分介面檢查的開發候選；原生 Firefox／真實 ChatGPT 驗收尚未完成。候選六個 production 檔案均逐一核對 SHA256。舊 r4 資料夾保留。
