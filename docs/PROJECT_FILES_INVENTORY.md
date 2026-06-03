# 專案檔案盤點（YNM_poc / web）

> 更新：rag-raw 模式整理後。標示哪些必要、哪些可刪/歸檔。

## 一、執行時必要（不可刪）

| 路徑 | 用途 |
|------|------|
| `app/` | Next.js 頁面與 API（銷售助手、後台、對練） |
| `src/` | 核心邏輯：RAG、Gemini、BQ、auth、UI 元件 |
| `public/` | 靜態資源 |
| `package.json` / `package-lock.json` | 依賴與 npm scripts |
| `next.config.ts` / `middleware.ts` / `tsconfig.json` | 建置與路由 |
| `Dockerfile` / `.dockerignore` / `.gcloudignore` | Cloud Run 部署 |
| `deploy/cloudrun-*.env.yaml` | 雲端環境變數（不含 secrets） |
| `.env`（本機，gitignore） | 本機 API 金鑰、RAG corpus 路徑 |

## 二、RAG / 維運必要（開發與部署）

| 路徑 | 用途 |
|------|------|
| `scripts/ops/` | `deploy:test`、`deploy:prod`、env 更新 |
| `scripts/rag/` | `rag:setup`、`rag:ingest`、probe、test-rag-search |
| `scripts/test-rag-raw-full-log.ts` | **完整 rag-raw 測試 log** |
| `scripts/test-rag-raw-passthrough.ts` | 五題快速回歸 |
| `sql/` | BQ 建表 DDL |
| `docs/PLATFORM_STARTUP.md` 等 | 啟動與切換說明 |

## 三、依功能選用（保留但非 rag-raw 必需）

| 路徑 | 說明 |
|------|------|
| `scripts/test-sales-chat-suite.ts` | hybrid 模式五大類驗收（含 Gemini） |
| `scripts/compare-grounded-vs-pipeline.ts` | Grounding vs 管線比對 |
| `scripts/benchmark-sales-chat-modes.ts` | 多模式效能（大檔） |
| `scripts/bq/`、`scripts/*.cjs`（bq 相關） | BigQuery 匯入/遷移（`SALES_KNOWLEDGE_BACKEND=bq` 時） |
| `scripts/ingest/`、`training-ingest-batch.ts` | 訓練素材匯入 BQ |
| `jobs/xtrail-parse/` | PDF 解析 Cloud Job |
| `src/lib/gemini/*`（hybrid 管線） | rerank、summarize、guard — rag-raw **不經過** |
| `legacy-admin/` | 舊版後台靜態頁，**現行 app/admin 已取代** |

## 四、可刪除或歸檔（不影響 rag-raw 執行）

| 路徑 | 建議 |
|------|------|
| `debug-shake-out.txt` / `debug-shake-out2.txt` | 根目錄除錯暫存 → **可刪** |
| `source.tgz` | 舊打包殘留 → **可刪** |
| `tsconfig.tsbuildinfo` | 建置快取 → **可刪**（會再生） |
| `.tmp/`（587 檔） | 暫存 → **可整包刪** |
| `.deploy-tmp/` | deploy 合併 env 暫存 → **可刪** |
| `scripts/debug-archive/`（約 30 檔） | 開發除錯腳本 → **已歸檔，可不進版控** |
| `data/benchmark-*.json`、`compare-rag-bq-latest.txt` | 舊 benchmark 輸出 → 可移 `data/test-logs/archive/` |
| `data/data-agent-raw-response.txt` | 單次除錯輸出 → 可刪 |
| `config/rag-env.generated.txt` | 生成物 → 可刪（`rag:setup` 會再生） |

## 五、data/ 目錄

| 子路徑 | 必要？ | 說明 |
|--------|--------|------|
| `data/test-logs/` | 建議保留 | **測試 log 輸出目錄**（新增） |
| `data/training-materials/` | ingest 時需要 | 話術 xlsx、競品 pdf 等原始素材 |
| `data/*.xlsx`（根下） | 視 PoC | Demo 話術表；執行時 BQ/RAG 已 ingest 則非必需 |
| `data/retrieval-gold.json` | 測試用 | retrieval 金標 |
| `.data/` | 本機 PoC | Excel workflow 佇列、legal review mock |

## 六、scripts 數量說明

- 總計約 **102** 個腳本檔
- **日常 rag-raw 只需 3～5 個**：`test-rag-raw-full-log`、`test-rag-raw-passthrough`、`rag/test-rag-search`、`ops/deploy-*`
- 其餘為 BQ 遷移、hybrid 驗收、除錯歸檔 — **不是垃圾，是不同模式/時期的工具**

## 七、建議精簡步驟（若要做第二輪清理）

1. 刪除第四節「可刪」項目
2. 將 `scripts/` 根目錄剩餘 `test-*`、`compare-*` 移入 `scripts/sales/`
3. `legacy-admin/` 移入 `_archive/legacy-admin/`
4. `.gitignore` 加入 `data/test-logs/*.log`（保留目錄）、`.tmp/`

## 八、還原備份

- Git tag：`backup/pre-refactor-20260602`（在 `web/` repo）
- Zip：`_backups/ynm-web-pre-refactor-20260602.zip`
