import {
  DATA_AGENT_FORMAT_BULLET_MAX_CHARS,
  DATA_AGENT_FORMAT_INTRO_MAX_CHARS,
  DATA_AGENT_FORMAT_MAX_BULLETS,
  DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS,
  SALES_REPLY_BULLET_MAX_CHARS,
  SALES_REPLY_INTRO_MAX_CHARS,
  SALES_REPLY_MAX_BULLETS,
} from "@/lib/gemini/sales-reply-config";

export type ScriptCitation = {
  index: number;
  question: string;
  script: string;
  /** 引用標題列顯示用，如「客戶問」「素材來源」 */
  sourceLabel?: string;
  /** 引用內文列顯示用，如「建議話術」「報導摘要」 */
  scriptLabel?: string;
  sourceKind?: string;
  materialCategory?: string;
};

const MAX_BULLETS = SALES_REPLY_MAX_BULLETS;
const MAX_BULLET_CHARS = SALES_REPLY_BULLET_MAX_CHARS;
const MAX_INTRO_CHARS = SALES_REPLY_INTRO_MAX_CHARS;

/** 題庫查無時的說明文字（不含按鈕行為） */
export function notInQuestionBankMessage(): string {
  return "目前題庫中尚無此問題的標準話術。是否要將此問題加入「待新增題庫清單」，由話術管理窗口後續建檔？";
}

/** 問題提及知識庫未收錄名詞，或檢索相關度過低 */
export function outOfScopeKnowledgeMessage(unknownTerms?: string[]): string {
  const list = unknownTerms?.filter(Boolean).join("、");
  if (list) {
    return `目前知識庫沒有「${list}」的標準話術，無法依建檔資料回答。請改問 X-TRAIL、KICKS 或已收錄競品；若應納入題庫，可加入「待新增題庫清單」。`;
  }
  return "此問題與目前話術知識庫內容不符，無法依建檔資料回答，請換個方式提問，或加入「待新增題庫清單」。";
}

const META_SENTENCE =
  /可參考以下|依知識庫整理|這份(摘要|彙整|關於|重點|材料)?|以下(為|整理|摘要)|知識庫主要|存放於.*資料夾|涵蓋了|整理了.*重點|業代快速重點|Insights/i;

/** 移除 Markdown 列點殘留（主要來自 Data Agent / Gemini 輸出，非 BQ 原文） */
export function stripMarkdownArtifacts(text: string): string {
  let s = text.replace(/\r\n/g, "\n");

  s = s
    .replace(/\[object Object\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/#{1,6}\s*/g, "");

  // 行首 markdown 列點：- / * / +
  s = s.replace(/^\s*[-*+]\s+/gm, "");

  // 句末或句間殘留：「。 -」「。 *」「。 * 重點」
  s = s.replace(/([。；])\s*[-–—*]+\s*/g, "$1 ");
  s = s.replace(/\s+[-–—*]+\s+(?=[重點建議強調說明可強調可回覆])/g, " ");
  s = s.replace(/\s+\*\s+/g, " ");

  // 尾端孤立符號：「…優勢。 -」「…反應。 *」
  s = s.replace(/\s+[-–—*]{1,3}(?=\s|$)/g, "");
  s = s.replace(/[-–—*]{1,3}\s*$/g, "");

  // 合併多餘空白與空行
  s = s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[-–—*]+$/.test(line))
    .join("\n");

  return s.replace(/\s+/g, " ").trim();
}

function trimBullet(text: string): string {
  let s = normalizeReplyLine(text).replace(/。$/, "");
  if (s.length > MAX_BULLET_CHARS) {
    const cut = s.slice(0, MAX_BULLET_CHARS);
    const pause = Math.max(cut.lastIndexOf("，"), cut.lastIndexOf("、"));
    s = (pause > 80 ? cut.slice(0, pause) : cut).trim() + "…";
  }
  return s;
}

function trimAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const pause = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf("！"),
    cut.lastIndexOf("？"),
  );
  if (pause >= 24) return cut.slice(0, pause + 1).trim();
  return `${cut.trim()}…`;
}

