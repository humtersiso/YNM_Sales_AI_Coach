-- BigQuery：話術演練 staging（PoC）
-- 執行前請將 YOUR_PROJECT、YOUR_DATASET 替換為實際專案與 dataset（例：sales_training_poc）
-- 對應程式常數見 src/lib/ingest/script-drills-contract.ts

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.script_drills_staging` (
  ingest_batch_id STRING NOT NULL,
  ingested_at TIMESTAMP NOT NULL,
  source_sheet STRING NOT NULL,
  source_row INT64 NOT NULL,
  customer_question STRING,
  standard_script STRING,
  reviewer_es STRING,
  reviewer_ul STRING,
  reviewer_yj STRING,
  reviewer_em STRING,
  reviewer_yf STRING,
  reviewer_hl STRING,
  reviewer_kt STRING,
  reviewer_ya STRING,
  msd_confirmation STRING
);
