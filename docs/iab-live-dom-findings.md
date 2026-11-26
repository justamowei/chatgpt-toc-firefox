# 真實 ChatGPT IAB 渲染與快取實測

日期：2026-10-03。使用者明確改為先在 Codex 內建瀏覽器測試真實 ChatGPT。本輪不修改附加元件 runtime、不製作安裝包、不替代 Firefox LIVE 驗收。

## 結果

已在登入免費帳號的真實 chatgpt.com 建立一個中性測試對話，完成 12 則提問與回答。不是 localhost fixture。底部穩定窗口只有 2 則提問、3 則回答及 5 個 turn 區塊；早期訊息的區塊整個離開 DOM。回到首段後，首則以相同 data-message-id 與全文重新掛載。

測試端使用獨立的 plain-data Map 保存已見提問，首、中、尾往返期間保留 12 則。重載同一對話後，以另一個空 Map 收集：初始僅 4 則，原生鍵盤向上捲動並等待網站掛載後收齊 12 則，所有 ID 與全文和建立時的預期集合一致。這證明此樣本可以透過「先觀察一次、卸載後保留資料」收集全文；不是新快取功能已在 addon 執行。

| 項目 | 真實場景結果 |
| --- | --- |
| 瀏覽器／視窗 | Codex IAB，764 × 892；不是 Firefox |
| 樣本 | 一個自建中性對話，12 則提問，首則短回答，其餘 25 行回答 |
| 底部穩定掛載 | 2 user + 3 assistant，5 個 turn 區塊 |
| 其他閱讀窗口 | 會保留閱讀位置附近的訊息以及最後兩輪；掛載數會變動 |
| 完成後首中尾往返 | 測試端保留 12 則，首則同 ID／全文重新掛載 |
| 重載後從零收集 | 初始 4 → 最終 12，精確 ID／全文一致 |
| 原始證據 | 63 份真實 DOM 快照，僅保存自建提問全文及回答字數 |
| 舊索引重播 | 56 份具相同對話 context 的完成窗口；28 次有 overlap、adapter 未標 invalidated，但 IndexStore reset/drop |
| addon / Firefox | IAB 中未執行 addon；Firefox LIVE 尚未驗收 |

## 觀察到的機制

1. 本樣本使用 SECTION[data-testid="conversation-turn-N"][data-turn][data-turn-id]，內層訊息帶有明確 data-message-author-role / data-message-id。重新掛載的 user message ID／全文保持相同。這只適用於已觀察的頁面變體，不保證所有帳號、實驗版型或 Firefox 都相同。
2. 移除的是整個 turn 區塊，不只是文字被隱藏。計數必須分清 user 提問、assistant 回答與全部 turn 區塊；不能把五個區塊寫成五則提問。
3. 目前窗口可能包含閱讀位置附近加最後兩輪，並非必然是一段連續的歷史。不能只用首見時間或 window 首尾猜順序；要記錄 ID 相鄰見證與待核對範圍。
4. 實際捲動容器是帶 data-scroll-root 的 DIV。本輪使用其原生鍵盤 PageUp/PageDown/Control+Home。對 main 聚焦本身可能移動位置，不能把該動作當成單純一頁步進。
5. 捲動時 scrollHeight 及 scrollTop 會因網站掛載、估高修正與閱讀錨點調整而改變，向上時 scrollTop 也可能暫時增大。不能只用 scrollTop 方向、固定高度或固定比例推定覆蓋範圍。
6. 冷啟動到頂時，前兩則尚未出現；後續觀察才掛載首則與第二則，且 top 由 0 修正為 390。兩份存檔快照相隔 38.351 秒，期間包含其他工具操作，不能拿這個間隔或最後一次操作的額外等待量測網站載入延遲。一次 top=0 或一次空窗口不證明收集完成。原先直接跳頂／底的 load 方式仍不足以保證收齊。
7. 生成期間 assistant 的 request placeholder／turn ID 和完成後 message ID 可能不同。不能將回答 placeholder 換成正式 ID 自動視為使用者切換分支。本輪重播採完成窗口，未驗收 streaming、編輯或分支判定。
8. conversation-turn-N 的 slot 會重編／重用。例第九則同 ID／全文，建立時 slot=conversation-turn-17，重載初始為 conversation-turn-3，後續窗口又為 conversation-turn-13。不能以 slot 判斷永久身分、順序或分支矛盾；目前 DomAdapter 的 previousSlots invalidation 也需改，否則正常掛載較早訊息仍可能清快取。

## 舊程式刪除原因與證據界線

scripts/replay-live-dom.mjs 直接讀取目前 src/core.ts，以 esbuild 在記憶體編譯，重播真實輸入的 user entries。所有錄到的 user 節點均有自身明確 role 與 message ID；提問正文不含控制項。依 production DomAdapter 的相鄰 slots／prompts 規則計算 invalidated，branch 固定 null，direction 使用 observe。

在有共同 ID、沒有 slot 或正文 invalidation 的窗口切換中，IndexStore 仍因未知分支的 missing-entry 規則 reset，並以 mounted filter 刪除已見的離屏提問。真實窗口只有 2 則時，舊索引也只剩 2 則，plain-data 保留示範仍有 12 則。

重播是本機執行 IndexStore，不是把 addon 注入真實網站。保留示範只有資料聯集與精確全文核對，不具產品所需的順序矛盾、分支隔離、取消、容量與離屏導航功能；不能當成修正版。

## 後續修正規格

- SeenCache 保存純提問資料與角色所屬穩定 ID，MountedMap 僅保存目前連接的節點。正常卸載不得清 SeenCache、返回位置或取消導航。
- 把資料增量 cacheRevision 與真正換對話／確認分支矛盾的 navigationEpoch 分開。非連續窗口保留 segment 與順序見證；遇到矛盾應隔離，不默默混入当前分支。
- 明確啟動的掃描使用重疊步進、實際 IDs 增量、等待掛載及取消／時間界線；不可僅因 top=0、height 沒變或單次無進展標完整。
- 快取只涵蓋已觀察資料；「已看過 N／目前掛載 M」與未知範圍要可見。此輪不增加持久 storage 或聊天 API。
- 新增提問、編輯、重新生成、同 URL 分支、十個離屏定位／返回、資源界線與真正 Firefox 驗收仍須另做。本輪不把這些記為 PASS。

## 重現與資料保存

執行 `node scripts/replay-live-dom.mjs` 可重播已保存的真實快照，輸出 docs/evidence/iab-2026-10-03/replay-result.json。它不連線網站，不讀 cookies／session／瀏覽器 profile。快照不保存帳號名稱、完整對話網址、回答全文、請求憑證或驗證 challenge。

初次 25 行測試曾長時間未生成；停止後改送最短提問，稍後收到 OK，後續 11 輪正常完成。網站背景日誌有 RequestError 與部分請求的 challenge 內容，但未驗證它們是首次生成停滯的原因，沒有繞過驗證。先前提供的另一長對話沒有讀到內容並返回首頁；不能以此樣本宣稱已驗收所有舊對話。

GPT-6.1 Sol high 子代理已唯讀獨立核對原始快照、空 Map、ID／全文及重播 trace，結果一致；詳見 iab-live-independent-review.md。正式 runtime 維持 v0.1.1 撤回狀態。
