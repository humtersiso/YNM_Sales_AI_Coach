# 訓練素材根目錄（多車款）

每個**車款**一個子資料夾（`product_line` slug），之後新增車款只要加目錄並登記 registry，不必改程式核心。

```
training-materials/
  xtrail-ice/
    product-info/        ← 本品資訊
    competitor-compare/  ← 競品比較
    sales-script/        ← 話術 xlsx（可選）
  kicks/                 ← 未來車款，結構相同
  _common/               ← 跨車款共用（可選）
```

## 環境變數

```bash
TRAINING_MATERIALS_ROOT=C:\path\to\training-materials
# 單一車款助手（可選）
SALES_CHAT_PRODUCT_LINE=xtrail-ice
```

## 指令

```bash
npm run training:inventory
npm run bq:create-knowledge
npm run training:ingest:all          # 匯入所有車款子目錄
npm run training:ingest -- --product-line=xtrail-ice
npm run training:parse-job
npm run training:validate-search
```

新增車款：編輯 [`training-product-registry.ts`](../src/lib/ingest/contracts/training-product-registry.ts)，建立子資料夾後執行 ingest。

詳見 [`docs/TRAINING_MATERIALS_INGEST.md`](../docs/TRAINING_MATERIALS_INGEST.md)。
