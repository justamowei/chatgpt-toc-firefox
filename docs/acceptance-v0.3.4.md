# v0.3.4 驗收紀錄

Runtime source：a1ff15a7535cb7bf08cff683ff69104be17f1efb。主端與 GPT-6.1 Sol high 獨立重建驗收。

固定快照：work/saved-order-v034-review-a1ff15a，local git archive / core.autocrlf=false；依賴由已有 node_modules junction 提供。獨立 94/94 pure、typecheck、正式及 fixture build、兩組嚴格 lint 全通過；十二個輸出 hash 與主端實際檔案一致。

原生 Firefox 157.0.1 localhost：八項恢復／導航與五項 anchor 回歸通過，實際 extension storage、scrollIntoView、content-visibility 與 SPA 路由。主端已檢視 saved-order-repeated-refresh 截圖：30 筆保存目錄、7 筆目前掛載，提示沿用排序，列表没有恢復降級分組。

獨立初次指出一般 SPA 返回的排序斷言不足；已增加精確 ids 序列、groups=[] 與保存排序提示，重新執行全部八項通過。runtime commit 不變，後續 delivery 只補測試與文件。初次 anchor 舊 runner 的非同步 idle 競態與重用路由污染已修正並重跑；初次失敗 JSON 保留。

完整性限制維持：保存排序不證明分支或完整歷史；recoveredIds 未全數重見前不得通過完整證明，實際正文、倒序或已知分支變更仍隔離。v1 格式相容，資料容量／LRU 未變更。

證據：
- [主端恢復八項](evidence/v0.3.4/native-recovery.json)
- [主端錨點五項](evidence/v0.3.4/native-anchor-walk.json)
- [初次 runner 失敗](evidence/v0.3.4/legacy-anchor-runner-failure.json)
- [獨立 runtime 審查](evidence/v0.3.4/independent-runtime-review.json)
- [正式 build-info](evidence/v0.3.4/production-build-info.json)
- [fixture build-info](evidence/v0.3.4/fixture-build-info.json)

LIVE／正式安裝簽章／ESR／Android：PENDING。獨立代理未啟動瀏覽器；native 測試由主端執行，不將 localhost 合成 PASS 記為 ChatGPT LIVE。

固定 delivery 25b46d412e6aa7af451eb7a507b47c291a9ade66 的[最終獨立補充審查](evidence/v0.3.4/review-final.json) PASS：runtime／建置檔案完全相同，SPA 斷言缺口已解除，原生 8+5 報告與 hashes 核對一致；未重跑或冒稱獨立 native LIVE。
