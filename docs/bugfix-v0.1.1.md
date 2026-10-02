# v0.1.1：Firefox 零索引修復（2026-10-03）

使用者在 chatgpt.com、Firefox 157.0（64 位元）、一般視窗回報：右側目錄已出現，但以往與新對話皆顯示 0 則。這確認啟動成功，問題集中在 DOM 辨識。舊版只搜尋 `data-message-author-role`；缺少這個屬性的頁面會漏掉所有提問。

公開開發者的[現行 ChatGPT adapter](https://raw.githubusercontent.com/miuuyy/codex-chatgpt-web/main/src/chatgpt-session.ts)包含 `data-turn-key`／`data-user-message-bubble`，另有[conversation-overview](https://github.com/boabab/conversation-overview)使用 `conversation-turn-*`／`data-turn` 殼。這支持頁面結構改版的推論；未直接讀取使用者 DOM，因此尚未確認其實際變體。不保存使用者完整對話 URL 或內容。

## 修復

- 保留 message role／ID；支援明確角色的 turn shell／ID，以及 turn key 下的 user bubble／conversation role。
- 共用容器 ID 包含角色；重疊標記去重，附件提問可顯示，空虛擬殼不當作已掛載提問。排除輸入框、側欄、按鈕文字與 assistant 內的 user-looking 標記。
- Observer 監看新版屬性；既有節點稍後補上角色或 key 也會重新辨識。高亮 CSS 使用導航器自己的標記。
- 「頁面診斷」只列版本、已收錄數、main 與各標記數量，不包含聊天文字、ID、URL 或帳號資料；不傳送也不儲存。
- 未知分支與無穩定 ID 仍採保守處理；這次修復不承諾完整長歷史或遠距定位。

## 更新方式

1. 在 `about:debugging#/runtime/this-firefox` 移除舊的暫時附加元件。
2. 點「載入暫時附加元件」，選新版 `Firefox-原型-v0.1.1/manifest.json`，確認顯示版本 0.1.1。
3. 重整原 ChatGPT 分頁，再點 Firefox 附加元件選單中的「ChatGPT 對話導航器」。
4. 檢查提問收錄，選一則確認定位與高亮。若仍為 0，點「頁面診斷」，回覆其顯示的數字；不用提供聊天文字或 HTML。

仍為未簽章暫時原型；Firefox 重啟會移除。ZIP 需先解壓再選 manifest，不能直接作正式簽章安裝包。

## 驗證與剩餘工作

- 原生 Firefox 157 六組新版結構回歸 PASS：舊 selector 0 → 新版 6、定位與 3px 高亮、返回偏移 0px、去重／附件、純屬性 hydration、turn shell、失效錨點／卸載不保留／無 ID 停用。
- Typecheck PASS；核心 12/12 PASS。初次核心測試因 esbuild 沙箱目錄權限失敗，正常工具權限重跑通過；未修改核心。
- 首輪新測試在 0→6 通過後遇到 helper 的 Promise 點擊錯誤；修正 await 後六組重跑 PASS，保留初輪失敗證據。
- GPT-6.1 Sol high 固定 SHA 獨立驗收、正式包核對與受影響既有原生案例，待交付紀錄補齊。
- 真實頁面修復結果仍待使用者確認。Windows Firefox 電腦操作因工具不支援網址安全策略而停止，未直接查看聊天；隔離合成測試不受此限制。
