# XTRAIL ICE 資料源 prod 遷移 SOP（Phase 3）

## 前置

1. 在 **test** (`YNM_Sales_AI_Coach_test`) 完成全量匯入與 `npm run xtrail:validate-search` 驗收。
2. 確認 `v_sales_knowledge` 可查到 legacy + xtrail 資料。
3. 法務確認素材可進 GCP（GCS/BQ）。

## prod 建表

```bash
cd web
npm run env:use:prod
npm run bq:create-knowledge:prod
```

會建立 `source_assets`、`knowledge_units`，並以 prod 的 `sales script` 建立 `v_sales_knowledge`。

## 資料匯入

```bash
# 與 test 相同素材路徑
set XTRAIL_ICE_SOURCE_ROOT=C:\path\to\XTRAIL ICE AI訓練素材
npm run xtrail:ingest
npm run xtrail:parse-job
```

## 切換應用

[`deploy/cloudrun-prod.env.yaml`](../deploy/cloudrun-prod.env.yaml) 已預設：

```yaml
BIGQUERY_TABLE_KNOWLEDGE: "v_sales_knowledge"
BIGQUERY_USE_KNOWLEDGE_VIEW: "true"
```

重新部署：

```bash
npm run deploy:prod
```

## Dedupe

- `knowledge_units.content_hash`：同一內容不重複 insert（批次 ingest 預設啟用）。
- 重跑整批時可加 `--skip-dedupe`（需擴充 CLI）或刪除該 `ingest_batch_id` 列後重匯。

## 可選：Gemini Q&A 萃取

```bash
set GEMINI_API_KEY=...
python jobs/xtrail-parse/gemini_qa_extract.py 10
```

僅建議對已驗收之 chunk 小批量試行；產出 `qa_pair` 需人工抽樣覆核。

## Document AI（正式品質）

PoC 使用 `pypdf` / `python-pptx`。掃描 PDF 或複雜版面請改接 **Document AI Layout Parser**，在 `jobs/xtrail-parse/main.py` 新增 `documentai` 分支，並設定 `DOCUMENT_AI_PROCESSOR_ID`。

## 回滾

1. Cloud Run 設 `BIGQUERY_USE_KNOWLEDGE_VIEW=false`，`BIGQUERY_TABLE_SCRIPT_DRILLS=sales script`。
2. 重新部署；應用僅讀 legacy 話術表。
3. `knowledge_units` 資料保留，可再次切回 view。
