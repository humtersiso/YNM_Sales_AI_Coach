-- 每位業代一列：首頁 AI 小結（Gemini 產生後寫入，首頁只讀）
-- 替換 YOUR_PROJECT、YOUR_DATASET 後執行。

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.roleplay_agent_dashboard` (
  agent_id STRING NOT NULL,
  briefing_json STRING NOT NULL,
  stats_fingerprint STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  last_trigger STRING,
  last_session_id STRING
);
