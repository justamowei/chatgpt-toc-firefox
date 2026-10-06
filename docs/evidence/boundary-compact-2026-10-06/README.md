# r4 驗收證據

程式固定 SHA：8f2daab1536ad9e30abc74479a8dfa3854766d57；revision：2026-10-06-r4。

主驗收：收集邊界 5 項、介面 4 項、錨點 5 項、捲動機制 7 項、跳轉回歸 4 項、快取 8 項，全數 PASS。typecheck、核心 28 項、幾何 9 項及 production build/lint 另於主流程執行。獨立固定 SHA 驗收：核心 28、幾何 9、邊界 5、介面 4、typecheck/build/lint 全部通過，見 [獨立報告](../../acceptance-v0.3.1-r4.md)。

所有 JSON 使用 localhost 合成資料與隔離 Firefox，非真實 ChatGPT Firefox LIVE。source-build.json 分開保存 production 與 fixture 指紋；candidate 六個檔案已逐一 SHA256 核對。獨立驗收 JSON 已加入，不含登入資料或真實聊天。
