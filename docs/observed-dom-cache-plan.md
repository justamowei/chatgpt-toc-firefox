# Firefox DOM 卸載保留快取方案

日期：2026-10-03（Asia/Taipei）。使用者要求撤回 API／超限方案，改保留 ChatGPT 取消渲染的項目，並先以 computer-use 觀察真實 Firefox。此文件為下一階段規格，不表示新功能已完成。

## 撤回與事實界線

正式 content/dom/turns、package/lock/manifest 恢復到 5aa5102e2cc5e605196f6edfce2fb6d6b4faf649（v0.1.1）。撤回完整歷史按鈕、session／歷史 API 的正式入口、獨立 server 索引整合及 3bedace 縮頁／診斷修改。不改寫 Git 歷史，不刪除舊失敗／合成測試紀錄。歷史 API 模組／測試保留作未接入的實驗資料；正式 bundle 不執行它們。這是源碼撤回，尚未操作使用者 Firefox 移除或換載已安裝的 v0.2.0。

使用者觀察頁面通常只保留 5–7 則。我們尚未以允許的工具親自檢查真實 Firefox，不能把精確 DOM 機制、殼／內容是否都刪除、穩定 ID 或觸發條件寫成已實測結論。先前 limit 提示也是既有失敗事實，但不再以調整 API 限制作目前解法。

已確認原程式的刪除機制：production branch=null；IndexStore.merge 在未知分支時只要舊 entry 不在下一份 snapshot 就 reset，且之後只保留 mounted entries；无共同 ID 的 observe 窗口也會 reset。DomAdapter.read 的 nodes 只代表當下 DOM，DomAdapter.load 舊路徑又直接跳頂／底。這些規則讓已看過的提問隨卸載丟失。

## 產品目標

將「已看過的提問資料」與「當前可定位的 DOM 節點」分開。曾辨識、具有可信穩定 ID 的提問卸載後，文字與 ID 仍保存在此分頁記憶體；搜尋包含它們。只保持 plain data，不保留整個已卸載 HTMLElement／clone，避免大型 detached DOM 累積。目錄顯示「已看過 X 則／目前掛載 Y 則」，未知範圍明示尚未收集，不標已載入全對話。

**快取只能保存已見過的內容。** 對打開頁面時尚未掛載過的舊提問，需要使用者捲動或明確啟動逐段掃描，讓網站至少掛載一次。不能僅靠保存当前七則就取得未看過的全文，也不能讓模型 context window 改變這件事。

目前範圍是提問全文與 ID，不保存回答全文；當前頁記憶體保留，停用／關頁／重新整理不承諾恢復。跨重整或永久 browser.storage 快取屬另一項需明示保存範圍與清除行為的產品功能，這輪不預設開啟。沒有聊天內容送外部服務、profile/cookie 複製或新增登入 API 請求。

## 實作契約（真實观察後定稿）

