/**
 * 訓練素材匯入：副檔名、忽略規則、車款（product_line）推斷。
 * 目錄慣例：{TRAINING_MATERIALS_ROOT}/{product_line}/檔案…
 */

/** 平台級來源識別（非車款名） */
export const TRAINING_SOURCE_SYSTEM = "ynm_training";

export const TRAINING_PARSEABLE_EXTENSIONS = [".xlsx", ".xls", ".pdf", ".pptx", ".ppt"] as const;

export const TRAINING_REGISTER_ONLY_EXTENSIONS = [
  ".csv",
  ".docx",
  ".doc",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

export const TRAINING_ALL_KNOWN_EXTENSIONS = [
  ...TRAINING_PARSEABLE_EXTENSIONS,
  ...TRAINING_REGISTER_ONLY_EXTENSIONS,
] as const;

export const TRAINING_IGNORE_PATH_FRAGMENTS = [
  "~$",
  ".ds_store",
  "thumbs.db",
  "__macosx",
  ".git",
  "node_modules",
] as const;

/** 共用素材（跨車款），檢索時不綁單一 product_line 時可一併命中 */
export const COMMON_PRODUCT_LINE = "_common";

export function normalizeProductLine(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

export function shouldIgnoreRelativePath(relativePath: string): boolean {
  const lower = relativePath.replace(/\\/g, "/").toLowerCase();
  return TRAINING_IGNORE_PATH_FRAGMENTS.some((frag) => lower.includes(frag.toLowerCase()));
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i).toLowerCase() : "";
}

export function isParseableExtension(ext: string): boolean {
  return (TRAINING_PARSEABLE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isKnownExtension(ext: string): boolean {
  return (TRAINING_ALL_KNOWN_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * 從匯入根目錄與相對路徑推斷車款。
 * - 若 root 為 …/training-materials/xtrail-ice，則 product_line=xtrail-ice
 * - 若檔案在子目錄 xtrail-ice/foo.pdf，第一層目錄為車款
 */
export function inferProductLine(options: {
  materialsRoot: string;
  ingestRoot: string;
  relativePath: string;
  explicitProductLine?: string;
}): string {
  if (options.explicitProductLine) {
    return normalizeProductLine(options.explicitProductLine);
  }

  const rootName = normalizeProductLine(pathBasename(options.ingestRoot));
  const materialsName = normalizeProductLine(pathBasename(options.materialsRoot));
  const parts = options.relativePath.replace(/\\/g, "/").split("/").filter(Boolean);

  if (options.ingestRoot !== options.materialsRoot && rootName && rootName !== materialsName) {
    return rootName;
  }

  if (parts.length >= 2) {
    const first = normalizeProductLine(parts[0]);
    if (first && first !== "training-materials") return first;
  }

  return COMMON_PRODUCT_LINE;
}

function pathBasename(p: string): string {
  const norm = p.replace(/\\/g, "/").replace(/\/$/, "");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

/** 路徑標籤（模組資料夾等），不含車款根目錄 */
export function tagsFromRelativePath(relativePath: string, productLine: string): string[] {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  let start = 0;
  if (normalizeProductLine(parts[0]) === productLine) start = 1;
  const tags = parts
    .slice(start, -1)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length < 80);
  const withLine = [productLine, ...tags].filter((t) => t && t !== COMMON_PRODUCT_LINE);
  return [...new Set(withLine)].slice(0, 10);
}

export function mimeTypeForExtension(ext: string): string | null {
  const map: Record<string, string> = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return map[ext] ?? null;
}
