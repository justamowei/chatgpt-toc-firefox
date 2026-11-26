# 3bedace 超限縮頁與安全診斷：獨立合成驗收

固定來源 **3bedace3fe4d646b008b741489cfd8a702eb8d9c**。執行者 **/root/firefox_acceptance，GPT-6.1 Sol high**，2026-10-03 台北時間。

**本輪 synthetic PASS；使用者實際完整歷史功能仍 LIVE FAIL。** 沒有把候選修正當作已修好真實問題。使用者提示只能證明原版本遭遇 HistoryError limit，仍未知究竟單頁、累計量、正文、深度或其他上限。沒有使用者 Network metadata 或修正後真實重試成功，仍阻止替換交付並宣稱完成。

## 獨立性與命令

git archive 固定 SHA 至 work/acceptance/3bedace；原 repo/source/Git history 未修改。node_modules junction 重用原 repo 既有固定依賴，沒有重新 npm ci。TOC_TEST_EXECUTOR=/root/firefox_acceptance。Node v24.12.0；Windows。只啟動合成 Node HTTP localhost server，沒有 Firefox、使用者 profile、真實網站、cookie 或帳號 token 操作，沒有繞過既有 browser URL policy。

| 命令 | 實際結果 | exit |
|---|---|---|
| npm run typecheck | PASS | 0 |
| npm run test:history | 34/34（history26、full-index7、dom-history1） | 0 |
| node independent-adaptive-probes.mjs | 自主5/5 PASS | 0 |

本輪沒有獨立重跑原生 Firefox suite、正式 package 或交付 hash；parent 報告的 FULL18/18、renderer8/8 是另一執行者證據，不能算本 agent 的獨立實跑。

## 自主反例：不同於 stock queue Response 測試

建立真 Node HTTP gzip server；inject fetch 只將已驗證 https://chatgpt.com 的固定 route transport rebase 至 127.0.0.1。Node fetch 真正解壓 gzip，Response.body 的 decoded bytes 供原 history reader 消費。synthetic UUID/token/訊息只在測試記憶體，產物沒有使用者資料。限額刻意設 pageBytes=2000，以小樣本覆蓋一樣的超限分支；不是聲稱真實對話的實測大小。

| 案例 | 期待 | 實際 | 結果 |
|---|---|---|---|
| IND-ADAPT-01 | 頭頁縮小，older 再縮小，保持 cursor/順序及原頭頁大小重讀 | gzip head wire301 bytes、decoded8955 bytes；head100→50，older50→25（同boundary-5），下一older25（boundary-3），recheck50；6 expected=6 actual，user及全部message IDs精確有序，progress=[1,2,3] | PASS |
| IND-ADAPT-02 | 相同 oversize gzip 樣本在舊固定95c拒絕，證明新策略差異 | 95c2694e03185f66a1a0dc19a62bc8280b61420e 回limit；只request num_turns100 | PASS（舊拒絕符合此comparison期待） |
| IND-ADAPT-03 | 超限失敗的decoded bytes不可洗掉；總量優先、不再縮頁 | consumed18612 > total18611，kind total-bytes、stage older、pageTurns50、requests4、completedPages1；沒有下一個25request，progress=[1]；safe failure JSON不含synthetic token/UUID/text | PASS |
| IND-ADAPT-04 | 重讀頭頁在原50超限則失敗，不偷偷縮頭頁變更proof | stage recheck、kind page-bytes、observed8955/max2000、pageTurns50、completedPages3、requests7；trace=[100,50,50,25,25,50]，無head25、無snapshot成功回傳 | PASS |
| IND-ADAPT-05 | 已縮至50的streaming fetch故意忽視signal，abort仍快速拒絕且晚到不得回snapshot | abort約0.736ms；code aborted、progress=[]、trace=[100,50]；late body結束後無新request，無snapshot回傳；UI apply未測 | PASS |

自主probe腳本、JSON與stdout同目錄：independent-adaptive-probes.mjs、independent-adaptive-results.json、independent-adaptive.log。舊95c module使用既有独立固定快照生成的 history.mjs；未操作舊主來源。

## 唯讀程式審查

history縮頁 catch 精確限於 HistoryError.limit.kind=page-bytes，session/legacy未經paginated loop，total/text/depth/nodes/messages/pages不縮。失敗response reader.cancel與own.abort有清理；consumed及total timer在整次load共用，不因retry重置。stream chunk同時超page與total時優先total。header precheck已cancel且未假計整段未讀 bytes，宣告大小與decoded讀取值分開。headTurns獨立於older batchTurns，recheck shrink=false；cursor/revision/overlap/parent/cycle/has_next原校驗保留。縮到1仍不fit會拒絕；429與總deadline仍有限。

content的sticky historyResult獨立於navigation status，records僅allowlisted outcome/pages/error enum與limit的enum/數值，不序列化 raw Error.message/response、token、URL/UUID、聊天或ID。頁面診斷区分mountedCount/fullCount/binding/matchedCount；failure後純mounted刷新不會覆寫historyResult。next explicit load才重置；cancel與已installed snapshot撤銷有另分類。此UI路徑是唯讀審查，未在本輪獨立native執行；parent的FULL18提供另外合成驗證。

未發現本輪縮頁／limit metadata 的新增阻擋缺陷。診斷仍不包括所有schema/HTTP細分原因與compiled source SHA，這不是已量測limit縮頁的阻擋點；不能憑相同manifest version判定任何未來版本已裝正確。diagnosticSchema=2可區分95c舊診斷，但不能替代固定build provenance。

## 限制與交付 gate

縮頁只可能改善單頁回應太大。16MiB累計decoded bytes包含oversize retries/session/head reread，maxPages100、單則文字/深度等限額未提高；長對話仍可能合法拒絕。server若忽視num_turns、single message即超單頁或recheck增大，也仍fail closed。

**LIVE FAIL保持：** 尚無真實 ChatGPT.com Firefox metadata指出limit.kind，也沒有修正後真實完整目錄筆數、scope及跨掛載持續性結果。localhost gzip及單元PASS不能證明真實API有效、使用者問題已解決、expected全對話集合已核對或畫面branch已證明。ESR／containers／signing亦未執行。舊交付content/ZIP未由本agent替換；本結果只能支持候選修正的合成正確性與下一次無內容診斷，不能批准正式修好交付。
