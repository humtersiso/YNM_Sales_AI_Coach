CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.usage_events` (
  event_id STRING NOT NULL,
  user_id STRING NOT NULL,
  username STRING NOT NULL,
  branch STRING NOT NULL,
  tenure_years INT64 NOT NULL,
  assistant_type STRING NOT NULL,
  question_kind STRING NOT NULL,
  question STRING NOT NULL,
  reply_summary STRING,
  in_question_bank BOOL,
  asked_at TIMESTAMP NOT NULL
);
