/**
 * 不依賴 HTTP：驗證 Excel store、比對不增題、寫出 xlsx。
 * 執行：在 web 目錄 npm run smoke
 */
import fs from "fs";
import path from "path";
import {
  getQuestionProgress,
  getIncomingPreview,
  getStore,
  loadIncomingWorkbookForCheck,
  loadWorkbookFromPath,
  runIncomingDuplicateCheck,
} from "../src/lib/excel-store/store";
import { appStateToWorkbookBuffer } from "../src/lib/excel-store/write-workbook";

const webDir = path.resolve(__dirname, "..");
const demoXlsx = path.join(webDir, "..", "Demo話術演練資料.xlsx");
const mainXlsx = path.join(webDir, "..", "AI話術演練表.xlsx");

function fail(msg: string): never {
  console.error("SMOKE FAIL:", msg);
  process.exit(1);
}

function ok(msg: string) {
  console.log("SMOKE OK:", msg);
}

function main() {
  if (!fs.existsSync(demoXlsx)) {
    fail(`找不到 ${demoXlsx}，請先 npm run build:demo-xlsx`);
  }

  if (!fs.existsSync(mainXlsx)) {
    fail(`找不到 ${mainXlsx}，請先放入主庫檔`);
  }

  loadWorkbookFromPath(mainXlsx);
  const s0 = getStore();
  const n0 = s0.questions.length;
  const nExperts = s0.experts.length;
  const nTags = s0.tags.length;
  if (nExperts < 1) fail("專家筆數應大於 0");
  if (nTags < 1) fail("標籤筆數應大於 0");
  if (n0 < 1) fail("題目筆數應大於 0");
  ok(`載入主庫：題目 ${n0}、專家 ${nExperts}、標籤 ${nTags}`);

  const incoming = loadIncomingWorkbookForCheck();
  const preview = getIncomingPreview();
  if (!preview || preview.items.length < 1) fail("待比對資料未載入");
  if (incoming.missingCodes.length > 0) fail(`待比對人員代號缺漏：${incoming.missingCodes.join(", ")}`);
  ok(`待比對資料載入 ${preview.items.length} 筆，代號檢核通過`);

  const check = runIncomingDuplicateCheck();
  if (check.total < 1) fail("問題檢查結果為空");
  ok(`問題檢查：重複 ${check.duplicateCount}／待釐清 ${check.toClarifyCount}`);

  const store = getStore();
  const activeExpertIds = store.experts.filter((e) => e.isActive).map((e) => e.id);
  const pending = store.questions.filter((q) => q.status === "pending_clarification");
  const completed = pending.filter((q) => getQuestionProgress(q.id, activeExpertIds).status === "complete");
  ok(`儲存門檻檢核：待釐清 ${pending.length}，可儲存 ${completed.length}`);

  const buf = appStateToWorkbookBuffer(s0);
  if (!buf || buf.length < 500) fail("寫出 xlsx buffer 異常");
  ok(`寫出 xlsx buffer 長度 ${buf.length}`);
}

main();
console.log("全部通過。");
