/**
 * 修正點邏輯模擬
 * tsx scripts/ops/test-roleplay-corrections.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeScenarioFromConfig } from "../../src/lib/roleplay/engine/scenario-composer";
import { detectCorrectionCandidates } from "../../src/lib/roleplay/engine/correction-builder";
import { buildSessionCorrections } from "../../src/lib/roleplay/engine/correction-builder";
import type { RoleplayChatTurn } from "../../src/lib/roleplay/session-types";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
    break;
  }
}

loadEnv();

const ts = (i: number) => new Date(Date.now() + i * 1000).toISOString();

const TESTS: {
  name: string;
  turns: RoleplayChatTurn[];
  forbidIssues?: RegExp;
  expectMax: number;
}[] = [
  {
    name: "① 弱回覆（大螢幕、路上跑）",
    expectMax: 4,
    turns: [
      {
        role: "customer",
        content:
          "我最近在看 RAV4 跟 X-TRAIL，網路上大家都說豐田那台油耗比較漂亮，十年用車成本怎麼算都不對勁？",
        at: ts(0),
      },
      { role: "agent", content: "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！", at: ts(1) },
      {
        role: "customer",
        content: "測試路況太模糊，市區跟高速各多少？RAV4 冷氣整合在螢幕很難盲操作吧？",
        at: ts(2),
      },
      { role: "agent", content: "其實路上跑起來兩台差不多啦，您實際開過就懂。", at: ts(3) },
      {
        role: "customer",
        content: "螢幕大就方便？RAV4 單層玻璃，你們有分貝數據嗎？",
        at: ts(4),
      },
      {
        role: "agent",
        content: "因為螢幕是 12.3 吋的大螢幕，一定讓你操作上很方便。",
        at: ts(5),
      },
    ],
  },
  {
    name: "② 稱職回覆（不應挑毛病）",
    expectMax: 0,
    turns: [
      { role: "customer", content: "我想比十年用車成本。", at: ts(0) },
      { role: "agent", content: "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！", at: ts(1) },
      { role: "customer", content: "WLTC 油耗怎麼算？", at: ts(2) },
      {
        role: "agent",
        content:
          "WLTC 綜合油耗 X-TRAIL 旗艦約 16 km/L，十年 10 萬公里試算加車價折扣，比 RAV4 省約 29 萬。週六帶您對試算表？",
        at: ts(3),
      },
    ],
  },
  {
    name: "③ 使用者回報：已談成本／分貝／已邀約（應極少或零）",
    expectMax: 0,
    forbidIssues: /保養|收尾|油耗.*測試條件/,
    turns: [
      { role: "customer", content: "十年用車成本跟保養怎麼算？", at: ts(0) },
      { role: "agent", content: "您好，歡迎來看車！", at: ts(1) },
      {
        role: "customer",
        content: "WLTC 油耗測試路況是什麼比例？",
        at: ts(2),
      },
      {
        role: "agent",
        content:
          "我們是以車價、折扣、稅金、油資、油電電池等費用加總，實際表格方便跟您預約試乘時讓你看嗎？",
        at: ts(3),
      },
      {
        role: "customer",
        content: "隔音呢？RAV4 單層玻璃差多少？",
        at: ts(4),
      },
      {
        role: "agent",
        content: "是的，我們採用雙隔音玻璃，時速 50 是 60 分貝，RAV4 是 63 喔～",
        at: ts(5),
      },
    ],
  },
  {
    name: "④ 不清楚／試乘才給表／快點約試乘（應抓多項）",
    expectMax: 3,
    forbidIssues: undefined,
    turns: [
      {
        role: "customer",
        content:
          "最近在看休旅車，網路上很多人推RAV4，想了解這兩台長遠開下來的差異。",
        at: ts(0),
      },
      {
        role: "agent",
        content:
          "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！\nRAV4油耗比較好，但以10年10萬公里，折扣稅金電池車價加一加可能差30萬",
        at: ts(1),
      },
      {
        role: "customer",
        content:
          "這30萬差距很大，有試算表嗎？RAV4油耗比較漂亮，10年持有成本怎麼估算？",
        at: ts(2),
      },
      { role: "agent", content: "我不清楚耶", at: ts(3) },
      {
        role: "customer",
        content: "你連基礎試算都不清楚，請查清楚成本結構或找人說明。",
        at: ts(4),
      },
      { role: "agent", content: "試乘時將表格一併給你?", at: ts(5) },
      {
        role: "customer",
        content: "我現在就要評估數據，請針對稅金、車價跟維護成本講個邏輯。",
        at: ts(6),
      },
      { role: "agent", content: "快點約試乘拉", at: ts(7) },
    ],
  },
];

async function main() {
  const { scenario } = await composeScenarioFromConfig({
    productLine: "xtrail-ice",
    personaId: "P-01",
    ageRange: "30-40",
    competitor: "Toyota RAV4",
    maxTurns: 5,
    difficulty: "advanced",
  });

  let passed = 0;
  for (const test of TESTS) {
    console.log(`\n${test.name}`);
    const candidates = detectCorrectionCandidates(scenario, test.turns);
    console.log(`  候選（規則）: ${candidates.length}`);
    for (const c of candidates) {
      console.log(`    [${c.category}] ${c.issue}`);
    }

    const points = await buildSessionCorrections(scenario, test.turns);
    console.log(`  最終: ${points.length}`);
    for (const p of points) {
      console.log(`    [${p.category}] ${p.issue}`);
      console.log(`      建議: ${p.correctGuide.slice(0, 100)}…`);
    }

    const forbidOk = !test.forbidIssues || !points.some((p) => test.forbidIssues!.test(p.issue));
    const countOk = points.length <= test.expectMax;
    if (countOk && forbidOk) {
      console.log("  ✓ 通過");
      passed += 1;
    } else {
      console.log(`  ✗ 未通過 (count=${countOk} forbid=${forbidOk})`);
    }
  }

  console.log(`\n=== ${passed}/${TESTS.length} 通過 ===`);
  process.exit(passed === TESTS.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
