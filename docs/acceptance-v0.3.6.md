# v0.3.6 驗收紀錄

固定runtime：c32e8e92ec98d0dc3969ab3e2e8170bdf726258e。corrected測試commit：ff84d94ba7a8c14630c6bb46c649b2666a0dcba2（僅兩測試檔；runtime不變）。主端111/111純測試、typecheck／正式與fixture建置／嚴格lint PASS；原生Firefox157.0.1 localhost合成8/8 PASS。

- [原生8案例及實際hash](evidence/v0.3.6/native-automatic.json)
- [正式build-info](evidence/v0.3.6/production-build-info.json)、[fixture build-info](evidence/v0.3.6/fixture-build-info.json)
- [111純測試輸出](evidence/v0.3.6/pure-tests.txt)
- [固定runtime獨立報告](evidence/v0.3.6/independent-runtime-review.json)：GPT-6.1 Sol high，111 pure／8 native／12hash，未解決blocker 0
- [原始fixture正文不一致失敗](evidence/v0.3.6/initial-fixture-body-mismatch.json)：保留原始失敗；修正測試資料後通過，不修改產品隔離規則

兩端皆使用隔離Firefox profile、真實addon儲存與捲動；沒有操作使用者個人Firefox。ChatGPT LIVE、簽章、ESR／Android仍PENDING。等待第一筆掛載時停止按鈕未顯示，為已記錄UX限制。詳見[本版行為](release-v0.3.6.md)。
