# 開發與版本管理計畫

2026-10-08 更新至 v0.3.6 版本入口。main保留專案基線，本次更新僅為規範文件及版本索引；完整產品與歷史功能計畫見 [release/v0.3](https://github.com/justamowei/chatgpt-toc-firefox/blob/release/v0.3/docs/development-plan.md)。

## Git與版本規則

- 見 [完整版本規範](version-policy.md)、[版本目錄](versions.md)。
- 每功能或30有效分鐘commit；明列WIP與驗收範圍。
- 三段產品版本，主要能力增MINOR、相容修復增PATCH；每次不同產品程式的交付必須新版本，版本與manifest/package/lock一致。
- annotatedtag vX.Y.Z固定原始交付，建立後不移动。release/v0.3維護當前系列，feat/fix分支開發；main只收納範圍已核准的變更。
- 私人GitHub維持；原始commit/tag object与peeled commit核對一致才算SYNC_VERIFIED。只有鏡像/bundle核對則BACKUP_VERIFIED。
- 本機GCM禁用；由一次性雲端Linux job驗證bundle並恢復原始refs。禁止force-push、重寫歷史、移動tag與刪分支。
- 所有現有版本仍是未簽章實驗／測試版，Firefox ChatGPT LIVE待驗證；0.2.0已撤回，仅供追溯。tag与維護分支不表示公開Release或已正式簽章。

## 2026-10-08：v0.3.5 單對話重建與提問編號

使用者授權「清空該對話目錄→移到最底→一路往上收集→頂端自停」。clear不得影響其他對話或聊天本身；背景持久化generation阻止舊分頁／event page重啟回寫。預設10分鐘、設定1–10分鐘，停止／路由切换必须撤銷過期捲動，已提交reset ack的世代仍須在同context同步。

收集只tail→head→done。頂端見證以穩定ID／正文與局部幾何、6秒＋兩次2.4秒clamp探測，忽略同語義重掛載及遠處尾端高度／progressbar；中段停滯、空掛載、載入或真正邊界變動不能標到頂。到頂不再往回收集。

session提問序號只有連續重疊底→頂走訪、全穩定ID／已接通順序／無容量限制或矛盾才從1確認；否則顯示暫編。編號與撤銷持久化，F5／SPA／搜尋一致；新增須有已編號尾筆→新筆連續窗口，插入／暫時ID／正文順序分支矛盾撤銷。

驗收主103 pure＋原生Firefox157.0.1 localhost5項、固定SHA獨立重建12hash；ChatGPT LIVE、簽章仍PENDING。明細見docs/release-v0.3.5.md。Git版本遞增0.3.5、工作分支fix/rebuild-collection-numbering、維護線release/v0.3、固定annotated v0.3.5；每功能或30有效分鐘commit且同步原始SHA，禁本機GCM／網路Git。

## 2026-10-08：v0.3.6 空目錄自動收集

移除編號「暫」，未知起點的tooltip仍明示已收錄目錄順序，保持持久化起點證據及矛盾撤銷。首次載入／SPA必須先成功讀取原始保存索引；只有active+quarantine合計0才自動由底往上收集。拒絕／失敗不算空，任何1筆／部分／隔離資料都不自動重跑。不執行reset、不清空觀察期間新增資料；停止／導航／切換取消，單content生命週期每context最多嘗試一次。新增穩定ID提問自动合併保存，不按文字去重；F5／SPA延續排序與編號。預設10分鐘、設定1–10分鐘不變。

runtime c32e8e92ec98d0dc3969ab3e2e8170bdf726258e；測試 ff84d94ba7a8c14630c6bb46c649b2666a0dcba2。主端及GPT-6.1 Sol high獨立111純／8原生Firefox157.0.1 localhost、12buildhash一致。ChatGPT LIVE仍PENDING，首次掛載前停止按鈕未顯示為已記錄UX限制；詳見docs/release-v0.3.6.md。PATCH 0.3.6延續已觀察DOM能力和保存格式，feat/automatic-session-index、release/v0.3、不可移動annotated v0.3.6；每功能checkpoint與原始SHA雲端同步，本機GCM／網路Git禁用。

## 2026-10-08：v0.3.6 指定同版本邊界修正

保留產品版本0.3.6，revision 2026-10-08-v036-r2、固定snapshot/v0.3.6/2026-10-08-r2；原v0.3.6 tag／交付檔不移動或覆盖。tail準備依numeric rootmax，不對齊末答；head跨批次保留同root/frontier進度，clamp probe直接numeric邊界，避免首尾padding造成反向回拉。頂端6秒／兩次2.4秒探測与可見首訊息／ID正文／局部幾何證據保留；可見邊界外或重疊loader等待，隱藏／composer／遠端tail busy不阻止。中段／未掛載spacer不得宣稱到頂。主111純／15原生Firefoxlocalhost；真實LIVE尚未完成。詳見docs/release-v0.3.6-r2.md；fix/collection-boundary-v036與release/v0.3、每功能原始SHA雲端同步，本機GCM禁用。
