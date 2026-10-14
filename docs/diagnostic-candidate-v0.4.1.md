# v0.4.1 快速導航診斷候選

2026-10-15。針對「選取遠處提問，全程仍逐段移動」修正兩個已重現的程式缺口。尚未取得使用者真實頁面的完整 navigation.fast 診斷，不能將本候選宣稱為該頁面的已驗證修復。

## 修正與限制

- 快速導航只要求目標所在群組的顺序已確認；另一個不相關群組不再阻止它。估算與錨點仍限同一群組，不能跨未知群組順序猜位置。
- 稀疏掛載不再覆寫已確認的相鄰距離；完整 a→b→c 不會被暫時僅掛載 a、c 改成 a→c。
- 頁面診斷新增 fast.skipReason、eligibility、fast.lastAttempt；逐段移動時显示具体原因，快速嘗試紀錄不被後續步進覆蓋。只含固定狀態、數量及幾何，不含聊天正文、訊息 ID、URL 或登入資訊。
- 本頁未測量目標、寬度變更、距離鏈有缺口、對話／容器變更時仍採逐段導航。文字目錄可跨 F5；幾何仍限當頁。資料曾 fetch 不代表本插件已有足夠距離證據。
- 快跳未命中只回退一次；窗口完全相同時才復位，仍核對全部掛載 user 的位置。成功標亮仍需要精確 ID、正文与可見性驗證。

## 來源與包

產品版本 0.4.1，revision 2026-10-15-v041。runtime checkpoint：16bb24d905300e4eea187f00e76b415cfb525f2c。工作分支 fix/fast-eligibility-v041；沒有 0.4.1 交付 tag，release/v0.4 和 v0.4.0 原包／tag 保持不變。

- 正式 content.js SHA-256：2b0e74e7dc55a6ff1f1f340e558f7dad0745388c744c596b739d5de5e077c467。
- Fixture content.js SHA-256：a85a5f1a9a3199e596e6478a479f018da1fd6c97c7b5ffbaac1ec9a1eec49630。
- 未簽章候選 ZIP SHA-256：15917d934f68b2f09eee5d0c1aa27f2cf3d6d8a1e866d1993d456f13f3d9fd97。
- 安裝資料夾：outputs/Firefox-診斷候選-v0.4.1；manifest.version 可直接核對。ZIP 內六個 runtime 檔已逐一比對 build-info hash。

## 如何取得有用的現場診斷

在 Firefox 的 about:debugging#/runtime/this-firefox，用「載入暫時附加元件」選擇本候選的 manifest.json；既有測試插件可先移除，避免仍執行舊版。這是手動安裝指引，未宣稱已替使用者安裝。

在同一對話打開目錄，先點「頁面診斷」確認 version 0.4.1、revision 2026-10-15-v041。若目前只恢复保存文字而當頁尚未觀察過整段，原本就是冷啟動；可先收集整段，然後在不 F5、不切 session 的同頁嘗試遠處提問。

若仍逐段，點「頁面診斷」並提供 navigation.fast 區塊與 navigation.geometry。attempts=0 時看 skipReason；attempts=1/result=miss 時看 fast.lastAttempt 的 requested/after、heightBefore/heightAfter/replaced，區分位置估算與掛載未觸發。無需提供對話正文。不要只靠再次增加等待時間認定修復。

測試證據與結果見 evidence/v0.4.1；真正 Firefox ChatGPT LIVE：PENDING。

## 已完成驗證

Firefox 158.0，獨立 profile、localhost：28/28 PASS，包含本次 8 個門檻／稀疏窗口／拒絕診斷／未命中紀錄案例、既有 12 個冷暖導航／取消／截止時間／排版／F5／SPA 案例及 8 個已保存目錄回歸。v0.4.0 前後比較是在相同測試 harness 內載入該 tag 的 DomAdapter 原碼；不是在使用者登入的 ChatGPT 執行 A/B。

純程式 95/95、Git 規範 7/7、TypeScript PASS、web-ext lint 0 errors/notices/warnings。首次規範測試的「不存在 ref」以錯誤退出碼 128 回報，調整為 git show-ref --verify --quiet 後依退出碼 1 確認不存在，7/7 通過；這是測試入口修正，不是忽略產品缺陷。最終 build 與 ZIP／安裝資料夾逐檔 hash 相符。

尚待現場區分：快速路徑是否從未啟動、位置估算未命中、或 ChatGPT 沒有在直接捲動後重新掛載。此候選只修復本輪已重現的兩項程式缺口，並為下次真實診斷保留理由；不將合成測試寫為使用者頁面通過。
