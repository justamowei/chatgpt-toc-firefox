# Firefox v0.2.0 獨立驗收

固定來源 **95c2694e03185f66a1a0dc19a62bc8280b61420e** 在合成隔離環境的驗收 **PASS**；本輪未再发现阻擋此原型合成驗收的缺陷。38 個單元測試、42 組原生 Firefox 測試與一項自主分頁反例複驗全通過。真實 ChatGPT 完整歷史仍 **PENDING**，此結論不能解讀為使用者真實對話已全部載入或所有畫面分支均已確認。

## 來源、執行環境與獨立性

2026-10-03 台北時間；執行者 **/root/firefox_acceptance**，沿用 GPT-6.1 Sol high。從固定 commit 執行 git archive 至 work/acceptance/95c2694，與 parent repo 的 dist 分離；主來源與 Git history 未修改。所有測試命令 TOC_TEST_EXECUTOR 均為該執行者，五個原生 suite 的 results.json 也已核對相同。Firefox **157.0**、Node **24.12.0**、Windows **10.0.19045**、geckodriver **0.37.1**；使用新隔離 headless profiles 與 127.0.0.1 synthetic HTTP/cookie。没有讀取使用者 Firefox profile、真實聊天、帳號 cookies 或真正登入 token。

依 parent 指示以 junction 重用既有固定版本 node_modules，沒有重裝 npm ci；不主張本輪驗證乾淨 npm 下載／供應鏈重現性。原生 suite 使用同來源 localhost fixture build；正式 bundle 另獨立 build/lint/hash 核對。

## 命令與結果

| 命令／suite | 結果 | exit code |
|---|---|---|
| npm run typecheck | PASS | 0 |
| node --test tests/core.test.mjs tests/history.test.mjs tests/full-index.test.mjs tests/dom-history.test.mjs | 38/38（core12/history18/full-index7/dom-history1） | 0 |
| npm run build:firefox | PASS | 0 |
| npm run lint:firefox | 0 errors / 0 notices / 0 warnings | 0 |
| npm run test:firefox-full-history | 16/16 | 0 |
| npm run test:firefox-renderers | 8/8 | 0 |
| npm run test:firefox-fixture | 8/8 | 0 |
| npm run test:firefox-permissions | 7/7 | 0 |
| npm run test:firefox-addon-lifecycle | 3/3 | 0 |
| node independent-next-page-probe.mjs | 同樣舊版 FAIL scenario → PASS | 0 |
| npm run package:firefox；verify-package.ps1 | 六runtime與兩ZIP各7members一致 | 0 / 0 |

CORE-04 1000提問／20次搜尋 p95 **2.0793 ms**；主要導航20/20成功、p95 **141.8958 ms**、返回誤差 **0 px**。這些是合成資料測量。五套原生測試依序執行，不與 parent 共寫 fixture build。

## 完整歷史逐案期待與實際

| 案例 | 期待 | 實際 | 結果 |
|---|---|---|---|
| FULL-NATIVE-01 | 200則完整索引／僅7則掛載／點擊前無請求 | 200 expected = 200 actual；掛載7；同來源cookie與synthetic bearer皆核對 | PASS |
| FULL-NATIVE-02 | 離屏提問可搜尋；HTML字串安全 | 第0則可找到；onerror字串作純文字，無img執行 | PASS |
| FULL-NATIVE-03 | 10個遠距目標定位且保留完整清單 | 0/199/38/160/77/122/10/188/99/193；保留200 | PASS |
| FULL-NATIVE-04 | 已載入後user edit撤銷snapshot | 撤銷；回mounted7 | PASS |
| FULL-NATIVE-05 | 取消後晚到HTTP不套用 | lateResultApplied:false | PASS |
| FULL-NATIVE-06 | 403及缺cursor拒絕且保留mounted | forbidden/badCursor rejected；mounted7 | PASS |
| FULL-NATIVE-07 | 換route／dispose取消舊HTTP | wrongRouteApplied:false；lateAfterDispose:false | PASS |
| FULL-NATIVE-08 | 新增user prompt撤銷旧snapshot | newPromptInvalidation:true | PASS |
| FULL-NATIVE-09 | 空窗後整個other branch不可混索引 | oldBranchSearchCleared:true | PASS |
| FULL-NATIVE-10 | slotless explicit assistant新ID regenerate撤銷 | noSlotRegenerationRevoked:true | PASS |
| FULL-NATIVE-11 | 載入中answer text變更不套用 | changedDuringLoadApplied:false | PASS |
| FULL-NATIVE-12 | 返回較早、已卸載anchor | unmountedReturnRestored:true | PASS |
| FULL-NATIVE-13 | pending卸載再掛載仍保存變更見證 | pendingWitnessPreserved:true；staleSnapshotApplied:false | PASS |
| FULL-NATIVE-14 | 已載入transition保存舊answer見證 | loadedWitnessPreserved:true | PASS |
| FULL-NATIVE-15 | 空user hydration視為未掛載 | emptyIsUnmounted:true；completeRetained:200 | PASS |
| FULL-NATIVE-16 | newest明示has_next=true不可稱完整 | unreadNewerPageRejected:true；mountedFallback7 | PASS |

其他26組涵蓋新舊renderer/legacy query零索引、dedup/attachment、attribute hydration、sentinel不得借user anchor、未知branch保守失效、safe text、重複啟動、窄視窗/鍵盤、virtual-load停止後無晚到捲动、route pending刷新競態。選用權限原生拒絕/授權、registered CSS upgrade、forced stopped→runtime wake、**35秒無extension API自然idle至stopped但兩UI保留且append更新21**、idle後revoke兩頁DOM0、未知runtime schema全通過。Lifecycle3核對disable隐藏UI/highlight、reenable單一usable root可定位、uninstall後隱藏且reload DOM0；disable/uninstall当下仍有 inert 隱藏DOM與owned marker，未冒稱立即零DOM。

