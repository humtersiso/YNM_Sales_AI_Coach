-- BigQuery：統一知識單元（Silver）
-- 對應 web/src/lib/ingest/contracts/knowledge-unit-contract.ts

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.knowledge_units` (
  unit_id STRING NOT NULL,
  ingest_batch_id STRING NOT NULL,
  asset_id STRING NOT NULL,
  product_line STRING NOT NULL,
  material_category STRING NOT NULL,
  unit_type STRING NOT NULL,
  title STRING,
  customer_question STRING,
  standard_script STRING,
  source_locator STRING,
  tags ARRAY<STRING>,
  language STRING NOT NULL,
  content_hash STRING NOT NULL,
  ingested_at TIMESTAMP NOT NULL
);
