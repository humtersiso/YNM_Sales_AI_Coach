-- 對練單一事實表（Two-Gate Event Logging）
-- Gate 1：開始對練 → status='STARTED'，分數與 transcript 為 NULL
-- Gate 2：評分完成 → status='COMPLETED'，寫入分數與 transcript
-- 漏斗：COUNT(DISTINCT session_id) WHERE status='STARTED'  vs  COMPLETED
--
-- 替換 YOUR_PROJECT、YOUR_DATASET 後執行。
-- 若已有舊表 roleplay_sessions，可並存；新程式寫入 roleplay_session_facts。

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.roleplay_session_facts` (
  session_id STRING NOT NULL,
  status STRING NOT NULL,
  agent_id STRING NOT NULL,
  agent_username STRING,
  dealership_id STRING,
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  target_model STRING,
  competitor STRING,
  customer_type STRING,
  age_range STRING,
  difficulty STRING,
  max_turns INT64,
  score_empathy INT64,
  score_structure INT64,
  score_fact_check INT64,
  score_strategy INT64,
  score_closing INT64,
  score_total INT64,
  grade STRING,
  transcript STRING,
  report_json STRING
);
