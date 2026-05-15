# YNM 銷售顧問智慧訓練 — 總部資料整理平台（PoC）

Next.js 應用：總部 **資料匯入、流程追蹤、法務審核** 試用版；並實作 **Excel → BigQuery** 匯入管線，作為後續 **Gemini Data Analytics（以 BQ 為資料源）** 的基礎。

## 架構（精簡）

- **資料層**：BigQuery（話術、專家、紀錄、彙總）
- **分析層**：Gemini Data Analytics API（自然語言查詢／分析 BQ 表）
- **應用層**：本 repo Web + ADK Agent（銷售／對練，規劃中）

詳見 [`docs/GEMINI_BQ_DATA_PATH.md`](docs/GEMINI_BQ_DATA_PATH.md)、[`docs/PROJECT_SCOPE_SALES_TRAINING.md`](docs/PROJECT_SCOPE_SALES_TRAINING.md)。

## 快速開始

```bash
cd web
npm install
cp .env.example .env   # 填入 BQ / Gemini 等變數
npm run dev
```

預設登入帳密見 [`src/lib/auth/users.ts`](src/lib/auth/users.ts)（PoC 用）。

## 主要路徑

| 路徑 | 說明 |
|------|------|
| `/` | 資料總覽 |
| `/inbox` | 匯入與重複檢查 |
| `/clarification` | 問題流程追蹤 |
| `/legal` | 法務檢查 |
| `POST /api/ingest/script-drills` | 話術 Excel → BQ staging |

## 文件

- [專案範疇與甘特](docs/PROJECT_SCOPE_SALES_TRAINING.md)
- [BQ 匯入 PoC](docs/BQ_INGEST_POC.md)
- [Gemini × BQ 資料路徑](docs/GEMINI_BQ_DATA_PATH.md)
- [信件整合](docs/EMAIL_INTEGRATION.md)

## 指令

```bash
npm run build
npm run smoke
npm run docs:pdf    # 匯出範疇 PDF（需 Playwright）
```
