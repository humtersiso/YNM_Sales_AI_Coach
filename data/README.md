# 本機資料檔（不提交版控）

將話術 Excel 放在此目錄：

| 檔案 | 用途 |
|------|------|
| `AI話術演練表.xlsx` | 後台主庫（釐清、法務、專家流程） |
| `Demo話術演練資料.xlsx` | 匯入與重複比對（待處理清單） |

亦可透過 `.env` 指定完整路徑：`EXCEL_MAIN_PATH`、`EXCEL_INCOMING_PATH`。

產生 Demo 檔：

```bash
cd web
npm run build:demo-xlsx
```
