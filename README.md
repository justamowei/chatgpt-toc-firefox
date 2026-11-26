# ChatGPT 對話導航器（Firefox 優先）

目前 main 採用 **v0.3.7 r9**，build revision 為 `2026-11-18-v037-r9`，來源 commit 為 `caad4735ef7b1f270f897bd019840110b0e872b5`。

在 ChatGPT 對話頁面建立本機提問目錄，提供搜尋、提問定位、向上收集歷史、複製目錄與頁面診斷。同一識別碼的現行正文會更新原列，已觀察到的頁首提問優先排序。

r9 可分別設定總收集時間與頂端停止等待時間，兩項各為 1–10 分鐘，預設分別為 10 分鐘與 1 分鐘。頂端加入較早提問或離開頂端時重新計算等待，任一時限到達即停止並保存已收錄資料。設定於下一次收集生效。

[功能與 r9 驗證紀錄](docs/prompt-group-navigation.md#r9總收集時間與停止等待時間) · [Firefox 安裝](docs/install-firefox.md) · [開發流程](docs/development-plan.md) · [版本規範](docs/version-policy.md)

## 建置與安裝

使用 Node.js 24.12.0 與 npm 11.6.2，在專案根目錄執行

```sh
npm ci
npm run build:firefox
npm run package:firefox
```

建置結果位於 `dist/firefox`，未簽章 ZIP 位於 `artifacts/packages`。Firefox 暫時測試可至 `about:debugging#/runtime/this-firefox`，選「載入暫時附加元件」並開啟 `dist/firefox/manifest.json`，再重新整理 ChatGPT 分頁。在「頁面診斷」核對版本 `0.3.7` 與 revision `2026-11-18-v037-r9`。

長期安裝需使用 Mozilla 簽章的 XPI，送簽與安裝步驟見安裝文件。r9 的 Firefox localhost 驗證已記錄於功能文件，實際 ChatGPT 與正式簽章驗證仍待完成。

## 日常開發

每個功能或修正完成，或每 30 分鐘有效開發提交 Git 並同步私人 GitHub。驗證範圍依現行開發流程執行。

## Reproduce the Firefox package for Mozilla review

The build environment is Windows x64 with Node.js 24.12.0 and npm 11.6.2. Run the three build commands above from the extracted source root. The lockfile pins build dependencies, and the build uses checked-in source without credentials.
