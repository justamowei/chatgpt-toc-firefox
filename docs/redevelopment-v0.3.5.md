# v0.3.5 重新開發規格（2026-10-08）

使用者要求撤回舊 v0.3.5、v0.3.6 的使用線，功能基準固定 v0.3.4 tag（delivery 25b46d412e6aa7af451eb7a507b47c291a9ade66）。b054f36 在既有 Git 歷史上精確恢復該基準的 src、scripts、tests、manifests、package 與 tsconfig；不重寫或刪除舊 commits/tags。之後新增功能以此基準的 diff 審查。產品仍依使用者明確指定命名 0.3.5；revision 2026-10-08-v035-rebuild，交付用新 annotated snapshot/v0.3.5/2026-10-08-rebuild，不移動舊 v0.3.5。

## 功能契約

1. 收集整段對話：不清目錄、不反向巡覽；從目前窗口向上，實際對話捲動區到頂、第一 stable shell 可見、首訊息 ID/正文及相對幾何六秒穩定、無可見頂端 loading，並完成兩次間隔 clamp probe，才自動停止。僅 scrollTop=0 或連續沒新增都不能視為已到頂。
2. 建立完整目錄：獨立按鈕；先等待快取讀取，背景只重設當前 /c/ URL 的記錄，更新該對話 generation 防其他舊分頁回寫。重新定位到當前 live root 的 scrollHeight；重排/換 root 時持續跟隨 numeric 底部，不能反覆把最後 shell align 拉回；底部穩定後向上直到上述頂端停止。不自動 F5，以免破壞草稿、操作控制與待保存狀態。
3. 空目錄自動建立：只在背景回覆成功且既有 active+quarantine 總筆數零時，等待 mounted stable user 窗口穩定後由底向上建立。有任何已保存筆數（含隔離資料）都不自動；讀取 denied、格式錯誤、過期路由回覆也不自動。停止/曾啟動的 session 在本頁內容生命週期內不因 mount/SPA 返回重啟；最多記住32個session。自動模式已有空目錄，不再做破壞性 reset，避免另一分頁刚保存的紀錄被清除。
4. 新提問持續追加：沿用 v034 MutationObserver/plain stable ID+正文快取；重複 mount 不重複新增，SPA 切換分開保存；F5/返回後恢復有序、可尋找且落點重新核對的目錄。回答 token 更新不新增提問。

## 保留與排除

Firefox 第一優先，Shift+O、Alt不停止、只列目前掛載快捷格、現代簡約UI與基準保存/跳轉保留。預設10min，設定整數1–10min；4800步、5000筆/500萬正文、profile12對話/600萬JSON字元限制沿用。只新增重設所需 generation；依使用者最新指示不支援棄用035/36資料相容讀取、不加編號、不使用對話API、不傳送聊天資料至雲端。

停止、真實閱讀操作、離頁、切session、正文/順序矛盾均取消；晚回覆不能寫入新session。底部確認是定位階段，不等於伺服器完整歷史證明；完成文案明列網站完整歷史尚未核對。比viewport高的頂端裝飾或未知loading結構須保守限時停止，不誤報完成。

## 驗收與 Git

必要測試涵蓋到頂停/不反向、numeric bottom+large padding、slow/hidden loading、取消後無捲動、空/有/拒絕cache、手動只reset選中session、跨分頁stale write、SPA/F5、unmounted跳轉、新提問追加。原生Firefox以隔離profile與localhost虛擬掛載實測；與真實ChatGPT LIVE分別標示。獨立agent依固定runtime SHA驗收。

每功能或30有效分鐘commit，同步私人GitHub原始SHA，不本機networkgit/GCM；Linux Actions核對bundle/hash/refs後非force atomic同步。工作分支 feat/v035-rebuild-from-v034；維護 release/v0.3 只fast-forward接上恢復基準及新實作。舊canonical035/36及036-r2 snapshot均保留並在當前文件明列棄用。
