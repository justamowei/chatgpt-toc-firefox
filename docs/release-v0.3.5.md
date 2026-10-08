# v0.3.5 重建整段目錄與保存提問編號

2026-10-08，revision 2026-10-08-v035；runtime 6497a1b71bbbe48341022704b111ba611c16bad7。

「重建整段目錄」只重設目前對話的已保存索引，包含舊隔離資料；不刪除 ChatGPT 聊天。先保存返回閱讀位置，背景原子清空該對話，再移到真正捲動根的最底。底端穩定後只往上選取目前連續掛載區段的最早錨點，逐段收集；到頂確認邊界後直接停止，不再反向巡覽。日常觀察仍累積新增提問，不必每次重建。時間設定維持預設10分鐘、可選1–10分鐘。

停止依實際 scrollTop、可見最早穩定ID／正文、捲動根與局部頂端幾何；維持6秒穩定及兩次間隔2.4秒的clamp探測。停在中間、空掛載或等待超時不能當作頂端。同ID／正文重新建立DOM不重設見證；遠處尾端回答高度、尾端progressbar不影響頂端判定。邊界附近載入、conversation loading、正文／ID／捲動根／局部位置變化則重新等待。僅證明網站目前的穩定邊界，不宣稱伺服器完整歷史。

每筆提問前顯示編號。由底到頂的掛載視窗連續重疊、全部穩定ID有見證、順序已接通且無隔離／容量限制時，保存對話第1筆起的編號。未確認起點或中斷時顯示「暫N」，不冒稱session絕對序號。編號和原ID一起本機保存，F5／SPA／搜尋不重新編號；新增提問須實際觀察到已編號尾筆→新筆的連續窗口才延續。插入更早訊息、暫時ID、正文／順序／已知分支矛盾會撤銷編號；撤銷也會持久化。

## 保存與相容

延續addon ID、toc-index-v1與version:1；新讀取器兼容舊資料，加入optional generation／numbering。背景另外保存toc-index-generations-v1，原子重建遞增該對話generation；其他分頁及背景重啟後的舊寫入都拒絕，避免清空被自動合併復活。generation不隨12個對話LRU淘汰；最多5000個重建過的context，達上限拒絕新reset而保留現存資料。舊版讀取器不認識新增欄位，回退舊版前需匯出資料，不能保證它能讀新格式。

其他對話不清空；普通切換／F5直接恢復索引。取消準備期會恢復按鈕，已提交的reset acknowledgment即使取消捲動仍套用其generation；切換到其他對話則不得套用過期回覆。原本容量與無痕規則不變。

## 驗收與交付

主端純測試103/103、typecheck、正式與fixture build、Firefox嚴格lint 0錯誤／0警告。原生Firefox157.0.1、獨立profile／localhost、實際addon storage與捲動五項PASS：30筆長回答底→頂；80ms重掛載＋200ms尾端高度／progressbar；F5／搜尋全局編號與離屏精確定位；SPA＋新增第31筆；重建不復活污染且保留其他session；中段凍結可停止。已檢視編號與停止截圖。這是原生合成驗收，ChatGPT LIVE仍PENDING。

GPT-6.1 Sol high獨立固定SHA副本純103/103、typecheck、正式／fixture共12個檔案hash一致；native結果见[驗收紀錄](acceptance-v0.3.5.md)。

正式content SHA-256：1400611cf33ab4550133aef00a322069350c2b895e4031c950abe57f676b1565。
ZIP SHA-256：b0b456d4318a35c91e9153d89f13685b7f21dd5f7b0ac95bbe43cfe2419f67f2。

交付manifest：outputs/Firefox-測試版-v0.3.5/manifest.json。沿用[更新步驟](install-firefox.md)，覆蓋目前載入資料夾、about:debugging重新載入、F5；不要卸載或清除儲存。未簽章／暫時addon／ESR／Android安裝仍PENDING。

Git每功能checkpoint；本機網路Git／GCM禁用。checkpoint雲端原始SHA經Actions核對，交付tag與release線的最終同步結果另附。

多分頁編號明確區分未知與撤銷；同一generation内撤銷優先，舊的已確認編號也不能復活它。重新重建後新generation才可再編號。兩個方向的多分頁對抗案例均列入103項純測試。
