# Firefox v0.1.1 最終獨立驗收

**固定來源 `5aa5102e2cc5e605196f6edfce2fb6d6b4faf649` 在本輪合成 DOM 與隔離原生 Firefox 驗收範圍內 PASS，未發現剩餘阻擋缺陷。** 獨立 renderer 8/8、自主 probe 10/10 通過；兩次發現的錯誤返回錨點已用相同 sample 複驗修復。這支持交付未簽章測試原型，**不代表使用者真實 ChatGPT 頁面零索引問題已確認修好**；真實頁面結果仍 PENDING。

驗收者：GPT-6.1 Sol high sub-agent。日期：2026-10-03（Asia/Taipei）。Firefox **157.0**、geckodriver **0.37.1**，Windows headless 原生 Firefox、localhost 合成頁、無帳號隔離 profile。各版本使用 git archive 固定快照至 `work/acceptance/<sha>`，獨立鎖檔安裝與重建；未修改產品 source 或 Git，未讀取真實聊天、登入資料或使用者 Firefox profile。只寫測試 scratch、證據與授權的驗收報告。

## 最終指令結果

| 指令（5aa5102 獨立 scratch） | Exit | 結果 |
|---|---:|---|
| npm ci --offline --cache 工作區 work/npm-cache | 0 | 固定鎖檔 347 packages，0 vulnerabilities |
| npm run build:firefox | 0 | canonical 正式建置成功 |
| npm run typecheck | 0 | PASS |
| npm run lint:firefox | 0 | 0 errors / 0 notices / 0 warnings |
| npm run test:firefox-renderers | 0 | 8/8 PASS |
| node tests/independent-turn-probes.mjs | 0 | 10/10 PASS |
| npm run package:firefox | 0 | 獨立未簽章包產生成功 |
| verify-package.ps1 | 0 | 交付六 runtime、build-info 與兩個 ZIP 的 7 members 全相符，正式 origin 正確 |

原生套件設定 `TOC_TEST_EXECUTOR=GPT-6.1 Sol high sub-agent`，獨立 artifacts 分別為 `artifacts/independent-renderers`、`artifacts/independent-turn-probes`。自主 probe 使用原始測試樣本與期待；複驗只變更測試 metadata 的固定 SHA，沒有修改期待以迎合修復。

## 新 renderer 八組：期待與實際

| Case | 真實期待 | 實際結果 |
|---|---|---|
| NEW-01 zero-regression | 整 main 原始 `[data-message-author-role]` queryAll 為 0，新結構索引 6 題；診斷不包含文字/ID/URL | PASS：0→6、unknown history、diagnostic counts only |
| NEW-02 target-highlight-return | 新結構可定位、高亮並返回原位置 | PASS：key-5 located、非 legacy 節點 outline 3px、返回誤差 **0px** |
| NEW-03 nested-dedup-and-attachment | 巢狀標記去重且附件題收錄 | PASS：7 題、巢狀重複 0 |
| NEW-04 attribute-only-hydration | 僅 attribute 補標記也刷新目錄 | PASS：7→8 |
| NEW-05 shell-renderer | 舊殼 data-turn/turn-id 可索引、空 shell 排除 | PASS：6 題可定位、空 shell 0 |
| NEW-06 identity-and-branch-conservatism | no-ID 禁用，unknown branch 舊 DOM 丟棄，返回失效 | PASS：unstable disabled、unmounted retained=false、return invalidated=true |
| NEW-07 empty-sentinel-shared-wrapper | user bubble 與空 sentinel 共中間 wrapper，不可建假 assistant 返回錨點 | PASS：phantom anchor=false、back disabled=true |
| NEW-08 empty-sentinel-shared-turn-shell | 純 data-turn=user 殼與空 sentinel 共中間 wrapper，不可建假 assistant 返回錨點 | PASS：phantom anchor=false、back disabled=true |

## 自主十組 probes：期待與實際

| Case | 真實期待 | 實際結果 |
|---|---|---|
| IND-00 raw-zero-to-six | 整 main raw legacy marker=0，六個新 group 可收錄 | PASS：0、6；六個不同 `turn-key:user:plain-*` ID |
| IND-01 shared-group-message-id | 共 group message ID 不合併 user/assistant，assistant 仍可作返回錨點 | PASS：兩 user ID；assistant 返回誤差 **0px** |
| IND-02 empty-assistant-no-anchor | 純空 sentinel、唯一 user 已離開 viewport 時不得提供返回位置 | PASS：located、back disabled=true |
| IND-03 bubble-inside-assistant | assistant 裡的 user bubble 與 legacy user marker 不成為題目 | PASS：只剩合法 1 題 |
| IND-04 hybrid-and-identical-text | 新舊 markers 重疊去重，同文不同 ID 保留，controls 剔除 | PASS：real-hybrid、dup-one、dup-two 共 3 題；文字皆 same text |
| IND-05 pure-assistant | 純 assistant 與空 sentinel 不生成 user 題 | PASS：0 題 |
| IND-06 remount-and-reload-stable-id | clone remount 與 reload 再啟動後 ID 相同 | PASS：六 ID 前後完全一致 |
| IND-07 composer-sidebar-isolation | aside/form/textbox/contenteditable 的新舊假 markers 排除 | PASS：只剩合法 1 題 |
| IND-08 empty-sentinel-in-shared-inner-wrapper | 空 sentinel 不得借用共 wrapper 的 user bubble 文字建 assistant anchor | PASS：相同原 FAIL sample，back disabled=true |
| IND-09 empty-sentinel-with-legacy-shell-user | 空 sentinel 不得借用共 wrapper 的純 data-turn=user shell 文字建 assistant anchor | PASS：相同原 FAIL sample，back disabled=true |

