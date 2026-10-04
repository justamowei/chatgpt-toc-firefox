# v0.3.1 r2：頁首掃描與掛載重試

2026-10-05（Asia/Taipei）。使用者回報原v0.3.1收集新增0／無進展，離屏目標not-found。本輪保留manifest版本0.3.1，revision=`2026-10-05-r2`，副本使用獨立資料夾，避免混淆先前候選。

## 觀察與可確認的缺陷

真實ChatGPT IAB唯讀觀察：實際DIV[data-scroll-root]包含main，overflow:auto、clientHeight720；document根本身只有720px，沒有歷史捲動範圍。附近user／assistant與尾端兩輪可能同時掛載，並非連續窗口。掛載時height／top會修正，回答正文高度及提問、turn shell的高度不同，不能只加正文高度計算绝對位置。

目前尚未取得使用者失敗當下的Firefox DOM，不能確認他是否遇到相同容器變體。本機模型另重現了舊版缺陷：outer marker沒有捲動範圍、inner marked hidden容器才會移動；舊f9974ec仍選outer，開始收集9秒後只保留2題／新增0、真正root top29450不變。正式修正會優先actual turns／main的可捲動祖先，再核對標記與range，而非第一個全域marker。沒有把此模型寫成使用者根因已確認。

原Navigator另有可直接確認的缺陷：mounted目標locate一次false就立即not-found；網站非同步evict／replace可造成暫時false。已改成每載入窗口一次精確定位，失敗後有限續尋，維持60步／60秒與3次無進展，沒有用近似身分替代。

Windows真實Firefox視窗工具因「目前Windows瀏覽器不支援網址政策檢查」強制結束，上輪未執行Firefox頁面操作；既有查看授權無法解除工具限制。本輪使用隔離profile／localhost原生Firefox，未操作使用者登入／profile。IAB觀察和addon測試範圍仍分開。

## 收集流程

按「收集較早提問」先保存原閱讀錨點，重複要求實際root top=0，等待可見訊息及掛載穩定；兩次相同頁首可見見證／高度才轉入往下掃描。網站錨定把top移開時繼續要求頁首；空窗口不能當作到頂成功。

從頁首以0.85 viewport重疊逐段掃描至原閱讀訊息附近，捕捉每次掛載／首次短暫卸載的提問。明確已掛載assistant正文內部可跨過，遇另一已辨識turn相交則不跨。這樣既能迅速觸發最早窗口，也不把中間尚未掛載的提問視為已收集。掃描抵達原訊息後自然idle，顯示新增數；仍不宣稱完整歷史。240步／60秒期限、停止／手動介入、route／epoch取消持續有效。

## 高度、定位與返回

HeightLedger保存純數字body高度／寬度與同窗口兩user之間實測span，包含回答、提問與間距。每窗口自己的DOM相對順序可作量測；全球順序未核對時仍記錄局部span。定位只在全球已見順序可核對時，從目前掛載user的現座標加／減完整span鏈。任何缺鏈、nextId改變、寬度差>8px或非正有限值會拒絕估算，轉回舊位置／實測界限的有限搜尋。高度量測最多10000筆、span5000筆，epoch更換清除，沒有保存卸載DOM或聊天持久化。

位置僅為嘗試線索。定位只操作conversation root；等待精確ID／role／全文重新掛載並進入viewport，再高亮；允許少量校正，暫時失败由Navigator有限重試。返回offset後亦重新等待掛載／核對原正文版本与24px誤差，避免過早宣告恢復。refresh可能取消任務，之後每次捲動前重查signal／epoch／context，避免取消後寫入。

「頁面診斷」新增revision、實際root的tag／overflow／client／width／height／top／connected、高度量測數、掃描階段、最後load要求的位置與結果／scroll事件／root替換。沒有訊息ID、正文、URL或帳號；最後load為null表示該任務尚未執行load（例如只做已掛載定位），不等於故障。

## 驗證狀態

核心26項、HeightLedger9項與typecheck通過。七組原生Firefox掛載機制、原速度4項及快取8項最終回歸進行中，尚未以本文件宣稱全數PASS。GPT-6.1 Sol high唯讀審查指出的refresh後取消、返回offset過早成功、fixture旗標事件時序均已修正；固定SHA獨立複驗待完成。

整個addon在真實Firefox chatgpt.com的新流程尚未LIVE驗收，候選不能宣稱使用者問題完全已解決或保證全量。正式／fixture建置須分別核對hash；每功能或30有效分鐘commit、每次push核對遠端SHA的規則持續適用。
