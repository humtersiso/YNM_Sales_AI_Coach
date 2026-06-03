# 多車款訓練素材 → BigQuery 匯入 SOP

本系統以 **`product_line`（車款 slug）** 區分素材，X-TRAIL ICE 只是其中一個車款（`xtrail-ice`）。新增車款時擴充目錄與 registry 即可。

## 目錄慣例

```
data/training-materials/
  xtrail-ice/    # 現有
  kicks/         # 未來
  _common/       # 跨車款共用（可選）
```

## 登記新車款

編輯 [`training-product-registry.ts`](../src/lib/ingest/contracts/training-product-registry.ts)：

```typescript
{ id: "kicks", displayName: "Kicks", validationQuestions: ["…"], active: true }
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `TRAINING_MATERIALS_ROOT` | 多車款根目錄 |
| `SALES_CHAT_PRODUCT_LINE` | 銷售助手只查該車款 + `_common`（可選） |
| `BIGQUERY_TABLE_KNOWLEDGE` | 預設 `v_sales_knowledge` |

舊變數 `XTRAIL_ICE_SOURCE_ROOT` 仍可用（相容），建議改為 `TRAINING_MATERIALS_ROOT`。

## 流程

```bash
npm run training:inventory
npm run env:use:test
npm run bq:create-knowledge
# 若表已存在但無 product_line：
npm run bq:migrate:product-line

npm run training:ingest:all
# 或單車款：
npm run training:ingest -- --product-line=xtrail-ice

pip install -r jobs/xtrail-parse/requirements.txt
npm run training:parse-job
npm run training:validate-search
```

## BigQuery 欄位

- `product_line`：車款（`xtrail-ice`、`kicks`…）
- **`material_category`**：素材類別（建議分開，不要混在同一目錄）
  - `product_info` — 本品資訊
  - `competitor_compare` — 競品比較
  - `sales_script` — 話術 Q&A
- `v_sales_knowledge` **僅**讀 `knowledge_units`（舊表 `sales script` 已停用、不混用）

## UI

- **銷售助手**：頂部切換「本品資訊｜競品比較｜話術」
- **管理後台／資料總覽**：下拉篩選車款與類別

## 相容指令

`npm run xtrail:*` 仍可使用，行為與 `training:*` 相同或指向舊路徑。

Prod 遷移見 [`XTRAIL_ICE_MIGRATION_SOP.md`](./XTRAIL_ICE_MIGRATION_SOP.md)（內容適用所有車款）。
