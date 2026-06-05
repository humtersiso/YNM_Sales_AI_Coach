-- 既有 roleplay_session_facts 表新增 report_json（改善建議與五維評語）
-- 替換 YOUR_PROJECT、YOUR_DATASET 後執行一次即可。

ALTER TABLE `YOUR_PROJECT.YOUR_DATASET.roleplay_session_facts`
ADD COLUMN IF NOT EXISTS report_json STRING;