function trimBulletGentle(text: string): string {
  const s = normalizeReplyLine(text).replace(/。$/, "");
  return trimAtSentence(s, DATA_AGENT_FORMAT_BULLET_MAX_CHARS);
}

/** 單行回覆：先清 markdown，再清 meta 套話 */
export function normalizeReplyLine(text: string): string {
  return stripMetaPhrases(stripMarkdownArtifacts(text));
}

/** 移除 AI 常見的 meta 套話 */
export function stripMetaPhrases(text: string): string {
  let s = text
    .replace(/可參考以下回應方向[：:]\s*/gi, "")
    .replace(/依知識庫整理如下[：:]\s*/gi, "")
    .trim();

  s = s.replace(/這份\S{0,24}?(整理了|彙整了|涵蓋了|存放於)/g, "");
  s = s.replace(/以下\S{0,16}?(整理了|彙整|摘要)[：:，,]?\s*/g, "");
  s = s.replace(/^(整理了|彙整了|涵蓋了)\s*/i, "");
  s = s.replace(/^針對[^，。]{2,40}[，,]\s*/i, "");
  return s.replace(/\s+/g, " ").trim();
}

function isNearDuplicate(a: string, b: string): boolean {
  if (!a || !b) return false;
  const n = Math.min(28, a.length, b.length);
  if (n < 12) return false;
  return a.slice(0, n) === b.slice(0, n) || a.includes(b.slice(0, 20)) || b.includes(a.slice(0, 20));
}

function isJunkFragment(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return true;
  if (/^[-–—*]+$/.test(t)) return true;
  if (/^[-–—*]+\s*$/.test(t)) return true;
  if (/^(建議|說明|強調)[，,]?\s*$/.test(t)) return true;
  if (/[，,]\s*$/.test(t) && !/[。！？]/.test(t) && t.length < 40) return true;
  return false;
}

export function isMetaSentence(text: string): boolean {
  const t = normalizeReplyLine(text).trim();
  if (t.length < 6) return true;
  if (META_SENTENCE.test(t)) return true;
  if (/^(這份|以下|整理了|彙整了|涵蓋了)/.test(t)) return true;
  if (/^(整理|彙整|摘要|存放於)/.test(t) && t.length < 50) return true;
  return false;
}

function splitMergedBullets(bullets: string[]): string[] {
  const out: string[] = [];
  for (const raw of bullets) {
    const parts = raw
      .split(/\s*[-–—]\s+(?=[建議|強調|可強調|重點|可回覆])/)
      .flatMap((p) => p.split(/(?<=[。；])\s*(?=[*]\s*(?:重點|建議|強調|可)|建議|強調|可強調)/))
      .flatMap((p) => p.split(/\s+\*\s+/))
      .map((p) => normalizeReplyLine(p))
      .map((p) => p.trim())
      .filter((p) => p.length >= 6 && !isJunkFragment(p));
    out.push(...(parts.length > 0 ? parts : [normalizeReplyLine(raw)]).filter((p) => !isJunkFragment(p)));
  }
  return out;
}

