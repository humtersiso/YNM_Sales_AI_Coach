CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.YOUR_DATASET.platform_users` (
  user_id STRING NOT NULL,
  username STRING NOT NULL,
  password_hash STRING NOT NULL,
  role STRING NOT NULL,
  display_name STRING NOT NULL,
  branch STRING NOT NULL,
  tenure_years INT64 NOT NULL,
  status STRING NOT NULL,
  must_change_password BOOL NOT NULL,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  created_by STRING
);
