# v0.3.0 已觀察提問保留快取：獨立候選驗收

2026-10-03（Asia/Taipei）。使用者指定 GPT-6.1 Sol high sub-agent 驗收任務，執行者 `/root/cache_candidate_acceptance`。

初次固定來源為 **3bfbc718ea5d3cea324bfec89669df2e08f42519**；本次發現一項答案返回方向缺陷，主代理修正後，最終固定來源為 **4c3d838d187b0e2771bbf58d6ba00ddc0b07a4b2**。此文件的最終結論對應後者。沒有發現沿 workspace 至 repo 的適用 AGENTS.md。

**已見資料保留的核心／本機重播及獨立本機 Firefox 八項回歸通過；真實 Firefox chatgpt.com 完整 addon LIVE 驗收仍未完成。** 本結果不批准宣稱使用者問題已全面修好或交付已驗證可用的正式安裝包。

## 本代理實際執行與證據範圍

兩個固定提交皆獨立執行 typecheck、核心測試與重播。主代理完成原生執行後，本代理另對最終固定 SHA 重建 fixture 並獨立執行八項 cache 回歸，使用新隔離 profile、headless Firefox 與 localhost；沒有操作真實網站／帳號／使用者 profile，沒有修改 source、tests、Git。本代理只新增本文件作 tracked change；命令會更新 ignored artifacts、fixture dist 與隔離測試工作資料。

