# 範例檔案放置說明

若 `AI話術演練表.xlsx` 未納入版本庫，請於本機放在專案根目錄（例如 `C:\Yulon\YNM_poc\AI話術演練表.xlsx`），再透過 API 上傳測試。

欄位與工作表優先順序以程式契約為準：

- [`src/lib/ingest/script-drills-contract.ts`](../../src/lib/ingest/script-drills-contract.ts)

匯入 BQ 後，銷售助手將透過 **Gemini Data Analytics API** 以 BQ 為資料源查詢，見 [GEMINI_BQ_DATA_PATH.md](../GEMINI_BQ_DATA_PATH.md)。
