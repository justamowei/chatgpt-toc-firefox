# 開發與版本管理計畫

2026-10-07規範更新。main保留專案基線，本次更新僅為規範文件及版本索引；完整產品與歷史功能計畫見 [release/v0.3](https://github.com/justamowei/chatgpt-toc-firefox/blob/release/v0.3/docs/development-plan.md)。

## Git與版本規則

- 見 [完整版本規範](version-policy.md)、[版本目錄](versions.md)。
- 每功能或30有效分鐘commit；明列WIP與驗收範圍。
- 三段產品版本，主要能力增MINOR、相容修復增PATCH；每次不同產品程式的交付必須新版本，版本與manifest/package/lock一致。
- annotatedtag vX.Y.Z固定原始交付，建立後不移动。release/v0.3維護當前系列，feat/fix分支開發；main只收納範圍已核准的變更。
- 私人GitHub維持；原始commit/tag object与peeled commit核對一致才算SYNC_VERIFIED。只有鏡像/bundle核對則BACKUP_VERIFIED。
- 本機GCM禁用；由一次性雲端Linux job驗證bundle並恢復原始refs。禁止force-push、重寫歷史、移動tag與刪分支。
- 所有現有版本仍是未簽章實驗／測試版，Firefox ChatGPT LIVE待驗證；0.2.0已撤回，仅供追溯。tag与維護分支不表示公開Release或已正式簽章。
