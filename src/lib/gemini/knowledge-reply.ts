import { prepareDisplayCitations } from "@/lib/gemini/citation-utils";
import { normalizeReplyLine, type ScriptCitation } from "@/lib/gemini/reply-format";
import { extractFileHints } from "@/lib/gemini/knowledge-search";
import {
  SALES_REPLY_BULLET_MAX_CHARS,
  SALES_REPLY_MAX_BULLETS,
} from "@/lib/gemini/sales-reply-config";

const BOILERPLATE =
  /All rights reserved|Confidentiality Classification|Do not use without|Yulon Nissan|Yulon NISSAN/gi;

const MAX_BULLETS = SALES_REPLY_MAX_BULLETS;
const MAX_BULLET_LEN = SALES_REPLY_BULLET_MAX_CHARS;

function joinBrokenUrls(text: string): string {
  let s = text;
  // https://...\n?si= 或 \nh?v=
  s = s.replace(/(https?:\/\/[^\s]*?)\s*\n\s*([?#a-z][^\s]*)/gi, "$1$2");
  s = s.replace(/(https?:\/\/[^\s]*?)\s*\n\s*([a-z][^\s]*)/gi, "$1$2");
  // https://www.youtube.com/watc h?v= → watch?v=
  s = s.replace(/(https?:\/\/\S+?)\s+([a-z?][\w?&=;./-]*)/gi, "$1$2");
  return s;
}

function normalizeChunk(text: string): string {
  return joinBrokenUrls(
    text
      .replace(BOILERPLATE, " ")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n"),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function displayUrl(url: string): string {
  const compact = url.replace(/\s/g, "");
  try {
    const u = new URL(compact);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.length > 1 ? u.pathname : "";
    return `${host}${path}`.slice(0, 48);
  } catch {
    return compact.slice(0, 48);
  }
}

function extractDocLabel(question: string): string {
  const m = question.match(/^(.+?\.(?:pdf|pptx|xlsx|xls))/i);
  if (m) return m[1].trim();
  const paren = question.match(/^(.+?)\s*\(/);
  return paren?.[1]?.trim() || question.slice(0, 60);
}

function pickPrimaryDoc(citations: ScriptCitation[], message: string): string {
  const hints = extractFileHints(message);
  for (const hint of hints) {
    const hit = citations.find((c) => c.question.toLowerCase().includes(hint.toLowerCase()));
    if (hit) return extractDocLabel(hit.question);
  }
  if (citations[0]) return extractDocLabel(citations[0].question);
  return "知識庫";
}

function groupByDoc(citations: ScriptCitation[], docLabel: string): ScriptCitation[] {
  const key = docLabel.toLowerCase().replace(/\s+/g, "");
  const grouped = citations.filter((c) =>
    extractDocLabel(c.question).toLowerCase().replace(/\s+/g, "").includes(key.slice(0, 12)),
  );
  return grouped.length > 0 ? grouped : citations;
}

function shorten(text: string, max = MAX_BULLET_LEN): string {
  const s = normalizeReplyLine(text);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
    const pause = Math.max(cut.lastIndexOf("，"), cut.lastIndexOf("、"));
    return (pause > 80 ? cut.slice(0, pause) : cut).trim() + "…";
}

/** 解析 YT 負評 PDF 單頁文字 */
function parseYtNegativePoint(script: string): string | null {
  const text = normalizeChunk(script);
  if (!text || text.length < 10) return null;

  const urlMatch = text.match(/https?:\/\/[\w./?#&=%+\-:]+/i);
  const url = urlMatch?.[0]?.replace(/\s/g, "") ?? "";

  let channel = "";
  const channelAfter = text.match(/負面評價\s*_?([^_\n]+?)(?=https|$)/);
  if (channelAfter?.[1]) channel = channelAfter[1].trim().replace(/^_/, "").replace(/\s+/g, "");

  let complaint = "";
  if (url) {
    const after = text.split(urlMatch![0])[1] ?? "";
    complaint = after
      .replace(/^[\s?&=;0-9a-zA-Z._+\-]+/i, "")
      .replace(/^[\s！!。；]+/, "")
      .split(/[！!]/)[0]
      ?.trim() ?? "";
  }
  if (!complaint || complaint.length < 4) {
    const parts = text
      .split(/[！!]/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 6 && !p.includes("http") && !/Confidential/i.test(p));
    complaint = parts[parts.length - 1] ?? "";
  }
  if (!complaint || complaint.length < 4) return null;

  complaint = complaint.replace(/^價\s*/, "").trim();

  const link = url ? displayUrl(url) : "";
  if (channel && link) {
    return shorten(`${complaint}（${channel}｜${link}）`);
  }
  if (link) return shorten(`${complaint}（${link}）`, 130);
  return shorten(complaint);
}

function summarizeYtNegativeReviews(citations: ScriptCitation[]): string[] {
  const bullets: string[] = [];
  const seen = new Set<string>();

  for (const c of citations) {
    const point = parseYtNegativePoint(c.script);
    if (!point) continue;
    const key = point.replace(/https?:\/\/\S+/g, "").slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(point);
  }

  return bullets.slice(0, MAX_BULLETS);
}

/** 一般素材：每段合併 1～2 句，湊滿較完整的列點 */
function summarizeGenericChunks(citations: ScriptCitation[]): string[] {
  const bullets: string[] = [];
  const seen = new Set<string>();

  for (const c of citations) {
    const text = normalizeChunk(c.script);
    if (!text || text.length < 12) continue;

    const sentences = text
      .split(/[。！!；\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 8 && s.length <= 120)
      .filter((s) => !/^(車型|規格|All rights)/i.test(s));

    if (sentences.length === 0) continue;

    const rich =
      sentences.length >= 2
        ? shorten(`${sentences[0]}，${sentences[1]}`)
        : shorten(sentences.find((s) => /[\u4e00-\u9fff]{4,}/.test(s)) ?? sentences[0]);

    const key = rich.slice(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(rich);
    if (bullets.length >= MAX_BULLETS) break;
  }

  return bullets;
}

export function buildKnowledgeReply(
  message: string,
  citations: ScriptCitation[],
): { intro: string; bullets: string[]; displayCitations: ScriptCitation[] } {
  if (citations.length === 0) {
    return { intro: "", bullets: [], displayCitations: [] };
  }

  const docLabel = pickPrimaryDoc(citations, message);
  const grouped = groupByDoc(citations, docLabel);
  const isYtNegative =
    /YT|負評|youtube|youtu\.be/i.test(message) ||
    /YT|負評/i.test(docLabel) ||
    grouped.some((c) => /負評|youtu/i.test(c.script));

  const bullets = isYtNegative
    ? summarizeYtNegativeReviews(grouped)
    : summarizeGenericChunks(grouped);

  if (bullets.length === 0) {
    return { intro: "", bullets: [], displayCitations: [] };
  }

  const intro =
    grouped.length > 1 ? `《${docLabel}》（${grouped.length} 段來源）` : `《${docLabel}》`;
  const displayCitations = prepareDisplayCitations(grouped);

  return { intro, bullets, displayCitations };
}
