# 銷售助手 Agent 架構（Function Calling + BQ + Streaming）

## 決策摘要

| 模式 | 上線建議 | 原因 |
|------|----------|------|
| **agent**（預設） | ✅ 建議 | 規則/FC 分流 + 固定 BQ SQL + Gemini 摘要；抗幻覺、次秒級 BQ |
| hybrid | 備援 | 快但盲測品質不穩 |
| bq-fast | 僅除錯 | 易偏題、無摘要 |
| data-agent | 進階/離線 | 命中高但 ~12s，不適合手機即時 |

## 流程（`SALES_CHAT_MODE=agent`）

```
使用者提問
  → 規則路由（<1ms）或 Gemini Function Calling plan_knowledge_search（~0.3–0.8s）
  → searchKnowledgeByPlan（固定 SQL 模板，可搭配 BI Engine）
  → summarizeCitationsWithGemini（僅根據摘錄，禁止編造）
  → 回傳 intro + bullets + citations
```

串流（`POST /api/sales/chat/stream`）：

1. `status`：正在理解 / 查詢 BQ
2. `intro_delta`：結論句打字（`streamIntroFromCitations`）
3. `done`：完整 bullets + citations

## 環境變數

```env
SALES_CHAT_MODE=agent
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```

## 相關檔案

- `src/lib/gemini/sales-intent-router.ts` — 規則 + FC 參數
- `src/lib/gemini/knowledge-search-planned.ts` — 計畫內 BQ 查詢
- `src/lib/gemini/sales-agent-orchestrator.ts` — 編排
- `src/lib/gemini/gemini-client.ts` — `geminiPlanKnowledgeSearch`, `geminiStreamText`
- `app/api/sales/chat/stream/route.ts` — NDJSON 串流 API

## BI Engine（計費專案 `653828324568` ≠ BQ 資料專案）

- **BI Engine 管理／計費**：專案編號 `653828324568`（Console 顯示用）
- **實際加速的表**：`gen-lang-client-0927009312.YNM_Sales_AI_Coach_test.knowledge_units`、`v_sales_knowledge`（地區 **asia-east1**）

`.env` 應設 `BIGQUERY_PROJECT_ID=gen-lang-client-0927009312`；`BI_ENGINE_PROJECT=653828324568` 僅供對照。

| 優先 | 物件 | 類型 |
|------|------|------|
| 必選 | `knowledge_units` | Table |
| 建議 | `v_sales_knowledge` | View |

## Gemini 濃縮（與 BI 專案無關）

使用 **AI Studio `GEMINI_API_KEY`**（`generativelanguage.googleapis.com`），**不要**把 `653828324568` 當成 Vertex 模型專案。Vertex 備援用 `GEMINI_VERTEX_PROJECT=gen-lang-client-0927009312`。

## Data Agent 回覆模式

詳見 [DATA_AGENT_SALES_FORMAT.md](./DATA_AGENT_SALES_FORMAT.md)。

```env
SALES_DATA_AGENT_RAW=false       # true = 顯示 Data Agent 原文，不整理
SALES_DATA_AGENT_FORMAT=true     # true = Gemini 整理成「小標題：內文」列點（預設）
```

預設流程：**Data Agent 查 BQ → Gemini 整理 → 前端列點**；與 `653828324568` BI 專案無關。

## 後續優化

- [x] BI Engine 對象說明（見上表）
- [ ] 預熱常見問句快取
- [ ] bullets 亦改 SSE 逐字（目前僅 intro 串流）
- [ ] Territory 對戰檢索：專用 SQL / 排除 Sportage 誤命中
