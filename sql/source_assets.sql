-- BigQuery：訓練素材原始檔登記（Bronze 元資料）
-- 執行前請將 YOUR_PROJECT、YOUR_DATASET 替換為實際值
-- 對應 web/src/lib/ingest/contracts/knowledge-unit-contract.ts

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.source_assets` (
  asset_id STRING NOT NULL,
  ingest_batch_id STRING NOT NULL,
  source_system STRING NOT NULL,
  product_line STRING NOT NULL,
  material_category STRING NOT NULL,
  relative_path STRING NOT NULL,
  file_name STRING NOT NULL,
  mime_type STRING,
  file_size INT64 NOT NULL,
  content_hash STRING NOT NULL,
  gcs_uri STRING,
  parse_status STRING NOT NULL,
  parse_error STRING,
  ingested_at TIMESTAMP NOT NULL
);