全部42組的原始case期待／實際JSON、逐案表與截圖在 canonical evidence。

## 先前 FAIL 與修復複驗

首次來源 **22cc60b77466fd41dfeeba0257a9f5e484fa59b7** 的typecheck/37unit/build/lint與15+8+8原生suite皆PASS，但自主 **IND-NEXT-01 FAIL，exit1**：newest JSON明示 has_previous_page:false + has_next_page:true，二次相同head仍回 resolved:true / exhausted:true / count:1，三次請求。此快照不准以stock PASS宣稱可交付完整歷史。

95c2694新增可選next布林shape檢查，拒絕first/newest reread的true，older next=true仍合法。相同自主sample複驗回 **schema拒絕，2 requests，PASS**；HIST18與FULL-NATIVE16也通過。舊FAIL程式/JSON/log與舊snapshot結果保留在22cc60b evidence，沒有覆蓋。

## 正式建置與交付核對

正式manifest version0.2.0；permissions仍 activeTab/scripting/storage；optional_host_permissions僅 https://chatgpt.com/*，沒有新增帳號通讀權限或localhost origin。三支正式JS均編譯 FIXTURE=false；未含fullFixture/synthetic-fixture-token/TOC_TEST_EXECUTOR/handleRequest等測試入口。未minify產物仍保留FIXTURE=false guard下不可達的loopback字串，不能聲稱所有127.0.0.1字面值已移除；production origin injection拒絕另有HIST02單元測試。

下列六檔：獨立fixed build = build-info = outputs/Firefox-原型-v0.2.0逐一相等。

| 檔案 | SHA256 | 結果 |
|---|---|---|
| background.js | bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977 | PASS |
| content.js | 625f31fd5c14ec064a6bde4c7fc3ff39f76b7e60bc1b2f1fc3a746204a4675d7 | PASS |
| options.js | a986be9a94429358b8a9fd6871e3ab0672cc75fdb1c020cdd1878f8076350ad4 | PASS |
| options.html | 163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf | PASS |
| host.css | fbc849f0af4b24c89360b59ca8b55d0ccd423429f737b0db422a651d57a5c6a4 | PASS |
| manifest.json | ae6d6619600bb6a07cf2d8c26e4f96fcae24fa193c4abf09a7e1a78763e03c14 | PASS |

正式交付 ZIP SHA256 **1d0723f76997e0f173ac4633cc45e8919e34f2dcc85edf98121cdc6d06de5c5c**；獨立重包ZIP SHA256 **846cb82b56b9dea1f5a44e766744e838f6fa1d84616d5fbcb158f728edb3fe84**。ZIP時間戳／打包時間可能使整檔hash不同；兩ZIP各**7members**（上述六檔＋build-info.json）已解壓串流計算hash，逐檔相等於canonical build及delivery folder，包括build-info。parent提供的最後contenthash與本獨立build完全相同；舊22cc的b186…3065及3b335…202d包不是此最終交付。

最終fixture content SHA256 **0edb421afc66d3842eab485c1a5c4ab6a0c2a17d3d33df08ce43875ccb4b29cb**，與五套原生metadata相同；fixture/prod有編譯設定與origin差異，未冒稱二者byte-identical。

## 邏輯審查與未驗證範圍

取消／route／dispose採task token、AbortSignal與alive/context guard；fetch忽視abort的晚到結果不會apply。snapshot與mounted IndexStore分開；不把每次只mounted7當完整proof。UI核對只涵蓋可觀測subset ID/角色/順序/正文與answer witness；畫面沒有掛載的其他分支或regen沒有觀測見證，仍不能保證即時發現。API缺revision時revisionVerified=false；first-head reread可偵測已觀测head變更，不是原子transaction，也不證明未觀測middle完全不變。

history只在明確click後對目前URL UUID固定same-origin GET，session token本次記憶體使用；404 only legacy fallback，401/403/schema/limit失敗保留mounted模式。unit覆蓋pagination/cycle/hidden角色/大小時間頁數上限/429有限Retry-After/abort與附件screenText。沒有chat/token storage或跨對話讀取的新功能。內部web endpoint不是OpenAI公開穩定API；合成schema、同origin cookies與bearer成功不能替代真實網站協定驗證。

**PENDING：** LIVE-01–07、方案FULL-07真實登入/schema與FULL-11真實整段expected集合、實際OpenAI分頁／revision語義／版本變化／附件renderer與scroll掛載、Firefox ESR、容器分頁、REL-01 signing。FULL-NATIVE-07/11是合成route/dispose与pendinganswerchange，編號相近但不是方案FULL-07/11真實gate。未執行應保持PENDING，不能轉PASS。

## 證據位置

主報告：outputs/Firefox-sub-agent-v0.2.0驗收.md。最終canonical evidence：outputs/Firefox-v0.2.0-獨立驗收證據/95c2694（provenance.json、原生逐案結果.md、五套results.json/截圖、所有命令log、package-verification.json、runtime-policy-verification.json、兩build-info、source-archive.zip）。舊FAIL：outputs/Firefox-v0.2.0-獨立驗收證據/22cc60b/首次驗收-FAIL保留.md及同目錄probe/JSON/log。完整scratch與archive另保留work/acceptance/95c2694與22cc60b。
