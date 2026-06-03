CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.auth_audit_log` (
  audit_id STRING NOT NULL,
  action STRING NOT NULL,
  actor_username STRING NOT NULL,
  target_username STRING,
  ip_address STRING,
  detail STRING,
  created_at TIMESTAMP NOT NULL
);
