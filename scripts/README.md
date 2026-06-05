# Scripts 目錄

| 子目錄 | 用途 |
|--------|------|
| `ops/` | Cloud Run 部署、IAM/env 檢查、本地 amd64 容器、log tail（見 [docs/CLOUDRUN_LOCAL_PARITY.md](../docs/CLOUDRUN_LOCAL_PARITY.md)） |
| `rag/` | RAG 設定、ingest、檢索測試 |
| `sales/` | 銷售助手測試（待逐步移入 `test-sales-*`） |
| `smoke/` | 冒煙測試 |
| `debug-archive/` | 開發除錯腳本歸檔（不列入 npm scripts） |

根目錄保留主要驗收入口，例如 `test-rag-raw-passthrough.ts`。
