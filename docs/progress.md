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

## 2026-10-02 20:19：自然背景休眠不移除目錄

- 9afa2c9b2602b51f0088b57ae59317c6b9e3d19d已push、遠端SHA一致；其後計畫文件a7e682bb80662f1974d85c0a41e93578ee6be486也已push並核對。
- sub-agent對9afa獨立主要8組、權限5組與額外邊界3組PASS，另找到阻擋缺陷：兩個auto頁面、關閉options後35秒自然idle，background stopped且兩個UI消失；喚醒後不復原。保留該FAIL證據。
- 修正：runtime port斷線只清除port參考，不再誤判為停用。內容UI與索引在頁面本機持續運作；明確停用／撤權仍透過dispose訊息，背景tabs.sendMessage fallback能處理已無port的頁面。
- 新增原生自然idle案例：35秒無extension API、background確實stopped、兩UI保留且新增訊息20→21。接續由options喚醒並撤權，兩個頁面皆清理，reload不重注入。權限／生命週期6組PASS。
- 主要8組關聯回歸PASS；20/20定位、0失敗，p95 122.62ms，返回最大偏移0px。核心及background來源未改，沿用已通過的對應核心證據。
- 本組立即commit／push並核對；交付新固定SHA給sub-agent複驗。整個Firefox重啟、真實ChatGPT、ESR、容器／工作區與簽章仍PENDING。

## 2026-10-02 20:33：原生停用再啟用唯一目錄與CSS生命週期

- 2cfe1e712c58da57975c5d1154e4f1bc64cc1daf已push且远端一致；sub-agent主要8/8、權限6/6、自然與強制active UI休眠／喚醒PASS，修復上一缺陷。
- 新獨立FAIL：原生addon.disable銷毀content context但舊DOM殘留；enable後工具列再啟動生成2個root，違反唯一實例。uninstall殘留DOM另列觀察限制。
- 修正：新content context啟動前清理孤兒root與舊高亮標籤；目錄預設隱藏，host.css由Firefox scripting插入／自動註冊管理，原生停用／移除時樣式自動移除。高亮改用同一管理CSS，不遺留inline outline。自然background idle不移除管理CSS。
- 更新既有auto註冊缺少host.css的協調路徑，加入原生registration-upgrade回歸。
- 主測：主要8/8，20/20定位p95 113.50ms、0失敗、返回0px；權限／生命週期7/7；addon disable／enable唯一可操作root／uninstall隱藏且reload無root 3/3。Typecheck／build／lint／package均退出0。
- 測試初輪highlight helper誤收合持久expanded面板，定位按鈕不可見；保留run1-toggle失敗證據，改為只有收合時才展開，不改產品行為或門檻。
- 浏览器卸載context後不能執行JS清理；隱藏且不運作DOM需reload或新context清掉，文件明記。明確網站撤權／單頁停用仍直接清DOM。
- 本組完成後立即commit／push／核對，交新固定SHA重新驗受影響的background、CSS、DOM及原生流程。核心未變，舊獨立核心證據明記重用；LIVE／ESR／容器／簽章仍PENDING。

## 2026-10-02 20:39：固定建置資產換行

- fb5bfa0fbad4c011d05583d89e947a6112f28370已push且遠端一致。sub-agent固定快照原生回歸進行中，發現host.css raw copy因工作樹與git archive資產換行不一致而有不同hash；JS bundle相同。字節核查：獨立archive raw CRLF hash=f3ac96f93a29de3bed06affeee5d902baf1cb4706f032d337a2fbb318a992ad4，canonical LF hash=5dfc4c888918275eb536a33e22a37f3153d8a1d273d60feb83a453c864bdc8bb。
- 修正build對options.html與host.css固定UTF-8／LF，不修改runtime功能。正式及fixture重新build、lint、package並比對hash；新的canonical CSS預期與sub-agent先前LF資產相同。
- 原CSS差異保留記錄，不能聲稱fb5當時所有輸出byte一致。新快照需獨立重建核對；只有runtime JS、CSS與manifest皆byte-identical的原生證據才明記重用，不將舊整包hash套用新ZIP。

## 2026-10-02 20:50：v0.1原型交付與獨立驗收完成

