# Firefox v0.1 實驗原型

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
- 真實 ChatGPT 尚無經核對的分支與全量歷史來源。未知分支只保留目前能確認的掛載訊息；無法據此保證整段長對話索引或遠距定位。
- 設定頁提供網站選用權限與自動啟用；權限原生回歸狀態見驗收報告，未通過項目不當作已驗收。

若找不到提問、返回失敗或頁面版本不支援，保留畫面提示；不要當作已完成導航。沒有真實樣本的 LIVE-01–07 以及 Mozilla 簽章的 REL-01 都是 PENDING。

## 驗證指令

`npm run test:core` 執行合成核心回歸。`npm run test:firefox-fixture` 使用 Selenium＋固定 geckodriver 0.37.1，啟動無帳號的獨立原生 Firefox、透過實際附加元件按鈕注入 localhost 合成頁面。`npm run test:firefox-permissions` 另測原生拒絕／授予、reload、停止背景後由訊息喚醒、兩個分頁撤權清理與訊息格式拒絕。測試專用 manifest 與正式套件分開；正式套件僅允許 ChatGPT。

強制背景停止測試只在隔離profile針對本暫時附加元件呼叫Firefox測試用 `terminateBackground`，核對stopped→running。另有兩個auto頁面、關閉options、35秒不呼叫extension API的自然閒置測試：確認background stopped、UI與observer保留，再喚醒並撤權清理。整個Firefox重啟仍未驗證。測試操作者可用 `TOC_TEST_EXECUTOR`、輸出路徑可用 `TOC_TEST_ARTIFACTS` 設定，避免把獨立驗收誤記為主要開發者。

Windows 預設 Firefox 路徑為 `C:/Program Files/Mozilla Firefox/firefox.exe`；必要時以 `FIREFOX_BINARY` 指定。驅動／測試 profile 留在工作目錄，測試證據留在 artifacts，均不提交 Git。WebDriver 系統存取僅用於隔離測試瀏覽器的工具列與權限 UI，服務綁定本機回環。

`npm run package:firefox` 打包至 `artifacts/packages` 並輸出 SHA-256；打包前先成功建置與 lint。

移除方式：在 about:debugging 移除暫時附加元件，或關閉 Firefox。停用單一頁面用目錄中的「停用此頁」；重新啟動仍可再點附加元件按鈕。
