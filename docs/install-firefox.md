# Firefox v0.2.0 完整歷史實驗版

2026-10-03：使用者已確認 v0.1.1 能辨識提問；v0.2.0 新增完整歷史讀取，請移除舊暫時附加元件、載入新版並重整 ChatGPT，再按「載入完整目錄」。完整使用與限制見[新版說明](full-history-v0.2.0.md)。

適用：Windows 桌面 Firefox。已在原生 Firefox 157.0 合成頁面載入實際 MV3 附加元件；真實 ChatGPT 與 ESR 尚未驗收。manifest 的最低版本是 API 下限，不能當作各版本實測承諾；Android 尚未驗收。

## 建置與暫時安裝

1. 在本專案執行 `npm ci`、`npm run typecheck`、`npm run build:firefox`、`npm run lint:firefox`。
2. 在 Firefox 開啟 `about:debugging`，選「這個 Firefox／This Firefox」，再點「載入暫時附加元件／Load Temporary Add-on」。
3. 選擇 `dist/firefox/manifest.json`。交付副本則選 Firefox 原型資料夾中的 `manifest.json`。
4. 在一般視窗的 ChatGPT 分頁，從 Firefox 附加元件選單點「ChatGPT 對話導航器」。右側會出現「目錄」。點入口可展開，搜尋或選取已收錄的提問。
5. 用 Tab、Enter、清單上下方向鍵操作；Esc 收合並停止導航。工具列快捷鍵宣告為 Alt+Shift+O，但目前原生自動化鍵盤未成功觸發工具列命令，啟動以已驗證的附加元件按鈕為準。

原型重啟 Firefox 後會移除。打包 ZIP／未簽章 XPI 不能替代正常 Firefox 的正式簽章安裝；目前沒有正式日常安裝版。

## 已實作與限制

- 右側窄列、提問目錄、全文搜尋、目前閱讀提示、精確 ID 定位與高亮、返回剛才閱讀位置。
- 有限度逐批捲動、停止／強制逾時、分支與頁面失效、停用清理；「載入較早訊息」仍為實驗功能。
- 只在頁面記憶體收錄提問。沒有穩定 ID 的提問停用精準定位；搜尋只涵蓋已收錄內容。
- 新增明確啟動的同來源完整歷史讀取，分頁耗盡或 legacy current_node 根路徑後核對 head。完整清單與 DOM 分開保存，正常卸載不縮回附近幾題；只搜尋提問全文，回答不加入目錄。
- 顯示伺服器分支及已核對的掛載數量；這不是整個 UI 分支的完整證明。沒有 API／DOM 身分對應时保留伺服器清單供搜尋，暫停定位。完整讀取失敗仍使用原掛載目錄。
- 設定頁提供網站選用權限與自動啟用；權限原生回歸狀態見驗收報告，未通過項目不當作已驗收。

若找不到提問、返回失敗或頁面版本不支援，保留畫面提示；不要當作已完成導航。沒有真實樣本的 LIVE-01–07 以及 Mozilla 簽章的 REL-01 都是 PENDING。

## 驗證指令

`npm run test:core` 執行合成核心回歸。`npm run test:firefox-fixture` 使用 Selenium＋固定 geckodriver 0.37.1，啟動無帳號的獨立原生 Firefox、透過實際附加元件按鈕注入 localhost 合成頁面。`npm run test:firefox-permissions` 另測原生拒絕／授予、reload、停止背景後由訊息喚醒、兩個分頁撤權清理與訊息格式拒絕。測試專用 manifest 與正式套件分開；正式套件僅允許 ChatGPT。

`npm run test:firefox-addon-lifecycle` 測原生停用／重新啟用／移除附加元件：目錄顯示與高亮使用Firefox管理的host.css，停用或移除時樣式隨附加元件移除，因此不留下可見目錄／高亮。Firefox已銷毀的content context不能再執行JS teardown，可能留下隱藏且不運作的DOM；重整移除，或重新啟用時由新context清除舊節點，僅建立一個新目錄。單頁「停用此頁」及網站撤權則會直接移除DOM。

強制背景停止測試只在隔離profile針對本暫時附加元件呼叫Firefox測試用 `terminateBackground`，核對stopped→running。另有兩個auto頁面、關閉options、35秒不呼叫extension API的自然閒置測試：確認background stopped、UI與observer保留，再喚醒並撤權清理。整個Firefox重啟仍未驗證。測試操作者可用 `TOC_TEST_EXECUTOR`、輸出路徑可用 `TOC_TEST_ARTIFACTS` 設定，避免把獨立驗收誤記為主要開發者。

Windows 預設 Firefox 路徑為 `C:/Program Files/Mozilla Firefox/firefox.exe`；必要時以 `FIREFOX_BINARY` 指定。驅動／測試 profile 留在工作目錄，測試證據留在 artifacts，均不提交 Git。WebDriver 系統存取僅用於隔離測試瀏覽器的工具列與權限 UI，服務綁定本機回環。

`npm run package:firefox` 打包至 `artifacts/packages` 並輸出 SHA-256；打包前先成功建置與 lint。

移除方式：在about:debugging移除暫時附加元件後重整原頁面，或關閉Firefox。停用單一頁面用目錄中的「停用此頁」；重新啟動仍可再點附加元件按鈕。

`npm run test:history` 跑 API／完整索引／跨角色返回單元測試；`npm run test:firefox-full-history` 在隔離 Firefox 原生附加元件中使用 localhost 合成 API、cookie/token 與 200 題七題掛載窗口。這可驗證 MV3 同來源 fetch／分頁與 UI 行為，不代表真實 ChatGPT 登入流程或未文件化 schema 已實測。
