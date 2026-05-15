import fs from "fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const EXPIRY_DAYS = 7;

export type LegalChecklistItem = { id: string; label: string; checked: boolean };

export type LegalReviewFile = {
  token: string;
  questionId: string;
  questionText: string;
  standardScript: string;
  checklist: LegalChecklistItem[];
  comments: string;
  createdAt: string;
  expiresAt: string;
};

export const DEFAULT_LEGAL_CHECKLIST: Omit<LegalChecklistItem, "checked">[] = [
  { id: "abs", label: "無絕對化或未經證實的承諾用語" },
  { id: "comp", label: "無未授權的競品比較或貶抑" },
  { id: "brand", label: "符合品牌語氣與合規宣稱範圍" },
  { id: "privacy", label: "未蒐集或暗示不當索取客戶隱私" },
];

function dataDir() {
  return path.join(process.cwd(), ".data", "legal-reviews");
}

function ensureDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
}

function tokenPath(token: string) {
  return path.join(dataDir(), `${token}.json`);
}

function readReviewFile(token: string): LegalReviewFile | null {
  const p = tokenPath(token);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as LegalReviewFile;
  } catch {
    return null;
  }
}

export function createLegalReview(
  questionId: string,
  questionText: string,
  standardScript: string,
): LegalReviewFile {
  ensureDir();
  const token = randomBytes(24).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 86400000);
  const row: LegalReviewFile = {
    token,
    questionId,
    questionText,
    standardScript,
    checklist: DEFAULT_LEGAL_CHECKLIST.map((x) => ({ ...x, checked: false })),
    comments: "",
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  fs.writeFileSync(tokenPath(token), JSON.stringify(row, null, 2), "utf8");
  return row;
}

export function getLegalReview(token: string): LegalReviewFile | null {
  const r = readReviewFile(token);
  if (!r) return null;
  if (new Date(r.expiresAt).getTime() < Date.now()) return null;
  return r;
}

export function updateLegalReview(
  token: string,
  patch: { checklist?: LegalChecklistItem[]; comments?: string },
): LegalReviewFile | null {
  const cur = readReviewFile(token);
  if (!cur) return null;
  if (new Date(cur.expiresAt).getTime() < Date.now()) return null;
  const next: LegalReviewFile = {
    ...cur,
    checklist: patch.checklist ?? cur.checklist,
    comments: patch.comments !== undefined ? patch.comments : cur.comments,
  };
  fs.writeFileSync(tokenPath(token), JSON.stringify(next, null, 2), "utf8");
  return next;
}
