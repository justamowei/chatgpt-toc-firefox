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

HeightLedger保存純數字body高度／寬度與同窗口兩user之間實測span，包含回答、提問與間距。全球順序未核對時記錄局部DOM相鄰span；順序已核對後，只更新全局相鄰且同時掛載的兩端，避免不連續窗口／保留尾端把已量測8→9覆寫成8→16。末輪MECH05亦確認經替換、卸載與返回後仍使用完整高度鏈。定位只在全球已見順序可核對時，從目前掛載user的現座標加／減完整span鏈。任何缺鏈、nextId改變、寬度差>8px或非正有限值會拒絕估算，轉回舊位置／實測界限的有限搜尋。高度量測最多10000筆、span5000筆，epoch更換清除，沒有保存卸載DOM或聊天持久化。

位置僅為嘗試線索。定位只操作conversation root；等待精確ID／role／全文重新掛載並進入viewport，再高亮；允許少量校正，暫時失败由Navigator有限重試。返回offset後亦重新等待掛載／核對原正文版本与24px誤差，避免過早宣告恢復。refresh可能取消任務，之後每次捲動前重查signal／epoch／context，避免取消後寫入。

「頁面診斷」新增revision、實際root的tag／overflow／client／width／height／top／connected、高度量測數、掃描階段、最後load要求的位置與結果／scroll事件／root替換。沒有訊息ID、正文、URL或帳號；最後load為null表示該任務尚未執行load（例如只做已掛載定位），不等於故障。

## 驗證狀態

固定產品來源`31608f2c3766d282f66c65a6d15ab63ceaf894a1`，包含最後的高度鏈保留修正。核心26項、HeightLedger9項、typecheck、正式build與lint（0 errors／0 warnings／0 notices）通過。

主端原生Firefox157.0掛載機制7項／速度4項／快取8項全部PASS。多層容器18題由2題收齊且自然idle、精確順序；完整height鏈實際用於離屏u7並在往返後保留；root替換與evict各在導航armed後發生，精確定位；答案返回offset -406→-406並等待remount。40題含60000px回答與500ms空白延遲，掃描自然idle、全部精確順序且實際跨越巨型回答：32.849秒／43次scroll；已見離屏定位1.189秒／2次scroll，18000px高度變動後1.206秒／2次scroll，停止後無晚到scroll／高亮且40題保留。這些時間只屬該localhost模型。

舊速度測試只等40IDs就停止，會在舊尾端已見資料與新頭部尚未橋接時太早結束，已改等待自然idle與完整預期順序；舊快取案例假設收集結束在頭部，但r2 sweep自然到原錨點，原錨點當時掛載可精確返回。現在明確卸載原錨點後才測未知順序拒絕，提供實際ordered橋接後才測離屏恢复。沒有放寬產品顺序守門。早期fixture setup要求3題但尾窗口只有2題的逾時，也沒有當作產品FAIL或PASS；baseline證據使用修正setup後的固定舊source重跑。

GPT-6.1 Sol high唯讀審查指出的refresh後取消、返回offset過早成功、hash後重新取得節點、連續偏移穩定與fixture旗標事件時序均已修正並核對。最後高度鏈修正31608f2的獨立核心26／幾何9／機制7／速度4／快取8全部重新PASS，不沿用舊979候選結果。独立40題33.273秒43步、離屏1.405秒、高度改變後1.426秒。證據見[evidence](evidence/scroll-mechanism-2026-10-05/README.md)與[獨立報告](acceptance-v0.3.1-r2.md)。

整個addon在真實Firefox chatgpt.com的新流程尚未LIVE驗收，候選不能宣稱使用者問題完全已解決或保證全量。正式／fixture建置須分別核對hash；每功能或30有效分鐘commit、每次push核對遠端SHA的規則持續適用。
