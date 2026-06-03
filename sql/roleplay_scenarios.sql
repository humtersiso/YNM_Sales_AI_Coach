-- 對練情境（KB-T33 一檔一情境，Section A～F 可先 JSON 儲存）
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.roleplay_scenarios` (
  scenario_id STRING NOT NULL,
  title STRING NOT NULL,
  product_line STRING,
  payload_json STRING NOT NULL,
  source_file STRING,
  version STRING,
  active BOOL NOT NULL,
  ingested_at TIMESTAMP NOT NULL
);