/** Data Agent 加工用：不拆「重點／建議」、僅在句號處略裁切 */
export function polishSalesReplyGentle(
  intro: string,
  bullets: string[],
): { intro: string; bullets: string[] } {
  let cleanedBullets = bullets
    .map((b) => trimBulletGentle(b))
    .filter((b) => b.length >= 8 && !isMetaSentence(b) && !isJunkFragment(b));

  const seen = new Set<string>();
  cleanedBullets = cleanedBullets.filter((b) => {
    const key = b.slice(0, 28);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cleanedBullets = cleanedBullets.slice(0, DATA_AGENT_FORMAT_MAX_BULLETS);

  let cleanedIntro = normalizeReplyLine(intro).replace(/^#+\s*/gm, "");
  if (cleanedIntro.includes("\n")) {
    cleanedIntro = cleanedIntro.split(/\n+/).map((p) => p.trim()).filter(Boolean)[0] ?? "";
  }
  if (isMetaSentence(cleanedIntro)) cleanedIntro = "";
  if (cleanedIntro) cleanedIntro = trimAtSentence(cleanedIntro, DATA_AGENT_FORMAT_INTRO_MAX_CHARS);

  if (!cleanedIntro && cleanedBullets.length > 0) {
    cleanedIntro = trimAtSentence(cleanedBullets[0], DATA_AGENT_FORMAT_INTRO_MAX_CHARS);
    cleanedBullets = cleanedBullets.slice(1);
  }

  cleanedBullets = cleanedBullets.filter((b) => !isNearDuplicate(cleanedIntro, b));
  return { intro: cleanedIntro, bullets: cleanedBullets };
}

/** 無具體事實的空泛列點（整理後過濾） */
const VAGUE_DATA_AGENT_BULLET =
  /系統內建|專屬試算|專屬檔|專屬計算|可進行(查詢|分析|試算)|建議查詢|可協助|運用.*(數據|資料).*說明|存在.*(檔案|資料)|提供.*預算參考|進行更深入|客製化諮詢/i;

/** 資料源沒有卻硬列的「未載明」句（應整條省略） */
const ABSENT_DATA_BULLET =
  /原文未載明|知識庫未載明|題庫未載明|未載明|無相關數據|無.*相關數據|沒有.*數據|查無.*(數據|資料)|無法提供.*(數據|資料)|資料不足|未取得|缺乏.*數據/i;

export function isAbsentDataBullet(text: string): boolean {
  return ABSENT_DATA_BULLET.test(text.trim());
}

function hasConcreteFact(text: string): boolean {
  if (isAbsentDataBullet(text)) return false;
  if (/\d/.test(text)) return true;
  if (/[VvＶ]\d|Lv\d|MHEV|Turbo|Hybrid|油電|汽油/i.test(text)) return true;
  return text.length >= 48 && !VAGUE_DATA_AGENT_BULLET.test(text);
}

function isVagueDataAgentBullet(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  if (hasConcreteFact(t)) return false;
  return VAGUE_DATA_AGENT_BULLET.test(t);
}

/** Data Agent 整理：保留全部列點，不將第一點挪作小結 */
export function polishDataAgentReply(intro: string, bullets: string[]): { intro: string; bullets: string[] } {
  let cleanedBullets = bullets
    .map((b) => trimBulletGentle(b))
    .filter(
      (b) =>
        b.length >= 8 &&
        !isMetaSentence(b) &&
        !isJunkFragment(b) &&
        !isVagueDataAgentBullet(b) &&
        !isAbsentDataBullet(b),
    );

  const seen = new Set<string>();
  cleanedBullets = cleanedBullets.filter((b) => {
    const key = b.slice(0, 28);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cleanedBullets = cleanedBullets.slice(0, DATA_AGENT_FORMAT_MAX_BULLETS);

  let cleanedIntro = normalizeReplyLine(intro.replace(/^小結[：:]\s*/i, ""));
  if (cleanedIntro.includes("\n")) {
    cleanedIntro = cleanedIntro.split(/\n+/).map((p) => p.trim()).filter(Boolean)[0] ?? "";
  }
  if (isMetaSentence(cleanedIntro) || isAgentMetaTitle(cleanedIntro)) cleanedIntro = "";
  if (cleanedIntro && (isVagueDataAgentBullet(cleanedIntro) || isAbsentDataBullet(cleanedIntro))) {
    cleanedIntro = "";
  }
  if (cleanedIntro) {
    cleanedIntro = trimAtSentence(cleanedIntro, DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS);
  }

  cleanedBullets = cleanedBullets.filter((b) => !isNearDuplicate(cleanedIntro, b));
  if (!cleanedIntro && cleanedBullets.length > 0) {
    cleanedIntro = ensureDataAgentSummary("", cleanedBullets);
  }
  return { intro: cleanedIntro, bullets: cleanedBullets };
}

/** 整理 intro + bullets，去除套話並補上直接結論句 */
export function polishSalesReply(intro: string, bullets: string[]): { intro: string; bullets: string[] } {
  let cleanedBullets = splitMergedBullets(bullets)
    .map(trimBullet)
    .filter((b) => b.length >= 6 && !isMetaSentence(b));

  const seen = new Set<string>();
  cleanedBullets = cleanedBullets.filter((b) => {
    const key = b.slice(0, 24);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cleanedBullets = cleanedBullets.slice(0, MAX_BULLETS);

  let cleanedIntro = normalizeReplyLine(intro);
  if (cleanedIntro.includes("\n")) {
    cleanedIntro = cleanedIntro.split(/\n+/).map((p) => p.trim()).filter(Boolean)[0] ?? "";
  }
  if (isMetaSentence(cleanedIntro)) cleanedIntro = "";

  if (!cleanedIntro && cleanedBullets.length > 0) {
    const first = cleanedBullets[0];
    const clause = first.match(/^(.{12,68}?)([，,；]|$)/)?.[1] ?? first.slice(0, MAX_INTRO_CHARS);
    if (!isMetaSentence(clause)) cleanedIntro = clause.trim();
  }

  if (cleanedIntro.length > MAX_INTRO_CHARS) {
    const cut = cleanedIntro.slice(0, MAX_INTRO_CHARS);
    const pause = Math.max(cut.lastIndexOf("，"), cut.lastIndexOf("、"));
    cleanedIntro = (pause > 20 ? cut.slice(0, pause) : cut).trim();
  }

  if (cleanedIntro && cleanedBullets.length > 0 && isNearDuplicate(cleanedIntro, cleanedBullets[0])) {
    if (cleanedBullets[0].length >= cleanedIntro.length) {
      cleanedBullets = cleanedBullets.slice(1);
    } else {
      cleanedIntro = "";
    }
  }

  cleanedBullets = cleanedBullets.filter((b) => !isNearDuplicate(cleanedIntro, b));

  return { intro: cleanedIntro, bullets: cleanedBullets };
}

/** 將話術／AI 回覆整理為列點（建議、強調、說明等） */
export function extractBulletPoints(text: string, maxBullets = MAX_BULLETS): string[] {
  const normalized = stripMarkdownArtifacts(text.replace(/\n+/g, "\n"));
  if (!normalized) return [];

  const numbered = normalized
    .split(/\s*(?=\d+[.、)）]\s)/)
    .map((c) => c.replace(/^\d+[.、)）]\s*/, "").trim())
    .filter((c) => c.length > 8);

  if (numbered.length >= 2) {
    return polishSalesReply("", numbered).bullets.slice(0, maxBullets);
  }

  const byKeyword = normalized
    .split(/(?=(?:建議|強調|說明|可強調|可回覆|重點是|最後|應將|可再以|亦可|重申))/g)
    .map((c) => c.trim())
    .filter((c) => c.length > 8)
    .map(trimBullet);

  if (byKeyword.length >= 2) {
    return polishSalesReply("", byKeyword).bullets.slice(0, maxBullets);
  }

  const sentences = normalized
    .split(/(?<=[。；])/)
    .map((s) => normalizeReplyLine(s.trim()))
    .filter((s) => s.replace(/。$/, "").length > 8 && !isJunkFragment(s))
    .map((s) => trimBullet(s.replace(/。$/, "")));

  if (sentences.length >= 1) {
    return polishSalesReply("", sentences).bullets.slice(0, maxBullets);
  }

  const single = trimBullet(normalized.slice(0, MAX_BULLET_CHARS));
  return isMetaSentence(single) ? [] : [single];
}

function pickIntroFromText(text: string, bullets: string[]): string {
  const head = normalizeReplyLine(text.split(/\n+/)[0] ?? "");
  if (head.length >= 8 && head.length <= MAX_INTRO_CHARS + 8 && !isMetaSentence(head)) {
    return head.length > MAX_INTRO_CHARS
      ? head.slice(0, MAX_INTRO_CHARS).replace(/[，,][^，,]*$/, "")
      : head;
  }
  return polishSalesReply("", bullets).intro;
}

export function isUsableReply(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("[object Object]")) return false;
  return true;
}

export function isValidCitation(c: ScriptCitation): boolean {
  return Boolean(c.script?.trim() && c.script.length > 10 && c.script !== "（無建議話術）");
}

/** 自題庫話術產生列點回覆 */
export function buildBulletReplyFromCitations(citations: ScriptCitation[]): {
  intro: string;
  bullets: string[];
} {
  const primary = citations.find((c) => c.script && c.script.length > 10);
  if (!primary) {
    return { intro: "", bullets: [] };
  }

  const bullets = extractBulletPoints(primary.script);
  const { intro, bullets: polished } = polishSalesReply("", bullets);
  return { intro, bullets: polished };
}

/** 自 Gemini 或長文本產生列點 */
export function buildBulletReplyFromText(text: string): { intro: string; bullets: string[] } {
  const bullets = extractBulletPoints(text);
  const intro = pickIntroFromText(text, bullets);
  return polishSalesReply(intro, bullets);
}

/**
 * Data Agent 原始回覆：僅依換行／編號切段，不裁字、不拆「重點／建議」關鍵字。
 */
export function parseDataAgentRawReply(raw: string): { intro: string; bullets: string[] } {
  const text = raw.replace(/\r\n/g, "\n").replace(/\[object Object\]/g, "").trim();
  if (!text) return { intro: "", bullets: [] };

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const numbered: string[] = [];
  const other: string[] = [];
  for (const line of lines) {
    if (/^\d+[.、)）]\s/.test(line)) {
      numbered.push(line.replace(/^\d+[.、)）]\s+/, "").trim());
    } else {
      other.push(line);
    }
  }
  if (numbered.length > 0) {
    return { intro: other.join("\n").trim(), bullets: numbered };
  }

  const mdBullets: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    if (/^[-*•]\s+/.test(line)) {
      mdBullets.push(line.replace(/^[-*•]\s+/, "").trim());
    } else {
      rest.push(line);
    }
  }
  if (mdBullets.length > 0) {
    return { intro: rest.join("\n").trim(), bullets: mdBullets };
  }

  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 2) {
    return { intro: paras[0], bullets: paras.slice(1) };
  }

  return { intro: text, bullets: [] };
}

