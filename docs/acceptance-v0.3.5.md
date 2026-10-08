# v0.3.5 驗收紀錄

固定runtime：6497a1b71bbbe48341022704b111ba611c16bad7。主端103/103純測試、型別／正式及fixture建置／嚴格lint PASS。原生Firefox157.0.1 localhost合成5/5 PASS，見[native](evidence/v0.3.5/native-rebuild.json)、[正式build-info](evidence/v0.3.5/production-build-info.json)、[fixture build-info](evidence/v0.3.5/fixture-build-info.json)。

GPT-6.1 Sol high固定git archive副本：純103/103、typecheck、重建12個檔案hash一致。獨立原生Firefox157.0.1 localhost5/5也通過；兩個多分頁P2反例已消除，未解決blocker 0。詳見[固定SHA獨立報告](evidence/v0.3.5/independent-runtime-review.json)。

審查找到準備期UI、取消reset ack、epoch callback、編號撤銷被broker復活、遠處loading干擾及SPA當下編號延續問題，均加入修正／回歸。本輪未操作個人Firefox profile。ChatGPT LIVE、正式簽章、ESR／Android：PENDING。
