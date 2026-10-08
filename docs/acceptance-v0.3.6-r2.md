# v0.3.6-r2 建置驗收

版本0.3.6、revision 2026-10-08-v036-r2；固定runtime 5f1479c9133364a38fd7b2eb54ce129970610274。主端111純／15原生Firefox157.0.1localhost（7邊界＋8自動）PASS，typecheck/build/嚴格lint通過。

- [邊界7項](evidence/v0.3.6-r2/native-boundaries.json)、[自動8項](evidence/v0.3.6-r2/native-automatic.json)
- [正式產物](evidence/v0.3.6-r2/production-build-info.json)、[fixture產物](evidence/v0.3.6-r2/fixture-build-info.json)、[純測試](evidence/v0.3.6-r2/pure-tests.txt)
- [原始缺陷重現](evidence/v0.3.6-r2/original-v036-padding-failure.json)、[中間異常逾時](evidence/v0.3.6-r2/intermediate-timeout.json)、[單獨重跑PASS](evidence/v0.3.6-r2/isolated-pad02-pass.json)

GPT-6.1 Sol high：111純／typecheck／正式與fixture lint／12hash PASS；原生15/15 PASS，未解決blocker 0；[固定來源完整報告](evidence/v0.3.6-r2/independent-runtime-review.json)。原生邊界執行於49c8a2產物，最終5f1479只補TS非null標註，正式和fixture六檔hash完全不變；自動8項使用最終來源建置。獨立驗收以5f1479固定archive為準。

真實Firefox／ChatGPT LIVE尚未完成（computer-use與CUA初始化崩潰）；簽章／ESR／Android PENDING。未操作個人Firefoxprofile或清除其索引。