/** 移除行內 markdown（保留換行） */
export function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

const AGENT_META_TITLE = /^(insights|重點摘要|摘要|分析結果|核心特色與優勢)$/i;
const AGENT_META_PRELUDE =
  /^根據(檢索|知識庫)|以下為|主要(特色|重點)可歸納|可歸納為以下/i;

/** Data Agent 常見無用標題（Insights 等） */
export function isAgentMetaTitle(text: string): boolean {
  const t = cleanInlineMarkdown(text).trim();
  if (!t || t.length > 80) return false;
  if (AGENT_META_TITLE.test(t)) return true;
  if (AGENT_META_PRELUDE.test(t)) return true;
  return false;
}

/** 從列點補一句小結（不刪除任何列點） */
export function ensureDataAgentSummary(intro: string, bullets: string[]): string {
  let s = cleanInlineMarkdown(intro.replace(/^小結[：:]\s*/i, "")).trim();
  if (s && !isAgentMetaTitle(s) && !isMetaSentence(s)) {
    return trimAtSentence(s, DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS);
  }
  if (bullets.length === 0) return "";

  const first = bullets[0];
  const titled = first.match(/^([^：:]{2,16})[：:]\s*(.+)$/);
  if (titled) {
    return trimAtSentence(titled[2].trim(), DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS);
  }
  return trimAtSentence(first, DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS);
}

