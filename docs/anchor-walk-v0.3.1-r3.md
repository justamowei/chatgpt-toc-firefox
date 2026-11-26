# v0.3.1 r3：沿已掛載訊息巡覽

2026-10-05 Asia/Taipei。使用者回報r2仍失敗，提出反覆選取最遠掛載訊息。本輪採用此方向；manifest仍0.3.1，revision=`2026-10-05-r3`，固定產品來源`535a4ffe0fbde463b97c687e4e8dab93f7814bf0`。r2本機PASS不能抵銷真實失敗。

## 真實頁面的新觀察

在先前已授權的中性ChatGPT IAB測試對話，以locator讓已掛載section進入畫面。初始slots6–10、root top3861／height6653／client672；選turn6後出現4、5（top2134.5／height5629），選turn4後出現2、3（top1885.5／height6653）；選turn2後最早slot1（top641.5／height6669），選turn1後其top21.5、root top122.5。

錨點進畫面確實觸發更早掛載，root高度非固定整段座標。slot只描述當時DOM，不能當歷史身分。以上是locator自動捲動與真實網站觀察，未執行addon；不是Firefox LIVE，也不能斷言已取得使用者Firefox根因。截圖只留本機，不提交聊天正文。

## 實作契約

- 從viewport附近的連續掛載窗口，選方向上最外側訊息outer shell，原生`scrollIntoView`讓瀏覽器處理實際祖先及懶掛載。沒有點聊天按鈕或提交提問。
- 大spacer／local slot gap拆開窗口，拒絕保留尾端跨未知中段。slot只作local線索，一shell含兩role可有兩slot步幅。
- 曾在真正物理連續窗口觀察的相鄰user pair保存純ID關係（最多5000，滿額仍更新existing key，epoch清除）。之後版面插入留白時，必須同時核對當前全局successor才能跨到live已見相鄰錨點。冷啟動disjoint tail沒有此見證；不拿旧絕對座標導航。
- 新stable ID或連續窗口signature改變並穩定才算進展，scroll事件／像素／height只是診斷。640ms停滯只补一次邊界外45%viewport捲動，重新取得live root／shell；空窗口不能作邊界證明。
- 收集先older，兩次穩定窗口無進展改newer；newer再兩次無進展停止。停滯不能區分真邊界與renderer失去反應，文案明示「兩端連續未觀察到進展；完整歷史尚未核對」，不宣稱真的到頁首或完整。
- 收集最多5分鐘／2400步；尋找60秒／60步、單批8秒。保留停止／手動介入／context與epoch取消、已見快取不因正常卸載刪除。
- 定位同樣用outer shell，最後精確核對stable ID／role／正文、connected／viewport；返回保留答案版本與偏移穩定核對，未知順序的離屏守門不放寬。高度量測仍供診斷，r3不以高度鏈猜導航座標。

## 驗收範圍

最終來源535a4ff主端typecheck／核心28／geometry9、新錨點5、原Firefox機制7／速度4／快取8全部PASS。正式build與lint為0 errors／0 warnings／0 notices。GPT-6.1 Sol high在獨立固定archive重跑typecheck／核心28／geometry9／錨點5全部PASS，不沿用r2或中途probe的hash／PASS。

主端40題47.289秒／54個scroll事件；已見遠距目標13.167秒／18事件，插入18000px留白後5.591秒／7事件，皆精確目標，停止無晚到scroll／高亮。18題包含root replacement及evict仍精確定位，返回答案偏移-406→-406。獨立新錨點模型冷尾7→30約12.094秒、冷中7→30約10.789秒；停滯保留7／6.818秒有限停止。上述性能僅屬各自localhost模型。

證據見[evidence](evidence/anchor-walk-2026-10-05/README.md)與[獨立報告](acceptance-v0.3.1-r3.md)。正式content SHA256為`55e9d391826942df3b132e2046787434785abaf50748e9181178782d7d4c3bda`，fixture為`974bcf84877947f9d0a36484c5387f1e71617d69134c5ae2e2586df64c82dfed`，不得混用。

新模型為原生Firefox、content-visibility outer shells、相鄰重疊窗口與pinned tail、凍結／取消。Renderer觀察shell邊界實際抵達viewport而推進；沒有page prototype monkeypatch（Xray隔離不能據此攔截addon）。test calls數是邊界抵達觀測，不是攔到API呼叫。

舊速度／機制的一跳及height-method要求改為r3錨點步進契約；保留精確集合／順序／目標／取消驗證，等待與commands依seek預算核對。遠距步進較慢，不能宣稱r2的1秒級速度。初次舊MECH的9秒到頭／speed的5秒seek要求與r3步進不符；另修正一shell含兩role時slot stride錯拆窗口所造成的真實seek停滯。新錨點取消案例的首輪null／undefined斷言失敗是WebDriver序列化差異，改核對兩者都表示沒有高亮；最終固定来源全部重新跑。

整個addon在真實Firefox ChatGPT仍未LIVE驗收；IAB觀察、停滯或收齊合成集合都不證明網站完整歷史。Git每功能或30有效分鐘commit、每次push核對遠端SHA持續適用。
