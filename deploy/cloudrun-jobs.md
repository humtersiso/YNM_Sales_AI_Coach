# Cloud Run Jobs — 資料平面

線上 **ynm-assistants-api** 僅處理即時讀寫（usage_events、roleplay_sessions）。
大量素材匯入改由 Job 執行。

| Job | 目錄 | 對應本機指令 |
|-----|------|----------------|
| 訓練素材 → BQ | `jobs/training-ingest/` | `npm run training:ingest` |
| BQ/素材 → Vertex RAG | `jobs/rag-sync/` | `npm run rag:ingest` |

## 建議排程

1. 總部上傳新話術 xlsx/PDF
2. 觸發 `ynm-training-ingest` Job
3. 成功後觸發 `ynm-rag-sync` Job
4. 廠商前端無需變更；API 自動讀到新資料

## 環境變數

與 API 服務共用 `BIGQUERY_*`、`GEMINI_*`、`RAG_*` 等，見 `deploy/cloudrun-api.env.example.yaml`。

## 部署

```bash
cp deploy/cloudrun-api.env.example.yaml deploy/cloudrun-api.env.yaml
# 編輯 env 後
npm run deploy:jobs:test
```

建議以 Cloud Scheduler 串接：training-ingest 成功 → 觸發 rag-sync。
