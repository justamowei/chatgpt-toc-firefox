# Firefox 日常安裝

「about:debugging → 這個 Firefox → 載入暫時附加元件」保留到 Firefox 重啟。一般版 Firefox 要長期安裝，使用 Mozilla 簽章的 XPI。私人使用可在 AMO Developer Hub 選擇「On your own」送簽，不需公開上架。

1. 用 `npm run build:firefox` 和 `npm run package:firefox` 建置未簽章 ZIP，在 Mozilla 開發者後台以自行散布方式上傳，並附上同版本原始碼與建置說明。
2. 簽章完成後，從後台下載簽章版 `.xpi`。
3. 在 Firefox 開啟 `about:addons`，從齒輪選「從檔案安裝附加元件」，選取簽章版 XPI。安裝後重啟 Firefox，確認目錄可用。

升版沿用既有附加元件 ID。暫時版本移除後的本機資料由 Firefox 管理，若要保留可讀目錄，請先用面板的「複製目錄」備份文字。

[Mozilla 送簽流程](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/#self-distribution) · [自行散布與安裝](https://extensionworkshop.com/documentation/publish/self-distribution/)

## 歷史測試版安裝說明

# Firefox 目前安裝：v0.3.6 r4

在 about:debugging#/runtime/this-firefox 暫時載入 outputs/Firefox-測試版-v0.3.6/manifest.json。重整 ChatGPT，「頁面診斷」版本為 0.3.6，revision 為 2026-11-17-v036-r4。見 [v0.3.6 交付](release-v0.3.6.md)。下方保留原版紀錄。

# Firefox v0.3.5 更新與使用

正式manifest：outputs/Firefox-測試版-v0.3.5/manifest.json；version0.3.5／revision2026-10-10-v035。

保留插件addon ID，在Firefox about:debugging →這個Firefox，使用目前載入資料夾覆蓋本版檔案後重新載入；若舊載入資料夾已刪除，移除失效暫時插件再載入本版manifest。重新整理ChatGPT分頁。實際已保存資料是否仍在取決於Firefox是否曾卸載／清除；本次程式不清除儲存。

按「收集整段對話」由目前位置向上收集；到穩定頂端直接结束，保留已收錄資料，不轉向下補收。從中間開始時，尚未看過的更晚訊息不會因這次向上巡覽憑空加入；可先自行移到頁尾再開始。Shift+O開啟、Esc收合、停止按鈕與真正閱讀操作取消，Alt不停止。預設10分鐘，設定可選1–10分鐘。

本版有本機原生Firefox合成驗收，真實ChatGPT LIVE仍PENDING，未簽章。

2026-10-15：v0.4.0／v0.4.1 已撤回，請使用上述 v0.3.5 安裝入口。程式與資料儲存格式恢復原版，不執行清除目錄。
