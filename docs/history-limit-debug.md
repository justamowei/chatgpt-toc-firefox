# 超限修正開發狀態：尚未交付

> 已撤回：2026-10-03 使用者要求停用 API／超限方向，正式 runtime 恢復 v0.1.1。此報告僅保留歷史；有效下一階段為 observed-dom-cache-plan.md，先觀察真實 Firefox 後開發卸載保留快取。

日期：2026-10-03（Asia/Taipei）。開發中 runtime source：3bedace3fe4d646b008b741489cfd8a702eb8d9c，已推送私人 GitHub 並核對遠端 SHA。已交付 v0.2.0 的 runtime 仍為 95c2694；沒有替換安裝資料夾、ZIP 或建立新的修復包。

## 結論與剩餘問題

使用者真實完整載入返回通用 limit 錯誤，完整目錄沒有套用。已實作針對單頁超限的縮頁及不含聊天內容的具體診斷，但尚未知道使用者觸發的是哪個上限；不能把這項修正宣稱為真實問題已解決。產品 LIVE 狀態仍為 USER_REPORTED_FAIL。

## 實作內容

- 只對 paginated page-bytes 遞減 num_turns：100→50→25→12→6→3→1。各次保留同一 before cursor、累計已讀 bytes 及原總 deadline；失敗 body 取消後不 merge、不增加完成頁數。
- 頭頁重讀保持首次成功的 page size。較早頁可另縮小；不把縮小後的不同頭頁集合當作原頭頁核對通過。最小頁仍超限明確失敗。
- 累計量同時超限時優先報 total-bytes，不能靠縮頁恢復已消耗的額度。session／legacy／文字／結構／訊息數／頁數超限不採此縮頁策略。原上限未放大，仍可能不適用特別大的對話。
- limit 診斷只含固定類型、observed/maximum、declared/decoded/count 口徑、來源階段、分頁大小、完成頁數、已讀 bytes 及請求數。無聊天內容、UUID、URL、token/cookie、內容 hash 或原始回應。
- 頁面診斷分開 mountedCount/fullCount；lastHistory 保存最後一次明確讀取結果，正常導航提示與 DOM 刷新不覆蓋它。新版診斷格式 diagnosticSchema=2，並未作新版本安裝交付。

## 主端驗證（全部是合成資料）

| 檢查 | 結果 |
|---|---|
| typecheck／正式 build／web-ext lint | PASS；lint 0 errors/warnings/notices |
| 核心單元 | 12/12 PASS |
| 歷史26＋完整索引7＋方向1 | 34/34 PASS |
| 隔離 Firefox 157 localhost 完整歷史 | 18/18 PASS |
| 隔離 Firefox 新 renderer 回歸 | 8/8 PASS |

FULL-NATIVE-17 使用 Node HTTP server 真正 gzip 的合成回應。解壓後頭頁大於 2 MiB、初始請求 100 回合失敗，縮 50 回合後讀完四頁並重讀相同頭頁。精確取得 200 個合成提問 ID／順序，畫面只有七個掛載；捲動後完整索引仍有 200，離屏搜尋仍命中。這不是 ChatGPT 真實登入或使用者長對話測試。

FULL-NATIVE-18 的合成提問為 262,145 字元，明確報 text-chars 上限 262,144；沒有縮頁重試或套用部分結果。掛載窗口更換及導航後 lastHistory 仍保留原失敗。HIST-19–26 另涵蓋總量優先、最小頁仍超限、legacy 不適用縮頁、頭頁重讀超限、cursor/revision/parent/overlap 仍拒絕、取消與壓縮宣告大小和解壓大小區分。

主端證據：outputs/Firefox-超限排錯證據/3bedace（僅 JSON 結果／build metadata，無 browser profile）。新正式開發 build 的 content SHA-256 為 3a907ed168284d86361d5cdf2d6fde8a52fbece480913c5daaa39db21f94954f，未當作新安裝包交付。舊交付 content SHA 625f31fd…保持未變。

## 獨立審查與真實門檻

GPT-6.1 Sol high sub-agent 從固定 3bedace archive 重建，typecheck 和 34/34 歷史相關單元通過，自主合成 probe 5/5 PASS：真 Node HTTP gzip、頭頁縮 50 後較早頁再縮 25 而重讀仍 50；舊 95c2694 相同樣本被上限拒絕（預期舊行為，對照成立）；失敗已讀 bytes 仍計累計量；重讀頭頁超限不能再縮；忽略 signal 的晚串流於取消後不返回 snapshot／進度或新增請求。沒有新合成阻擋缺陷，但沒有測真實帳號、實際網站協定或使用者對話。probe 結果只代表合成回歸，不改 LIVE 狀態。

真實 Firefox 通道不可用；已向使用者請求歷史請求的單／複數路徑類型、HTTP 狀態及 Size，沒有要求完整 URL、標頭、回應或 token。等待此證據確認實際超限類型，再完成真實長對話全集合、穩定搜尋／卸載、舊／新對話與定位驗收。**未完成真實驗收前不交付另一個宣稱修好的版本。**完整門檻見 live-history-failure.md。
