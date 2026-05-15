import * as XLSX from "xlsx";
import { createHash, randomUUID } from "node:crypto";
import { normalizeText } from "@/lib/duplicate/checker";
import type {
  AppState,
  Expert,
  ExpertSuggestion,
  Notification,
  Question,
  QuestionTag,
  Tag,
} from "./types";

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function findHeaderKey<T extends Record<string, unknown>>(
  row: T,
  keyword: string,
): string | null {
  return (
    Object.keys(row).find((key) => key.includes(keyword) || asText(row[key]).includes(keyword)) ??
    null
  );
}

/** 「標準話術」欄（上架用短稿），勿與「標準話術思路」混淆 */
function findStandardScriptColumnKey(row: Record<string, unknown>): string | null {
  return Object.keys(row).find((k) => k.includes("標準話術") && !k.includes("思路")) ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(prefix: string, key: string) {
  const h = createHash("sha256").update(key).digest("hex").slice(0, 26);
  return `${prefix}_${h}`;
}

function cleanQuestionText(text: string) {
  return text
    .replace(/^【[^】]*】/, "")
    .replace(/^【[^】]*】/, "")
    .trim();
}

export function parseWorkbookBuffer(buffer: Buffer, workbookPath: string): AppState {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const experts: Expert[] = [];
  const tags: Tag[] = [];
  const questions: Question[] = [];
  const questionTags: QuestionTag[] = [];
  const expertSuggestions: ExpertSuggestion[] = [];
  const notifications: Notification[] = [];

  const qaSheet = workbook.Sheets["問題蒐集對應"];
  const peopleSheet = workbook.Sheets["人員"];
  const tagSheet = workbook.Sheets["標籤"];

  if (!qaSheet) {
    throw new Error("Excel 缺少必要 sheet：問題蒐集對應");
  }

  const qaRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(qaSheet, { defval: "" });
  const qaSample = qaRows.find((r) => Object.keys(r).length > 0) ?? {};
  const standardScriptCol = findStandardScriptColumnKey(qaSample);
  const questionKey =
    findHeaderKey(qaRows[0] ?? {}, "客戶疑問") ?? Object.keys(qaRows[0] ?? {})[6];
  // 規則：主流程建議回覆以 Excel H 欄（標準話術）為主，不使用自動生成內容。
  const replyKey =
    findHeaderKey(qaRows[0] ?? {}, "標準話術思路") ??
    findHeaderKey(qaRows[0] ?? {}, "提供給講師參考") ??
    findHeaderKey(qaRows[0] ?? {}, "AI回答");
  const sourceKey = findHeaderKey(qaRows[0] ?? {}, "提供DLR");
  const qIdKey = findHeaderKey(qaRows[0] ?? {}, "系統ID");

  const t0 = nowIso();
  for (const row of qaRows) {
    const originalTextRaw = asText(row[questionKey]);
    const originalText = cleanQuestionText(originalTextRaw);
    if (!originalText || originalText.includes("客戶疑問")) continue;
    const sourceText = sourceKey ? asText(row[sourceKey]) : "";
    const id = (qIdKey && asText(row[qIdKey])) || stableId("qa", `${originalText}\0${sourceText}`);
    const scriptCell = standardScriptCol ? asText(row[standardScriptCol]) : "";
    questions.push({
      id,
      source: sourceText || "Excel匯入",
      originalText,
      normalizedText: normalizeText(originalText),
      status: "duplicate",
      isDuplicate: true,
      duplicateOfId: null,
      suggestedReply: (replyKey ? asText(row[replyKey]) : "") || "（Excel未提供回覆）",
      standardScript: scriptCell || null,
      legalStatus: "none",
      legalComments: null,
      duplicateScore: null,
      createdAt: t0,
      updatedAt: t0,
    });
  }

  // 人員表常有前置說明列，因此以位置 + 內容特徵解析，
  // 同時相容主檔（A/B/信箱在D/分組在G）與 Demo 檔（A含代號姓名、信箱在B）。
  if (peopleSheet) {
    const peopleAoa = XLSX.utils.sheet_to_json<(string | number)[]>(peopleSheet, { header: 1, defval: "" });
    for (const row of peopleAoa) {
      const colA = asText(row[0]);
      const colB = asText(row[1]);
      const emailRaw = row.map((cell) => asText(cell)).find((text) => text.includes("@")) ?? "";
      const groupText = asText(row[6]) || asText(row[5]) || asText(row[2]);
      let codeText = "";
      let nameText = "";

      // 格式1：A欄=代號，B欄=姓名（目前主檔）
      if (/^[A-Z]{2,4}$/.test(colA.toUpperCase()) && colB) {
        codeText = colA.toUpperCase();
        nameText = colB;
      } else {
        // 格式2：A欄=「代號 姓名」（舊檔/示範檔）
        const mixed = colA.match(/^([A-Z]{2,4})\s+(.+)$/);
        if (mixed) {
          codeText = mixed[1].toUpperCase();
          nameText = mixed[2].trim();
        }
      }

      // 跳過空列/標題列/不合法資料列
      if (!codeText || !nameText) continue;
      if (nameText === "姓名" || nameText === "AI報名人員") continue;

      const email = emailRaw.includes("@") ? emailRaw : `${codeText.toLowerCase()}@placeholder.local`;
      const id = stableId("ex", `${codeText}\0${nameText}\0${email}`);
      experts.push({
        id,
        code: codeText,
        name: nameText,
        email,
        groupName: groupText || null,
        isActive: true,
        createdAt: t0,
        updatedAt: t0,
      });
    }
  }

  if (tagSheet) {
    const tagRows = XLSX.utils.sheet_to_json<(string | number)[]>(tagSheet, { header: 1, defval: "" });
    for (const row of tagRows) {
      const nonEmpty = row.map((v) => asText(v)).filter(Boolean);
      if (nonEmpty.length < 2) continue;
      const level1 = nonEmpty[0];
      if (level1 === "第一層標籤" || level1 === "第二層標籤") continue;
      for (const level2 of nonEmpty.slice(1)) {
        if (level2 === "第一層標籤" || level2 === "第二層標籤") continue;
        tags.push({
          id: stableId("tag", `${level1}\0${level2}`),
          level1,
          level2,
          createdAt: t0,
          updatedAt: t0,
        });
      }
    }
  }

  const pendingSheet = workbook.Sheets["新問題Demo"];
  if (pendingSheet) {
    const pr = XLSX.utils.sheet_to_json<Record<string, unknown>>(pendingSheet, { defval: "" });
    if (pr.length > 0) {
      const qk = findHeaderKey(pr[0] ?? {}, "客戶疑問") ?? Object.keys(pr[0] ?? {})[0];
      const l1k = findHeaderKey(pr[0] ?? {}, "標籤第一層");
      const l2k = findHeaderKey(pr[0] ?? {}, "標籤第二層");
      const pidKey = findHeaderKey(pr[0] ?? {}, "系統ID");
      const srcKey = findHeaderKey(pr[0] ?? {}, "來源");
      const dupRefKey = findHeaderKey(pr[0] ?? {}, "重複參考題ID");

      const tagIdByPair = new Map(tags.map((t) => [`${t.level1}|${t.level2}`, t.id]));

      for (const row of pr) {
        const textRaw = asText(row[qk]);
        const text = cleanQuestionText(textRaw);
        if (!text || text.includes("客戶疑問")) continue;
        const id =
          (pidKey && asText(row[pidKey])) ||
          stableId(
            "pend",
            `${text}\0${l1k ? asText(row[l1k]) : ""}\0${l2k ? asText(row[l2k]) : ""}`,
          );
        const dupRef = dupRefKey ? asText(row[dupRefKey]) : "";
        questions.push({
          id,
          source: (srcKey && asText(row[srcKey])) || "Excel-新問題Demo",
          originalText: text,
          normalizedText: normalizeText(text),
          status: "pending_clarification",
          isDuplicate: false,
          duplicateOfId: dupRef || null,
          suggestedReply: "已進入問題待釐清區塊",
          standardScript: null,
          legalStatus: "none",
          legalComments: null,
          duplicateScore: null,
          createdAt: t0,
          updatedAt: t0,
        });

        if (l1k && l2k) {
          const l1 = asText(row[l1k]);
          const l2 = asText(row[l2k]);
          const tagId = tagIdByPair.get(`${l1}|${l2}`);
          if (tagId) {
            questionTags.push({
              id: randomUUID(),
              questionId: id,
              tagId,
              createdAt: t0,
            });
          }
        }
      }
    }
  }

  const sugSheet = workbook.Sheets["專家建議"];
  if (sugSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sugSheet, { defval: "" });
    if (rows.length > 0) {
      const qid = findHeaderKey(rows[0] ?? {}, "問題ID") ?? Object.keys(rows[0] ?? {})[0];
      const eid = findHeaderKey(rows[0] ?? {}, "專家ID");
      const contentK = findHeaderKey(rows[0] ?? {}, "建議內容");
      const sid = findHeaderKey(rows[0] ?? {}, "系統ID");
      for (const row of rows) {
        const questionId = asText(row[qid]);
        const expertId = eid ? asText(row[eid]) : "";
        const content = contentK ? asText(row[contentK]) : "";
        if (!questionId || !expertId || !content) continue;
        expertSuggestions.push({
          id: (sid && asText(row[sid])) || randomUUID(),
          questionId,
          expertId,
          content,
          createdAt: t0,
          updatedAt: t0,
        });
      }
    }
  }

  const qtSheet = workbook.Sheets["問題標籤"];
  if (qtSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(qtSheet, { defval: "" });
    if (rows.length > 0) {
      const qid = findHeaderKey(rows[0] ?? {}, "問題ID") ?? Object.keys(rows[0] ?? {})[0];
      const tid = findHeaderKey(rows[0] ?? {}, "標籤ID");
      const rid = findHeaderKey(rows[0] ?? {}, "系統ID");
      for (const row of rows) {
        const questionId = asText(row[qid]);
        const tagId = tid ? asText(row[tid]) : "";
        if (!questionId || !tagId) continue;
        if (questionTags.some((x) => x.questionId === questionId && x.tagId === tagId)) continue;
        questionTags.push({
          id: (rid && asText(row[rid])) || randomUUID(),
          questionId,
          tagId,
          createdAt: t0,
        });
      }
    }
  }

  const notifSheet = workbook.Sheets["通知紀錄"];
  if (notifSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(notifSheet, { defval: "" });
    if (rows.length > 0) {
      const idK = findHeaderKey(rows[0] ?? {}, "系統ID");
      const qid = findHeaderKey(rows[0] ?? {}, "問題ID");
      const eid = findHeaderKey(rows[0] ?? {}, "專家ID");
      const st = findHeaderKey(rows[0] ?? {}, "狀態");
      const msg = findHeaderKey(rows[0] ?? {}, "訊息");
      const ct = findHeaderKey(rows[0] ?? {}, "建立時間");
      for (const row of rows) {
        const questionId = qid ? asText(row[qid]) : "";
        const expertId = eid ? asText(row[eid]) : "";
        if (!questionId || !expertId) continue;
        notifications.push({
          id: (idK && asText(row[idK])) || randomUUID(),
          questionId,
          expertId,
          status: (st && asText(row[st]) === "failed" ? "failed" : "sent") as Notification["status"],
          message: msg ? asText(row[msg]) : null,
          createdAt: (ct && asText(row[ct])) || t0,
        });
      }
    }
  }

  return {
    workbookPath,
    experts,
    tags,
    questions,
    questionTags,
    expertSuggestions,
    notifications,
  };
}
