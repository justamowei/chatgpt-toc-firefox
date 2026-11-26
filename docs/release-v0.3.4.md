# v0.3.4 保存目錄排序修正

2026-10-08，revision 2026-10-08-v034。固定 runtime commit：a1ff15a7535cb7bf08cff683ff69104be17f1efb。

## 修正後的行為

已收集、保存且有順序證據的目錄，在 F5 或 SPA 切到其他對話再切回後，直接恢复原本提問和排序；不再要求每筆訊息重新掛載才能取消「區段內順序待核對」。目前畫面沒有任何訊息時也能先恢復目錄。未掛載項目仍可點擊尋找，成功落點必須核對穩定 ID 與正文。

根因是 reorder 把「快取訊息尚未重新在 DOM 確認」與「順序尚未確認」混用。現在排序只根據已觀察的前後關係；recoveredIds 繼續記錄待確認身份，並明確阻止這些候選直接取得完整性證明。branch=null 仍為分支未確認，不能宣稱已取得完整 session。

延續 toc-index-v1 / version:1 與 addon ID，兼容 v0.3.3 保存的 candidateIds、v0.3.2 restored-unverified 前綴；不清除已有快取。未接通的兩個群組仍分開顯示，保留各群組已有排序，不用首次觀察時間或捲動方向捏造群組間順序。正文、倒序或已知分支矛盾仍隔離舊版本並取消過期導航。

提示改為「已沿用保存的目錄排序」；真正未接通時顯示「已收錄群組／先後順序尚未確認」，避免把恢復狀態誤呈現為排序錯誤。

## 驗證

- 純測試 94/94，typecheck、production/fixture build 與嚴格 lint 通過；獨立 GPT-6.1 Sol high 固定 Git archive 重建與十二個 artifact hash 全部一致。
- 原生 Firefox 157.0.1、獨立 profile、localhost 虛擬掛載頁：恢復／導航 8/8，錨點回歸 5/5。未使用個人 profile，不是 ChatGPT LIVE。
- 收集 30 筆、一般 SPA A→B→A、F5、連續三次 F5：精確順序無變化，沒有錯誤待核對分組；反覆 F5 不自動重收集，renderer 起點維持 23。
- 空掛載 SPA 返回先恢復 30 筆；雙向未掛載第 3／24 則精確高亮；舊快取遷移、時間設定與正文矛盾取消通過。
- 錨點回歸含冷啟 7→30、冷啟中段補收、離屏雙向定位、停滯仍可停止及取消後無晚到捲動。初次舊 runner 因 settings:get 非同步開始前誤判 idle 而失敗，已保留原證據；修正先等 loading、每次冷啟使用不同對話 URL 後五項通過。產品 runtime 未因 runner 修正變更。

正式 content SHA-256：5e854661b492054b7fde199c15360715f4a10560c8a8caeb9685fbce2f2c0912。

[獨立與主端驗收](acceptance-v0.3.4.md)，原始 JSON / build-info 見 evidence/v0.3.4。

## 更新與範圍

交付為 outputs/Firefox-測試版-v0.3.4/manifest.json。依 [更新步驟](install-firefox.md) 覆蓋目前載入資料夾並重新載入，保持 addon ID；不要卸載或清除索引。仍保留現有容量與 LRU：每對話 5000 筆／500 萬正文字元，profile 最近 12 個對話／600 萬 JSON 字元，無痕不保存。已清除、淘汰或從未保存的紀錄無法復原。

本次修正保存格式已能記錄的有序區段；原本同一連通群組的非唯一部分順序仍是既有格式限制，未新增圖邊序列化或宣稱其全部關係可永久恢復。真實 ChatGPT LIVE、簽章、ESR／Android 安裝仍 PENDING；未簽章暫時 addon 重啟可能移除。

Git 本機 GCM／網路 Git 禁用；功能 checkpoint 已由雲端 Linux 復原原始 SHA 並核對（Actions run 37721041589）。交付 tag／維護線的同步結果另附，不把本地 commit 或鏡像視為同步完成。
