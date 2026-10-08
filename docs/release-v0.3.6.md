# v0.3.6 空目錄自動收集與新增提問延續

2026-10-08，revision 2026-10-08-v036；runtime c32e8e92ec98d0dc3969ab3e2e8170bdf726258e；corrected測試來源 ff84d94ba7a8c14630c6bb46c649b2666a0dcba2。

1. 目錄編號統一顯示「1.」「2.」，移除「暫」字。已核對起點的序號仍保存；未核對起點時，數字代表已收錄目錄的順序，tooltip明示「已收錄目錄第N項」，不能據此推斷網站未載入的session絕對序號。正文／順序矛盾仍保留隔離與撤銷規則。
2. 進入有conversation ID的對話，先等待本機保存資料讀取。只有成功讀取且該對話沒有任何保存項目，才等待穩定提問掛載、自動移到最底並向上收集到穩定頂端。任何現存項目（即使只有1筆、部分目錄或隔離區段）都不自動重跑。讀取拒絕／失敗或不是對話路由不啟動。判定使用原始保存內容，不把讀取期間新增的視窗資料誤算成已有歷史。
3. 繼續對話時，實際掛載的新提問由MutationObserver合併到現有索引並保存。同文字不同穩定ID保留為不同提問；不清空之前的目錄。F5與切換返回沿用已保存內容及編號。

自動收集沿用已驗證的由底往上導航、頂端穩定判定與1–10分鐘設定，預設10分鐘；不執行cache:reset、不遞增重建generation。停止、手動導航、頁面外閱讀操作或離開對話取消當次執行；同一內容程式生命週期，每個session最多嘗試一次，停止後返回不反覆重啟。等待第一筆掛載時尚未顯示停止按鈕，等待期間的閱讀取消尚未涵蓋；實際開始後可停止。已收錄資料會保留，未完成可自行按「重建整段目錄」。手動重建維持只清空本對話索引、不刪聊天的原行為。

## 本機資料與相容

保留addon ID、toc-index-v1／version:1與原本容量／無痕規則。cache:read新增明確回覆，區分成功無資料和未授權／失敗；不把讀取失敗當空目錄。不存聊天於GitHub、不使用歷史API；每對話5000笔／500萬正文，profile最近12個對話／600萬JSON字元。自動收集只核對網站已顯示的穩定边界，不宣稱伺服器完整歷史。

## 驗收與交付

主端純111/111，typecheck、正式及fixture建置、Firefox嚴格lint 0錯誤／0警告／0提示。原生Firefox157.0.1獨立profile、localhost虛擬化場景8/8 PASS：延遲DOM後空目錄自動收齊30筆、追加兩筆同文字不同ID、F5恢復32筆不重跑、1筆保存／隔離資料都不重跑、新session自動收集、停止返回不重啟、無自動reset／保留5個session、手動重建正常到頂停止。已檢視實際編號／完成截圖。

GPT-6.1 Sol high固定runtime的獨立副本也完成111純測試、8項原生Firefox、typecheck/lint，正式及fixture共12個hash一致，未解決blocker 0。先前F5合成測試因fixture重整後改變新增提問正文而失敗，原失敗證據保留；只修正fixture正文延續與路由等待，runtime未改。這是localhost合成驗收，ChatGPT LIVE仍PENDING；簽章／ESR／Android未驗收。

正式content SHA-256：9d5c17bf7010f1e960b15865dcbbb9eae10236f446f14f3247572320c99527cd。
ZIP SHA-256：b7aeea4fcedc40db3e372b356e5ecb9cf05944e775c5b5a1006c633fbba67a4e。

交付manifest：outputs/Firefox-測試版-v0.3.6/manifest.json；詳見[更新與使用](install-firefox.md)、[驗收證據](acceptance-v0.3.6.md)。覆蓋目前載入資料夾、about:debugging重新載入、F5；不要卸載或清除儲存。

Git工作線feat/automatic-session-index；交付annotated v0.3.6與release/v0.3。每功能checkpoint，本機網路Git／GCM禁用；原始bundle由一次性雲端Linux作業同步，refs與tag精確核對結果另外保存。