IND-08/09 都使用高1600px的中間 wrapper、位於前100px的 user 文字、空 sentinel，main scrollTop=700 後導航另一題。user 已不在可視區，但 wrapper 空白區可視；正確結果是返回 disabled=true，不能把 wrapper 誤認成 assistant 位置。最後 source 將四種 userMarker 同時用於 content.matches 與 content.querySelector，原生結果證明這兩個樣本不再建立假錨點。

## 首次 FAIL 歷史（完整保留）

| 固定版本 | renderer | 自主 probes | 發現及後續 |
|---|---:|---:|---|
| 6a67fbfe240d838335e517ecd3e0e96c54f0e2fb | 6/6 PASS | 8 PASS / 1 FAIL，exit1 | IND-08 誤借 user bubble 文字建 assistant anchor，back disabled=false；c1e833 相同 sample 轉 PASS |
| c1e833771073506fd528858bd2d4b498bb5b6fa4 | 7/7 PASS | 9 PASS / 1 FAIL，exit1 | IND-09 後代排除漏 data-turn=user；5aa5102 相同 sample 轉 PASS |
| 5aa5102e2cc5e605196f6edfce2fb6d6b4faf649 | **8/8 PASS** | **10/10 PASS，exit0** | 最終驗收版本，兩原 FAIL 皆修復 |

6a67 的 NEW-01 使用 `:not(form *)` 計算合法舊 marker，form 仍有 legacy marker，不能稱該舊 fixture 的整 main raw selector=0。自主 IND-00 自首版起就證明 raw=0→6。c1e833 及最終 stock fixture 已改 form 為新 markers 與原始 queryAll=0；沒有改寫歷史期待。

舊失敗報告：[6a67 失敗紀錄](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/Firefox-sub-agent-v0.1.1-6a67fbf失敗紀錄.md)、[c1e833 失敗紀錄](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/Firefox-sub-agent-v0.1.1-c1e8337失敗紀錄.md)。scratch 原報告與 JSON/截圖皆未覆蓋。

## Canonical build 與交付包

正式 manifest version 0.1.1、MV3，optional_host_permissions 僅 `https://chatgpt.com/*`；無 localhost、127.0.0.1 或 fixture origin。交付資料夾 `Firefox-原型-v0.1.1` 的六 runtime 與獨立固定來源 build 及 build-info 完全一致。

| 正式檔案 | SHA256 |
|---|---|
| background.js | bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977 |
| content.js | **0f2d006125a6c643f0354fdeeeebab728dd431014f4cccb6cbace60e89be766b** |
| options.js | a986be9a94429358b8a9fd6871e3ab0672cc75fdb1c020cdd1878f8076350ad4 |
| options.html | 163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf |
| host.css | fbc849f0af4b24c89360b59ca8b55d0ccd423429f737b0db422a651d57a5c6a4 |
| manifest.json | 80ddddcae0306f0314f0eac53512b3d55e0bc827e9a956f260137c0f2ce71c6b |
| build-info.json（額外 provenance member） | d5c95b6f38844f34fcd340b4d07815e5550c67fbbe4ac8760b5ea693f126abe0 |

原生測試 fixture content SHA256：`0b703e4b46e424737e067bf0b7f7979b5e06153e52556bd5c8ff391c6a0465ec`；fixture background：`8081a2f22c734deba874c64b5d68ac5e07814eac29efb4cc1a26e7a4e01bb7ff`。fixture 與正式 origin 不同；兩者各從同一固定 source 建置，不混稱同一 bundle。

交付 [未簽章 ZIP](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/ChatGPT-對話導航器-v0.1.1-未簽章.zip) SHA256：**`7f6b70e09178c7a0cd73f7d5ed8419546c24f1b4c4fd739ed90cf719e7dca3d7`**。獨立重包 ZIP：`42531c3acc1a4f26c2ee974e48643f378d06d71a90ebf81f8a4f2459e11a2a8c`。ZIP時間戳/封裝順序可不同；兩包各 **7 members**、每一 member（含 build-info）byte hash 與 canonical build 及交付資料夾均相同。不是沿用先前失敗快照的 fb74f9 或 c1e833 包。

## 證據與仍未執行的 gate

輸出證據位於 `outputs/Firefox-v0.1.1-獨立驗收證據/{6a67fbf,c1e8337,5aa5102}`，含 logs、實際期待/結果 JSON、獨立 probe 程式、舊 FAIL 截圖與包核對 JSON。

- [最終 renderer 8 組 JSON](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/Firefox-v0.1.1-獨立驗收證據/5aa5102/renderer-results.json)
- [最終自主 probe 10 組 JSON](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/Firefox-v0.1.1-獨立驗收證據/5aa5102/probe-results.json)
- [六 runtime / ZIP7 members 核對](C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/outputs/Firefox-v0.1.1-獨立驗收證據/5aa5102/package-verification.json)

本轮未獨立重跑 legacy 8 / addon lifecycle 3；主 agent 的最後 5aa5102 自測兩套件 PASS（20/20、定位p95 135.0866ms、返回0px），其 provenance 與本獨立驗收分開。core 本輪無修改：git blob `bcb70434ee291897c36b8865ec3b54c56c87ff2a` 與先前驗收 5cf4764 相同；本輪未重跑 core，不把歷史 core 結果計入這18個原生案例。

**PENDING：真實登入 ChatGPT LIVE-01–07、使用者實際 DOM/零索引修復確認、Firefox ESR、容器、簽章/REL-01。** 不以隔離 fixture 代替這些 gate。最終判斷僅為指定明確 markers、已掛載內容及本輪合成邊界的修復可供使用者測試；完整長歷史与未知網站變體仍不作保證。
