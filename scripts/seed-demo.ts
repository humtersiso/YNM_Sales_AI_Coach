/**
 * 確保 Demo xlsx 存在、載入記憶體並寫入兩筆示範專家建議（不經資料庫）。
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { demoPending } from "../src/lib/demo-questions";
import {
  getStore,
  loadWorkbookFromPath,
  listExpertsByEmailAsc,
  saveStoreToWorkbook,
  upsertSuggestion,
} from "../src/lib/excel-store/store";

const webDir = path.resolve(__dirname, "..");
const demoXlsx = path.join(webDir, "data", "Demo話術演練資料.xlsx");

async function main() {
  if (!fs.existsSync(demoXlsx)) {
    execSync("npx tsx scripts/build-demo-xlsx.ts", {
      cwd: webDir,
      stdio: "inherit",
      shell: process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh",
    });
  }
  if (!fs.existsSync(demoXlsx)) {
    throw new Error(`找不到 Demo xlsx：${demoXlsx}`);
  }

  loadWorkbookFromPath(demoXlsx);
  const experts = listExpertsByEmailAsc();
  const state = getStore();
  const findQ = (t: string) => state.questions.find((q) => q.originalText === t);

  const pending0 = findQ(demoPending[0].text);
  const pending2 = findQ(demoPending[2].text);

  if (pending0 && experts[0]) {
    upsertSuggestion(
      pending0.id,
      experts[0].id,
      "建議先釐清公司戶合約條款與殘值設定，再對照個人購車稅費與保固範圍，可提供試算表範本連結。",
    );
  }
  if (pending2 && experts[2]) {
    upsertSuggestion(
      pending2.id,
      experts[2].id,
      "歐系柴油話題可改談總持有與柴油稅／DPF 養護，再帶回同級安全與保固誠意；避免陷入規格對槓。",
    );
  }

  saveStoreToWorkbook();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
