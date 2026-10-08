# v0.3.5 重新開發驗收

版本0.3.5，revision2026-10-08-v035-rebuild，runtime 95a74670e26a930c6cadc3c4a29a9d40eb5a7d43。基準canonical v0.3.4 delivery 25b46d412e6aa7af451eb7a507b47c291a9ade66；恢復commit b054f36b07657d978576ca7934228d1d212cc1c2 的所有src/scripts/tests/manifests/package/tsconfig與該tag精確相同。Git ancestry保留後續歷史，功能由034重做；不覆蓋/移動旧035/36tag。

## 結果

- 主端及獨立111/111純邏輯測試；型別檢查PASS。
- 獨立固定來源逐檔重建，正式/fixture共12/12 SHA256相符；兩份web-ext lint errors/notices/warnings均0。
- 獨立原生Firefox157.0.1、隔離profile、真實附加元件與storage.local、localhost numeric scroll virtualizer：最終11/11 PASS，exit0。fixture以實際scroll events掛載5/7則及pinnedtail；未monkeypatch scrollIntoView來虛構成功。
- 主端只做正式建置/封裝、純測試与證據核對；不把獨立原生11項冒稱為主端第二套原生結果。
- ChatGPT LIVE：PENDING。CUA初始化返回node_repl kernel exited unexpectedly / windows sandbox helper_unknown_error setup refresh had errors；此原生localhost結果不代表目前ChatGPT網站整段服務端歷史完整。

## 原生矩陣

| case | 檢查 | 結果 |
| --- | --- | --- |
| R01 | 中段13、window5、pinned2、底spacer1600：先numericbottom再向上32/top0，不反向 | PASS |
| R02 | window7、hiddenbusy及持續tailstream仍能32/top0，head單調不下滑 | PASS |
| R03 | v034已保存32不auto，SPA A/B/A、F5，unmounted exactID高亮 | PASS |
| R04 | 有1active或只有quarantine均不auto | PASS |
| R05 | 手動建立清當前A舊列，B資料完全保留，再bottom/head32 | PASS |
| R06 | 原收集不reset、只向上、頂端停止 | PASS |
| R07 | 新prompt追加為33且F5原順序恢復 | PASS |
| R08 | Stop後无捲動、準備期停止解除UI、SPA roundtrip無污染且B可跳轉 | PASS |
| R09 | 真head0/top0可見historyloader9s，7s時仍loading，不提前完結 | PASS |
| R10 | 首次DOM延遲1100ms，對話頁無輸入/點擊也auto32/top0 | PASS |
| R11 | 無stableID的mount1800ms不auto，補stableID後auto32/top0 | PASS |

[原生結果](evidence/v0.3.5-rebuild/native-final-11.json)、[獨立靜態](evidence/v0.3.5-rebuild/independent-static-review.json)、[獨立建置](evidence/v0.3.5-rebuild/independent-build-hashes.json)。fixture/test HEAD紀錄啟動時04163fc；runtimeRevision及runtimeHashes鎖定上述95a7467，後來僅測試/文件提交沒有產品差異。

## 修復與完整原始證據

b536初輪8/9PASS、R08真失敗：手動建立的Navigator前準備期被取消/切route後host還留loading；static還找到首次DOM晚掛載未啟動auto、hydration await前無cancel token，以及前session晚reset ack令新session保存漏排。修成queue刷新檢查auto、準備期token/UI取消、generation owner隔離與stableUser gate後，最終111純+11原生通過。原失敗JSON保留，不改成PASS。

r2原生10/11，R10是fixture初始dataset未設定返回null却期待idle；單案另遇收合panel的list尚未建構却期待32的harness錯誤（實際scope32、top0、navidle）。修正test初始not-loading與有效expanded設定；無runtime變更；final r3完整11/11。以上原test失敗也保留，不能冒稱原輪全過。

## 限制

DOM邊界只證明穩定可見捲動頂端；未核對伺服器分支完整性。超viewport高頂端裝飾、未知virtualizer/loader、超容量/期限時保守停止并明示未核對；不是連續無新增就宣稱完整。預設10min，可設1–10min；5000筆/500萬正文、profile12對話/600萬JSON字元容量沿用。未簽章暫載版，Firefox重啟需重載；依使用者要求不相容讀取棄用035/36快取。已保存v034目錄與跳轉保留。
