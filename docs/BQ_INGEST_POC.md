# BigQuery 話術演練匯入 PoC（對齊 4.2 甘特 vdb）

本文件說明 **「裕日資料庫串接與資料匯入 BigQuery」** 中，以 Excel／CSV（如 `AI話術演練表.xlsx`、`Sales Script.csv`）寫入 **staging** 的最小可行路徑。匯入完成後，資料供 **[Gemini Data Analytics API](./GEMINI_BQ_DATA_PATH.md)** 以 BigQuery 為資料源進行語意查詢與分析。

## 在整體架構中的位置

```

Excel / CSV / 裕日 DB  →  [本 PoC：ingest API]  →  BigQuery  →  Gemini Data Analytics  →  銷售助手 / Agent

```

早期疑慮「Vertex Search 能否直接索引 BQ 表」已不採為主路徑；**先確保資料進 BQ**，再由 Gemini 對表做自然語言查找。

## 範圍

- **做什麼**：multipart 上傳 `.xlsx` → 伺服端解析（合併儲存格填滿、表頭掃描、欄位索引取值）→ `insertAll` 寫入 BigQuery 表。

- **不做什麼**：裕日資料庫即時串接、GCS + load job 大量匯入（建議後續擴充）、正式表 merge／dedupe 排程、Gemini API 本體（屬 vll 甘特項）。

## API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/ingest/script-drills/preview` | 僅預覽：`dataRowCount`、`warnings`、樣本列；不寫 BQ。Query：`maxRows`（預設 100）。 |
| `POST` | `/api/ingest/script-drills` | 全檔解析並寫入 staging。 |

表單欄位名：`file`（`multipart/form-data`）。

## 環境變數

見 [`web/.env.example`](../.env.example)。

**BigQuery 匯入**

- `BIGQUERY_PROJECT_ID` 或 `GOOGLE_CLOUD_PROJECT`

- `BIGQUERY_DATASET`（預設 `sales_training_poc`）

- `BIGQUERY_TABLE_SCRIPT_DRILLS`（預設 `script_drills_staging`）

- `GOOGLE_APPLICATION_CREDENTIALS` 或 ADC

**Gemini Data Analytics（後續 vll，預留）**

- `GEMINI_API_KEY` 或 Vertex AI 專案內模型端點（依裕日 GCP 定案）

- 服務帳號需具 BQ `bigquery.tables.getData` 與 Gemini API 權限

## DDL

[`web/sql/script_drills_staging.sql`](../sql/script_drills_staging.sql)：替換 `YOUR_PROJECT`、`YOUR_DATASET` 後執行。

手動上傳 CSV（如 `Sales Script.csv`、`Expert List.csv`）時，請在 BigQuery 主控台使用明確 schema、略過表頭列，避免 autodetect 吃掉欄位。

## 欄位契約與「欄位被吃掉」對策

- 凍結對照：[`script-drills-contract.ts`](../src/lib/ingest/script-drills-contract.ts)

- 解析：[`parse-script-drills-xlsx.ts`](../src/lib/ingest/parse-script-drills-xlsx.ts)（AOA + 欄位索引 + 合併儲存格填滿）

## 錯誤列與重跑

- **PartialFailureError**：修正 schema 或資料後重送；檢查 `bigquery.insertErrors`。

- **重跑**：每批有 `ingest_batch_id`；正式環境需定義 dedupe 或覆寫策略。

- **法遵**：話術與個資欄位進 BQ 前須與法務確認。

## 下一步

1. 在裕日 GCP 建立 dataset／正式表（或由 staging 排程 merge）。

2. 依 [GEMINI_BQ_DATA_PATH.md](./GEMINI_BQ_DATA_PATH.md) 串接 Gemini Data Analytics，以代表問句驗收檢索品質。

