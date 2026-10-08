# 版本與 Git 管理規範

生效日期：2026-10-07。此文件取代 development-plan.md 第 15 節中與版本、分支、tag、同步狀態衝突的旧規定。使用者要求 GitHub 私人儲存庫、每功能或時間 checkpoint commit；禁止在本機再次使用會崩潰的 Git Credential Manager。

## 1. 版本號代表什麼

產品版本採三段整數 `MAJOR.MINOR.PATCH`；manifest.version、package.json.version、package-lock.json 根套件兩處 version 必須完全一致。Git 交付 tag 為 `vMAJOR.MINOR.PATCH`。Build revision 與 SHA-256 是建置識別，不能代替產品版本。

| 欄位 | 遞增條件 | 範例 |
| --- | --- | --- |
| MAJOR | 已進入穩定版後，出現不相容的使用方式、資料／設定契約變更，並提供遷移說明 | 1.x.y → 2.0.0 |
| MINOR | 新的主要能力、資料取得／導航模式，或 0.x 階段的不相容設計變動 | 0.1.x DOM 原型 → 0.2.0 API 實驗 → 0.3.0 已觀察 DOM 快取 |
| PATCH | 同一主要能力內的錯誤修正、效能或介面／設定改進，保留相容性或提供舊資料遷移 | 0.3.2 → 0.3.3 |

- `0.x.y` 都是實驗／測試版，不因編號增加就成為穩定版。`1.0.0` 必須完成文件指定的真實 Firefox ChatGPT 驗收、安裝／更新與簽章交付條件，不能只靠 localhost 合成測試。
- 新的可安裝交付只要產品行為、DOM 辨識、持久化或導航程式有變更，就必須遞增版本。禁止將不同產品程式反覆交付成同一個 `0.3.1`，也禁止移動既有 tag 或覆蓋原交付包。
- 單純規範、驗收報告、測試入口或 Git 恢復工具的變更不改產品版本，另建 commit；不得藉此把產品程式變更當作文件更新。
- 版本號不表示「對話完整」「LIVE 通過」或「已正式安裝」。版本目錄另外記錄實驗、撤回、驗收範圍及同步狀態。
- 各功能／測試 checkpoint 都有 commit，但只有實際選定的交付快照建立 `vX.Y.Z` tag；不需要每次 commit 都改版本。

## 2. Commit、tag、分支各自的責任

| 名稱 | 用途與允許更新 |
| --- | --- |
| commit SHA | 不變的來源快照；每個功能或 30 分鐘有效工作 checkpoint 保存一次 |
| `vX.Y.Z` annotated tag | 固定某次交付 commit，附版本、來源、驗收與限制；建立後不移動、不刪除重建 |
| `feat/<功能>`、`fix/<問題>` | 工作分支；每個可辨識功能／修復開始時建立，交付前核對固定 SHA |
| `release/vMAJOR.MINOR` | 該版本系列的維護線，例如 release/v0.3；可向前納入同系列新 PATCH，具體交付仍由 tag 固定 |
| `main` | 儲存庫基線與已核准變更；規範文件可先更新。只有符合明列驗收範圍的程式才納入，不能將撤回或未驗證能力標為正式版 |
| `feat/firefox-prototype` | 既有持續開發歷史，保留並補同步；後續新增工作逐步改用具體 feat/fix 分支 |
| `backup/*` | 來源鏡像與原始 Git bundle 的緊急備份；不代表正常 commit／tag 已同步，也不代表穩定版 |
| `chore/version-governance-sync` | 本次一次性雲端恢復作業與執行證據；不作產品交付分支 |

不需要每個 PATCH 建一條分支。歷史交付用 tag 瀏覽；只有實際需要維護的系列才建立 release 分支。本次只建立當前的 release/v0.3；已撤回 0.2.0 不建立可用維護線。

## 3. 每次交付程序

1. 明列變更與相容／遷移行為，決定 MINOR 或 PATCH；同步三份套件版本及 build revision。
2. 完成必要測試。記錄來源 SHA、正式／fixture 建置 hash、原生／合成／LIVE 各自的結果，未執行項目標 PENDING。
3. 保存產品與驗收文件 commit，選定 delivery commit；該 commit 的來源版本、建置及驗收報告須可核對。
4. 以來源作者身份建立 annotated tag `vX.Y.Z`，說明 runtime commit、delivery commit、狀態與證據文件。補建舊 tag 的日期為本次補建日期，不冒稱當年已建立。
5. 同步原始 commit history、工作／維護分支及 annotated tag；讀取 GitHub ref、tag object 與 peeled commit 核對。只呼叫 push 或只有備份成功，均不能記為完成。
6. 交付檔案由該版本重建或核對原始 build-info 的實際 hash；若有後續修復，遞增版本並重新驗證受影響範圍。

已交付版本發現缺陷或撤回時，保留 tag 與原始證據，在版本目錄加入狀態與原因。不得修改歷史快照來掩蓋當時的失敗或缺口。

## 4. Commit 與驗收節奏

每完成小功能、修復、測試組、文件變更立即 commit；累積 30 分鐘有效開發即使未完成也以 wip checkpoint 保存。純等待不計入。交付 agent 驗收／結束當輪／切換主要任務前保存變更。主代理管理 Git history；驗收代理以固定 SHA 工作。

