# ChatGPT 自製對話導航器：開發規劃 v1.4（Firefox 優先）

規劃日期：2026-10-02（Asia/Taipei）  
決策：直接自製，略過第三方工具評估  
瀏覽器優先序：Firefox 桌面版為 P0；Chrome／Edge 為 P1 後續相容目標  
本次交付：產品規格、技術決策、可行性驗證、任務順序與驗收條件  
目前狀態：使用者已恢復功能開發。Firefox v0.1實驗原型已建置；核心、原生導航、權限／背景生命週期，以及原生停用再啟用唯一目錄與管理CSS清理已有實测。各固定來源／套件hash與最新自測／獨立結果見原型驗收報告。Git每功能／30分鐘commit、每次push與遠端SHA核對持續執行。真實ChatGPT長歷史／容器／工作區／ESR／簽章仍待驗證。第12–15節為具體開發與驗收約束，優先於前文較概括的描述。
版本管理：Git；雲端目標已由使用者指定為 GitHub 私人儲存庫。  
Sub-agent 設定：GPT-6.1 Sol，reasoning effort = high，獨立驗收。

## 1. 要做出的成品

先製作可在 Firefox 桌面版使用的 ChatGPT Web 導航擴充功能，暫名「ChatGPT 對話導航器」，再適配 Chrome／Edge。Firefox 是開發、功能取捨與驗收的主要環境。核心流程：

**開啟長對話 → 看見提問目錄 → 搜尋或選取提問 → 回到正確訊息 → 回到原本閱讀位置。**

目標是恢復長對話的日常導航。重點包含目前畫面之外的歷史，而不只是列出眼前訊息。第一個原型可以先支援已載入訊息，但必須標示索引範圍；正式長對話版本另設驗收關卡。

Firefox 優先已由使用者指定。其餘先採合理預設：Windows、繁體中文、私人本機使用、無伺服器、無 AI API 費用。原型透過 Firefox 暫時載入附加元件測試；正式日常使用採已簽章 XPI。Firefox 實際版本在 T01 記錄，最低支援版本依所需 API 與實測後設定；ESR 另記錄驗證範圍，不預先宣稱支援全部版本。

## 2. 範圍與版本

| 版本 | 目標 | 必要交付 |
|---|---|---|
| 技術探索 | 在 Firefox 證明長歷史能否可靠索引與定位 | 可行性紀錄、已驗證資料來源、支援邊界 |
| v0.1 基礎原型 | Firefox 中已取得訊息的導航可用 | 暫時載入套件、右側入口、提問列表、搜尋、正確跳轉、範圍提示 |
| v0.2 長對話原型 | 處理尚未掛載的歷史 | 較早訊息收錄、遠距定位、取消、返回位置、分支處理 |
| v1.0 私人使用版 | Firefox 日常聊天穩定可用 | Firefox 真實環境驗收、簽章 XPI、設定、相容性提示、安裝／更新／移除文件 |
| P1 相容版本 | 移植至 Chrome／Edge | Chromium 專用 manifest 與兩瀏覽器實測，不阻擋 Firefox 首版 |
| 後續版本 | 擴充閱讀與整理能力 | 回答 H2／H3 目錄、書籤、匯入快照與離線閱讀 |

v1.0 先集中於 Firefox 中的原 Web 聊天；離線閱讀保留為後續模組。Firefox 自行分發所需的簽章納入首版交付；公開商店列表、桌面 App、手機、跨平台聊天、雲端同步與自動摘要另行規劃。

## 3. 使用介面

### 3.1 右側導航列

- 預設收合為窄列，每個標記對應一則已收錄提問；滑鼠停留或鍵盤聚焦時顯示提問摘要。
- 點選標記，定位該則提問；目前閱讀位置有高亮。
- 點「目錄」展開約 300 px 的列表面板，寬度可依視窗調整；窄視窗使用覆蓋面板，避免擠壓聊天輸入框。
- 在擴充功能已啟用的頁面中，至少保留「目錄」入口。是否有超過五則訊息只影響預設展開行為，不作為功能可用性的限制。
- 原生目錄恢復且發生重疊時，自製入口可移位或收合；「只在原生目錄缺失時顯示」列為後續選項，因原生入口辨識尚待驗證。

### 3.2 展開面板示意

```text
┌──────────────────────────────┐
│ 對話目錄                 收合 │
│ 搜尋提問…                    │
│ 已收錄 24 則 · 歷史尚未完整    │
├──────────────────────────────┤
│ 如何重現目錄消失？            │
│ 幫我比較兩種修復方法          │
│ 這段程式為什麼出錯？      ←目前│
│ 接下來要測什麼？              │
├──────────────────────────────┤
│ 載入較早訊息   回到剛才位置    │
│ 設定                         │
└──────────────────────────────┘
```

這是靜態流程示意，並非已運作的原型。未核對完整歷史時不顯示全域提問編號、總數或「整段對話 80%」等可能誤導的資訊；可以顯示已收錄數量。

### 3.3 使用者可理解的狀態

| 情況 | 顯示文字與行為 |
|---|---|
| 已取得部分歷史 | 「已收錄 N 則，較早訊息尚未完整」；搜尋只涵蓋已收錄提問 |
| 已核對目前分支的完整索引 | 「目前分支共 N 則提問」；完整索引不代表每則都已掛載 |
| 正在找遠處訊息 | 「正在載入較早訊息…」＋「停止」；不顯示無根據的剩餘時間 |
| 暫時找不到目標 | 「尚未找到這則訊息，可繼續載入」；保留已收錄索引 |
| 頁面結構不支援 | 「目前頁面版本尚未支援，請更新導航器」；停止操作 |
| 切換聊天或分支 | 停止舊任務，更新列表；不短暫顯示舊聊天摘要 |

## 4. 最先做的技術探索

這一步是正式版本的必要工作，不能以畫出目錄取代。預估 1–2 人日，先在 Firefox 實際環境測試，才寫死頁面選擇器或資料解析方式。Chrome／Edge 的可用結果不能代替 Firefox 通過。

### 4.1 探索項目

