import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { findBestDuplicate, normalizeText } from "@/lib/duplicate/checker";
import { parseWorkbookBuffer } from "./parse-workbook";
import { appStateToWorkbookBuffer } from "./write-workbook";
import { loadClarificationStore, saveClarificationStore } from "./clarification-store";
import type { AppState, Expert, ExpertSuggestion, Notification, Question, QuestionTag } from "./types";
import { resolveIncomingWorkbookPath, resolveMainWorkbookPath } from "./paths";

const REQUIRED_CODES = ["ES", "UL", "YJ", "EM", "YF", "HL", "KT", "YA", "MSD"] as const;

type IncomingPreview = {
  workbookPath: string;
  loadedAt: string;
  items: Array<{ text: string; source: string; sourceQuestionId: string }>;
  missingCodes: string[];
  expertCodes: string[];
  incomingSuggestions: Record<string, Array<{ expertCode: string; content: string }>>;
};

type GlobalStore = { state?: AppState; incoming?: IncomingPreview };

const EXPERT_PERSONA_BY_CODE: Record<string, { style: string }> = {
  ES: { style: "我先把總持有成本講白，避免只比單一數字。" },
  UL: { style: "我會先同理客戶，再補上實際使用差異。" },
  YJ: { style: "我習慣先講重點，再引導到試乘體驗。" },
  EM: { style: "我會用安全情境說明，讓客戶更有感。" },
  YF: { style: "我會用比較口語、比較貼近客戶的方式回覆。" },
  HL: { style: "我會補同級比較脈絡，避免只卡在單一配備。" },
  KT: { style: "我習慣先講結論，再補關鍵理由。" },
  YA: { style: "我會用家庭用車情境來講，讓客戶更快代入。" },
  MSD: { style: "我負責把前面八位重點整合成可直接使用的版本。" },
};

function getGlobal(): GlobalStore {
  const g = globalThis as typeof globalThis & { __ynmExcelStore?: GlobalStore };
  if (!g.__ynmExcelStore) {
    g.__ynmExcelStore = {};
  }
  return g.__ynmExcelStore;
}

function nowIso() {
  return new Date().toISOString();
}

function persistClarificationState(state: AppState) {
  const questionIds = new Set(
    state.questions.filter((q) => q.status === "pending_clarification").map((q) => q.id),
  );
  saveClarificationStore({
    questions: state.questions.filter((q) => q.status === "pending_clarification"),
    questionTags: state.questionTags.filter((x) => questionIds.has(x.questionId)),
    expertSuggestions: state.expertSuggestions.filter((x) => questionIds.has(x.questionId)),
    notifications: state.notifications.filter((x) => questionIds.has(x.questionId)),
  });
}

function displayNameFromRaw(name: string) {
  const normalized = name.replace(/\s+/g, " ").trim();
  const matched = normalized.match(/^[A-Z]{2,4}\s+(.+)$/);
  if (matched) return matched[1].trim();
  return normalized;
}

function cleanQuestionPrefix(text: string) {
  return text
    .replace(/^【[^】]*】/, "")
    .replace(/^【[^】]*】/, "")
    .trim();
}

/** 由九位專家回覆濃縮成單段法務／前線用話術（無「某某專家：」前綴） */
export function buildStandardScriptParagraph(byCode: Record<string, string>): string {
  const eight = REQUIRED_CODES.filter((c) => c !== "MSD");
  const parts: string[] = [];
  for (const code of eight) {
    const t = byCode[code]?.trim();
    if (!t) continue;
    const first = t.split(/\n/).map((s) => s.trim()).filter(Boolean)[0] ?? t;
    parts.push(first);
  }
  const msd = byCode.MSD?.trim();
  if (msd) {
    const m0 = msd.split(/\n/).map((s) => s.trim()).filter(Boolean)[0] ?? msd;
    parts.push(`整合重點：${m0}`);
  }
  return parts.join(" ");
}

