# v0.4.0：已觀察區段快速導航

2026-10-14，build revision 2026-10-14-v040，最終runtime c1e01866df7478dfdee060f42cadbc0de46ad458。

首次讀取長對話仍沿已掛載的邊緣載入。看過的區段若有相鄰提問的實測距離鏈，直接瞬間跳到目標附近，等待掛載，核對穩定ID、提問內容及可見性後再對齊並標亮。目標已在DOM時維持直接scrollIntoView。

每次導航至多一次快速嘗試，等待最多2.2秒並扣除批次預算。幾何失效、寬度差超過8px、次序不明或未命中時回退逐段；不以平均高度或數量比例猜位置。根容器、對話／正文版本變更會重設幾何。拒絕直接捲動的edge-only渲染器，在原掛載窗口與幾何完整未變時先復位到原游標，避免跟隨固定尾端。

目錄文字和順序保留既有v1儲存格式，可在F5／SPA回來後還原。幾何屬當次頁面，沒有保存到storage；F5、切換對話或排版大改後，需重新觀察區段才有快速位置。收集向上，不清空已保存資料，不在頂端重新對齊向下；正常頂端仍由六秒穩定、兩次夾住探測且沒有可見loader確認。

Firefox 158.0 localhost：暖導航459ms／2個事件；强制逐段6923ms／21個事件。產品26項原生驗收、95項純測試與7項Git治理核對通過；記錄器另3項通過。詳細範圍見[驗收](acceptance-v0.4.0.md)。真實ChatGPT LIVE仍待現場核對。

[安裝與測試](install-firefox.md) · [設計與限制](plan-v0.4.0.md)。可安裝manifest在outputs/Firefox-測試版-v0.4.0；same addon ID不變。未簽章、未上架的測試包。

版本採MINOR，因新增導航模式。工作feat/warm-navigation-v040，新維護線release/v0.4；原v0.3.5和九個歷史tags不動。各checkpoint保留原始Git SHA，透過私人GitHub連接器和雲端runner同步，未啟動本機GCM。固定tag／delivery commit的值見[版本目錄](version-catalog.json)；最后同步核對結果另記在交付資料夾。

ZIP SHA-256：b3dfc8955a99c1c5acfc6762bffce2ba4fd1f496ad2ce65187fee224befb0f0b