- 交付建置來源5cf4764741cca11cf9b52310007cb656fd5b9606已push，遠端SHA一致；最後只追加文件，不改runtime。
- GPT-6.1 Sol high獨立fb5主要8/8、權限7/7、addon生命週期3/3、額外SPA／未知分支／可信輸入3/3、自然及強制idle／喚醒PASS。20/20定位p95 208.96ms、返回0px；實際窄視窗500px。
- 獨立5cf：offline npm ci／typecheck／build／lint／package退出0；canonical addon lifecycle3/3與原生grant／兩auto可見UI／force／wake PASS。JS與manifest byte-identical、HTML/CSS經換行normalization等價，關聯回歸有直接canonical證據，不冒稱raw assets byte-identical。
- 七個ZIP members逐一對應dist；主交付ZIP SHA862fe1bfe7e7ebbca31d47e2ab15a45c196deceef5f446615b3a19cea5df0162。獨立ZIP timestamp不同，整包hash另記最終報告，檔案hash一致。
- T07a原型範圍PASS，無已知剩餘阻擋缺陷。歷史FAIL均保留。LIVE-01–07／ESR／容器工作區／REL-01仍PENDING，未稱作原長對話問題全部已解決或正式日常版。
- 安裝目錄、ZIP、預覽與中文驗收／安裝說明已放outputs；兩份獨立報告同步repo docs與outputs。最後文件commit後立即push、核對遠端SHA，確切最後文件SHA以Git log為準。

## 2026-10-03：v0.1.1 零索引相容修復

- 使用者真實 chatgpt.com／Firefox 157 一般視窗，有目錄但新舊對話 0 則；不保存完整對話 URL 或內容。
- 新增 turn key／user bubble、角色 turn shell／turn ID 辨識，角色限定 ID、巢狀去重、排除控制文字／側欄／輸入框／空殼；新增屬性 observer 與新節點高亮。
- 新增本機「頁面診斷」只提供版本及標記數量，無聊天文字、ID、URL、持久化或傳送。
- Firefox 157 新結構六組 PASS：旧 selector 0→新版6、定位與實際3px outline、返回0px、去重／附件、hydration、殼、失效／未知分支。Typecheck、核心12/12、正式build／零警告lint PASS。
- 首輪測試 helper Promise 呼叫失敗與核心 esbuild 沙箱權限失敗保留，修正測試 await／正常工具權限後通過；產品核心未改。
- 本修復立即commit／push核對，接續 GPT-6.1 Sol high 固定SHA獨立原生驗收、受影響原生回歸與新交付包。LIVE仍待確認；不承諾全量長歷史。
- 電腦操作因目前Windows瀏覽器未支援網址政策而停止；不繞過限制，合成瀏覽器與程式工作继续。

## 2026-10-03：獨立驗收返回錨點缺陷修復

- 6a67fbfe240d838335e517ecd3e0e96c54f0e2fb 已push／遠端一致。GPT-6.1 Sol high於固定archive原生複驗：new6 PASS；獨立9 probe中8 PASS／1 FAIL。
- IND-08：空assistant sentinel的parent中有user bubble，textOf誤讀user文字並建立assistant return anchor，提問離開viewport後仍錯誤啟用返回。FAIL結果與截圖保留。
- 修正：sentinel候選內容本身或後代含user marker時不建assistant錨點；新增NEW-07檢查wrapper空白可視但user不可視的返回disabled情況。
- New7／typecheck PASS；測試NEW-01改用整個main的原始legacy queryall，確認真正0→6，不用預先過濾composer。runtime此次仅sentinel處理改變。
- 首個快照legacy8／addon生命週期3 PASS；本修復立即commit／push／核對，接續新固定SHA獨立複驗及正式包替換。

## 2026-10-03：新舊混合 user marker 一致排除