/** Data Agent：保留小結 + 列點（不套用 finalizeBulletsOnlyReply 清空 intro） */
export function sanitizeDataAgentDisplay(intro: string, bullets: string[]): {
  intro: string;
  bullets: string[];
} {
  const cleanedBullets = bullets
    .map((b) => cleanInlineMarkdown(b.replace(/^\*+\s*/, "").trim()))
    .filter((b) => b.length >= 6 && !isAbsentDataBullet(b));

  if (cleanedBullets.length === 0) {
    const only = ensureDataAgentSummary(intro, []);
    return { intro: only, bullets: [] };
  }

  const summary = ensureDataAgentSummary(intro, cleanedBullets);
  const deduped = cleanedBullets.filter((b) => !summary || !isNearDuplicate(summary, b));
  return {
    intro: summary,
    bullets: deduped.length > 0 ? deduped : cleanedBullets,
  };
}

/** 有列點時只顯示重點，不顯示 Insights 等標題／導言 */
export function finalizeBulletsOnlyReply(intro: string, bullets: string[]): {
  intro: string;
  bullets: string[];
} {
  const cleanBullets = bullets.map((b) => cleanInlineMarkdown(b)).filter((b) => b.length >= 4);
  if (cleanBullets.length === 0) {
    const introText = isAgentMetaTitle(intro) ? "" : cleanInlineMarkdown(intro);
    return { intro: introText, bullets: [] };
  }
  return { intro: "", bullets: cleanBullets };
}

