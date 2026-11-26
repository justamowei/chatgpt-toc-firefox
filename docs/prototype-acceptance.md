# Firefox v0.1 原型驗收報告

> 此文件保留 v0.1 歷史合成驗收。2026-10-03 真實頁面零索引回報後已交付 v0.1.1 修復，最新結果與更新步驟見[修復說明](bugfix-v0.1.1.md)。歷史合成 PASS 不代表使用者真實頁面已通過。

日期：2026-10-02（Asia/Taipei）  
範圍：T07a 實驗原型；真實 ChatGPT 長對話與正式日常安裝尚未通過。  
結論：主測及GPT-6.1 Sol high獨立驗收已完成；在已測v0.1範圍，沒有剩餘阻擋交付的缺陷。  
交付建置來源：`5cf4764741cca11cf9b52310007cb656fd5b9606`，分支 `feat/firefox-prototype`。原生功能驗收來源為fb5bfa0及5cf的關聯回歸，兩者runtime source相同。  
私人 GitHub：[chatgpt-toc-firefox](https://github.com/justamowei/chatgpt-toc-firefox)。此來源已 push，遠端 SHA 一致；後续文件提交不改此程式驗收來源。

## 已完成的功能

右側目錄與提問標記、全文搜尋、穩定 message ID 定位及高亮、返回原閱讀位置、目前位置提示、鍵盤操作、深淺色與窄視窗。有限歷史載入有停止、單批／總逾時與無進展上限；對話切換會撤銷舊目標與返回錨點。

Firefox預設用附加元件按鈕手動啟用；設定頁可直接申請ChatGPT選用權限，自動啟用可撤回。重複啟動只保留一個實例。自然背景休眠保留頁面目錄；撤權或「停用此頁」會清除目錄、觀察器、計時器、事件與導航任務。原生停用／移除addon後，Firefox管理的CSS移除，目錄與高亮隱藏；其隱藏且不運作DOM在reload或新context啟動時清除。

正式套件只允許 `https://chatgpt.com/*`，只把設定存入 storage.local。聊天索引留在頁面記憶體；沒有 page bridge、聊天 API、cookies 讀取、雲端聊天儲存或對外傳送。測試套件才包含 localhost 與可信合成分支標籤。

## 原型測試結果

環境：Windows 10.0.19045、Node 24.12.0、npm 11.6.2、Firefox 157.0、geckodriver 0.37.1；獨立無帳號headless profile。固定樣本：20則掛載提問／20則合成虛擬歷史、1,000則核心搜尋資料、兩個自動啟用分頁。執行者：主agent；獨立驗收另列。

| 案例 | 實際結果 | 狀態 |
|---|---|---|
| ENV-01／建置 | typecheck、正式 build、web-ext lint：0 errors／0 notices／0 warnings；打包退出0 | PASS |
| CORE-01–04 | 12 個核心回歸；ID 去重／排序、增量文字、分支失效、完整度證據撤銷、取消／逾時／晚到結果、訊息schema | PASS，來源未變 |
| CORE-04 效能 | 固定1,000提問、20次核心搜尋；獨立fc02核心來源同blob的p95 3.24ms | PASS；未量測1,000項原生UI渲染 |
| FF-01 | 真實工具列activeTab注入、重複一個root、單頁停用後不重啟；原生addon停用隱藏／重新啟用1個可操作root／移除隱藏且reload清DOM，另3組全通過 | PASS，獨立複驗通過 |
| FF-02 | 20/20 ID定位且目標可見；0失敗；p95 113.50ms；20次返回同一u-6錨點，最大偏移0px（門檻24px） | PASS |
| FF-03 | 合成逐批收錄、停止與晚到捲動、branch／SPA失效、pending刷新切換後新訊息20→21 | PASS；不宣稱全量歷史 |
| FF-04 | 同文字不同ID、HTML字串不變元素、無結果搜尋、焦點／方向鍵／Esc、深淺色、實際500px窄視窗不溢出 | PASS；480px未實測 |
| FF-05 | 原生權限拒絕／允許、舊註冊CSS升級、reload、強制停止後訊息喚醒、35秒自然休眠時兩UI保留且新增訊息更新、無port兩頁撤權清理、未知訊息拒絕；7組全通過 | PASS，獨立複驗通過 |
| LIVE-01–07 | 真實ChatGPT、完整分支／全量ID、十個未掛載目標、返回、編輯／重新生成、容器／工作區 | PENDING |
| ESR／Android／Chrome／Edge | 本輪未執行 | PENDING |
| REL-01 | Mozilla簽章、重啟／升版與設定保持 | PENDING |

正式manifest的最低Firefox 140為API下限，不能當作140／ESR／Android已實測。Alt+Shift+O命令已宣告，但原生自動化未成功觸發啟動快捷鍵；目前用已驗證的附加元件按鈕。

## 獨立驗收與修復

驗收 agent：使用者指定的 GPT-6.1 Sol high；透過 git archive 匯出固定SHA到獨立scratch，唯讀審查成品，獨立npm ci、建置及原生Firefox測試。

- fc02d697：核心13/13獨立案例、主要7组通過；額外probe發現SPA取消刷新timer卻未清除handle，切換後不再更新。主agent修正並加入原生回歸。
- 9afa2c9：主要8/8、權限5/5、額外SPA／未知分支／可信輸入3/3通過；但自然35秒背景休眠會移除兩個目錄，屬阻擋缺陷。另以兩個有效UI的即刻強制停止重現。失敗證據保留。
- 2cfe1e7：將port斷線與明確停用分開；獨立主要8/8、權限6/6、自然／強制active UI睡醒均PASS。另發現原生停用再啟用生成2個root，違反唯一實例；uninstall殘留DOM另記錄限制。
- fb5bfa0：新context先清孤兒root與舊高亮標籤；管理CSS隨Firefox addon移除，自然背景休眠則保留。獨立主要8/8、權限7/7、原生addon生命週期3/3、額外SPA／未知分支／可信輸入3/3及自然idle／喚醒PASS；20次定位p95 208.96ms、返回0px。舊2root缺陷已修。
- fb5原始host.css及options.html因換行有差異：host.css archive的CRLF hash f3ac96…ad4，canonical LF hash 5dfc4c…8bb；不能聲稱當時所有輸出byte一致。功能測試與文件核對其換行等價，canonical版另外做關聯回歸。
- 5cf4764：只修改build，固定HTML／CSS的UTF-8／LF，不改runtime source。獨立offline npm ci／typecheck／build／lint／package均退出0；canonical原生addon生命週期3/3及原生grant→兩個auto可見UI→強制停止→喚醒PASS。新canonical輸出hash與交付核對一致，七個ZIP members均匹配。無剩餘原型阻擋缺陷。

完整獨立報告：[最終canonical驗收](acceptance-final.md)、[fb5原生驗收](acceptance-native.md)。文內相對證據路徑以原始work/acceptance各SHA目錄為基準；原始artifact不在Git內。

舊失敗不回填為PASS。核心來源未變的證據明記重用；最新background／content／DOM／CSS變更後重新跑原生關聯案例。測試早期ShadowRoot／WebDriver操作錯誤、addon helper誤收合面板，與產品窄視窗、SPA、背景休眠、重新啟用重複root缺陷分開記錄，沒有移除樣本或降低門檻。

## 交付與套件核對

可暫時載入資料夾：`outputs/Firefox-原型-v0.1`。未簽章ZIP：`outputs/ChatGPT-對話導航器-v0.1-未簽章.zip`。使用說明另有 `outputs/Firefox-原型安裝說明.md`。

ZIP SHA-256：`862fe1bfe7e7ebbca31d47e2ab15a45c196deceef5f446615b3a19cea5df0162`。

| 正式套件檔案 | SHA-256 |
|---|---|
| content.js | fde39cddd6587e0c25cda2c8fd2788e648e0588720f84b5740668f5002ea60c0 |
| background.js | bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977 |
| host.css | 5dfc4c888918275eb536a33e22a37f3153d8a1d273d60feb83a453c864bdc8bb |
| options.js | a986be9a94429358b8a9fd6871e3ab0672cc75fdb1c020cdd1878f8076350ad4 |
| options.html | 163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf |
| manifest.json | 267ec122e1922cd12a7a00fe9af0da4ee9fb34d463920d698982a37d6c3eddc1 |

ZIP七個members逐一核對與dist/firefox一致。獨立重打包ZIP可能因時間戳有不同整包hash，仍須逐一比對members；不得以此跳過檔案核對。build-info.json記錄各正式輸出hash。

## 下一階段

需由使用者在獨立Firefox測試設定檔登入ChatGPT，開啟至少一段受影響長對話，先驗證候選selector與穩定ID。預先固定預期分支／提問集合與十個未掛載目標，再執行LIVE矩陣；不複製既有profile、cookies或登入憑證。

目前真實adapter沒有可靠的完整分支來源，未知分支只保留目前能確認的掛載訊息。不能把合成已知分支的20則收錄當作長對話問題已解決。完成真實驗收後，才準備Mozilla unlisted簽章與正式日常安裝。

本機原始合成證據在repo的artifacts；獨立證據在work/acceptance各固定SHA資料夾。均未包含真實聊天，且不納入Git套件或聊天雲端同步。
