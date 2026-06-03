# Data Agent × 知識庫 × Gemini 整理（業代易讀版）

## 專案與資料源（一頁整理）

| 層級 | 專案／服務 | 用途 |
|------|-----------|------|
| **知識庫資料** | `gen-lang-client-0927009312` | BigQuery dataset `YNM_Sales_AI_Coach_test` |
| **主要表** | `knowledge_units` | 匯入後的知識單元（話術、規格、對戰等） |
| **檢索 View** | `v_sales_knowledge` | 銷售助手預設檢索（`BIGQUERY_USE_KNOWLEDGE_VIEW=true`） |
| **Data Agent** | 同上專案 | `geminidataanalytics.googleapis.com`，Agent 連結上述 BQ |
| **Gemini 整理** | AI Studio `GEMINI_API_KEY` | `gemini-3.1-flash-lite`，把 Data Agent 原文改成固定格式 |
| **BI Engine** | `653828324568`（Console 計費顯示） | 加速 BQ 表掃描；**不是** Vertex／Gemini 模型專案 |

地區：**asia-east1**（BQ 表與檢索）。

---

## 一輪問答在做什麼（`SALES_CHAT_MODE=data-agent`）

```
業代提問
  → 問題分類 sales-question-profile（本品 / 競品 / QA，UI 不顯示）
  → 規則／FC 決定檢索計畫（resolveSearchPlanWithProfile）
  → BQ 查 v_sales_knowledge → 引用來源 citations
  → Data Agent（依分類追加查詢規則）→ 原文
  → Gemini 整理（依分類追加格式規則）→ 小結 + 列點
  → 前端 ChatThread 顯示
```

---

## 業代問題分類（後端隱藏）

| 分類 | BQ `material_category` | 回答策略 |
|------|------------------------|----------|
| **本品** `own_product` | `product_info` | 以 X-TRAIL（`SALES_CHAT_PRODUCT_LINE`）配備、規格、數字為主 |
| **競品** `competitor` | `competitor_compare` | 小結必寫「{競品} vs X-TRAIL」差異；Data Agent 要求雙車對比 |
| **QA 話術** `sales_qa` | `sales_script` | 小結「可這樣回客戶…」；列點以建議／可回覆開頭 |

- 分類模組：[`sales-question-profile.ts`](../src/lib/gemini/sales-question-profile.ts)
- Prompt 分類規則：[`sales-reply-directives.ts`](../src/lib/gemini/sales-reply-directives.ts) 的 `buildCategoryQueryRules` / `buildCategoryFormatRules`
- dev 除錯：`console.info('[sales] profile', …)`（`NODE_ENV=development`）
- 測試：`tsx scripts/test-sales-question-profile.ts`

---

## 穩定一致性怎麼做

| 機制 | 說明 |
|------|------|
| **固定 Prompt** | `buildDataAgentFormatPrompt`（`sales-reply-directives.ts`） |
| **低溫度** | `temperature: 0.1` |
| **JSON 輸出** | `intro`（小結，必寫）+ `bullets[]`，禁止 markdown |
| **以資料為主** | 金額／里程／型號必保留；禁止「有檔案可試算」類空話 |
| **無資料則省略** | 禁止「原文未載明保費」等列點；沒有就不列 |
| **列點格式** | 每條必須 `小標題：內文`（中文冒號），成本題分項列金額 |
| **後處理** | `polishDataAgentReply` → `sanitizeDataAgentDisplay`（保留小結，不佔用第一點） |
| **失敗備援** | Gemini 失敗時改 `formatMarkdownReplyToDisplay`（無 LLM，仍盡量一致） |

關閉 Gemini 整理、只看 Data Agent 原文：

```env
SALES_DATA_AGENT_RAW=true
```

僅關整理、仍做 markdown 解析：

```env
SALES_DATA_AGENT_FORMAT=false
# 或 SALES_DATA_AGENT_CONDENSE=false
```

---

## 環境變數（建議）

```env
SALES_CHAT_MODE=data-agent
BIGQUERY_PROJECT_ID=gen-lang-client-0927009312
BIGQUERY_DATASET=YNM_Sales_AI_Coach_test
BIGQUERY_USE_KNOWLEDGE_VIEW=true
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
SALES_DATA_AGENT_RAW=false
SALES_DATA_AGENT_FORMAT=true
```

---

## 相關程式

| 檔案 | 職責 |
|------|------|
| `sales-question-profile.ts` | 本品／競品／QA 分類（規則 + FC 備援） |
| `conversational-analytics.ts` | 編排 BQ + Data Agent + 整理 |
| `data-agent-refine.ts` | `formatDataAgentOutputForSales` |
| `sales-reply-directives.ts` | 整理用 Prompt 規則 |
| `reply-format.ts` | markdown 解析、sanitize、列點上限 |
| `gemini-client.ts` | `dataAgentChat`、`geminiGenerateText` |
| `ChatThread.tsx` | 「小標題：」加粗顯示 |

---

## 與 hybrid／agent 模式差異

| 模式 | 回答來源 | 整理方式 |
|------|----------|----------|
| **data-agent** | Data Agent 查 BQ | Gemini 整理原文（本文件） |
| **agent** | 固定 SQL 檢索摘錄 | `summarizeCitationsWithGemini`（較短、2～4 點） |
| **hybrid** | BQ 摘錄優先 | 同上；Data Agent 為備援 |

兩種 Gemini 步驟共用 `SALES_DIRECT_REPLY_RULES` 語氣，但 Data Agent 整理允許較多列點（最多 8 條），方便成本／規格比較題。