/**
 * 將 Data Agent / Gemini 的 markdown 回覆整理為 intro + 列點（供 UI 顯示）
 */
export function formatMarkdownReplyToDisplay(text: string): { intro: string; bullets: string[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const prelude: string[] = [];
  const bullets: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || /^[-–—*]+$/.test(line)) continue;

    const heading = line.match(/^#{1,6}\s*(.+)$/);
    if (heading) {
      const h = cleanInlineMarkdown(heading[1]);
      if (!isAgentMetaTitle(h)) title = h;
      continue;
    }

    if (isAgentMetaTitle(line)) continue;

    const numberedBold = line.match(/^\d+[.)）]\s*\*\*([^*]+)\*\*\s*[：:]\s*(.+)$/);
    if (numberedBold) {
      bullets.push(
        `${cleanInlineMarkdown(numberedBold[1])}：${cleanInlineMarkdown(numberedBold[2])}`,
      );
      continue;
    }

    const boldBullet = line.match(/^[-*•]\s*\*\*([^*]+)\*\*\s*[：:]\s*(.+)$/);
    if (boldBullet) {
      bullets.push(
        `${cleanInlineMarkdown(boldBullet[1])}：${cleanInlineMarkdown(boldBullet[2])}`,
      );
      continue;
    }

    const plainBullet = line.match(/^[-*•]\s+(.+)$/);
    if (plainBullet) {
      bullets.push(cleanInlineMarkdown(plainBullet[1]));
      continue;
    }

    const inlineBoldLead = line.match(/^\*\*([^*]+)\*\*\s*[：:]\s*(.+)$/);
    if (inlineBoldLead) {
      bullets.push(
        `${cleanInlineMarkdown(inlineBoldLead[1])}：${cleanInlineMarkdown(inlineBoldLead[2])}`,
      );
      continue;
    }

    const cleaned = cleanInlineMarkdown(line);
    if (isAgentMetaTitle(cleaned) || AGENT_META_PRELUDE.test(cleaned)) continue;

    if (!title && prelude.length === 0 && bullets.length === 0) {
      prelude.push(cleaned);
    } else if (bullets.length === 0) {
      prelude.push(cleaned);
    } else {
      bullets.push(cleaned);
    }
  }

  const intro = [...(title ? [title] : []), ...prelude].join("\n").trim();
  return finalizeBulletsOnlyReply(intro, bullets);
}

/** 濃縮／Data Agent 回覆送前端前一律清 markdown、只留列點 */
export function sanitizeSalesChatDisplay(intro: string, bullets: string[]): {
  intro: string;
  bullets: string[];
} {
  const cleanedBullets = bullets
    .map((b) => cleanInlineMarkdown(b.replace(/^\*+\s*/, "").trim()))
    .filter((b) => b.length >= 4);

  if (cleanedBullets.length > 0) {
    return finalizeBulletsOnlyReply("", cleanedBullets);
  }

  const combined = [intro, ...bullets].filter(Boolean).join("\n").trim();
  if (!combined) return { intro: "", bullets: [] };
  return formatMarkdownReplyToDisplay(combined);
}
