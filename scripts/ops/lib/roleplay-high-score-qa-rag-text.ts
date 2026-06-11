/**
 * 從 RAG facts 萃取可放入高分問答集的回答句（與對練 filter 對齊）
 */
import {
  filterFactsForSession,
  hasConcreteNumbers,
  isVagueCorrectGuide,
  normalizeCompetitorToken,
} from "../../../src/lib/roleplay/engine/correction-guide";
import { isRawRagDump } from "../../../src/lib/roleplay/engine/correction-builder";
import { isValidRagFact } from "../../../src/lib/roleplay/rag-context";

export type RagFact = { label: string; value: string };

export function cleanFactExcerpt(value: string): string {
  return value
    .replace(/Do not use without any permission[\s\S]*/gi, "")
    .replace(/Confidentiality Classification:[\s\S]*?(?=\S)/gi, "")
    .replace(/All rights reserved[\s\S]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableSentence(s: string): boolean {
  const t = s.trim();
  if (t.length < 12 || t.length > 120) return false;
  if (/^重點\s*\d+$/.test(t)) return false;
  if (/舊世代\s*HEV|vs\.\s*重點|Do not use|商品特點挑戰|話術策略|挑戰\s*SPORTAGE/i.test(t)) {
    return false;
  }
  if (isRawRagDump(t) || isVagueCorrectGuide(t)) return false;
  return true;
}

/** 從單則 RAG value 拆出可引用句 */
export function extractUsableSentences(value: string): string[] {
  const clean = cleanFactExcerpt(value);
  const parts = clean.split(/[。！？\n；•]+/).map((s) => s.trim());
  const out: string[] = [];
  for (const p of parts) {
    if (!isUsableSentence(p)) continue;
    if (!hasConcreteNumbers(p) && p.length < 20) continue;
    const key = p.slice(0, 24);
    if (!out.some((u) => u.slice(0, 24) === key)) out.push(p);
  }
  if (out.length === 0 && clean.length >= 20 && hasConcreteNumbers(clean)) {
    out.push(clean.slice(0, 100));
  }
  return out;
}

export function buildRagSnippetPool(
  facts: RagFact[],
  competitor: string,
  keyPoints: string[] = [],
): string[] {
  const filtered = filterFactsForSession(facts, competitor).filter((f) =>
    isValidRagFact({ label: f.label, value: cleanFactExcerpt(f.value) || "—" }),
  );
  const pool: string[] = [];
  for (const f of filtered) {
    for (const s of extractUsableSentences(f.value)) {
      if (!pool.some((x) => x.slice(0, 28) === s.slice(0, 28))) pool.push(s);
    }
  }
  for (const kp of keyPoints) {
    const t = cleanFactExcerpt(kp);
    if (t.length >= 12 && !isVagueCorrectGuide(t) && !pool.includes(t)) {
      pool.push(t.slice(0, 100));
    }
  }
  return pool;
}

export function inferIssueFromSnippets(snippets: string[], competitor: string): string {
  const joined = snippets.join(" ");
  const c = normalizeCompetitorToken(competitor);
  if (/油耗|km\/L|油費|油資|WLTC/i.test(joined)) return `油耗／持有成本（vs ${c}）`;
  if (/定保|保養|回廠|維修/i.test(joined)) return `保養／回廠費用（vs ${c}）`;
  if (/分貝|隔音|玻璃/i.test(joined)) return `隔音／質感（vs ${c}）`;
  if (/空間|座椅|行李|七人/i.test(joined)) return `空間／座位（vs ${c}）`;
  if (/促銷|折扣|車價|萬/i.test(joined)) return `價格／方案（vs ${c}）`;
  return `產品比較（vs ${c}）`;
}

export function inferCustomerHook(
  opening: string | undefined,
  snippets: string[],
  shortComp: string,
): string {
  if (opening?.trim() && opening.length >= 12) {
    const o = opening.trim();
    return o.startsWith("「") ? o.slice(1).replace(/」$/, "") : o;
  }
  const first = snippets[0];
  if (first && /油耗|省油|油費/i.test(first)) {
    return `網路上都在比 ${shortComp} 跟 X-TRAIL 的油耗，我想先聽你們怎麼說`;
  }
  return `我最近也在看 ${shortComp}，想聽你們實際差在哪`;
}
