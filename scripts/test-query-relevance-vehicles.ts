/**
 * 多車款／競品抽測：守門規則 + 完整問答
 * npx tsx scripts/test-query-relevance-vehicles.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessSalesQueryAnswerability,
  detectUnknownKnowledgeSubjects,
} from "../src/lib/gemini/query-relevance-guard";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

type Case = {
  label: string;
  q: string;
  /** 守門：是否應在檢索前擋下（未知名詞） */
  guardBlock: boolean;
  /** 端到端：是否應有題庫回答（有 citations） */
  expectAnswer: boolean;
  /** 題庫尚未匯入（如 KICKS）→ 應回「尚無建檔」而非誤判不符 */
  expectNoData?: boolean;
};

const cases: Case[] = [
  { label: "本品 X-TRAIL", q: "XTRAIL 特色如何?", guardBlock: false, expectAnswer: true },
  { label: "本品配備", q: "X-TRAIL ProPILOT 怎麼介紹?", guardBlock: false, expectAnswer: true },
  {
    label: "KICKS 本品",
    q: "KICKS 有什麼配備?",
    guardBlock: false,
    expectAnswer: false,
    expectNoData: true,
  },
  {
    label: "KICKS vs HR-V",
    q: "KICKS 跟 HR-V 油耗怎麼比",
    guardBlock: false,
    expectAnswer: false,
    expectNoData: true,
  },
  { label: "競品 RAV4", q: "XTRAIL 跟 RAV4 油耗怎麼比", guardBlock: false, expectAnswer: true },
  { label: "競品 Tucson", q: "Tucson 跟 XTRAIL 比較", guardBlock: false, expectAnswer: true },
  { label: "競品 Territory", q: "Territory 對戰怎麼回", guardBlock: false, expectAnswer: true },
  { label: "話術 試乘", q: "客戶想試乘 XTRAIL 怎麼邀約", guardBlock: false, expectAnswer: true },
  { label: "離題 UFO", q: "UFO 01 跟 X-TRAIL的差異", guardBlock: true, expectAnswer: false },
  { label: "離題 法拉利", q: "法拉利跟 XTRAIL 哪台比較好", guardBlock: true, expectAnswer: false },
];

async function main() {
  let failed = 0;
  const rows: string[] = [];

  console.log("=== 守門規則（未知名詞）===\n");
  for (const c of cases) {
    const unknown = detectUnknownKnowledgeSubjects(c.q);
    const blocked = unknown !== null;
    const ok = blocked === c.guardBlock;
    if (!ok) failed += 1;
    const mark = ok ? "OK" : "NG";
    console.log(`${mark} [${c.label}] guardBlock=${c.guardBlock} got=${blocked} ${unknown ? `(${unknown.join("、")})` : ""}`);
    console.log(`    Q: ${c.q}`);
  }

  console.log("\n=== 端到端問答（BQ + Gemini）===\n");
  for (const c of cases) {
    const pre = assessSalesQueryAnswerability(c.q, []);
    if (c.guardBlock) {
      const ok = !pre.ok && Boolean(pre.userReply);
      if (!ok) failed += 1;
      const mark = ok ? "OK" : "NG";
      console.log(`${mark} [${c.label}] 應擋下 | ${pre.userReply?.slice(0, 70)}…`);
      rows.push(`${mark}\t${c.label}\tblocked\t-\t${c.q}`);
      continue;
    }

    try {
      const r = await chatWithDataAgent(c.q);
      const answered = r.inQuestionBank && r.citations.length > 0;
      const unknownBlocked =
        !answered &&
        (r.reply.includes("知識庫沒有") ||
          (r.reply.includes("無法依建檔資料") && detectUnknownKnowledgeSubjects(c.q)));
      const noData = !answered && r.reply.includes("尚無") && r.reply.includes("建檔");
      const noHit = !answered && r.reply.includes("尚無此問題");
      const ok = c.expectNoData
        ? noData || noHit
        : c.expectAnswer
          ? answered
          : unknownBlocked || noHit;

      if (!ok) failed += 1;
      const mark = ok ? "OK" : "NG";
      console.log(
        `${mark} [${c.label}] bank=${r.inQuestionBank} cites=${r.citations.length} | ${r.reply.slice(0, 90)}…`,
      );
      rows.push(
        `${mark}\t${c.label}\t${answered ? "answered" : "no-hit"}\t${r.citations.length}\t${c.q}`,
      );
    } catch (e) {
      failed += 1;
      console.log(`NG [${c.label}] ERROR: ${e instanceof Error ? e.message : e}`);
      rows.push(`NG\t${c.label}\terror\t-\t${c.q}`);
    }
  }

  console.log("\n--- 摘要 ---");
  for (const line of rows) console.log(line.replace(/\t/g, " | "));

  console.log(failed === 0 ? "\n全部通過。" : `\n${failed} 項未通過。`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
