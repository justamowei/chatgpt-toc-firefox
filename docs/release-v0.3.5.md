> 版本更正：依使用者指定，原誤標v0.3.7改為v0.3.5。此為版本metadata調整，功能未更改。下列20項原生合成與94項純測試為更正前相同功能來源的驗收證據，原始證據維持原版本以供核對。更正版產物hash與額外驗證見本版補充。

# v0.3.5 頂端收集修正

2026-10-10。以已回退的 v0.3.4 為基礎，修正「收集整段對話」抵達頂端後反覆跳動、不能正常結束。依使用者選擇，到穩定頂端直接結束，保留已收錄資料。

## 行為與原因

原本每個收集批次都重新對齊最早掛載訊息，再由訊息位置計算位移。在原生 Firefox 合成頁含 450px 頁首留白時，原版會在 450px 與 157px 間重複移動；18 秒後仍在 loading。這是可重現的程式缺陷，尚未核對使用者真實 ChatGPT DOM 是否由相同條件觸發。

本版保留目前邊緣節點與識別值。只有掛載邊緣改變才重新對齊；同一邊緣後續持續以實際 scrollTop 向上推進，不反覆加入節點偏移。抵達穩定頂端後直接結束，不再轉向下補收。

頂端仍需核對：實際 scrollTop 為零、首則訊息可見且仍掛載、同一捲動容器與邊緣身份、局部及整體幾何持續穩定至少 6 秒，並有兩次相隔至少 2.4 秒的頂端探測；可見的 loading 或新掛載會重置證據。隱藏 loading 不阻止完成。

## 使用

按「收集整段對話」從目前位置向上巡覽，保留現有目錄。從頁尾開始可覆蓋本次經過的整段；從中間開始不會補收尚未看過的更晚訊息。本次不加入清空重建、自動全收或新的編號功能。設定的 1–10 分鐘期限、停止操作、缓存與離屏導航沿用 v0.3.4。

Firefox 載入本機 outputs/Firefox-測試版-v0.3.5/manifest.json；更新步驟見 [安裝說明](install-firefox.md)。正式產物 content.js SHA256：eb20132a677b1feda1349885f5c6c735a6244e7a4e3ce5cc0602b8dd5352df33。ZIP SHA256：27c418444ccf29c483f4b0dbb56ce2c1ed3133d29cabeacf06fc05dce6b1eab9。

## 驗收與限制

94/94 純測試、7/7 版本規範測試、20/20 原生 Firefox localhost 合成回歸通過；正式與 fixture 產物嚴格 lint 均零錯誤、零通知、零警告。GPT-6.1 Sol high 子代理固定 runtime 0a069e08a7893a55b48d061ce7dbb8a9fc0f9b64 審查 PASS。詳見 [驗收報告](acceptance-v0.3.5.md)。

ChatGPT LIVE 尚未實測，個人 Firefox 及現有插件未操作。若頁首有大於視窗且無法辨識的留白，導致 root 雖到零但首則訊息仍不可見，會保守等待至停止或期限，不宣稱完成。頂端捲動邊界成立也不能當作完整歷史已核對。

此為 PATCH 實驗版，使用新的不可變 v0.3.5 tag；已刪除的舊v0.3.5程式不恢復、v0.3.6保持移除，歷史八個正式 tag 不移動。固定交付 commit／tag object 由 [版本目錄](version-catalog.json) 記錄，僅版本／revision更正，功能來源保持0a069e08。

## 更正後補充驗證

更正後 runtime：f3cc43662f91bf3c156661bc524f64a8377605ce。94/94 純測試、6/6 原生 Firefox localhost 頂端回歸、typecheck 與兩種產物嚴格 lint PASS（各零 errors/notices/warnings）。[原生結果](evidence/v0.3.5/native-top.json)、[純測試](evidence/v0.3.5/pure-tests.txt)、[正式產物](evidence/v0.3.5/production-build.json)。正式 content.js 逐字核對只變更 revision 字串；背景、設定與CSS產物hash不變。先前20項合成回歸保留為功能來源證據，不當作更正版重跑20項。ChatGPT LIVE仍未測。
