# v0.3.1 r3 證據歸屬

2026-10-05 Asia/Taipei。固定產品來源535a4ffe0fbde463b97c687e4e8dab93f7814bf0、revision2026-10-05-r3。全部addon測試為隔離Firefox157.0 localhost，不是ChatGPT LIVE。

- primary-anchor.json：原生lazy outer shell模型5項，冷尾與冷中各精確30題；pinned tail不跳未知中間、雙向離屏、凍結有限停止與取消。
- primary-mechanism.json：原有嵌套root、18題精確集合、root替換／evict、返回答案offset-406、純數字診斷7項。導航method已改mounted-edge-anchor。
- primary-speed.json：40題／60000px回答／500ms空窗口4項；47.289秒收齊、13.167秒遠距、18000px高度改變後5.591秒、取消無晚到動作。沒有維持r2的1秒級速度宣稱。
- primary-cache.json：8項，既有真實IAB快照在localhost重建，加上SPA、修改隔離、順序未核對拒絕猜測、缺提問錨點拒絕返回。
- independent-anchor.json：GPT-6.1 Sol high固定git archive重建、獨立Firefox錨點5項PASS；不是父端重跑的結果，fixture content hash同974bcf…。
- source-build.json：正式fixture=false建置六檔SHA256、產品来源與候選旗標。正式content55e9d391…；fixture974bcf848…不可混用。

核心28／geometry9／typecheck主端与獨立均PASS。geometry9僅保留元件回歸，不表示r3使用舊位置估算導航。完整說明見[修正報告](../../anchor-walk-v0.3.1-r3.md)與[獨立報告](../../acceptance-v0.3.1-r3.md)。

真實IAB新操作觀察由父端完成，證明把仍掛載section移入viewport可帶動更早窗口，root height會改變。此證據不含addon執行，也非Firefox，截圖含中性測試正文故只留本機，不提交Git。使用者真實問題仍不能以本機PASS直接標完全解決。
