# RAG Corpus 同步 Job

離線將訓練素材匯入 Vertex RAG corpus（銷售 rag-raw / grounded、對練 RAG facts 共用基礎設施）。

## 本機

```bash
npm run rag:setup
npm run rag:ingest
```

## Cloud Run Job

與 `training-ingest` 相同模式部署；建議在 BQ ingest 完成後執行。
