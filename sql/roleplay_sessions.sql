-- 對練場次紀錄（Phase 2 持久化；目前 PoC 使用記憶體 store）
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.roleplay_sessions` (
  session_id STRING NOT NULL,
  scenario_id STRING NOT NULL,
  user_id STRING NOT NULL,
  username STRING NOT NULL,
  branch STRING,
  persona_id STRING,
  status STRING NOT NULL,
  agent_turn_count INT64,
  score INT64,
  grade STRING,
  transcript_json STRING,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP
);
