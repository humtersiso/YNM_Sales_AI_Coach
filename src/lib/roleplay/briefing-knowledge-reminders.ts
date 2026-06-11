import type { RoleplayCompletedDetail } from "@/lib/bq/roleplay-sessions-bq";
import {
  isValidFactMemoryLine,
  parseScenarioFactsFromReport,
} from "@/lib/roleplay/briefing-correction-summary";
import { filterFactsForSession } from "@/lib/roleplay/engine/correction-guide";
import { DEMO_ROLEPLAY_SCENARIOS } from "@/lib/roleplay/seed/demo-scenarios";

const FACT_WEAK_THRESHOLD = 13;

function compactLine(text: string, max = 100): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isGarbageFactText(text: string): boolean {
  return (
    /重點\s*\d|舊世代\s*HEV|Do not use|請對照|依教材|vs\.\s*重點/i.test(text) ||
    text.length > 220
  );
}

function formatFactLine(label: string, value: string): string {
  const l = label.trim();
  const v = value.trim();
  if (!l && !v) return "";
  const combined = !l ? v : !v ? l : `${l} ${v}`;
  if (isGarbageFactText(combined)) return "";
  const line = compactLine(`記熟：${combined}`);
  return isValidFactMemoryLine(line.replace(/^記熟：/, "須牢記：")) ? line : "";
}

function demoFactsForSession(competitor: string, targetModel: string) {
  const c = competitor.toLowerCase();
  const m = targetModel.toLowerCase();
  const hit =
    DEMO_ROLEPLAY_SCENARIOS.find(
      (s) =>
        s.sectionA.competitor.toLowerCase().includes(c.split(" ")[0] ?? c) ||
        c.includes(s.sectionA.competitor.toLowerCase().split(" ")[1] ?? "") ||
        m.includes(s.sectionA.productDisplayName.toLowerCase().split(" ")[0] ?? ""),
    ) ?? DEMO_ROLEPLAY_SCENARIOS[0];
  return hit.sectionC.facts;
}

export { parseScenarioFactsFromReport } from "@/lib/roleplay/briefing-correction-summary";

function factCheckCommentFromReport(reportJson: string | null | undefined): string {
  if (!reportJson?.trim()) return "";
  try {
    const j = JSON.parse(reportJson) as {
      dimensions?: { dimensionId?: string; comment?: string }[];
    };
    const hit = j.dimensions?.find((d) => d.dimensionId === "factCheck");
    return String(hit?.comment ?? "").trim();
  } catch {
    return "";
  }
}

/** 補齊 completed detail 的 scenarioFacts（舊資料無 report 內 facts 時） */
export function enrichCompletedDetailFacts(d: RoleplayCompletedDetail): RoleplayCompletedDetail {
  let facts = d.scenarioFacts ?? [];
  if (facts.length === 0) {
    facts = parseScenarioFactsFromReport(d.reportJson);
  }
  if (facts.length === 0) {
    facts = demoFactsForSession(d.competitor, d.targetModel);
  }
  const factCheckComment =
    d.factCheckComment?.trim() || factCheckCommentFromReport(d.reportJson);
  return { ...d, scenarioFacts: facts, factCheckComment };
}

/**
 * 從近場完賽紀錄整理「待記憶知識點」原文，供小結 LLM 改寫成 knowledgeLines。
 * 優先：事實引用弱項場次 → 該場 scenarioFacts → 評語／改善建議。
 */
export function buildKnowledgeRemindersFromSessions(
  sessions: RoleplayCompletedDetail[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  function push(line: string) {
    const t = line.trim();
    if (!t || t.length < 4) return;
    const key = t.slice(0, 24);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(compactLine(t));
  }

  const enriched = sessions.map(enrichCompletedDetailFacts);
  const sorted = [...enriched].sort((a, b) =>
    String(b.finishedAt).localeCompare(String(a.finishedAt)),
  );

  const weakFirst = [
    ...sorted.filter((s) => (s.scoreFactCheck ?? 20) <= FACT_WEAK_THRESHOLD),
    ...sorted.filter((s) => (s.scoreFactCheck ?? 20) > FACT_WEAK_THRESHOLD),
  ];

  for (const s of weakFirst) {
    const weakFact = (s.scoreFactCheck ?? 20) <= FACT_WEAK_THRESHOLD;
    const sessionFacts = filterFactsForSession(s.scenarioFacts ?? [], s.competitor);
    for (const f of sessionFacts) {
      push(formatFactLine(f.label, f.value));
    }
    if (weakFact && s.factCheckComment && s.factCheckComment !== "—") {
      push(s.factCheckComment);
    }
    for (const tip of s.improvementTips ?? []) {
      if (/油耗|km|成本|WLTC|數字|事實|試算|持有|油價|里程/i.test(tip)) {
        push(tip);
      }
    }
    if (out.length >= 6) break;
  }

  if (out.length === 0 && sorted.length > 0) {
    for (const f of sorted[0].scenarioFacts ?? []) {
      push(formatFactLine(f.label, f.value));
    }
  }

  return out.slice(0, 5);
}

export function ruleKnowledgeLines(reminders: string[]): string[] {
  if (reminders.length === 0) return [];
  return reminders.slice(0, 3).map((r) => (r.startsWith("記熟") || r.startsWith("須牢記") ? r : `須牢記：${r}`));
}
