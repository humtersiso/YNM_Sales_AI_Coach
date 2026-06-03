# YNM 銷售顧問智慧訓練 — 總部資料整理平台（PoC）

Next.js 應用：總部 **資料匯入、流程追蹤、法務審核** 試用版；並實作 **Excel → BigQuery** 匯入管線，作為後續 **Gemini Data Analytics（以 BQ 為資料源）** 的基礎。

## 目錄

| 路徑 | 說明 |
|------|------|
| `app/` | 頁面與 API 路由 |
| `src/` | 認證、BQ、Gemini、Excel 流程 |
| `data/` | 本機話術 Excel（見 [data/README.md](data/README.md)） |
| `docs/` | 啟動說明、範疇、功能總表 HTML |
| `scripts/` | `smoke`、`build:demo-xlsx`、`test-bq-main` 等 |
| `sql/` | BigQuery staging DDL |

## 架構（精簡）

- **資料層**：BigQuery（話術、專家、紀錄、彙總）
- **分析層**：Gemini Data Analytics API（自然語言查詢／分析 BQ 表）
- **應用層**：本 Web + ADK Agent（銷售／對練，規劃中）

詳見 [`docs/GEMINI_BQ_DATA_PATH.md`](docs/GEMINI_BQ_DATA_PATH.md)、[`docs/PROJECT_SCOPE_SALES_TRAINING.md`](docs/PROJECT_SCOPE_SALES_TRAINING.md)。

## 快速開始

```bash
cd web
npm install
cp .env.example .env   # 填入 BQ / Gemini 等變數
npm run dev
```

**完整步驟（含 GCP 權限、BQ 建表、驗證）** 請見 **[docs/PLATFORM_STARTUP.md](docs/PLATFORM_STARTUP.md)**。

管理員帳號請用 `npm run seed:admin` 建立（見 `docs/PLATFORM_STARTUP.md`）。

## 主要路徑

| 路徑 | 說明 |
|------|------|
| `/` | 資料總覽 |
| `/inbox` | 匯入與重複檢查 |
| `/clarification` | 問題流程追蹤 |
| `/legal` | 法務檢查 |
| `POST /api/ingest/script-drills` | 話術 Excel → BQ staging |

## 文件

- [**平台啟動說明（GCP／本機）**](docs/PLATFORM_STARTUP.md)
- [專案範疇與甘特](docs/PROJECT_SCOPE_SALES_TRAINING.md)
- [BQ 匯入 PoC](docs/BQ_INGEST_POC.md)
- [Gemini × BQ 資料路徑](docs/GEMINI_BQ_DATA_PATH.md)
- [信件整合](docs/EMAIL_INTEGRATION.md)

## 指令

```bash
npm run build
npm run smoke          # Excel 流程（需 web/data/ 內 xlsx）
npm run smoke:portal   # HTTP 煙霧（需 dev server）
node scripts/test-bq-main.mjs   # BigQuery 連線
npm run env:use:test   # 切到測試資料源
npm run env:use:prod   # 切到正式資料源
npm run bq:create-prod
npm run bq:migrate:test-to-prod
npm run bq:verify-env
npm run docs:pdf       # 匯出範疇 PDF（需 Playwright）
node scripts/embed-arch-image.mjs   # 架構圖內嵌至功能總表 HTML
```
