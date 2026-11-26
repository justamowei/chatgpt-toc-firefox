# v0.3.2 修正與驗收

2026-10-07（Asia/Taipei），runtime 固定來源 2c9d0d2aa9f95336c449981d58d4360bc7d16d3f，revision 2026-10-07-v032。後續 commit 只補測試／文件，runtime hash 未變。

## 五項修正

1. 面板開關保留列表節點與捲動位置，首次長列表每 frame 最多建 60 列。資料／搜尋真正改變才重建，一次驗證目前所有可定位 ID。捲動只更新前後兩個目前閱讀指示；普通串流／捲動合併到 120ms 更新，新移除提問立即擷取。
2. 收集跨輪保留物理邊界證據，同容器、窗口與幾何穩定 6 秒及兩次間隔 2.4 秒的 clamp 探測才換向。容忍 2px 抖動；累積漂移、載入、正文渲染、節點／容器替換重新計時。不再因三次空輪停止，仍限制 5 分鐘／2400 輪、明確取消與保存容量。
3. Alt、AltGraph、Ctrl／Meta 組合、單獨修飾鍵及 Shift + O 不停止收集。停止按鈕、Esc 和實際閱讀操作保留。Shift + O 只在輸入框外開啟面板。
4. 穩定 ID、正文與順序存於 Firefox storage.local，按對話 URL 隔離。背景序列化合併多分頁，400ms 節流及離頁 flush；過期讀取不覆蓋新觀測。未知分支的上次資料保留供搜尋，重新觀察相同 ID／正文後去重／恢復；不同版本保持隔離。只保存普通視窗本機資料，不上傳聊天內容，不使用歷史 API。
5. required ChatGPT host permission、預設 auto=true。舊 auto=false 本版升級遷移一次，之後明確停用保持。Firefox 授權並載入完成後自動啟用，安裝前已開啟的頁面需重新整理。

保存預算：每對話 5000 筆／500 萬正文字元；全 profile 最近使用 12 個對話／600 萬 JSON 字元。全域超限移除較久未使用對話；單筆 JSON 過大拒絕新寫入，保留舊儲存並顯示錯誤。清除儲存不清除已開分頁記憶體，繼續瀏覽可能補存。

## 驗收結果

主端及獨立 agent 的 typecheck、74 項純測試、正式／fixture build、lint 均 PASS。獨立核對固定來源 136 個 tracked blobs 與两組 12 個產物 hash，見 [獨立報告](acceptance-v0.3.2.md)。

Firefox 157.0 實際載入 addon，以獨立 profile／127.0.0.1 合成對話完成 **18/18 原生測試**：

| suite | 實際結果 |
| --- | --- |
| firefox-v032 7 項 | 預設及第二分頁自動啟用；600 筆反覆 20 次切換保持同 row／捲動位置且 0 childList 重建；Alt／ShiftO 不停止；按鈕停止；F5 恢復 600；未知分支保留 600 且再掛載去重；不同對話隔離 |
| collection-boundary 6 項 | 5 秒／25 秒延遲都收齊 30 筆且正確順序；中間冻结 22 秒仍 loading 不反向；載入、換容器及幾何改變重算邊界；停止後遲到資料不自動捲動／高亮 |
| anchor-walk 5 項 | 冷啟 7 筆→30；未知中間確實掛載；離屏目標 3／24 精確 ID 高亮；中間凍結可停止；停止後無遲到導航 |

原始 JSON 在 docs/evidence/v0.3.2，截图另附 outputs/ChatGPT-v0.3.2-修正驗證。主端已檢視 600 快取／掛載 6 格及 F5 後 600／掛載 20 格的原生截图。

預設沙箱仍造成 Firefox NoSuchWindowError；目前政策經自動審查允許獨立合成 runner 的沙箱外執行後，原生驗收完成。没有降低 Firefox 自身 sandbox，沒有讀取使用者 profile／帳號。早期 setup 的 collapsed-list 舊假設 timeout 已修正，並等待非同步 onInstalled 自動註冊完成，不以工具列／手動 enable 代替預設啟用。

## 交付範圍

交付 sibling outputs/Firefox-測試版-v0.3.2/manifest.json。正式 content SHA-256：82868d66d5fc233b6222d8eb48a5149ebc9286f18033a84479456b9c175e1dd1；fixture content：d1d5f19dc0ccee7a1209c3d13a34fbd669a3bbcbbf9ee1a2d0cd2df86e659637。

本版真實 ChatGPT LIVE、ESR、Android、正式簽章安裝仍待驗證。原生合成測試不能視為 LIVE，物理邊界巡覽不能視為完整 session 證明。未知分支的 F5 舊資料保留搜尋，未核對時不直接跳到舊分支。

Git Credential Manager 已停止使用，一般 feature 分支 push 待恢復。使用 GitHub 連接器備份 checkpoint 與原始本機 Git bundle，核對明細另附交付報告。原本機 commits 保留，不重建／force push。