- c1e833771073506fd528858bd2d4b498bb5b6fa4 已push／遠端一致；獨立stock7 PASS、原9 probe全PASS，IND08修復。追加純turn shell後代共用空sentinel之IND09 FAIL，10組為9PASS／1FAIL。
- 原因是matches已包含data-turn=user，但querySelector後代判斷漏掉；統一userMarker常數供兩者使用，新增NEW08；保留c1 FAIL結果／截圖。
- 最後來源new8／typecheck PASS。此修復僅變更sentinel排除marker集合，其他runtime不變。立即commit／push／核對，再以固定SHA獨立重跑stock8＋既有10probe、主測legacy8／lifecycle3與最終交付hash核對。

## 2026-10-03：v0.1.1 最後交付與獨立 PASS

- 最後runtime來源5aa5102e2cc5e605196f6edfce2fb6d6b4faf649已push／遠端一致。主測新8、legacy8、addon生命週期3均PASS；20/20定位p95 135.0866ms、返回最大偏移0px。Typecheck／正式build／lint 0/0/0／package均PASS。
- GPT-6.1 Sol high獨立固定archive：ci／build／typecheck／lint／package／verify退出0；原生new8/8、自主probe10/10 PASS。6a67 IND08及c1e833 IND09相同sample皆轉PASS；前兩個FAIL報告、logs／JSON／截圖另保留。
- 正式交付六runtime與獨立canonical一致；交付ZIP含build-info之7members也全相符。ZIP SHA256 7f6b70e09178c7a0cd73f7d5ed8419546c24f1b4c4fd739ed90cf719e7dca3d7，prodcontent 0f2d006125a6c643f0354fdeeeebab728dd431014f4cccb6cbace60e89be766b。
- 交付outputs/Firefox-原型-v0.1.1、ChatGPT-對話導航器-v0.1.1-未簽章.zip、bugfix-v0.1.1.md與Firefox-sub-agent-v0.1.1驗收.md；manifest正式origin僅chatgpt.com、無測試origin。
- 同步安裝說明／計畫與v0.1歷史報告註記，最後文件commit／push／核對。核心沿用12/12且blob未改；舊權限7組保留歷史证據，不當作本輪獨立重跑。
- 使用者真實頁面更新後的收錄／定位仍PENDING，請先移除舊暫時addon、載入新版manifest、reload ChatGPT再用工具列啟動；若仍0，回覆頁面診斷數量即可。無法直接操作Firefox是目前工具網址政策限制，不繞過；LIVE／長歷史／ESR／容器／簽章維持PENDING。

## 2026-10-03：使用者確認辨識成功，完整索引需求核查

- 使用者回報v0.1.1已能抓取真實對話，約6–7題；仅記錄辨識回饋，不把LIVE完整度或十個遠距目標改PASS。
- 核對沒有七題硬上限。production branch=null，卸載撤銷原索引；load直接頂／底也不能覆蓋中間虛擬內容。
- 完成docs/full-history-plan.md与FULL01–12門檻，原計畫§4.2允許正常登入同來源唯讀探索，建議以可靠歷史來源及DOM按需定位分離。資料端、分頁、分支、取消與失敗均有明確契約。
- GPT-6.1 Sol high唯讀審查已交outputs/Firefox-完整對話索引-唯讀設計審查.md；沒有改產品source或取用真實帳號／Firefox profile。
- 本組僅需求／設計，沒有接入網站API或更改v0.1.1行為；不宣稱完整載入已開發。文件低影響變更不新增鏡像測試，立即commit／push／核對。

## 2026-10-03：完整歷史來源模組

- 使用者要求執行完整索引方案；新增同來源目前對話的唯讀 loadHistory，明確呼叫才請求 session 與歷史，不寫入 storage 或 log。
- 新分頁協定需明確耗盡，舊 mapping 僅第一頁 404 後使用，沿 current_node 到真實 root；全部完成後重新核對 head，拒絕資料中途改變。
- 固定來源、型別／ID／順序、隱藏訊息、串流大小、時間、頁數／訊息上限與取消晚到請求均有獨立測試。HIST-01–17 主端與模組作者均 17/17 PASS；既有 CORE 12/12、完整索引 4/4 PASS。此 commit 只包含可獨立測試的來源模組，前端整合仍在進行。
- source 及憑證均未取用真實使用者 Firefox profile；候選網站協定與真實登入驗收仍 PENDING，不把 localhost 合成 cookie/token 當成真實帳號驗證。
