/**
 * 產出精簡版 web/data/Demo話術演練資料.xlsx（必要 sheet／欄位與主庫對齊）。
 * 執行：在 web 目錄下 npm run build:demo-xlsx
 */
import path from "path";
import * as XLSX from "xlsx";
import { demoKnowledge, demoSimilar } from "../src/lib/demo-questions";

const OUT_NAME = "Demo話術演練資料.xlsx";

/** 精簡：知識庫只取前 N 筆 + 相似題前 M 筆，降低示範檔體積 */
const KNOWLEDGE_MAX = 5;
const SIMILAR_MAX = 5;

function main() {
  const qaRows: Record<string, string>[] = [];
  for (const [q] of demoKnowledge.slice(0, KNOWLEDGE_MAX)) {
    // 主資料僅保留「客戶疑問」欄，其餘欄位全部拿掉。
    qaRows.push({ 客戶疑問: q });
  }
  for (const sim of demoSimilar.slice(0, SIMILAR_MAX)) {
    // 僅保留問題文字，不輸出示範回覆或來源欄位。
    qaRows.push({ 客戶疑問: sim.text });
  }
  const qaRowsWithId: Record<string, string>[] = qaRows.map((row) => ({ ...row }));
  if (qaRowsWithId.length > 0) {
    qaRowsWithId[0] = {
      ...qaRowsWithId[0],
      // 保留示範題目內容，但不加前綴與額外欄位
      客戶疑問: "若客戶同時關注油耗與安全，KICKS該如何完整回應？",
    };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qaRowsWithId), "問題蒐集對應");

  const outPath = path.resolve(process.cwd(), "data", OUT_NAME);
  XLSX.writeFile(wb, outPath);
  console.log(`已寫入：${outPath}`);
}

main();
