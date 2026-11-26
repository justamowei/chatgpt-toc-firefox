# v0.3.1 r2 證據範圍

固定產品來源`31608f2c3766d282f66c65a6d15ab63ceaf894a1`，包含高度鏈保留修正。manifest version0.3.1、revision2026-10-05-r2。日期使用客戶端2026-10-05 Asia/Taipei；JSON保留執行器UTC時間。

- baseline-f9974ec-failure.json：從git archive固定初版f9974ec，在相同localhost nested-root模型重現：開始收集9秒仍只保留2題、inner root top29450不動；預期FAIL，沒有借用未完成版本或首次錯誤setup結果。
- primary-mechanism.json：Firefox157.0實際安裝fixture addon，7組多層容器、頁首自然掃描、實測span導航、root替換、evict、穩定返回與純數字診斷PASS。18題精確集合／順序，原答案offset -406一致。
- primary-speed.json：40題／60000px回答／500ms空窗口，完整預期集合／順序與自然idle；真實scroll事件確認forward巨型回答跨越。4項PASS；32.849秒收集，1.189秒離屏與1.206秒高度變動樣本定位。
- primary-cache.json：12題真實IAB快照在localhost重建與合成窗口8項PASS。CACHE07明确卸载原錨點後才核對未知順序拒絕，再以实际bridge證明後返回。不是在真實ChatGPT執行addon。
- source-build.json：正式fixture=false的六檔SHA核對、revision與來源。正式content `4e74710ce1c34f69313886eb6973612b3ed183c0f1e9262e3f820339e84f492b`；fixture `2675b598be58e8c4d954bdf622b1b08f8a41a03511bf8317931496afb2b42098`，不可混用。
- independent-mechanism.json／independent-speed.json／independent-cache.json：GPT-6.1 Sol high對31608f2另開隔離Firefox重新跑7／4／8項，全部PASS且fixture hash一致；40題33.273秒43步、離屏1.405秒、18000px高度改變後1.426秒。核心26／geometry9／typecheck另行獨立PASS，詳見[獨立報告](../../acceptance-v0.3.1-r2.md)。

所有瀏覽器測試均為隔離profile localhost，沒有用使用者登入資料。真實IAB幾何觀察另存前次匿名紀錄；新流程在真實Firefox ChatGPT整體addon LIVE仍待驗收。本機PASS不能抵銷使用者真實失敗。
