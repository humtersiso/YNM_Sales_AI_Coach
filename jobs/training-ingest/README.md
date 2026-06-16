# 訓練素材匯入 Job

離線將 `data/training-materials/` 匯入 BigQuery `knowledge_units`。

## 本機

```bash
npm run training:ingest
```

## Cloud Run Job（範例）

```bash
gcloud run jobs deploy ynm-training-ingest \
  --source . \
  --region asia-east1 \
  --set-env-vars BIGQUERY_PROJECT_ID=...,BIGQUERY_DATASET=...

gcloud run jobs execute ynm-training-ingest --region asia-east1
```

建議以 Cloud Scheduler 每月或素材更新後觸發。
