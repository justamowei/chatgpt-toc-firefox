# GPT-6.1 Sol high：IAB 真實證據獨立審查

日期：2026-10-03。子代理 /root/iab_live_review 唯讀審查，不操作瀏覽器、不修改產品或文件、不提交 Git。主端記錄其實際結論。

## 核驗結果

- 63 份真實快照中 56 份符合重播條件。排除的 7 份全部缺 context，其中僅 1 份生成中，不將 7 份都稱為生成窗口。
- 子代理自寫另一支唯讀腳本，在記憶體編譯目前 src/core.ts，重算 56 筆 trace；每個欄位與 replay-result.json 一致。
- 冷啟動 Map 從空白開始，初始 4 → 最終 12；逐 ID／全文與 expectedPrompts 比對，12 則全部相同。
- 28 次具有共同 ID、刪除舊條目、invalidated=false、reset=true。共同 ID 順序沒有矛盾且 context 相同，支持 unknown-branch missing 規則的因果歸因。
- 同 ID／全文會換 conversation-turn-N slot；slot 不可當永久身分、順序或分支證據。
- 最後兩份冷啟動快照間隔 38.351 秒，含其他工具操作；不能獨立量測網站延遲。

## 範圍與限制

這是目前 IndexStore 的離線重播及真實快照資料核驗；沒有在 IAB 執行完整 addon，也未測完整 DomAdapter/readTurns、MutationObserver 時序、導航、分支或產品快取。addonExecutedInIab=false、firefoxAcceptance=false 的證據 flags 正確。

可採用結論：真實 IAB DOM 的已見 ID／全文可重新收集，現有索引遇到離屏缺項會刪除資料。不能稱修復完成，IAB 也不等於 Firefox LIVE 驗收。
