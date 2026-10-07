# v0.3.3 修正與驗收

2026-10-07，revision 2026-10-07-v033；runtime 固定來源 567dfda645d113449eece4932519da98e59e7118。後續文件 commit 不改 runtime。

## 三項修正

1. SPA 切換對話後，背景讀取以 tabs.get 的當前頂層 URL 驗證對話，不再只比 content sender 的初始文件 URL。切出先 flush 舊對話，恢復讀取使用 context／generation 防止遲到結果覆蓋新對話；空掛載階段仍能恢復同對話快取。切換時清除搜尋字串，避免上一對話的篩選造成空白。
2. 未知分支的已保存提問恢复到可點選列表，保留穩定 ID、正文與舊順序提示。跳轉用相鄰掛載窗口尋找，重新掛載後才核對 ID／正文並高亮，不依據快取宣稱完整或證明目前分支。無順序橋接時先向上找，連續無進展後最多反向一次；沿用原本 60 秒／60 輪尋找期限。正文、順序或已知分支矛盾的舊版本仍隔離供搜尋。兼容 v0.3.2 的 restored-unverified 快取，不需要重新收集才能恢復候選提問。
3. 「收集整段對話」預設最多 10 分鐘；設定可選整數 1–10 分鐘並儲存，下次收集生效，執行中維持原期限。收集最多 4800 輪；穩定物理邊界可提早完成，停止／真正閱讀操作仍可取消，Alt 不停止。單次導航仍最多 60 秒，與收集期限分開。

資料保存規格延續：Firefox storage.local、同對話 URL 隔離，每對話 5000 筆／500 萬正文，全 profile 最近使用 12 個對話／600 萬 JSON 字元。全域容量超限仍會淘汰較久未使用對話；未保存、已清除或已淘汰資料不能憑空恢復。無痕不保存，不使用 session/history API，不上傳聊天內容。

## 驗收證據

Firefox 157.0 真正載入 addon，獨立臨時 profile／localhost 虛擬掛載合成頁面完成 **13/13**，不是 ChatGPT LIVE：

| 測試 | 結果 |
| --- | --- |
| null 分支長歷史 | 初始 7 則，巡覽收齊 30，精確順序並寫入真實 extension storage |
| SPA A→B→A | A 的 30 則全部恢復，B 的 7 則不混入；搜尋篩選清除；A 未掛載第 3 則成功核對高亮 |
| F5 恢復與雙向導航 | 30 則仍為按鈕，第 3／24 則離屏定位成功，未宣稱完整 |
| v032 舊快取 | 23 則隔離前綴＋7 則尾段恢復 30；重新 seed 合法分離快取，從冷啟前綴也找到尾段第 24 則 |
| 收集時間設定 | 預設 10；儲存 2，重整仍 2，下一次執行顯示最多 2 分鐘，停止有效 |
| 正文矛盾 | 未掛載目標重新出現不同正文時取消舊導航、隔離原版本，沒有錯誤高亮 |
| 七項既有功能回歸 | 自動／第二分頁啟用、600 筆面板重複開關無節點重建、Alt／Shift+O 保持收集、停止、F5 600 筆、未知分支去重、不同對話隔離 |

純測試 **88/88**、typecheck、正式／fixture build、web-ext lint 通過（0 error／warning／notice）。截止與永不回覆的取消測試採縮短期限驗證；未把設定顯示測試當作連續等待 10 分鐘的實測。獨立 agent 使用固定 Git archive 重建核對，見 [獨立驗收](acceptance-v0.3.3.md)。主端已檢視 F5 恢復後成功定位第 24 則的 Firefox 截圖。

正式 content SHA-256：03e4409516645975c8fb0718f21a87c3658b8cbcbef86277837b1105dbffed30；fixture：ea1cee7629f6f25cd5ece3a023b4b2c7978505a89f34b206c95e05c9619724f9。原始測試 JSON／build-info 見 docs/evidence/v0.3.3，截圖另附交付報告。

## 更新與限制

交付 outputs/Firefox-測試版-v0.3.3/manifest.json，正式版只匹配 chatgpt.com；localhost fixture 不能作為日用版。為保留索引，使用同一 addon ID 更新：將新版檔案覆蓋到目前載入的測試插件資料夾，在 about:debugging 按「重新載入」，再重整 ChatGPT。不要先卸載或清除本機索引。版本應為 0.3.3、診斷 revision 2026-10-07-v033。

本版仍是未簽章暫時 addon，重啟 Firefox 可能移除暫時安裝；不承諾卸載後儲存仍在。真實 ChatGPT LIVE／ESR／Android／正式簽章安裝仍待驗證，合成邊界巡覽不證明完整 session。

Git Credential Manager 繼續停用。功能已 commit；文件與驗收另 commit。GitHub 連接器備份 backup/v0.3.3 checkpoint 與包含原始本機 commits 的 Git bundle，結果另附 cloud-backup.json；一般 feature 分支 push 仍待恢復。不改寫原 Git 歷史。