1. **獨立資料層：** observed prompts 的 Map 與 ordered IDs 不因 nodes 的 disconnect 或 mounted 集合縮小而刪除。卸載只更改 mounted 状態；重新掛載以明確角色＋穩定 ID 去重。同文不同 ID 不合併，不以文字相似、可重用槽位／奇偶序號或 WeakMap 暫時 ID 冒充穩定身分。
2. **收集時機：** 啟動時先 snapshot，MutationObserver 回呼及捲動後收集新掛載提問；對 debounce 前後的短暫卸載必須實測。資料收集與 UI 重繪分開，避免 120ms UI 延遲讓可觀測窗口完全錯過。removed subtree 僅在仍含可驗證 role/ID/content 時讀取；空殼／未完成 hydration 不產生假附件提問，也不清掉已見資料。
3. **順序：** 優先觀察有可信 ID 的 turn 殼全序、相鄰邊與連續窗口 overlap。資料分開記錄順序已確認／未確認，矛盾拒絕而非猜測；沒有共同錨點、可信殼序或確認掃描方向時，新資料保留到待核對區，不能按第一見到時間冒稱聊天順序。不用 slot 編號當永久 ID。
4. **對話與分支：** 新的 URL 對話或頁面停用取消收集／導航並清除當前快取。相同 ID 正文變化、確認的分支切換／編輯／重新生成可建立新 generation 並取消舊目標，但須區分 hydration 與真正編輯。**正常卸載、空窗口和無 overlap 本身不證明切分支。** 無法確認同 URL 分支的資料標成「已觀察／目前分支未核對」，不能標當前分支完整或定位至可能錯誤訊息；具體 UI 訊號必須真實观察後定稿。
5. **逐段掃描：** 明確使用者啟動，優先由目前位置以重疊 viewport 步進，不直接跳頂漏中段。每段等待掛載並收集，保留未知范围與無進展原因，有時間／批次界線、停止與返回閱讀位置。若真網站只響應原生使用者捲動而不響應程式 scroll，提供手動收集方式；不將合成 wheel 當成已驗證可靠的真人輸入。
6. **離屏搜尋與定位：** 搜尋讀快取，定位只能用現存相符 role/ID 的節點；卸載的提問透過可信殼位置／確認順序按需捲動再等待。找不到、網站無法重新掛載或分支無法核對時明確失敗，不以相似文字或下一則取代。返回依有效閱讀錨點和 generation。
7. **資源與生命週期：** 以條目數、提問文字總量及任務時間限制快取和掃描；觸頂停止新增並顯示原因，不靜默丟棄前面資料或宣稱已完整。停止／換頁／停用使晚到收集和捲動失效。定稿上限需以真實樣本量測，不沿用 API 回應 bytes 當 DOM 提問快取容量。

## GPT-6.1 Sol high 唯讀審查補充

已檢查固定 5aa5102 的 core/dom/content，沒有修改產品或重新跑合成測試。除了未知分支 reset/filter，content.refresh(reset) 會一起取消導航、清高亮與返回位置；不能只移除一行 filter 就當作完整修復。

- SeenCache、MountedMap、BranchConfidence 分開。列表 cacheRevision 與真正 context／已確認矛盾的 navigationEpoch 分開；正常卸載／收錄新條目不清返回位置、不取消正常尋找。快取合併不自動捲動主畫面。
- 同 URL 非重疊窗口保留成待核對 segment，不因 common=0 清快取、不猜 UUID 或收錄時間是聊天順序。矛盾時隔離舊 segment 並標示曾看過／分支未核對，暫停當前分支定位；不用靜默混合清單或靜默刪除曾見資料掩蓋不確定性。
- 5aa 的 previousPrompts 只見前一窗口，無法偵測隔很久重掛載後的同 ID 正文改變；新的 SeenCache 應保存正文版本見證。原 prefix-extension 豁免可能將追加編輯當 hydration，這項不能在沒看真實頁面時沿用作安全證明。
- 離屏定位在高亮前重新核對 role-owned stable ID、正文版本、connected、viewport、context 和 generation；只查同 ID 存在不夠。返回錨點也需版本核對；取消晚到任務不刪正當快取。
- 純提問快取未必能看到只改回答的重新生成及後續分支替換，不能保證識別所有分支。需要真實 UI／結構見證；未知時標記與定位限制必須可見。

此審查支持規格方向，不代表真實 DOM 行為已核對。新的 SeenCache 尚未實作，LIVE 驗收維持未完成。

## 真實 Firefox 必須先觀察的場景

使用者已授權查看 Firefox／指定 ChatGPT 對話，不重複要求同意。透過允許的 computer-use 觀察初始頁、捲動首中尾、反向返回、新增提問、編輯／分支切換。需確認：卸載的是內容或整個 turn、重掛載 ID 是否相同、順序與 slot 是否可重用、實際 scroller、程式和原生捲動能否觸發掛載、hydration/streaming 與停留時間。螢幕可協助確認使用情境；具體 DOM 結構仍需受允許的頁面讀取能力或本機 addon 診斷，不能單憑截圖推定 ID。

目前 CUA inventory apps=[]，只有 Codex IAB 和 MCP Apps、均無分頁；本輪可用工具沒有 node_repl/sky 呼叫。plugin-management 查詢 Firefox 返回空集合。先前 Firefox URL policy 限制不繞過，不用 shell UIA／真實 profile 的 Selenium／cookie 複製代替。尚未進入使用者真實 Firefox，仍為阻礙。