| 檢查 | 最終固定提交實際結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:core` | 20/20 PASS，0 fail／skip；synthetic 1000 則搜尋 20 次 p95 約 3.22 ms |
| `node scripts/replay-cache-candidate.mjs docs/evidence/iab-cache-fix-2026-10-03/frames.json` | exit 0；20 窗口、精確 12 IDs／全文／顺序，最後 mounted=2、quarantine=0、ordered=true；未標 verified-complete |
| source／提交差異唯讀審查 | 最終 source 相對初次 SHA 僅增加 content.restore 的缺錨點答案拒絕 guard |
| 正式 bundle 讀取與 hash 核對 | `dist/firefox/content.js` SHA-256 與已提交 production-build-info.json 一致 |
| `TOC_TEST_ARTIFACTS=artifacts/independent-seen-cache-4c3d838 node tests/firefox-seen-cache.mjs` | exit 0；Firefox 157.0；獨立 CACHE-01–08 全部 PASS；重新建置 fixture 的 content hash 與主代理相同 |

原生執行前後，`git diff --exit-code 4c3d838d187b0e2771bbf58d6ba00ddc0b07a4b2 -- src tests scripts package.json package-lock.json manifests` 皆無差異。一般 sandbox 首次阻擋 esbuild 讀取父目錄，fixture 未啟動；經批准的 escalation 重跑才完成。該首次環境失敗不是產品測試 PASS，也沒有忽略它後沿用舊 artifact。

重播輸入來自真實 IAB ChatGPT 中性自建對話：當時以 `src/turns.ts` 編譯的純唯讀解析 callback 取得窗口辨識結果，之後以本機 IndexStore 重播。本代理獨立重跑的是重播與 assertion，沒有重新取得頁面 DOM。`addonExecutedInIab=false`、`firefoxLiveAcceptance=false`。這不是在 IAB 執行 addon，也不是 Firefox 正式網站 LIVE PASS。

核心 SEEN-06 另重播上一輪 56 個已完成真實 IAB 窗口，插入空 snapshot；核對每步已見 ID／正文集合，以及最後 12 則順序、unknown branch 和沒有正常卸載 epoch 重置。新 20 窗口重播由獨立 script 對全部預期 ID／全文／順序做 deepEqual，不能只以數量 12 當作正確證明。

## 保留快取與 DOM／導航整合審查

- IndexStore 明確分開 plain-data entries、mounted 集合、cacheRevision、navigation epoch；不保留 adapter 的 DOM 欄位。穩定 ID 的資料不因正常卸載、空窗口、非重疊窗口或 slot 換號而刪除。暫時 ID 僅供當前掛載，同文不同 ID 不合併。
- 順序以實際窗口的 ID precedence graph 合併；沒有 overlap／bridge 的區段仍保留，但不靠捲動方向、slot 編號或 first-seen 時間假定全序。連通圖也可能有不唯一的順序，UI 顯示待核對；正文（包括追加編輯）或順序矛盾隔離舊 generation，舊文字仍供搜尋，返回位置與晚到導航失效。
- production branch 永遠為 null；UI 顯示分支未完整核對與歷史尚未完整。提問快取不能辨識所有僅改答案的重新生成／分支切換。當前掛載定位仍須精確 user role、stable ID、正文；離屏項目須在重掛載後再核對 context、epoch、connected、viewport。沒有按相似文字替換目標的成功路徑。
- MutationObserver 回呼立即 collect，120 ms 只延遲 render；removed subtree 只收錄尚未見過且仍具 stable role／ID／內容的提問。空 user hydration 不冒充附件。SPA 的舊 nodes 用 route witness 排除；首頁建立 `/c/id` 的同 node 仍可保留。content 的 route timer、popstate、pagehide、停用清理及可信手動輸入取消皆已審查；實際網站時序仍待 LIVE。
- Navigator generation／AbortSignal、總期限、batch 期限及晚到 async locate 的取消有核心回歸。逐段載入約 70% viewport，最多 60 秒／20 批、3 次無進展停止；停止不等於完整。回答返回須 role 與 SHA-256 正文版本見證；缺少順序見證或可核對的提問錨點時拒絕探索。
- 保留上限 5000 筆／500 萬字元含隔離版本；觸頂停止新增，既有資料可搜尋。此上限的真實長對話效能沒有獨立量測。重新整理、切換對話、停用、關頁不承諾持久化。

## 本次發現及修正核對

初次 SHA 的 **P2：離屏答案返回缺少提問錨點時可能猜錯方向**。`DomAdapter.capture` 允許在 preceding user 已卸載時捕捉 assistant，所得 anchorId 為 undefined；`direction` 以 assistant ID 查只含提問的 store，target=-1 而預設 newer。若使用者從较早答案跳到較晚提問，再返回已卸載的答案，可能往反方向載入，最後不能返回。

本代理以原 `src/dom.ts` 在記憶體編譯，mock DOM／geometry 執行 capture 與 direction：answer-1 先於 user-2，capture 得 assistant／anchorMissing=true；移除 answer-1 後 direction=新方向 newer；補入可信 user-1 anchor 後 direction=older。此反例是合成程式層證據，沒有將其說成真實網站發生頻率，也沒有證明錯訊息高亮成功。

最終 SHA 在 `src/content.ts` restore 的 Navigator.run 前加入 guard：離屏 assistant 且沒有 anchorId，顯示「原答案缺少可核對的提問錨點，請先手動捲動至原答案附近。」並返回。唯讀 diff 確認此 guard 不猜測方向；本代理獨立執行新增的 CACHE-08 原生 Firefox 本機回歸，核對 back 曾啟用、答案卸載、明確提示、scrollTop 不变、沒有 restored=true。這修正了猜測探索，仍不提供該種缺錨点答案的自動返回。

在本次已審查與執行範圍內，未確認尚未處理的 P0／P1 缺陷。這不是對所有網站變體及 LIVE 流程無缺陷的證明。

## 獨立原生 Firefox 本機回歸與另一執行者證據

本代理獨立 cache 執行結果為 **8/8 PASS**，Firefox **157.0**、fixture=true、`liveChatGptAddon=false`。結果保存在 [independent results.json](evidence/firefox-cache-fix-2026-10-03/independent-cache-results.json)，timestamp `2026-10-03T12:32:09.487Z`；不是主代理舊檔或尚未跑過的案例。

另已讀取並核對主代理保存的 [cache-results.json](evidence/firefox-cache-fix-2026-10-03/cache-results.json) 與 [lifecycle-results.json](evidence/firefox-cache-fix-2026-10-03/lifecycle-results.json)，各為 cache **8/8 PASS**、lifecycle **3/3 PASS**。本代理沒有重跑 lifecycle suite；它是另一執行者證據，不能列成本代理的獨立 lifecycle 執行。

cache 涵蓋精確 12 ID／全文保留及 slot 換號、尾窗口離屏搜尋／精確高亮／返回、空掛載與首次卸載 subtree、追加編輯隔離、SPA 舊 DOM 排除、首頁第一提問網址建立、自動收集／未知順序拒絕返回／取得順序見證後返回／停止保留，以及上述缺答案錨點拒絕。

CACHE-07 的 fixture 一次替換不重疊的十則窗口；原本期待未證順序也自動返回會 timeout。最終測試核對正確的拒絕，再提供實際 ordered window 當 bridge，才核對返回。不能把該 fixture 模式稱為真實網站持續重疊捲動已驗證。

lifecycle 核對原生停用後 UI／高亮不可見、重啟清掉舊 isolated-context DOM 並只建立一個可用 root、卸載後隱藏且重載清除 inert DOM。停用／卸載前 root 或 marker 在 inert DOM 留存有明示，未說成當下所有節點都已刪除。

另已查看 [12 已看過／2 掛載截圖](evidence/firefox-cache-fix-2026-10-03/cache-retains-12-mounted-2.png)，畫面明示「Firefox 原生附加元件：合成測試頁」、歷史尚未完整與分支未核對；它支持本機 UI 結果，不是 chatgpt.com LIVE 截圖。

## bundle 歸屬與 API 排除

正式 `content.js` SHA-256：**441c92cc5731915fca39a2b4c7f471498d65216f26e83e8ab942b291acda2a36**。與 [production-build-info.json](evidence/firefox-cache-fix-2026-10-03/production-build-info.json) 相同。初次 SHA 的正式 content hash 是 `e8aacd3a015231eedb72fcd46ff8c3334a0cb9111afcc92772bfaf9731dce18e`，不含新 guard，不與最終候選混用。

本代理重新建置及實跑的 fixture content hash 是 `52ce502c4537711ca3474d60a0a074c7ba8ea6658b4cb3fc575893f51d30bc60`，與主代理最終 cache／lifecycle 相同；另直接核對 `dist/fixture/content.js` SHA-256。fixture branch／localhost permissions 與正式 bundle 不同，fixture PASS 不能直接當正式 host 整合結果。

source imports 與現有正式 bundle 已核對：content／dom 未接入 full-index.ts 或 history.ts，production FIXTURE=false；bundle 沒有 backend-api、auth/session、fetch 或 XMLHttpRequest 路徑。browser.storage.local 僅在 background 的 settings get／set，不保存聊天快取。本代理重建了 fixture，沒有重建正式 bundle 或獨立執行 lint；主代理的正式 build／lint PASS 屬另一執行者報告，不能以正式 hash 核對冒稱本代理正式重建成功。

## 尚未完成的交付門檻

真實 Firefox chatgpt.com 中執行完整 addon 的程式 scroll、Observer 時序及重掛載仍未驗收；IAB 唯讀解析器＋本機 IndexStore 只能支持資料解析與保留。實際新增、編輯、答案重新生成、各種分支、網站容器、十個首中尾離屏定位／返回、手動干預／停止／切頁／停用需要分開的真實結果。正式簽章、ESR／不同 container 也未在本輪獨立執行。

**接受範圍：最終固定 SHA 的已見提問保留候選、獨立核心與本機重播、獨立原生 Firefox cache 八項回歸，以及另一執行者的 lifecycle 證據；LIVE 未完成，正式可用安裝包驗收保持未通過。** 沒有提供新包或以 synthetic PASS 取代使用者要求的真實 Firefox 驗證。