function formatIntegratedReply(byCode: Record<string, string>, namesByCode: Record<string, string>) {
  const orderedCodes = REQUIRED_CODES.filter((code) => code !== "MSD");
  const expertLines = orderedCodes
    .map((code) => {
      const persona = EXPERT_PERSONA_BY_CODE[code];
      const content = byCode[code]?.trim();
      if (!persona || !content) return null;
      return `${namesByCode[code] ?? code}：${persona.style}\n${content}`;
    })
    .filter((line): line is string => Boolean(line));

  const msd = EXPERT_PERSONA_BY_CODE.MSD;
  const summaryPoints = orderedCodes
    .map((code) => {
      const persona = EXPERT_PERSONA_BY_CODE[code];
      const content = byCode[code]?.trim();
      if (!persona || !content) return null;
      const oneLine = content.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? content;
      return `- ${namesByCode[code] ?? code}：${oneLine}`;
    })
    .filter((line): line is string => Boolean(line));

  if (summaryPoints.length === 0) {
    return expertLines.join("\n\n");
  }

  const msdName = namesByCode.MSD ?? "MSD";
  const msdLine = `${msdName}（MSD整合）：${msd.style}\n我幫你整合前面八位專家的重點，建議這樣回：\n${summaryPoints.join("\n")}`;
  return [...expertLines, msdLine].join("\n\n");
}

export function loadWorkbookFromPath(workbookPath: string): AppState {
  const buffer = fs.readFileSync(workbookPath);
  const state = parseWorkbookBuffer(buffer, workbookPath);
  const floating = loadClarificationStore();
  const mainDuplicates = state.questions.filter((q) => q.status === "duplicate");
  state.questions = [...mainDuplicates, ...floating.questions];
  state.questionTags = [
    ...state.questionTags.filter((qt) => mainDuplicates.some((q) => q.id === qt.questionId)),
    ...floating.questionTags,
  ];
  state.expertSuggestions = [
    ...state.expertSuggestions.filter((s) => mainDuplicates.some((q) => q.id === s.questionId)),
    ...floating.expertSuggestions,
  ];
  state.notifications = [...floating.notifications];
  getGlobal().state = state;
  return state;
}

export function loadWorkbookFromBuffer(buffer: Buffer, workbookName: string): AppState {
  const state = parseWorkbookBuffer(buffer, workbookName);
  const floating = loadClarificationStore();
  const mainDuplicates = state.questions.filter((q) => q.status === "duplicate");
  state.questions = [...mainDuplicates, ...floating.questions];
  state.questionTags = [
    ...state.questionTags.filter((qt) => mainDuplicates.some((q) => q.id === qt.questionId)),
    ...floating.questionTags,
  ];
  state.expertSuggestions = [
    ...state.expertSuggestions.filter((s) => mainDuplicates.some((q) => q.id === s.questionId)),
    ...floating.expertSuggestions,
  ];
  state.notifications = [...floating.notifications];
  getGlobal().state = state;
  return state;
}

export function ensureStoreLoaded(): AppState {
  const g = getGlobal();
  if (g.state) {
    return g.state;
  }
  const p = resolveMainWorkbookPath();
  return loadWorkbookFromPath(p);
}

export function getStore(): AppState {
  return ensureStoreLoaded();
}

export function listExpertsByEmailAsc(): Expert[] {
  return [...getStore().experts].sort((a, b) => a.email.localeCompare(b.email));
}

