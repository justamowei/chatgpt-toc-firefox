# v0.3.6 修正版：捲動容器邊界與到頂確認

2026-10-08；產品版本依使用者明確指示維持0.3.6，建置revision 2026-10-08-v036-r2。runtime 5f1479c9133364a38fd7b2eb54ce129970610274。原始v0.3.6 tag／安裝檔／報告保留，本修正另存snapshot/v0.3.6/2026-10-08-r2與獨立交付資料夾，不移動原tag。

## 原因與修正

原本bottom探測以最後訊息底緣對齊，再加0.45個viewport；底部留白超過此距離時，所謂向下探測反而向上移。每個重試batch再scrollIntoView(end)會回拉至訊息底緣，無法轉向上。頂部也有對稱問題：對齊首則訊息後只跨一部分留白，下一batch又拉回。

修正直接使用實際捲動容器的numeric邊界。tail準備每批與poll追蹤實際scrollHeight上限，不再對齊最後訊息；到底探測請求超過最大值。允許最後訊息上方離開viewport，只要穩定ID仍掛載、實際已clamp到底；回答正文串流、字型／高度重排與答內busy不再阻止定位準備。tail證據用同一root、末端ID、viewport與相對底端gap，不用回答正文或絕對總高度；仍等待6秒及兩次相隔2.4秒clamp探測才轉head，不以tail定位宣稱歷史完整。

head相同root／frontier的跨批重試保留捲動進度，不再重新對齊首則。停滯時向上步進；實際頂端探測直接負位置，確保方向不反轉。到頂完成仍須scrollTop接近0、首則穩定訊息可見、ID／正文與局部幾何穩定6秒、兩次clamp且沒有載入。可見的同root邊界外或覆蓋首則的history loader延後完成，hidden／aria-hidden／CSS隱藏或composer/sidebar與遠端尾端busy不阻止起點證據。

中段停滯、空掛載、巨大未掛載spacer不能當起點。若靜態頁首區塊超过一屏且首則尚不可見，維持保守等待至時間上限；不能只看scrollTop0宣稱到頂。到頂只證明網站目前可觀察的穩定邊界，不保證伺服器完整session。收集時間預設10分鐘、可選1–10分鐘；手動重建仍只清空目前對話索引，不刪聊天，其他保存／新增提問行為不變。

## 驗收

固定來源111/111純測試、typecheck、正式／fixture建置、Firefox嚴格lint 0/0/0。原生Firefox157.0.1隔離profile／localhost，7項邊界＋8項自動功能合計15/15 PASS：450px首尾留白、950px尾留白、末答持續busy／串流與高度變動／root替換、9秒外側與重疊loader等待後補入第31筆、凍結中段不假到頂／停止無晚到捲動、隱藏loader；空session自動30筆、已有內容不重跑、追加同文字不同ID、F5／SPA恢復等。

獨立GPT-6.1 Sol high已完成111純／typecheck／兩種lint與12hash一致；原生15/15也PASS，未解決blocker 0，見[驗收報告](acceptance-v0.3.6-r2.md)。修正前35秒卡在tail的原失敗保留。中間固定d3案例出現117秒異常逾時，單獨重跑PASS及最終全部PASS也保留，未確認其根因。Windows computer-use與CUA初始化崩潰，未完成真實Firefox／ChatGPT LIVE；不把localhost測試宣稱LIVE驗收。簽章／ESR／Android仍PENDING。

正式content SHA-256：0a41196ca7218e1ee9dd0d2cbb34852b548311c8805575058569c729ec60d27d。
ZIP SHA-256：1e0559631e616883130fddad4559d1c2f969204dce40ca61886e0b3da1a354d5。

交付manifest：outputs/Firefox-測試版-v0.3.6-修正版/manifest.json。覆蓋目前載入資料夾檔案，about:debugging重新載入，再F5，勿卸載或清除索引。可用build-info.json的revision與頁面診斷辨識修正版，manifest版本維持0.3.6。

Git工作線fix/collection-boundary-v036、release/v0.3；原annotated v0.3.6不移動，另有固定建置snapshot。每功能checkpoint由原始bundle雲端Linux同步，本機網路Git／GCM禁用；精確refs核對另存交付同步證據。
