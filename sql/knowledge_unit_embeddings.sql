-- BigQuery：知識單元 embedding（供語意檢索）
-- 執行：node scripts/bq-create-knowledge-embeddings.cjs

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.knowledge_unit_embeddings` (
  content_hash STRING NOT NULL,
  customer_question STRING NOT NULL,
  product_line STRING,
  material_category STRING,
  embedding ARRAY<FLOAT64> NOT NULL,
  embedded_at TIMESTAMP NOT NULL
);
