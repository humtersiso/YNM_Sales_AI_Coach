# Platform / Features（漸進重構）

RAG 模組仍位於 `src/lib/rag/`（穩定 import 路徑 `@/lib/rag/*`）。

新增 **rag-raw** 純檢索：`src/lib/rag/rag-raw-chat.ts`  
啟用：`SALES_CHAT_MODE=rag-raw`

後續可將 `lib/rag` 迁至 `platform/rag` 並留 shim，需避免 PowerShell 批次改檔造成編碼損壞。