function finalizeReadyPendingQuestions(state: AppState): number {
  const experts = state.experts.filter((e) => e.isActive);
  if (experts.length === 0) return 0;

  const now = nowIso();
  const ready = state.questions.filter((q) => q.status === "pending_clarification" && q.legalStatus === "approved").filter((q) => {
    return experts.every((expert) =>
      state.expertSuggestions.some(
        (s) => s.questionId === q.id && s.expertId === expert.id && s.content.trim().length > 0,
      ),
    );
  });

  for (const q of ready) {
    const byExpertCode = Object.fromEntries(REQUIRED_CODES.map((code) => [code, ""])) as Record<string, string>;
    const namesByCode = Object.fromEntries(REQUIRED_CODES.map((code) => [code, code])) as Record<string, string>;
    for (const expert of experts) {
      const expertCode = (expert.code ?? "").trim().toUpperCase();
      if (!REQUIRED_CODES.includes(expertCode as (typeof REQUIRED_CODES)[number])) continue;
      namesByCode[expertCode] = displayNameFromRaw(expert.name);
      const content =
        state.expertSuggestions.find((s) => s.questionId === q.id && s.expertId === expert.id)?.content ?? "";
      byExpertCode[expertCode] = content.trim();
    }

    q.status = "duplicate";
    q.isDuplicate = true;
    q.duplicateOfId = null;
    q.suggestedReply = formatIntegratedReply(byExpertCode, namesByCode);
    q.standardScript = buildStandardScriptParagraph(byExpertCode);
    q.legalStatus = "none";
    q.legalComments = null;
    q.updatedAt = now;
  }

  return ready.length;
}

export function saveStoreToWorkbook(): { path: string; backupPath: string | null; mergedCount: number } {
  const state = getStore();
  const mergedCount = finalizeReadyPendingQuestions(state);
  persistClarificationState(state);
  const buf = appStateToWorkbookBuffer(state);
  const dir = path.dirname(state.workbookPath);
  const base = path.basename(state.workbookPath, ".xlsx");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(dir, `${base}_backup_${stamp}.xlsx`);
  let backupPathOut: string | null = null;
  try {
    if (fs.existsSync(state.workbookPath)) {
      fs.copyFileSync(state.workbookPath, backupPath);
      backupPathOut = backupPath;
    }
  } catch {
    backupPathOut = null;
  }
  fs.writeFileSync(state.workbookPath, buf);
  return { path: state.workbookPath, backupPath: backupPathOut, mergedCount };
}

export function reloadStoreFromDisk(): AppState {
  const p = resolveMainWorkbookPath();
  return loadWorkbookFromPath(p);
}

export function importCountsFromReload(): {
  importedQuestions: number;
  importedExperts: number;
  importedTags: number;
  importedPending: number;
  path: string;
} {
  const s = reloadStoreFromDisk();
  const dup = s.questions.filter((q) => q.status === "duplicate").length;
  const pending = s.questions.filter((q) => q.status === "pending_clarification").length;
  return {
    importedQuestions: dup,
    importedExperts: s.experts.length,
    importedTags: s.tags.length,
    importedPending: pending,
    path: s.workbookPath,
  };
}

export function getMainWorkbookSummary() {
  const s = ensureStoreLoaded();
  const duplicateQuestions = s.questions.filter((q) => q.status === "duplicate");
  const pendingQuestions = s.questions.filter((q) => q.status === "pending_clarification");
  return {
    workbookPath: s.workbookPath,
    duplicateCount: duplicateQuestions.length,
    pendingCount: pendingQuestions.length,
    expertCount: s.experts.length,
    tagCount: s.tags.length,
    previewRows: duplicateQuestions.slice(0, 10).map((q) => ({
      id: q.id,
      source: q.source,
      question: q.originalText,
      reply: q.suggestedReply,
    })),
    legalReviewCandidates: duplicateQuestions.slice(0, 120).map((q) => ({
      id: q.id,
      question: q.originalText,
      scriptPreview: (q.standardScript ?? "").slice(0, 160),
    })),
  };
}