## 2026-10-03：使用者授權改先做 IAB 真實場景研究

已完成真實 chatgpt.com 免費帳號的 IAB 測試，見 docs/iab-live-dom-findings.md 與 docs/evidence/iab-2026-10-03。12 則中性提問、63 份 DOM 快照，原生鍵盤首中尾往返；底部只掛載 2 提問＋3 回答，user ID／正文重新掛載保持相同。重載同一對話，以空資料 Map 從初始4則收齊12，精確 ID／全文一致。以實際完成窗口重播旧 IndexStore，28 次有 overlap、未 invalidated 仍 reset/drop。這是 IAB 觀察與本機重播，沒有在 IAB 執行 addon，也不是 Firefox PASS。

需修正先前假設：窗口可能保留附近訊息加最後兩輪，未必連續；掛載數不是固定七則；data-scroll-root 高度及 top 會動態修正，向上捲動未必數值單調下降；冷啟動 top=0 後仍須等待舊訊息掛載。一次首尾跳躍、固定 scrollHeight 或零進展不能證明完整。回答串流的 request placeholder 與正式 ID 變化也不能直接視為分支切換。conversation-turn-N 的 slot 在正常重載與載入較早訊息時會重編／重用；同 ID／全文可換 slot，因此 previousSlots 不得把這種換號判定為分支 invalidation，也不能將 slot 當永久顺序。獨立審查已核對該證據；快照不能單獨量測網站掛載延遲。

上方「本輪沒有 node_repl／IAB 分頁」是撤回當時的歷史狀態。後續已有 sky 與 IAB 通道；Firefox 視窗擷取被審查阻擋，使用者最新明確允許改先測 IAB 後，才取得真實 ChatGPT 頁面證據。沒有繞過政策。這輪只完成研究、重播與規格更新，SeenCache 產品仍未實作，Firefox LIVE 門檻維持待驗收。

## 交付驗收門檻

- 真實長對話先記錄已見提問的預期集合；初始 5–7 則，手動連續捲動收錄至少跨首中尾且明確大於七則。
- 首／中／尾窗口來回切換、空掛載間隔與重新掛載後，已見的精確 IDs/全文/順序保持；沒有正常卸載清空或重複條目，離屏搜尋命中。
- 新提問、路由換對話、同 URL 分支、編輯、重新生成、hydration 分別核對；不能混同正常卸載。未核對分支資訊明示。
- 全對話自動收集與「已見資料保留」分開驗收；尚未看過的提問不算快取成功。真正全量须有全預期集合與順序核對，抽樣不足以標完整。
- 十個首中尾離屏定位與返回分開計數；取消、手動干預、停用、資源上限保留可靠結果與原因。
- GPT-6.1 Sol high sub-agent 對固定 SHA 獨立驗收；合成回歸不能替代上述實際 Firefox 結果。**真實场景尚未觀察前不盲改並交付下一個「已修好」安裝包。**

## 2026-10-03：保留快取候選已實作

v0.3.0 已實作上述契約，並在真實 IAB 上唯讀執行同一份提問解析器；20 個新窗口辨識結果經當前 IndexStore 保留 12 則，頁尾僅掛載 2 則仍有全部精確 ID／全文／順序。核心 20 項、Firefox 本機 8 項快取與 3 項生命週期回歸通過；固定 SHA 獨立驗收另列報告。正式 API 入口未恢復。上方「快取未實作」為較早階段紀錄。詳細狀態見 [v0.3.0 候選驗證](seen-cache-v0.3.0.md)。真實 Firefox 完整 addon 驗收仍未完成，不能標 LIVE PASS。

## 2026-10-04：v0.3.1 導航補充

不改变v0.3.0已見快取的純資料、順序隔離與精確定位契約。加入每context／epoch已見座標線索，不保存DOM；收集240步／60秒、seek60步／60秒，自適應等待掛載與回答內部安全跨越。空白seek可用實際掛載user座標作搜尋界限，這不代表掃過區域沒有提問；收集仍須有可見訊息，不跳未核對未知窗口。完整歷史不作保證。詳見 navigation-speed-v0.3.1.md。