| 工作 | 要取得的答案 | 通過證據 |
|---|---|---|
| 訊息辨識 | 提問、回答、附件、工具訊息如何區分？是否有穩定 message ID？ | 原始觀察與去識別化樣本；重整後 ID 對照 |
| 路由辨識 | 一般聊天、專案聊天、新聊天如何辨識 conversation ID？ | 開啟、SPA 切換、重整各一次；不假定固定網址模式 |
| 完整索引來源 | 頁面正常載入的資料是否有完整目前分支？是否分頁？ | 核對完整預期 ID 集合、順序、分支結構與分頁邊界；首／中／尾只作初步核對 |
| 遠距定位 | 目標不在 DOM 時，頁面是否有可靠的訊息定位能力？ | 從末端跳往至少 10 個已知舊提問的結果 |
| 逐批載入 | 找到正確捲動容器、載入完成訊號與歷史邊界 | 重複載入不漏項，能停止，抵達邊界後不無限重試 |
| 分支變動 | 編輯提問與重新生成後，如何辨識目前路徑？ | 同一聊天兩條分支不合併；識別不足時停用歷史合併 |
| Firefox 隔離與生命週期 | 頁面 bridge、背景事件頁面、網站權限是否按預期運作？ | 原生 Firefox 中驗證，不依賴 Chromium 專用能力 |
| 容器分頁 | 不同容器的登入狀態是否可能共用索引？ | 兩個容器同時開啟 ChatGPT 不串資料；只使用可取得的分頁中繼資料，不要求讀取 cookies |

測試材料先用短對話、約 50–150 則提問的中對話，以及一個實際受影響的長對話；沒有對應長度就用現有樣本。每個樣本先記錄已知首、中、尾提問作為核對依據。

### 4.2 資料來源優先順序

1. **已掛載 DOM：** 基礎原型的來源，持續收錄已看見的提問；卸載後仍保留本次頁面生命週期內的索引。
2. **頁面正常取得的對話資料：** 探索能否在本機唯讀取得目前分支的結構。若需要讀取頁面執行環境，採隔離、最小範圍的 bridge，驗證每一份輸入。
3. **逐批載入：** 由使用者明確啟動，取得較早訊息並累積索引；有時間／批次上限。
4. **官方匯出快照：** 後續離線模式的來源；不可默認等同目前 Web 狀態。

第 2 項是否存在、如何取得、是否完整，均尚未驗證。必要時可探索同來源、沿用正常登入狀態的唯讀資料請求，但未文件化介面必須封裝為可停用的 adapter；不保存登入憑證、不繞過存取限制，不把網站內部介面當成 OpenAI 公開 API。

### 4.3 通過與降級規則

- 完整索引與可靠遠距定位都通過：進入完整長對話版本。
- 完整索引通過，遠距定位只能逐批載入：列出完整提問，未掛載目標顯示載入流程；記錄耗時與可到達率，不承諾立即跳轉。
- 只能取得 DOM：可完成 v0.1；以逐批載入探索 v0.2。若對超長聊天仍無法達到驗收，不把它當成已解決原問題。
- 無法可靠辨識分支／歷史邊界：搜尋只涵蓋已確認資料，完整度維持未知。

如果方案最後只能支援有限索引，交付文件要明確記錄缺口；離線閱讀可以補足查閱，但不替代即時導航的成功條件。

## 5. 技術決策

| 項目 | 規劃選擇 | 用意 |
|---|---|---|
| 擴充功能 | Firefox WebExtensions／Manifest V3 為主；分瀏覽器產生 manifest | 共用索引與 UI，平台差異集中於建置設定與 adapter |
| API | Firefox 原生 `browser.*` Promise API；Chromium 另設相容層 | 共用核心不直接依賴 `chrome.*` |
| 背景程式 | Firefox 使用非持久背景事件頁面；Chromium 使用 service worker | 保留共同事件處理邏輯，按平台設定入口 |
| 開發語言 | TypeScript | 明確定義訊息、完整度、導航狀態與錯誤 |
| 編譯 | esbuild；建立時再鎖定已確認版本 | 輸出簡單、可檢查的本機套件 |
| Firefox 開發工具 | web-ext，建立時鎖定版本 | lint、run、build；簽章另走交付流程 |
| UI | 原生 DOM＋Shadow DOM | 小型介面、樣式隔離；Shadow DOM 不作為安全邊界 |
| 索引／導航 | 純資料核心＋獨立 ChatGPT adapter | 網站改版時集中修改適配器 |
| 搜尋 | 本機提問文字搜尋 | 第一版不引入模型、向量資料庫或伺服器 |
| 設定 | 擴充功能 storage.local | 保留顯示與版面偏好 |
| 聊天索引 | 先採 content script 記憶體 | 頁面離開後清除；跨重整保留列為明確選用功能 |
| 測試 | 核心邏輯測試＋可控頁面 fixture＋真實瀏覽器驗收 | 分別驗證資料正確性、載入行為與真實相容性 |

Firefox content scripts 具有 Xray 隔離，不能直接假設可讀到網站變數；頁面 bridge 在 Firefox 先驗證。需要 MAIN world 時確認目標版本能力，且不能把頁面可讀／可修改的資料當成可信輸入。[Mozilla Content scripts 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)、[執行環境文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld)

目前 Mozilla 文件說明 Firefox 不支援 `background.service_worker`，而使用 `background.scripts`／事件頁面。Firefox manifest 只加入其背景設定；Chromium manifest 才使用 service worker。共同邏輯不依賴背景常駐、DOM 或長時間計時器，事件監聽在頂層同步註冊。[Mozilla background 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)

### 5.1 啟動與權限

v0.1 先使用 `activeTab`、`scripting`、`storage`：使用者點 Firefox 擴充功能按鈕後，在支援的 ChatGPT 頁面啟用。重整、權限撤回後的行為在 Firefox 驗證，未自動重新注入時提示需再次啟動。[Mozilla permissions 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)

