-- BigQuery View：僅新版訓練素材（knowledge_units），不含舊 sales script
-- 舊表 gen-lang-client-0927009312.YNM_Sales_AI_Coach_test.sales script 已停用、不 UNION

CREATE OR REPLACE VIEW `YOUR_PROJECT.YOUR_DATASET.v_sales_knowledge` AS
SELECT
  customer_question,
  title,
  standard_script AS standard_script_idea,
  'training' AS knowledge_source,
  product_line,
  material_category,
  unit_type,
  asset_id,
  source_locator
FROM `YOUR_PROJECT.YOUR_DATASET.knowledge_units`
WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
  AND TRIM(COALESCE(standard_script, '')) != '';
