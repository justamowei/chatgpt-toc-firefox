# v0.4.0 驗收

日期：2026-10-14。最終產品runtime：c1e01866df7478dfdee060f42cadbc0de46ad458。測試環境：Windows、隔離 Firefox 158.0、localhost；未操作個人瀏覽器設定檔或真實ChatGPT登入資料。

| 檢查 | 結果 |
| --- | --- |
| TypeScript | PASS |
| 核心／幾何／互動／持久化／背景／收集／設定純測試 | 95/95 PASS |
| Git／版本治理 | 7/7 PASS（交付tag建立後再核對） |
| 新冷載入與暖導航 | 12/12 PASS |
| 舊目錄與F5／SPA／遷移／双向導航 | 8/8 PASS |
| 頂端停止／padding／載入／取消 | 6/6 PASS |
| 獨立本機記錄器 | 3/3 PASS |
| 產品與記錄器web-ext lint | 各0 errors／0 warnings／0 notices |
| 產品build檔案與ZIP逐檔hash | PASS |
| 真正 Firefox ChatGPT LIVE | PENDING |

暖導航在48筆提問、局部DOM掛載、包含55,000px回答的合成場景為 459ms、2 個scroll事件；同一已載入資料模型、改寬度使旧幾何失效而強制逐段路徑為 6923ms、21 個事件。兩者都精確標亮 warm:u-3，暖跳轉沒有新增history fetch。這是單次模式比較，不是舊版A/B或真實ChatGPT速度承諾；scroll事件不等於程式函式呼叫次數。

新增案例實際執行localhost history fetch，第一次7次、後續已載入區段0次，DOM仍只保留局部窗口。另驗證18,000px排版變化、超越目標後反向回退、容器替換、1秒總截止、取消、F5、暖導航中SPA／正文版本變更。

舊edge-only渲染器回歸曾暴露直接跳轉失敗後被固定尾端吸走；最終修復以未改變的root、client尺寸、canvas高度、整組ID和原user錨點content-space座標（2px內）證明原窗口仍有效，才復位再逐段走。最终v034双向導航及迁移皆通過。

頂端套件最後一輪曾出現20秒wait實際748398ms才逾時，原因未確證；同一source、全新profile重跑6/6PASS，visible loader案例15334ms停止。異常原結果保留在本機artifacts/v040-top-interrupted-results.json，不以該輪宣稱PASS。

GPT-6.1 Sol high驗收代理只讀核對固定來源、獨立記憶體重建hash、封包與原生測試證據；不將其審閱稱作自己操作真實ChatGPT。最终代理結論見acceptance-subagent-v0.4.0.md。

產品content SHA-256：a096925edbb4b5a5b8f0664bc0a17346c9a1596ac4b03681e667df4064ad5b31

fixture content SHA-256：10c951b832f24711091a68b26da256d221922a3376e95cb1b3a4592285e2d644

ZIP SHA-256：b3dfc8955a99c1c5acfc6762bffce2ba4fd1f496ad2ce65187fee224befb0f0b

機器可讀結果在[evidence/v0.4.0](evidence/v0.4.0)。未使用私有conversation/history API、未上傳真實聊天、未宣稱已核對整段伺服器歷史。
