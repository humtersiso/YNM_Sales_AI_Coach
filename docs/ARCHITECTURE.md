# YNM 雙助手 API 架構

## 責任邊界

| 負責方 | 範圍 |
|--------|------|
| **廠商** | Web/App UI、入口、後台、裕日權限 IAM、使用者管理 |
| **我方（本 repo API）** | `/v1/sales/*`、`/v1/roleplay/*`、評分引擎、BQ/RAG 讀寫 |
| **離線 Job** | 訓練素材匯入 BQ、RAG corpus 同步 |

## 部署單元

```
┌─────────────────────────────────────────┐
│  Cloud Run: ynm-assistants-api          │
│  apps/api-server (Hono)                 │
│  /v1/sales  /v1/roleplay  /health       │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 packages/   src/lib/   GCP
 sales-core  (共用)     BQ + Vertex RAG + Gemini
 roleplay-core
 platform-core
```

## Monorepo 結構

```
web/
├── apps/api-server/      # 對外 HTTP（Production）
├── packages/
│   ├── contracts/        # DTO
│   ├── platform-core/    # Bearer 認證
│   ├── sales-core/       # 銷售業務 facade
│   └── roleplay-core/    # 對練業務 facade
├── jobs/                 # Cloud Run Jobs（資料平面）
├── src/lib/              # 既有核心邏輯（逐步遷入 packages）
├── app/                  # Next.js UI（內部 demo，見 ARCHIVED_MODULES.md）
└── docs/openapi.yaml     # 廠商契約
```

## 認證

見 [API_VENDOR_GUIDE.md](./API_VENDOR_GUIDE.md)。

- `YNM_API_AUTH_MODE=api_key`：聯調
- `YNM_API_AUTH_MODE=jwt`：正式（裕日 IAM）

## 本機開發

```bash
cd web
npm install
cp deploy/cloudrun-api.env.example.yaml deploy/cloudrun-api.env.yaml
# 設定 .env（BQ、Gemini 與現有 Next 相同）

export YNM_API_KEY=dev-key
npm run api:dev
curl http://localhost:8080/health
```

## 部署

```bash
npm run deploy:api:test
```

舊版全棧 Next（`ynm-web-test`）僅供內部參考，見 `npm run deploy:test`。

## 資料流

- **銷售問答**：API → sales-core → BQ/RAG → Gemini → usage_events
- **對練**：API → roleplay-core → session engine → 完賽寫 roleplay_sessions
- **素材更新**：Scheduler → training-ingest Job → rag-sync Job（不經 API）
