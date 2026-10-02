# v0.2.0 完整歷史實驗版驗收

> 2026-10-03 更新：使用者真實 Firefox 完整載入回報「對話超出本次載入上限」，仍只顯示掛載目錄。因此目前產品目標為 **LIVE FAIL**。下文保留當時的合成驗收與套件來源紀錄，不能作為實際問題已解決的結論。修正版交付須通過[真實長對話門檻](live-history-failure.md)。

日期：2026-10-03（Asia/Taipei）。最終實作 source：`95c2694e03185f66a1a0dc19a62bc8280b61420e`，branch `feat/firefox-prototype`。該 source 已 push，遠端 SHA 相同；後續文件 commit 不改產品 source。先前 `22cc60b` 的一般回歸通過，但獨立 has_next_page 反例失敗，已修復且不作最終交付來源。

## 結果

完整歷史來源、獨立記憶體目錄、全提問搜尋、明確取消、失效撤銷與有限導航已實作。主要開發者的合成測試：單元 38/38、完整歷史原生 Firefox 16/16。原生測試使用 Firefox 157.0、隔離 profile、localhost 合成 API 與合成 cookie/token；沒有取得真實 ChatGPT 帳號資料。

| 檢查 | 主端 | 固定 source 獨立複驗 |
|---|---|---|
| TypeScript typecheck | PASS | PASS |
| 核心、歷史、完整索引、跨角色方向 | 38/38 PASS | 38/38 PASS |
| 完整歷史原生 Firefox | 16/16 PASS | 16/16 PASS |
| 新 renderer、舊導航回歸 | 8/8、8/8 PASS（修正過程快照） | 8/8、8/8 PASS |
| 原生權限／背景生命週期 | 本輪交由獨立驗收 | 7/7 PASS |
| 原生附加元件停用／啟用／移除 | 本輪交由獨立驗收 | 3/3 PASS |
| 正式 build／web-ext lint | PASS；0 errors／warnings／notices | PASS；0/0/0 |
| 套件內容／正式來源核對 | PASS | PASS；固定 build／交付／ZIP 七檔一致 |

GPT-6.1 Sol high sub-agent 以 git archive 乾淨 source 獨立重建，單元 38/38、原生五組套件合計 42/42 PASS（16＋8＋8＋7＋3），另有自主分頁反例修復後 PASS。executor `/root/firefox_acceptance`，Firefox 157.0；核心搜尋 1,000 題／20 次 p95 2.0793 ms，原生 20 個已掛載目標 p95 141.8958 ms，返回誤差 0 px。報告與逐案例證據另存 `outputs/Firefox-sub-agent-v0.2.0驗收.md` 及 `outputs/Firefox-v0.2.0-獨立驗收證據/95c2694`；舊 source 22cc60b 反例 FAIL 一併保留。

## 覆蓋與修正

完整歷史原生案例核對：初始七題掛載下取得 200 題 exact ID／順序；未掛載全文搜尋、HTML 當文字、十個首／中／尾遠距目標；編輯、新提問、同 URL 全分支替換、沒有 slot 的 assistant 新 ID；停止／換頁／停用後晚到 HTTP 拒絕；401/403／錯 cursor 降級；未掛載返回；載入中卸載 witness、pending→loaded 保留 witness，以及空 user bubble hydration。

只讀審查指出的分支、方向、assistant身分、witness與空bubble問題已修正，並加入回歸。初次 FULL-NATIVE-03 因合成 renderer 每次相同 scroll window 都重建節點，使 locate 後剛加的 highlight 被移除；fixture 改成相同 window 保留節點後重跑，最終 source 原生 16/16 PASS。這不證明所有真實虛擬 renderer 的重掛載時序。

新增 HIST-18／FULL-NATIVE-16：初始 newest 或重讀 head 明示 has_next_page=true 時拒絕完整；older page 的 has_next_page=true 正常允許。22cc60b 的獨立反例曾 resolved/exhausted=true，保存 FAIL 證據，不能以同快照原有測試 PASS 掩蓋。95c2694 修復後重新固定驗收。

API 單元驗證有序分頁、cursor／無進展／overlap／parent 一致、legacy root/cycle/missing、多分支、head改變、隱藏訊息、來源與redirect、大小／深度／timeout／429，以及忽略abort的晚fetch。附件可索引檔名，核對畫面正文時使用來源正文而非硬要求檔名在bubble中。

## 交付與範圍

- 目錄：`outputs/Firefox-原型-v0.2.0/manifest.json`。來源主機只有 `https://chatgpt.com/*`，權限維持 activeTab／scripting／storage＋原選用網站權限。
- ZIP：`outputs/ChatGPT-對話導航器-v0.2.0-未簽章.zip`。
- ZIP SHA-256：`1d0723f76997e0f173ac4633cc45e8919e34f2dcc85edf98121cdc6d06de5c5c`。
- 正式 content.js SHA-256：`625f31fd5c14ec064a6bde4c7fc3ff39f76b7e60bc1b2f1fc3a746204a4675d7`。
- 安裝與操作：`docs/full-history-v0.2.0.md`，另有 outputs 同步副本。

FULL-07 的真實登入／內部 schema、FULL-11 的整段 expected ID／順序／UI 分支、其他 LIVE、Firefox ESR／容器／工作區、Mozilla 簽章與重啟升版仍 PENDING。畫面顯示伺服器分支與已核對 subset，完整 IndexStore UI proof 沒有被冒充；有界探索失敗須手動捲動。

依未文件化網站分頁結束及 head 重讀得出的結果是實驗版伺服器快照；缺 parent/revision 時不能獨立證明服務端沒有漏中段。未宣稱已保證全量的正式產品，也未把合成 cookie/token 當真實帳號驗收。