export function loadIncomingWorkbookForCheck() {
  const p = resolveIncomingWorkbookPath();
  const buffer = fs.readFileSync(p);
  const parsed = parseWorkbookBuffer(buffer, p);
  const expertCodes = [...new Set(parsed.experts.map((x) => x.code?.trim().toUpperCase()).filter(Boolean))] as string[];
  const missingCodes = REQUIRED_CODES.filter((code) => !expertCodes.includes(code));
  const seen = new Set<string>();
  const items = parsed.questions
    .filter((q) => q.status === "duplicate")
    .map((q) => ({ text: q.originalText, source: q.source ?? "Demo 新資料", sourceQuestionId: q.id }))
    .filter((x) => {
      const k = normalizeText(x.text);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const codeByIncomingExpertId = new Map(parsed.experts.map((e) => [e.id, (e.code ?? "").toUpperCase()]));
  const incomingSuggestions: IncomingPreview["incomingSuggestions"] = {};
  for (const s of parsed.expertSuggestions) {
    const code = codeByIncomingExpertId.get(s.expertId);
    if (!code) continue;
    const arr = incomingSuggestions[s.questionId] ?? [];
    arr.push({ expertCode: code, content: s.content });
    incomingSuggestions[s.questionId] = arr;
  }

  const incoming: IncomingPreview = {
    workbookPath: p,
    loadedAt: nowIso(),
    items,
    missingCodes,
    expertCodes,
    incomingSuggestions,
  };
  getGlobal().incoming = incoming;
  return incoming;
}

export function loadIncomingWorkbookForCheckFromBuffer(buffer: Buffer, fileName: string) {
  const parsed = parseWorkbookBuffer(buffer, fileName);
  const expertCodes = [...new Set(parsed.experts.map((x) => x.code?.trim().toUpperCase()).filter(Boolean))] as string[];
  const missingCodes = REQUIRED_CODES.filter((code) => !expertCodes.includes(code));
  const seen = new Set<string>();
  const items = parsed.questions
    .filter((q) => q.status === "duplicate")
    .map((q) => ({ text: q.originalText, source: q.source ?? "Demo 新資料", sourceQuestionId: q.id }))
    .filter((x) => {
      const k = normalizeText(x.text);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const codeByIncomingExpertId = new Map(parsed.experts.map((e) => [e.id, (e.code ?? "").toUpperCase()]));
  const incomingSuggestions: IncomingPreview["incomingSuggestions"] = {};
  for (const s of parsed.expertSuggestions) {
    const code = codeByIncomingExpertId.get(s.expertId);
    if (!code) continue;
    const arr = incomingSuggestions[s.questionId] ?? [];
    arr.push({ expertCode: code, content: s.content });
    incomingSuggestions[s.questionId] = arr;
  }

  const incoming: IncomingPreview = {
    workbookPath: fileName,
    loadedAt: nowIso(),
    items,
    missingCodes,
    expertCodes,
    incomingSuggestions,
  };
  getGlobal().incoming = incoming;
  return incoming;
}

export function getIncomingPreview() {
  return getGlobal().incoming ?? null;
}

export function listIncomingPreview() {
  return getIncomingPreview();
}

function upsertPendingQuestionFromIncoming(item: { text: string; source: string }, duplicateOfId: string | null): Question {
  const s = getStore();
  const normalized = normalizeText(item.text);
  const existed = s.questions.find((q) => q.status === "pending_clarification" && q.normalizedText === normalized);
  if (existed) return existed;

  const t = nowIso();
  const row: Question = {
    id: randomUUID(),
    source: item.source,
    originalText: item.text,
    normalizedText: normalized,
    status: "pending_clarification",
    isDuplicate: false,
    duplicateOfId,
    suggestedReply: "已進入問題待釐清區塊",
    standardScript: null,
    legalStatus: "none",
    legalComments: null,
    duplicateScore: null,
    createdAt: t,
    updatedAt: t,
  };
  s.questions.push(row);
  persistClarificationState(s);
  return row;
}

type WorkflowExpert = {
  id: string;
  code: string;
  name: string;
  isVirtual: boolean;
};

export function listWorkflowExpertsByRequiredCodes(): WorkflowExpert[] {
  const s = getStore();
  const reversed = [...s.experts].reverse();
  return REQUIRED_CODES.map((code) => {
    const found = reversed.find((e) => (e.code ?? "").toUpperCase() === code);
    if (found) {
      return { id: found.id, code, name: displayNameFromRaw(found.name), isVirtual: false };
    }
    return { id: `virtual-${code}`, code, name: `${code}（未建檔）`, isVirtual: true };
  });
}

function applyIncomingSuggestionsToPending(
  incoming: IncomingPreview,
  pendingQuestionId: string,
  sourceQuestionId: string,
): number {
  const rows = incoming.incomingSuggestions[sourceQuestionId] ?? [];
  if (rows.length === 0) return 0;

  const s = getStore();
  const expertsByCode = new Map(
    s.experts.map((e) => [((e.code ?? "").toUpperCase() || e.name.toUpperCase()), e]),
  );
  const t = nowIso();
  let inserted = 0;
  for (const row of rows) {
    const ex = expertsByCode.get(row.expertCode);
    if (!ex) continue;
    const nextContent = (row.content || "").trim();
    if (!nextContent) continue;
    const existed = s.expertSuggestions.find((x) => x.questionId === pendingQuestionId && x.expertId === ex.id);
    if (existed) {
      existed.content = nextContent;
      existed.updatedAt = t;
      continue;
    }
    s.expertSuggestions.push({
      id: randomUUID(),
      questionId: pendingQuestionId,
      expertId: ex.id,
      content: nextContent,
      createdAt: t,
      updatedAt: t,
    });
    inserted += 1;
  }
  return inserted;
}


export function runIncomingDuplicateCheck() {
  const incoming = getIncomingPreview();
  if (!incoming) {
    throw new Error("尚未載入待比對 Excel，請先執行步驟 2。");
  }

  const existing = listDuplicateQuestionsForCheck();
  const rows = incoming.items.map((item, index) => {
    const best = findBestDuplicate(item.text, existing);
    // Demo 來源保留一筆完整回覆案例，強制走待釐清流程供步驟 4 驗證。
    const forcePending = item.sourceQuestionId === "DEMO_QA_1";
    const isDup = forcePending ? false : Boolean(best);
    const pendingId = isDup ? null : upsertPendingQuestionFromIncoming(item, null).id;
    if (!isDup && pendingId) {
      applyIncomingSuggestionsToPending(incoming, pendingId, item.sourceQuestionId);
    }
    return {
      id: `incoming-${index}`,
      originalText: item.text,
      source: item.source,
      isDuplicate: isDup,
      duplicateScore: best?.score ?? null,
      suggestedReply: isDup ? best!.suggestedReply : "待進入問題釐清，請收集專家回覆",
      pendingQuestionId: pendingId,
    };
  });

  return {
    incomingPath: incoming.workbookPath,
    total: rows.length,
    duplicateCount: rows.filter((x) => x.isDuplicate).length,
    toClarifyCount: rows.filter((x) => !x.isDuplicate).length,
    rows,
  };
}

export function listExperts(): Expert[] {
  return [...getStore().experts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function updateExpert(
  id: string,
  data: Partial<Pick<Expert, "code" | "name" | "email" | "groupName" | "isActive">>,
): Expert {
  const s = getStore();
  const e = s.experts.find((x) => x.id === id);
  if (!e) throw new Error("找不到專家");
  if (data.code !== undefined) {
    const nextCode = data.code?.trim().toUpperCase() || null;
    if (nextCode && s.experts.some((x) => x.id !== id && (x.code ?? "").toUpperCase() === nextCode)) {
      throw new Error("代號重複");
    }
    e.code = nextCode;
  }
  if (data.name !== undefined) e.name = data.name.trim();
  if (data.email !== undefined) e.email = data.email.trim();
  if (data.groupName !== undefined) e.groupName = data.groupName?.trim() || null;
  if (data.isActive !== undefined) e.isActive = data.isActive;
  e.updatedAt = nowIso();
  return e;
}

export function createExpert(data: {
  code: string;
  name: string;
  email: string;
  groupName?: string;
  isActive?: boolean;
}): Expert {
  const s = getStore();
  const code = data.code.trim().toUpperCase();
  const name = data.name.trim();
  const email = data.email.trim();
  if (!code || !name || !email) {
    throw new Error("代號、姓名、Email 為必填");
  }
  if (s.experts.some((x) => (x.code ?? "").toUpperCase() === code)) {
    throw new Error("代號重複");
  }
  const t = nowIso();
  const expert: Expert = {
    id: randomUUID(),
    code,
    name,
    email,
    groupName: data.groupName?.trim() || null,
    isActive: data.isActive ?? true,
    createdAt: t,
    updatedAt: t,
  };
  s.experts.push(expert);
  return expert;
}

export function deleteExpert(id: string): { deleted: boolean } {
  const s = getStore();
  const idx = s.experts.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("找不到專家");
  s.experts.splice(idx, 1);
  s.expertSuggestions = s.expertSuggestions.filter((x) => x.expertId !== id);
  s.notifications = s.notifications.filter((x) => x.expertId !== id);
  return { deleted: true };
}

export function listTags() {
  return [...getStore().tags].sort((a, b) =>
    a.level1 === b.level1 ? a.level2.localeCompare(b.level2) : a.level1.localeCompare(b.level1),
  );
}

export function upsertQuestionTag(questionId: string, tagId: string): QuestionTag {
  const s = getStore();
  const existing = s.questionTags.find((x) => x.questionId === questionId && x.tagId === tagId);
  if (existing) return existing;
  const rel: QuestionTag = {
    id: randomUUID(),
    questionId,
    tagId,
    createdAt: nowIso(),
  };
  s.questionTags.push(rel);
  persistClarificationState(s);
  return rel;
}

export function listPendingQuestionsWithTags() {
  const s = getStore();
  const tagById = new Map(s.tags.map((t) => [t.id, t]));
  const pending = s.questions.filter((q) => q.status === "pending_clarification");
  return pending
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((q) => ({
      ...q,
      originalText: cleanQuestionPrefix(String(q.originalText ?? "")),
      tags: s.questionTags
        .filter((qt) => qt.questionId === q.id)
        .map((qt) => ({ tag: tagById.get(qt.tagId)! }))
        .filter((x) => x.tag),
    }));
}

export function listLegalReviewQuestions() {
  return listPendingQuestionsWithTags();
}

export function setQuestionLegalDecision(
  questionId: string,
  decision: "pending_review" | "approved" | "rejected",
  comments?: string,
) {
  const s = getStore();
  const q = s.questions.find((x) => x.id === questionId && x.status === "pending_clarification");
  if (!q) throw new Error("找不到待釐清題目");
  q.legalStatus = decision;
  q.legalComments = comments?.trim() || null;
  q.updatedAt = nowIso();
  persistClarificationState(s);
  return q;
}

export function listActiveExperts() {
  return getStore()
    .experts.filter((e) => e.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listSuggestions(): ExpertSuggestion[] {
  return [...getStore().expertSuggestions];
}

export function getQuestionProgress(questionId: string, expertIds: string[]) {
  const suggestedExpertIds = new Set(
    getStore()
      .expertSuggestions.filter((s) => s.questionId === questionId && s.content.trim().length > 0)
      .map((s) => s.expertId),
  );
  const answeredCount = expertIds.filter((id) => suggestedExpertIds.has(id)).length;
  const total = expertIds.length;
  const status = answeredCount === 0 ? "none" : answeredCount === total ? "complete" : "partial";
  return { answeredCount, total, status };
}

export function upsertSuggestion(questionId: string, expertId: string, content: string): ExpertSuggestion {
  const s = getStore();
  const t = nowIso();
  const existing = s.expertSuggestions.find((x) => x.questionId === questionId && x.expertId === expertId);
  if (existing) {
    existing.content = content.trim();
    existing.updatedAt = t;
    persistClarificationState(s);
    return existing;
  }
  const row: ExpertSuggestion = {
    id: randomUUID(),
    questionId,
    expertId,
    content: content.trim(),
    createdAt: t,
    updatedAt: t,
  };
  s.expertSuggestions.push(row);
  persistClarificationState(s);
  return row;
}

export function createNotifications(questionId: string, expertIds: string[], message: string): Notification[] {
  const s = getStore();
  const t = nowIso();
  const out: Notification[] = [];
  for (const expertId of expertIds) {
    const n: Notification = {
      id: randomUUID(),
      questionId,
      expertId,
      status: "sent",
      message,
      createdAt: t,
    };
    s.notifications.push(n);
    out.push(n);
  }
  persistClarificationState(s);
  return out;
}

export function listNotifications(): Notification[] {
  return [...getStore().notifications];
}

export function listDuplicateQuestionsForCheck() {
  return getStore()
    .questions.filter((q) => q.status === "duplicate")
    .map((q) => ({ id: q.id, originalText: q.originalText, suggestedReply: q.suggestedReply }));
}

export function seedClarificationDemoCases() {
  const s = getStore();
  const pending = s.questions
    .filter((q) => q.status === "pending_clarification")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 6);

  if (pending.length < 6) {
    const need = 6 - pending.length;
    const now = nowIso();
    for (let i = 0; i < need; i += 1) {
      const text = `示範新增題目 ${i + 1}：客戶同時關注價格、油耗與安全，應如何回覆？`;
      const q: Question = {
        id: randomUUID(),
        source: "Demo-補齊案例",
        originalText: text,
        normalizedText: normalizeText(text),
        status: "pending_clarification",
        isDuplicate: false,
        duplicateOfId: null,
        suggestedReply: "已進入問題待釐清區塊",
        standardScript: null,
        legalStatus: "none",
        legalComments: null,
        duplicateScore: null,
        createdAt: now,
        updatedAt: now,
      };
      s.questions.push(q);
      pending.push(q);
    }
  }

  const caseIds = new Set(pending.map((q) => q.id));
  s.expertSuggestions = s.expertSuggestions.filter((x) => !caseIds.has(x.questionId));
  s.notifications = s.notifications.filter((x) => !caseIds.has(x.questionId));

  const expertsByCode = new Map(
    s.experts
      .filter((e) => e.isActive)
      .map((e) => [String(e.code ?? "").toUpperCase(), e] as const),
  );
  const nonMsdCodes = REQUIRED_CODES.filter((c) => c !== "MSD");
  const nonMsdExperts = nonMsdCodes.map((c) => expertsByCode.get(c)).filter((x): x is Expert => Boolean(x));
  let msd = expertsByCode.get("MSD");
  if (!msd) {
    msd = {
      id: randomUUID(),
      code: "MSD",
      name: "MSD 整合",
      email: "msd@placeholder.local",
      groupName: null,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    s.experts.push(msd);
    expertsByCode.set("MSD", msd);
  }
  const now = nowIso();

  const sampleByCode: Record<string, string> = {
    ES: "先跟客戶確認主要使用情境，再以總持有成本做比較，避免只看單一牌價。",
    UL: "先同理客戶疑慮，再補上油耗與妥善率差異，讓判斷更完整。",
    YJ: "先講結論再補理由，最後引導試乘，讓客戶更快做決策。",
    EM: "用安全情境（夜間、雨天、長途）說明差異，強化客戶信心。",
    YF: "以口語化方式拆解重點，先成本、再安全、最後回到日常使用體驗。",
    HL: "補上同級車比較脈絡，避免只針對單一配備討論。",
    KT: "先做重點收斂，再給可執行建議，降低客戶決策壓力。",
    YA: "帶入家庭用車場景，讓客戶快速對應自己的需求。",
    MSD: "綜整所有專家意見後，建議先同理客戶在成本與安全上的疑慮，再以總持有成本、日常用車場景與安全配備整體說明差異，最後邀請客戶以試乘確認實際體感，讓決策更有把握。",
  };

  function addSuggestion(questionId: string, expertId: string, content: string) {
    s.expertSuggestions.push({
      id: randomUUID(),
      questionId,
      expertId,
      content,
      createdAt: now,
      updatedAt: now,
    });
  }

  function addNotification(questionId: string, expertIds: string[]) {
    for (const expertId of expertIds) {
      s.notifications.push({
        id: randomUUID(),
        questionId,
        expertId,
        status: "sent",
        message: "示範案例通知",
        createdAt: now,
      });
    }
  }

  // 先重置 6 筆案例的狀態，避免殘留舊階段
  for (let i = 0; i < 6; i += 1) {
    pending[i].legalStatus = "none";
    pending[i].legalComments = null;
    pending[i].updatedAt = now;
    pending[i].source = `DemoCase-${i + 1}`;
  }

  // Case 1: 全未完成（節點 0）
  pending[0].legalStatus = "none";
  pending[0].legalComments = null;
  pending[0].updatedAt = now;

  // Case 2: 僅完成通知（節點 1）
  addNotification(pending[1].id, nonMsdExperts.map((e) => e.id));
  // 不放任何專家回覆，確保停在節點 1

  // Case 3: 完成專家回饋，未 LLM（節點 2）
  addNotification(pending[2].id, nonMsdExperts.map((e) => e.id));
  for (const e of nonMsdExperts) {
    const code = String(e.code ?? "").toUpperCase();
    addSuggestion(pending[2].id, e.id, sampleByCode[code] ?? "專家建議內容");
  }

  // Case 4: 完成 LLM 整合，待智慧行銷審核（未送法務）
  addNotification(pending[3].id, nonMsdExperts.map((e) => e.id));
  for (const e of nonMsdExperts) {
    const code = String(e.code ?? "").toUpperCase();
    addSuggestion(pending[3].id, e.id, sampleByCode[code] ?? "專家建議內容");
  }
  addSuggestion(
    pending[3].id,
    msd.id,
    "整合建議：先同理客戶在成本與安全上的權衡，再以總持有成本（油耗、維保、保值）說明長期優勢，補充主被動安全配備在雨天與夜間情境的實際價值，最後邀請客戶試乘確認加速與隔音的體感差異。",
  );

  // Case 5: 法務審查中（節點 5，已過行銷審核）
  pending[4].legalStatus = "pending_review";
  pending[4].legalComments = "已送法務審查，等待回覆。";
  addNotification(pending[4].id, nonMsdExperts.map((e) => e.id));
  for (const e of nonMsdExperts) {
    const code = String(e.code ?? "").toUpperCase();
    addSuggestion(pending[4].id, e.id, sampleByCode[code] ?? "專家建議內容");
  }
  addSuggestion(
    pending[4].id,
    msd.id,
    "整合建議：建議先承接客戶對預算與安全的顧慮，再以全生命週期成本觀點比較油耗、保養與保值，說明此車在主被動安全與日常通勤情境的穩定表現，最後給出可執行的下一步（試乘與交車期程確認），協助客戶快速決策。",
  );

  // Case 6: 法務已通過，可回寫（節點 6）
  pending[5].legalStatus = "approved";
  pending[5].legalComments = "法務核准：措辭合規，可對外使用。";
  addNotification(pending[5].id, nonMsdExperts.map((e) => e.id));
  for (const e of nonMsdExperts) {
    const code = String(e.code ?? "").toUpperCase();
    addSuggestion(pending[5].id, e.id, sampleByCode[code] ?? "專家建議內容");
  }
  addSuggestion(
    pending[5].id,
    msd.id,
    "整合建議：建議先承接客戶對預算與安全的顧慮，再以全生命週期成本觀點比較油耗、保養與保值，說明此車在主被動安全與日常通勤情境的穩定表現，最後給出可執行的下一步（試乘與交車期程確認），協助客戶快速決策。",
  );

  persistClarificationState(s);
  return { ok: true, message: "已建立六種示範案例（階段 0~5 各一筆）。" };
}

