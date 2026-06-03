/**
 * PDF/PPT text_chunk：區分「引用標題 title」與「檢索用 customer_question」。
 * - title：檔名 + 頁碼（給 UI 引用）
 * - customer_question：檔名線索 + 內文摘要（給 BQ LIKE / rerank）
 * - standard_script：完整頁面內文（不變）
 */

const NOISE_LINE =
  /all rights reserved|confidential|yulon\s*nissan|do not use|permission|copyright|^\d+\s*$/i;

const FILE_LOCATOR_ONLY =
  /^.+\.(pdf|pptx|ppt)\s*\((?:page|slide)\s*\d+\)\s*$/i;

const SPEC_TOKEN =
  /\d+(?:\.\d+)?\s*(?:ps|PS|kgm|kg·m|kgm|km\/L|km\/l|匹|公里\/公升|公斤米|牛頓米|Nm)/gi;

/** 是否僅為「檔名 (page N)」、尚無內文摘要 */
export function isFileLocatorOnlyCustomerQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes(" · ")) return false;
  return FILE_LOCATOR_ONLY.test(t);
}

export function extractScriptExcerpt(script: string, maxChars = 380): string {
  const lines = script
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const meaningful: string[] = [];
  for (const line of lines) {
    if (NOISE_LINE.test(line)) continue;
    const cjk = (line.match(/[\u4e00-\u9fff]/g) ?? []).length;
    if (cjk < 2 && line.length < 24) continue;
    meaningful.push(line);
    if (meaningful.join(" ").length >= maxChars) break;
    if (meaningful.length >= 8) break;
  }

  let out = meaningful.join(" ").replace(/\s+/g, " ").trim();
  const specs = [...script.matchAll(SPEC_TOKEN)].map((m) => m[0].trim()).slice(0, 6);
  for (const token of specs) {
    if (!out.toLowerCase().includes(token.toLowerCase().replace(/\s+/g, ""))) {
      out = out ? `${out} ${token}` : token;
    }
  }
  return out.slice(0, maxChars);
}

export type ChunkSearchFields = {
  title: string;
  customer_question: string;
};

/**
 * @param fileName 原始檔名（含副檔名）
 * @param locatorKey page | slide
 * @param loc 頁碼
 */
export function buildChunkSearchFields(
  fileName: string,
  locatorKey: "page" | "slide",
  loc: number,
  script: string,
): ChunkSearchFields {
  const title = `${fileName} (${locatorKey} ${loc})`;
  const excerpt = extractScriptExcerpt(script);
  const stem = fileName.replace(/\.(pdf|pptx|ppt)$/i, "").trim();
  const customer_question = excerpt
    ? `${stem} (${locatorKey} ${loc}) · ${excerpt}`.replace(/\s+/g, " ").trim().slice(0, 500)
    : title.slice(0, 500);

  return {
    title: title.slice(0, 300),
    customer_question,
  };
}

/** xlsx table_row：檔名 + 工作表 + 內文摘要（供 BQ 檢索） */
export function buildTableRowSearchQuestion(
  fileName: string,
  sheet: string,
  script: string,
): string {
  const stem = fileName.replace(/\.(xlsx|xls)$/i, "").trim();
  const excerpt = extractScriptExcerpt(script, 280);
  const base = `${stem} / ${sheet}`;
  return excerpt ? `${base} · ${excerpt}`.replace(/\s+/g, " ").trim().slice(0, 500) : base;
}

/** backfill：xlsx table_row 由 title（檔名 / sheet）+ script 重建 customer_question */
export function rebuildTableRowSearchFields(input: {
  title?: string | null;
  fileName?: string | null;
  standard_script: string;
}): ChunkSearchFields | null {
  const script = input.standard_script?.trim() ?? "";
  if (!script) return null;

  let fileName = input.fileName?.trim() ?? "";
  let sheet = "Sheet1";
  const title = input.title?.trim() ?? "";
  const m = title.match(/^(.+\.(?:xlsx|xls))\s*\/\s*(.+)$/i);
  if (m) {
    fileName = fileName || m[1].trim();
    sheet = m[2].trim();
  } else if (fileName && !fileName.toLowerCase().endsWith(".xlsx")) {
    fileName = `${fileName}.xlsx`;
  }
  if (!fileName) return null;

  const displayTitle = title || `${fileName} / ${sheet}`;
  return {
    title: displayTitle.slice(0, 300),
    customer_question: buildTableRowSearchQuestion(fileName, sheet, script),
  };
}

/** backfill：由既有 title / customer_question + script 重建檢索欄 */
export function rebuildChunkCustomerQuestion(input: {
  fileName?: string | null;
  title?: string | null;
  customer_question?: string | null;
  standard_script: string;
}): ChunkSearchFields | null {
  const script = input.standard_script?.trim() ?? "";
  if (!script) return null;

  let title = input.title?.trim() ?? "";
  let fileName = input.fileName?.trim() ?? "";

  const cq = input.customer_question?.trim() ?? "";
  if (!title && cq) title = cq;

  const m = title.match(/^(.+\.(pdf|pptx|ppt))\s*\((page|slide)\s*(\d+)\)/i);
  if (m) {
    fileName = fileName || m[1];
    const locatorKey = m[3].toLowerCase() === "slide" ? "slide" : "page";
    const loc = Number(m[4]);
    if (Number.isFinite(loc)) {
      return buildChunkSearchFields(fileName, locatorKey as "page" | "slide", loc, script);
    }
  }

  if (fileName) {
    const pageInScript = script.match(/page\s*(\d+)/i);
    const loc = pageInScript ? Number(pageInScript[1]) : 1;
    return buildChunkSearchFields(fileName, "page", loc, script);
  }

  if (!isFileLocatorOnlyCustomerQuestion(cq)) return null;

  const excerpt = extractScriptExcerpt(script);
  if (!excerpt) return { title: cq.slice(0, 300), customer_question: cq };

  return {
    title: cq.slice(0, 300),
    customer_question: `${cq} · ${excerpt}`.slice(0, 500),
  };
}