v1.0 提供「在 ChatGPT 自動啟用」選項，啟用時只申請 `https://chatgpt.com/*` 的選用網站權限，註冊相應 content script；撤回權限就解除自動注入並通知開啟中的導航器停止。Firefox 的安裝與網站權限提示、拒絕、撤回、重啟後恢復均列入測試。[Mozilla 選用網站權限文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions)、[Firefox MV3 指引](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

預設不申請所有網站、cookies、debugger 或不限額儲存權限。這份權限設計是產品行為，實際安裝與選用權限仍由瀏覽器提供標準流程。

### 5.2 儲存與隔離

- 第一版索引在頁面記憶體中；聊天／分支切換以新 session epoch 管理，舊非同步結果不得寫回新畫面。
- 暫時沒有可信帳號／工作區識別時，不跨頁面或跨重整重用聊天摘要；不猜測身份、不用 email 當儲存鍵。
- 後續若需跨重整恢復，索引可由背景程式管理 session 儲存，需另驗證身份／工作區／分支、分頁與 Firefox 容器隔離、容量與清除時機。
- storage.session 預設不向 content scripts 開放，因此透過驗證 sender 的訊息介面存取；Firefox 事件頁面重新喚醒後也要能重建必要狀態。實際版本缺少必要 API 時，保留頁面記憶體模式，不把聊天默默改存磁碟。[Mozilla storage.session 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session)
- 容器分頁與一般／私人視窗不得共用聊天索引。第一版以分頁生命週期隔離，私人視窗預設不啟用；未完成對應驗收前不宣稱支援私人瀏覽。
- storage.local 只保留顯示設定；書籤若加入版本，另標示會保存提問摘要，提供刪除與匯出選項。聊天不使用 storage.sync。

## 6. 模組與介面

```text
chatgpt-toc/
  manifests/
    base.json               共用權限、名稱與入口設定
    firefox.json            背景事件頁面、Gecko ID 與版本設定
    chromium.json           後續 Chrome／Edge service worker 設定
  scripts/
    build.ts                產生各平台 manifest 與建置結果
  src/
    background.ts           啟動、選用權限與訊息驗證
    content.ts              頁面生命週期與功能入口
    core/
      types.ts              訊息、分支、索引與導航狀態
      index-store.ts        去重、更新、排序與完整度
      search.ts             搜尋與範圍
      navigation.ts         任務取消、定位流程與返回位置
    platform/
      firefox.ts            browser API、權限與容器中繼資料
      chromium.ts           後續 Chromium 相容層
    adapters/chatgpt/
      route.ts              對話／分支切換辨識
      dom.ts                提問與捲動容器辨識
      history.ts            較早訊息取得與歷史邊界
      page-bridge.ts        只有探索結果需要時才建立
    ui/
      rail.ts               收合導航列
      panel.ts              目錄、搜尋與狀態
      styles.css            深淺色、窄視窗與聚焦樣式
  tests/
    fixtures/               去識別化或合成樣本
  docs/
    feasibility.md          真實頁面觀察與已驗證能力
    install-firefox.md      暫時載入、簽章版安裝、更新與移除
    install-chromium.md     後續 Chrome／Edge 安裝說明
    compatibility.md        測試環境與已知限制
  dist/
    firefox/                Firefox 可載入的建置結果
    chromium/               後續 Chromium 建置結果
```

開發介面先定義為：

- `readContext()`：回傳可辨識的 conversation、branch、頁面能力及 session epoch；未知欄位保留未知。
- `collectMountedMessages()`：回傳提問與回答的實際 ID／位置／文字，辨識失敗不得任意拼成提問。
- `discoverHistory(signal)`：回傳新增訊息、可靠邊界訊號與完整度證據；支援取消。
- `locateTarget(target, signal)`：回傳 located、needs-loading、unsupported、not-found 或 cancelled。
- `capturePosition()`／`restorePosition()`：以訊息 ID＋相對偏移為首選；恢復失敗要回報，不只使用可能失效的 scrollTop。

索引項目包含來源、session epoch、conversation ID、可取得的 branch／message ID、摘要、排序證據與目前是否掛載。沒有穩定 ID 時，指紋只能暫時去重；重複文字提問必須分開，不以文字相同直接合併。

## 7. 導航流程與失效處理

1. 點選提問時，保存原閱讀位置，建立可取消的導航任務。
2. 再次核對聊天／分支與 epoch；目標仍掛載時直接定位並短暫高亮。
3. 未掛載時使用已驗證的 adapter 載入目標附近內容，或啟動逐批載入。
4. 每批核對新增穩定 ID、載入狀態、已知邊界與 epoch。連續沒有進展就停止本次任務並提示；不將「沒有新增」直接視為完整。
5. 初始限制為 60 秒或 20 批；命中任一條件即結束，可由使用者繼續。這是保護操作的設計值，不是預估所有長對話都能在一分鐘完成。
6. 使用者停止、切換聊天／分支、頁面不相容或關閉功能時，取消載入、捲動與後續非同步寫入。
7. 找到目標後核對 ID 與可辨識內容；核對失敗不得顯示成功。

逐批載入完成後可返回原位置；找不到原錨點時保留可理解的恢復入口。列表更新不打斷鍵盤焦點，動畫尊重 reduced-motion 設定。

## 8. 開發任務與依賴

依賴順序：GIT-00 → T00 → T01 → T02 → T03 → T04 → T05 → T06 → T07a → T07b。GIT-00 完成初始本機 commit 與雲端 push 後才繼續功能；已在暫停前完成的部分工作納入初始快照。資料正確性與頁面驗證先於正式長對話承諾。

| 任務 | 內容 | 完成條件 | 估計投入 |
|---|---|---|---|
| GIT-00 | Git 初始化與 GitHub 私人儲存庫 | 確認身份／分支／忽略規則，建立初始 commit、origin、首次 push，核對雲端 SHA 與 private 狀態 | 恢復開發後先完成 |
| T00 | 環境、依賴與可重現指令 | 鎖檔、原生Firefox與驅動探測、建置／型別／lint／測試指令有實際結果 | 已完成原型環境 |
| T01 | Firefox 真實頁面探索與樣本整理 | 版本、來源、穩定 ID、分支、容器及遠距跳轉有可重現紀錄 | 1–2 人日 |
| T02 | Firefox MV3 啟動、事件頁面與 adapter 骨架 | 可在 Firefox 暫時載入、啟動／停用；重複啟動不重複注入 | 0.5 人日 |
| T03 | 索引、搜尋、完整度與資料更新 | 重複提問不錯併、部分索引不誤標完整 | 1 人日 |
| T04 | 導航列、列表與已掛載定位 | v0.1 可操作，支援鍵盤與深淺色 | 1 人日 |
| T05 | 較早歷史、遠距定位、取消與返回 | 固定真實長對話中，十個預先選定且尚未掛載的目標 10／10 命中；取消／返回案例均通過 | 1.5–2 人日 |
| T06 | 分支／切換、權限與相容性降級 | 舊任務不影響新聊天，自動啟用可撤回 | 0.5–1 人日 |
| T07a | Firefox 原型回歸、打包與獨立驗收 | 來源、鎖檔、可重建測試包、lint、測試矩陣與 sub-agent 報告 | T07 合計 0.5–1.5 人日 |
| T07b | 正式簽章與安裝／升版驗收 | 已簽章 XPI 與簽章後實測；帳號、授權及外部審查為外部依賴 | 外部等待另計 |

Firefox 首版開發投入暫估約 6–9 人日。Mozilla 簽章／審查的等待時間另計；Chrome／Edge 相容工作放在 Firefox 通過後，另估 1–2 人日並依平台差異調整。這是工程規劃估算，不是執行時間承諾；T01 發現資料能力不足時重估 T05，不以增加重試次數掩蓋缺口。

## 9. 驗收門檻

以下是驗收目標；目前已完成的合成量測見原型驗收報告，真實短、中、長樣本仍待取得。合成測試不能取代ChatGPT真實頁面驗收。

| 驗收項目 | 測試 | 通過標準 |
|---|---|---|
| 已掛載定位 | 任選 20 個可辨識提問 | 20／20 正確；p95 定位高亮 ≤ 1 秒 |
| 完整歷史索引 | 依固定可信結構核對完整目前分支 | 完整 ID 集合、順序、總數及分頁邊界一致；否則保持部分／未知 |
| 遠距跳轉 | 從末端選 10 個尚未掛載舊提問 | 正式長對話支援樣本中 10／10 正確；記錄時間與批次 |
| 無法定位／請求錯誤 | 中斷載入、模擬未知結構 | 有明確結果、不誤跳、不無限重試 |
| 取消 | 載入中停止、切換聊天或分支 | 終止後不再執行新的捲動與舊結果寫入 |
| 分支與更新 | 相同文字提問、編輯、重新生成、附件 | 不錯併、不混分支、不把 streaming 變動當新提問 |
| 位置恢復 | 找到舊訊息後返回 | 穩定錨點可用時回到原訊息；失敗有提示 |
| 搜尋 | 1,000 則摘要資料集 | p95 ≤ 300 ms；明確標示搜尋範圍 |
| Firefox 主驗收 | 原生 Firefox 桌面版跑全部核心流程 | 記錄實際版本，所有 P0 項目通過；Chromium 結果不能替代 |
| 容器分頁 | 不同容器同時開啟聊天、切換工作區 | 不串索引、不把一個容器的資料顯示到另一個 |
| 正式安裝與重啟 | 已簽章 XPI 安裝、關閉並重啟 Firefox | 套件仍安裝；已授予的自動啟用設定按規格恢復 |
| 背景生命週期／權限 | 背景休眠再喚醒、拒絕與撤回網站權限 | 不丟失必要設定、不重複注入、不繼續未授權操作 |
| Chrome／Edge 相容驗收 | Firefox P0 通過後各跑核心流程 | 各自記錄版本與結果，作為 P1 支援依據 |
| 資料與效能 | 檢查網路、儲存、CPU／更新頻率 | 不向第三方送聊天、不全頁高頻重掃、不把聊天寫入同步儲存 |

如果 10 個舊目標只成功部分，報告成功率與原因，v0.2 保持實驗狀態；不得把「全部都有失敗提示」算作完整遠距跳轉通過。

## 10. 第一個開發階段的具體交付

接續開發時先完成 T01–T04，交付：

1. 真實頁面可行性紀錄：資料來源、索引完整度、可定位能力與限制。
2. 可在 Firefox 暫時載入的 v0.1 擴充功能：導航列、提問目錄、搜尋、已掛載跳轉與範圍提示。
3. 一組去識別化／合成 fixture 與核心測試結果。
4. Firefox 原型安裝說明、目前已通過與未通過的實測項目，以及正式簽章交付流程。

第一個優先任務是確認歷史索引與目標定位能力。介面可同步建立，但正式長對話功能必須以實測結果決定。

## 11. Firefox 安裝與正式交付

**原型階段：** 使用 `about:debugging` →「This Firefox／這個 Firefox」→「Load Temporary Add-on／載入暫時附加元件」，選擇建置目錄中的 manifest.json。也可用 web-ext 於測試設定檔執行。暫時附加元件在 Firefox 重啟後移除，不能算作可日常使用的正式安裝。[Mozilla 暫時安裝指引](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)、[web-ext 指引](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)

**日常使用版：** 產生可驗證的 XPI 與建置來源，採 Mozilla AMO 的 unlisted／自行分發簽章流程；不需要公開商店列表，但正常 Firefox Release／Beta 的正式安裝仍需要簽章。簽章後再做重啟、權限與更新驗收，不以暫時載入結果代替。[Mozilla 簽章與分發指引](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

Firefox manifest 設定固定 Gecko add-on ID，最低版本由實際 API 需求與測試決定。新送審套件另依 Mozilla 當時規則填寫資料收集聲明；預設本機處理且沒有對外傳送時，規劃為 `data_collection_permissions.required: ["none"]`，送審前核對實際資料流。[Mozilla browser_specific_settings 文件](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)

原型與打包可先在本機完成；提交 Mozilla 時才需要相應帳號與簽章授權。先備妥可審閱套件、來源與聲明，再處理外部提交；本次規劃未送出任何套件。

## 12. 開發與驗收的具體約束

### 12.1 開工條件與可繼續的工作

T00 環境準備先記錄 Node／npm／Firefox 版本、路徑、開發依賴鎖檔、工作目錄及瀏覽器測試方法。開發依賴只安裝在專案，npm 暫存留在 work；不進行全域套件安裝。

T00的可重現指令已完成：`npm ci`、`npm run typecheck`、`npm run build:firefox`、`npm run lint:firefox`、`npm run test:core`、`npm run test:firefox-fixture`、`npm run test:firefox-permissions`、`npm run package:firefox`。原型自測均退出0；固定快照的獨立結果另列，不把指令存在等同通過。正式建置輸出dist/firefox，合成建置dist/fixture，原生證據artifacts，打包artifacts/packages。fixture使用獨立測試manifest／adapter；正式manifest不包含測試來源。Firefox擴充功能案例必須實際載入附加元件，不能只把同一份JS放進普通網頁當作已驗證權限與生命週期。

T01 真實觀察必須有：可使用的原生 Firefox、獨立測試設定檔、該設定檔中的 ChatGPT 登入狀態，以及固定長對話樣本。未具備的項目標為待驗證，允許核心與 fixture 開發繼續，不把合成結果算成 T01 通過。

本機 Firefox 可先用無畫面模式執行不含帳號的本機 fixture；擴充功能生命週期使用 web-ext／原生 Firefox 驗證。完整互動自動化若採 geckodriver／Marionette，需先完成驅動與附加元件載入能力探測，再將路徑寫入證據表。不能假定有 Playwright 套件就能操作已安裝 Firefox：Playwright 官方說明其 Firefox 依賴修補版本，不能直接使用品牌版 Firefox。[Playwright 官方瀏覽器說明](https://playwright.dev/docs/browsers#firefox)

登入與長對話只在可用的正常授權 session 中測試。不得複製使用者的瀏覽器設定檔、cookies 或登入憑證到測試目錄；需要登入時由使用者在測試 Firefox 內完成。未提供真實樣本時，該層驗收維持 PENDING，不阻止本機原型交付。

### 12.2 索引完整度與分支失效

- 完整度分為 `unknown`、`partial`、`verified-complete`，附上資料來源、分支標識、核對時間、邊界與 ID 集合證據。
- `verified-complete` 必須根據可靠的目前分支結構重建 root 到 leaf 的路徑，且所有分頁已確認耗盡，或有等價、可核對的全量來源；預期提問 ID 集合、順序與總數全部一致。
- 僅看見首中尾、捲到頂端、連續沒有新 DOM、超時、介面不再捲動，都不能作為完整證據。
- conversation、分支、工作區或身份可信訊號改變時更新 epoch；同 URL 的編輯提問／重新生成也列為失效事件。可信識別不足時，撤銷舊的已卸載歷史、目標與返回錨點，重新收錄目前可確認的訊息。
- 沒有穩定 ID 或可靠順序時保留未知狀態；不得用提問文字相同判為同一訊息，也不得任意拼接兩段歷史來宣稱完整。
- 搜尋範圍另行記錄：完整提問 ID 索引不等於已取得每則提問全文；若摘要或文字被限制長度，搜尋提示必須反映範圍。

### 12.3 導航狀態與操作上限

導航狀態固定為 `idle`、`loading`、`located`、`cancelled`、`timed-out`、`unsupported`、`not-found`。每次操作有唯一 task token 與 epoch；每個非同步回呼在寫索引、改 UI 或捲動前重新核對。

- 每次最多 60 秒或 20 批；單批最多等待 8 秒。這些上限由測試固定，改值須寫入版本紀錄。
- 連續 3 批未取得新增穩定 ID 或可驗證的邊界變化，結束本次任務並說明未找到；不標記完整。
- 停止／切換／撤回權限後立即使 token 失效；任何晚到結果不得捲動、寫入新索引或更新新頁面 UI。未能中止的底層請求結果只可丟棄。
- 已掛載定位以正確 message ID 與目標可見為成功；無穩定 ID 的路徑不得算入精準跳轉驗收。
- 返回位置以同一 message ID＋相對視窗偏移驗收；固定 fixture 的偏移誤差 ≤24 px。真實頁面動態高度改變時另記錄差值，錨點已失效則顯示恢復失敗，不誤稱成功。
- 使用者主動捲動或輸入時可中止自動導航，避免自動載入與使用者操作相互爭奪位置；重啟導航由使用者觸發。

### 12.4 停用清理與輸入處理

`dispose()` 明確清理 observer、timer、event listener、UI 根節點、導航 task 與暫存引用。啟動兩次只保留一個實例；撤回權限後既有頁面也停止索引與捲動，並透過訊息／頁面生命週期清理。

Firefox event page自然idle會斷開runtime port，不能據此dispose本機頁面UI。原生停用／移除附加元件會銷毀content context，無法保證該context再執行JS清DOM；管理CSS隨附加元件移除，目錄與高亮必須不再可見。可能保留的隱藏且不運作DOM由重整移除，重新啟用的新context也先清舊節點，確保僅一個可操作目錄。明確網站撤權／單頁停用仍須直接清DOM；三種情境分開驗收。

摘要以 `textContent` 顯示；page bridge／runtime 訊息有固定 schema、sender／origin（適用時）、conversation 與 epoch 檢查。頁面 bridge 只交付資料，不接受任意 URL、任意腳本或特權 command。同頁來源檢查不能證明 bridge 資料可信，仍需資料結構與數值驗證。

原型的單次 bridge payload 上限先設為 2 MiB、最多 10,000 個訊息項目，文字欄位與巢狀深度另外受 schema 限制。超限明確拒絕或分批處理，不能默默截斷後宣稱完整。必測：HTML 注入字串、錯誤型別、超大資料、未知 schema、過期 epoch、偽造 command。

### 12.5 固定樣本與效能量測

實測前建立樣本清單：匿名 sample ID、對話長度、分支、瀏覽器版本、可信預期 ID／順序來源、初始已掛載 ID 集合及十個遠距目標。至少一個實際受影響長對話；十個目標在每次案例開始時均確認不在 DOM。樣本不足便標 PENDING，不事後挑成功目標取代失敗案例。

完整索引測試必須核對完整 expected ID 集合，不能只抽查首中尾。為導航測試所選的十個目標不替代完整性測試。

已掛載定位計時從使用者觸發開始至正確高亮可見；搜尋從查詢提交至結果更新。固定資料、環境與量測方式，至少 20 次，使用排序後 nearest-rank p95；失敗計入失敗次數，不從效能樣本中默默刪除。

## 13. 固定驗收案例與 sub-agent 程序

### 13.1 案例矩陣

| 案例 ID | 層級 | 項目 | 通過條件 |
|---|---|---|---|
| ENV-01 | 環境 | Node／依賴／Firefox | 版本、路徑、鎖檔及測試設定檔可重現 |
| CORE-01 | 核心 | 去重與排序 | 重複文字不同 ID 不合併；同 ID 增量更新不重複 |
| CORE-02 | 核心 | 完整度 | 缺頁／未知分支／中間漏 ID 時不得標完整 |
| CORE-03 | 核心 | 分支與競態 | 同 URL 分支切換及晚到舊結果不污染新 epoch |
| CORE-04 | 核心 | 搜尋 | 明確範圍、1,000 則資料集及既定量測通過 |
| FF-01 | Firefox fixture | 載入與重複啟動 | MV3 原生 Firefox 載入、啟停無誤，僅一個 UI |
| FF-02 | Firefox fixture | 掛載定位與返回 | 20 個 ID 全正確，返回同 ID、偏移誤差 ≤24 px |
| FF-03 | Firefox fixture | 歷史載入與取消 | 限制／停止／晚到回呼／無進展案例全部符合規格 |
| FF-04 | Firefox fixture | UI 與輸入 | 鍵盤、聚焦、窄視窗、深淺色及輸入驗證通過 |
| FF-05 | Firefox fixture | 權限與生命週期 | grant／deny／revoke／reload／背景喚醒及清理通過 |
| LIVE-01 | 真實 ChatGPT | 基本定位 | 固定掛載目標正確，記錄實際環境與版本 |
| LIVE-02 | 真實 ChatGPT | 完整索引 | 固定樣本完整 expected ID／順序／總數與分支一致 |
| LIVE-03 | 真實 ChatGPT | 遠距定位 | 預選十個未掛載目標 10／10 正確；記錄耗時與批次 |
| LIVE-04 | 真實 ChatGPT | 分支與頁面切換 | 同 URL 分支、編輯、重新生成、SPA 及晚到結果不錯用 |
| LIVE-05 | 真實 ChatGPT | 容器與工作區 | 跨分頁／容器／工作區不串索引；證據不足不能算通過 |
| LIVE-06 | 真實 ChatGPT | 取消與晚到結果 | 遠距載入中停止、切換頁面後不再捲動或寫回舊結果 |
| LIVE-07 | 真實 ChatGPT | 返回閱讀位置 | 遠距成功後返回原 message ID；穩定高度下偏移誤差 ≤24 px，動態高度差異另記錄；失效提示案例不替代成功返回 |
| REL-01 | 簽章安裝 | 日常安裝與升版 | 簽章 XPI 安裝、重啟、手動升版及設定保持均通過 |

核心、合成 fixture、原生 Firefox fixture、真實 ChatGPT、簽章後驗收分開記錄。任何層級通過都不能自動取代另一層。

### 13.2 證據與狀態

每個結果必填：case ID、執行日期、執行者、Firefox／OS／工具版本、build 版本與 SHA-256、前置條件、固定樣本 ID、操作、expected、actual、耗時／失敗次數、證據檔案與狀態。

狀態定義：

- PASS：確實執行且符合既定條件，有可核對證據。
- FAIL：確實執行但不符合條件；保留失敗，不刪除或改選樣本。
- PENDING：尚未執行，或尚缺帳號／樣本／依賴準備。
- BLOCKED：已嘗試執行，但外部環境使該案例無法繼續；寫清原因與解除條件。這是驗收案例狀態，不是自動 goal 狀態。

證據保留在工作目錄；使用者交付的摘要報告與必要去識別化圖像放 outputs。真實聊天內容、憑證與原始敏感網路紀錄不加入公開套件。

### 13.3 Sub-agent 驗收

1. 主 agent 開發與自測，提供固定來源快照／版本、建置命令、鎖檔、build SHA-256、案例矩陣及已知限制。
2. 驗收 agent 以唯讀方式審查來源，獨立執行可用的核心／fixture／Firefox 案例，核對實際套件與證據版本；若需寫測試輸出，使用獨立 scratch 目錄，不修改成品。
3. 回報缺陷、未執行案例及結果，不因主 agent 宣稱通過就照抄。沒有瀏覽器／登入／樣本能力時維持 PENDING，不宣稱真實驗收。
4. 主 agent 修復；驗收 agent 重跑受影響案例，並對關聯核心流程作必要回歸。
5. build 變更時列出哪些證據失效與為何哪些仍適用；包裝／簽章後重新核對套件 SHA-256。最終報告明列尚未完成的 P0，不以文件審查通過作為功能驗收通過。

T07a 可交付誠實標示範圍的實驗原型；只有 LIVE-01–07 與相關 Firefox 案例全通過，才可稱為已解決長對話導航的版本。正式日常安裝 v1.0 還須 REL-01 及簽章交付完成。

## 14. 本次能力核查與承諾界線

本次已確認：Node.js 24.12.0、npm 11.6.2、Firefox 157.0。Firefox 已以獨立工作目錄設定檔渲染本機測試頁並產生可檢視截圖；沙箱內首次執行失敗，經核准的沙箱外隔離測試成功。這只證明本機渲染可執行，不代表擴充功能載入或真實 ChatGPT 已驗收。

已安裝並鎖定TypeScript、esbuild、web-ext、Firefox／Node型別、selenium-webdriver與geckodriver npm套件。typecheck／lint／建置及官方geckodriver 0.37.1原生互動已驗證；獨立profile可載入實際MV3附加元件、點工具列與原生權限視窗。這些能力不代表已取得ChatGPT登入或真實長對話樣本。

可以承接：Firefox 優先原型開發、資料核心與 UI、測試建立、套件打包、錯誤修復、sub-agent 獨立審查與可執行案例驗收。需實際驗證才可承諾結果：真實長對話全量來源、所有遠距目標、分支／容器、登入測試環境與 Mozilla 簽章。

簽章準備、來源與測試包由主 agent 完成；Mozilla 帳號與必要授權、簽章審查結果及等待時間是外部依賴。未完成時交付原型並標示剩餘工作，不稱作正式已簽章版。

## 15. Git 環境、commit 節奏與 GitHub 雲端同步

### 15.1 Git 環境與首次上雲

此節為使用者追加要求。暫停期間已獲授權完成GitHub私人儲存庫與首次同步；後續使用者已恢復功能開發。GIT-00已完成：私人repo https://github.com/justamowei/chatgpt-toc-firefox ，main與feat/firefox-prototype首次push成功且SHA一致。以下為已執行且後續必須持續遵守的程序：

1. 以 `outputs/chatgpt-toc` 作為獨立專案儲存庫根目錄，先確認不在另一個既有儲存庫內，避免把整個 Documents／Codex 目錄納入。
2. 建立 `.gitignore`，排除 node_modules、建置產物、未簽章／簽章套件、暫存、測試 profile、真實聊天樣本、原始日誌、憑證與 `.env`。追蹤 source、manifest、package.json、package-lock.json、可重現腳本、合成／去識別化測試 fixture，以及必要文件。
3. 將本計畫與驗收／進度文件納入 repo 的 docs，後續與使用者可閱讀的 outputs 文件同步。計畫變更也必須 commit，不能只更新 repo 外的副本。
4. 初始化 Git，核對專案的 author name／email。沿用可用且適當的既有身份，必要時只設定 repo-local config；不任意修改使用者全域 Git 身份。
5. 主分支為 `main`；實作分支為 `feat/firefox-prototype`。基礎專案／規格以初始 commit 保存；暫停前未完成的程式另以 WIP commit 保存在開發分支，測試狀態清楚標示。
6. 雲端使用 **GitHub private repository**，暫定名稱 `chatgpt-toc-firefox`。先確認已登入的 GitHub 帳號、建立權限及名稱是否可用；若同名 repo 已存在，先核對所有權與內容，不覆蓋或直接接上未知儲存庫。
7. 透過可用的 GitHub 工具／CLI 建立私人 repo，設定 origin。使用使用者既有登入／認證方式，不把 token 寫入 remote URL、來源或日誌。
8. push main 與開發分支、設定 upstream；核對 GitHub 的 private 狀態、remote URL、分支與遠端 HEAD SHA 與本機一致，才標 GIT-00 完成。

若尚缺 GitHub 登入／授權／目標帳號，先完成可逆的本機 Git 快照，記錄雲端同步待完成；依本次要求，雲端首次 push 完成前不繼續新增功能。不可把只有本機 commit 當作已上雲。

### 15.2 Commit 觸發條件

採「功能或時間，以較早達到者為準」：

- 完成一項可辨識的小功能、修復、測試組或文件變更時立即 commit；不要等到整個版本才一次提交。
- 累積 **30 分鐘有效開發時間**，即使功能尚未完成也建立 checkpoint commit；若沒有檔案變更不建立空 commit。純等待、暫停期間不計入有效開發時間。
- 切換主要任務、交付 sub-agent 驗收、結束當輪開發或依使用者要求暫停時，優先保存已產生的變更；若暫停要求僅允許文件更新，先停止程式工作並記錄尚未 commit 的狀態，恢復時立即補快照。
- sub-agent 不與主 agent 同時寫 Git history。主 agent 負責 commit／push；驗收 agent 以固定 commit SHA 建置、執行測試與審查。

時間檢查點採 `wip: ...`，僅留在開發分支，記錄未完成內容與測試狀態。功能完成採 `feat:`、修復採 `fix:`、測試採 `test:`、文件採 `docs:`、環境採 `chore:`。Commit 訊息描述本次具體行為，避免只有「update」或「backup」。

### 15.3 Commit 前的檢查

- 使用 git status／diff 核對預計納入的檔案，精確 stage 相關路徑，不把真實聊天、登入資料、測試 profile 或依賴目錄混入。
- 功能／修復完成 commit 執行與變更相符的 typecheck、lint 與測試。僅文件變更檢查文件一致性；不重跑無關的全部測試。
- 時間 checkpoint 可保存未完成的程式；若測試失敗或未執行，commit 與進度紀錄必須寫明，不得當作已通過。
- 計畫、驗收案例、實際程式能力與測試結果一起更新；重要測試報告對應 commit SHA、build 版本與套件 SHA-256。
- 不為了通過檢查而移除失敗案例、縮小固定長對話樣本，或把真實驗收改成合成驗收。

### 15.4 Push 與雲端核對

**每一次 commit 後都 push 對應分支。** 建立 checkpoint 的目的包含雲端可恢復性，不只本機歷史。

- 首次推送設定 upstream；之後確認推送成功並核對遠端分支 SHA。使用 git ls-remote 或 GitHub 分支資料驗證，不只依命令已呼叫就寫成功。
- push 失敗時保留本機 commit，記錄失敗原因、最後成功 push SHA 與尚未同步 commit；嘗試處理可恢復的網路／認證問題，無法解除就向使用者報告，不反覆要求其已提供的授權。
- 不 force-push、不重寫已推送 history、不刪除遠端分支；修正以新 commit 進行。需要不可逆歷史操作時另說明原因。
- 預設在開發分支工作。main 只納入已完成且符合對應驗收範圍的變更；實驗原型可發布於開發分支，不將未驗證的長對話能力標成正式版。
- GitHub 儲存庫持續保持 private。公開發佈、建立 Release 或上傳簽章套件是另外的交付動作，不能因一般 push 自動執行。

### 15.5 Git 驗收與進度紀錄

| 案例 | 通過條件 |
|---|---|
| GIT-01 | 專案有獨立 Git 根目錄、正確忽略規則、可核對身份、main／開發分支 |
| GIT-02 | origin 指向已確認的 GitHub 私人 repo，本機與遠端初始 SHA 一致 |
| GIT-03 | 功能完成或 30 分鐘檢查點有 commit；WIP 與已驗收功能清楚區分 |
| GIT-04 | 每次 commit 後有成功 push 紀錄，失敗與待同步項目明列 |
| GIT-05 | sub-agent 驗收固定 commit SHA，修復後以新 SHA 重驗受影響項目 |

進度文件至少記錄：時間（Asia/Taipei）、branch、commit SHA、功能／WIP 摘要、測試結果、push 結果、遠端 SHA、下一步與未解除限制。

### 15.6 暫停時的歷史快照與恢復後狀態

暫停時已有package.json／package-lock.json、tsconfig.json、Firefox manifest、.gitignore、未驗證的core.ts與background.ts，均已保存。恢復後已完成DOM adapter、導航介面、設定、建置／測試／打包腳本，結果以docs/progress.md與原型驗收報告核對；保留歷史失敗，不以目前結果回填舊快照。

GitHub private 儲存庫已建立：https://github.com/justamowei/chatgpt-toc-firefox 。main 文件／專案基線與 feat/firefox-prototype 未驗證程式 WIP 均已保存、push 並核對 SHA。詳細紀錄在 docs/progress.md；最後文件更新後的分支 SHA 記於 outputs/GitHub 建立結果.md。功能開發已獲使用者恢復授權，後續結果依 docs/progress.md 與原型驗收報告更新。

### 15.7 目前任務狀態與下一階段

| 任務 | 原型狀態 | 尚缺條件 |
|---|---|---|
| GIT-00／T00 | PASS | 維持每次commit的push／SHA核對 |
| T01 | PENDING | 獨立Firefox內由使用者登入、至少一段受影響長對話、固定預期ID／分支與十個未掛載目標 |
| T02–T04 | 原型合成自測PASS | 真實ChatGPT adapter selector與定位LIVE-01仍待驗證 |
| T05 | 合成有限載入／取消／返回PASS | 真實完整分支來源、全量索引與十個遠距目標尚未完成 |
| T06 | 原生權限自測PASS | 真實編輯／重新生成／容器／工作區與背景連線邊界持續複驗 |
| T07a | PASS，原型打包與獨立複驗完成 | 已測v0.1範圍無剩餘阻擋缺陷；固定來源、套件hash、歷史失敗与PENDING案例見驗收報告 |
| T07b | PENDING | Mozilla帳號／簽章授權、簽章後重啟及升版驗收 |

未具備T01條件時繼續可獨立執行的原型修正與文件工作；不以增加自動捲動重試替代可信全量來源。正式長對話版需依13.1案例逐一通過。

### 16. 2026-10-03：DOM 改版零索引修復規格

v0.1.1 必須覆蓋 legacy message role／ID、明確角色 turn shell／ID、turn key 下 user bubble／assistant role。不得用文字或奇偶位置猜角色，空 key 或純槽位編號不能當穩定 ID；共用 group 的 ID 必須包含角色。去重、空殼、附件、輸入框／側欄排除、動態属性 hydration 與 managed CSS 高亮均需原生 Firefox 回歸。

零索引不能只顯示失敗訊息：提供使用者可主動開啟的頁面診斷，僅包含版本／結構標記數量，禁止聊天文字、訊息 ID、完整 URL、帳號、持久化或傳送。新版安裝要明示版本與移除舊版／重整頁面步驟。

合成通過不能取代 LIVE-01；使用者實際頁面仍需核對提問数量、定位／高亮與新增提問即時更新。工具無法操作真實頁面時，繼續隔離測試與交付修復，請使用者提供數量診斷完成變體確認。未知分支不累積卸載歷史的原規定保持。

### 17. 2026-10-03：完整歷史索引需求

使用者已確認v0.1.1能抓取真實對話，但僅约6–7題。此為辨識修復回饋，LIVE導航／完整度仍未通過。現production branch=null、未知分支卸載撤銷及直接頂／底載入造成目錄只覆蓋mounted window；不設假七題上限，也不靠放寬安全規則宣稱完整。

下一階段規格見docs/full-history-plan.md：預設完整提問目錄＋全文搜尋，分頁／current_node-root可靠來源與DOM定位分離，使用者主動啟動、目前對話唯讀、憑證僅請求記憶體、無外部傳送／保存。候選網站介面未文件化且未實测，來源adapter、完整proof、UI分支核對、取消與有限navigation各自驗收。FULL01–12與既有LIVE gate未過前，不能發布已保證全量的版本。

### 18. 2026-10-03：v0.2.0 實驗版實作

source 22cc60b 實作完整歷史來源與獨立索引；掛載目錄原保守規則維持，server快照不因正常卸載變小。畫面標示伺服器分支及子集核對數，不能標整段畫面分支已驗證。載入按鈕唯讀目前對話；完整資料僅留頁面記憶體，取消／撤權／停用清理。實作與測試見 docs/full-history-v0.2.0.md、docs/acceptance-v0.2.0.md。

最終實作source 95c2694另修 has_next_page newest 邊界：明示還有新頁時不得套用完整结果，older頁有新頁是正常分頁。原source獨立反例FAIL與修正後結果均保留。交付source／套件hash以新版驗收報告為準。

分支完全替換、slotless assistant新身分、跨卸載回答witness、回到較早錨點方向、附件正文／檔名與空user hydration均須回歸。真實完整expected集合、登入及內部API、UI分支與所有LIVE gate仍PENDING。僅交付未簽章實驗版，不把本輪合成通過當成正式全量保证。

## 2026-10-03：v0.2.0 使用者真實超限失敗，交付門檻收緊

使用者回報仍隨掛載數變動，完整載入提示為「對話超出本次載入上限，未宣稱完整；仍可使用已掛載目錄。」已確認 HistoryError limit，但頁大小、總量、文字／深度等具體類型待證據。產品目標 LIVE FAIL；舊合成 PASS 保留，不能抵銷實際失敗。新增 docs/live-history-failure.md，完整目錄數、穩定搜尋、全集合／分支与遠距定位必須真實 Firefox 驗收後才可交付修正版。目前沒有受允許 Firefox 分頁控制通道，不繞過先前網址政策限制；已請使用者提供無內容 network 大小／狀態 metadata。新 runtime 尚未改動。

## 2026-10-03：依使用者指示撤回 API／縮頁方向

使用者要求先處理5–7則虛擬化窗口卸載、保留已看過的項目，並用computer觀察真實Firefox。正式content/dom/turns/package/lock/manifest恢復到5aa5102 v0.1.1，與該source逐檔diff為空。正式build content SHA0f2d006125a6c643f0354fdeeeebab728dd431014f4cccb6cbace60e89be766b，與既有v0.1.1一致；typecheck/build/lint(0/0/0)/core12 PASS。不把撤回當快取問題已修好，使用者Firefox已安裝v0.2.0尚未透過UI換載。

不抹Git歷史，保留3bedace實驗／合成報告但標withdrawn；新DOM資料保留規格見docs/observed-dom-cache-plan.md。已确认IndexStore的branch=null卸載reset／filter是資料丟失機制；新的已觀察快取尚未實作，真實分支與渲染訊號需先看Firefox。CUA inventory無native apps/Firefox，只有空IAB/MCPApps；本輪工具無node_repl/sky，插件搜尋Firefox無結果，沒有親自進入實際頁面。之前API network大小問題不再需要；不繞政策限制。後續需可用且允許的Firefox控制通道。