訊息採 feat/fix/test/docs/chore/wip，寫明具體行為。檢查 status/diff、精確 stage、執行與變更相符的驗證；文件變更核對內容與鏈結，不重跑無關功能。失敗／未執行的測試不標 PASS。

## 5. 雲端同步與恢復

| 狀態 | 判定 |
| --- | --- |
| LOCAL_ONLY | 原始 commits 只在本機 |
| BACKUP_VERIFIED | 雲端鏡像與 Git bundle 已逐檔／SHA 核對，但正常 refs 或原始 history 尚未完成 |
| SYNC_VERIFIED | 遠端分支指向原始本機 commit，annotated tag object SHA 和 peeled commit 均一致 |
| BLOCKED | 已保存資料及已完成的驗證，明列拒絕／權限／認證原因；不能寫成已上雲完成 |

每個 checkpoint 都應立即同步對應分支；失敗時保留原始 commit、最後成功 SHA 及待同步清單，不重寫歷史、不 force push、不刪除遠端分支。需要維護線只以 fast-forward 更新；遠端有新提交時先核對，不覆蓋他人工作。

本機 GCM 崩潰的限制延續：不再啟動本機 Git Credential Manager 或重試本機網路 Git 指令。必要時以 GitHub 連接器保存鏡像／bundle，再由一次性的 GitHub Actions Linux runner 讀取 bundle、核對來源、使用該次 job 的 GITHUB_TOKEN 同步原始 refs。恢復程式必須拒絕在本機執行；token 只在雲端 job 環境，不能寫入來源、remote URL 或輸出。

雲端恢復只允許固定版本目錄指定的 tags、已明列的 feat/fix 工作分支、當前維護線及 main 的規範文件。功能 checkpoint 可先只同步該次工作分支；經驗收選定交付後再同步維護線與新 annotated tag。預先驗證所有 refs；產品 refs 以 atomic、非 force 更新。失敗不移動既有 tag，也不以來源鏡像 commit 假冒原始 SHA。

私人狀態保持；建立 Git tag 與維護分支不等於公開 GitHub Release、正式簽章或上架。公開發佈與簽章仍需另外明確授權。

## 6. 現有歷史的處理

對照 [版本目錄](versions.md) 與機器可讀 [version-catalog.json](version-catalog.json)。挑選已交付且有固定來源／驗收文件的快照，保留原 SHA，不重編版本號：0.1.0、0.1.1、0.2.0（已撤回）、0.3.0、0.3.1（首次交付）、0.3.2、0.3.3。

0.3.1 的 r2–r5 是歷史上重用同一版本號的修訂；獨立記錄各 SHA 與驗收限制，不把它們都覆蓋為同一 tag。此例外僅描述既有歷史，生效後不再沿用這種交付方式。

main 的本次更新限定版本／Git 規範和索引；目前可測試的完整產品來源從 release/v0.3 或最新交付 tag 取得。GitHub Actions 的官方行為與 token 權限參考：[事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)。

本次 v0.3.5 為同一已觀察DOM能力的重建／編號改進，PATCH；新讀取器兼容既有保存資料，保留addon ID。明列fix/rebuild-collection-numbering工作分支與chore/rebuild-collection-sync一次性雲端作業，交付後fast-forward維護線並新增不可移動v0.3.5。main只更新規範目錄。

本次v0.3.6為同一已觀察DOM能力的自動化／編號介面改進，PATCH；保存格式與addon ID延續。工作線feat/automatic-session-index與一次性作業chore/automatic-session-sync，交付新增不可移動annotated v0.3.6、fast-forward release/v0.3；main只更新5份規範／索引文件。自動收集不清空索引、不遞增重建generation，已有任何保存內容不重跑。

## 2026-10-08 使用者指定的同版本修正例外

使用者明確要求「修改好的也是 v0.3.6 版」。本次邊界修正維持manifest/package/lock 0.3.6，以revision 2026-10-08-v036-r2及固定snapshot/v0.3.6/2026-10-08-r2區分，原v0.3.6 tag不移動、原報告／安裝包保留，另存修正版資料夾。機器目錄另列sameVersionRevisions，不覆盖canonical versions。此為本次明確指示的例外，後續交付仍適用前述遞增規則，除非使用者再次另有指示。工作分支fix/collection-boundary-v036；維護線release/v0.3向前更新，本機網路Git／GCM禁用。


## 使用者指定回復基準後重用版本（2026-10-08）

本次使用者明確指定：棄用舊035/36並以034重新開發035。優先採該要求，產品manifest/package為0.3.5，revision2026-10-08-v035-rebuild，固定 annotated snapshot/v0.3.5/2026-10-08-rebuild；不可移動既有canonical v0.3.5。基準程式先以獨立commit精確恢復034，再新增四項功能；Git ancestry保留後续歷史，工作feat/v035-rebuild-from-v034與release/v0.3只非force fast-forward。catalog.redevelopment另列baseline與deprecatedTags，原canonical版本表及撤回證據不重寫。此例外來自使用者當次指令，不允許一般情況任意重用版本號。
