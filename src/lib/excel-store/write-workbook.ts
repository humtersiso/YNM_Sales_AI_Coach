import * as XLSX from "xlsx";
import type { AppState } from "./types";

function tagMatrixFromTags(tags: AppState["tags"]) {
  const byL1 = new Map<string, string[]>();
  for (const t of tags) {
    const arr = byL1.get(t.level1) ?? [];
    if (!arr.includes(t.level2)) arr.push(t.level2);
    byL1.set(t.level1, arr);
  }
  const aoa: string[][] = [["第一層標籤", "第二層標籤"]];
  for (const [level1, level2s] of byL1) {
    aoa.push([level1, ...level2s]);
  }
  return aoa;
}

export function appStateToWorkbookBuffer(state: AppState): Buffer {
  const dupQuestions = state.questions.filter((q) => q.status === "duplicate");
  const pendingQuestions = state.questions.filter((q) => q.status === "pending_clarification");
  const tagById = new Map(state.tags.map((t) => [t.id, t]));

  const qaRows = dupQuestions.map((q) => ({
    提供DLR: q.source ?? "",
    客戶疑問: q.originalText,
    標準話術: q.standardScript ?? "",
    AI回答: q.suggestedReply,
    系統ID: q.id,
  }));

  const peopleRows = state.experts.map((e) => ({
    代號: e.code ?? "",
    姓名: e.name,
    欄位C: "",
    信箱: e.email,
    欄位E: "",
    欄位F: "",
    分組: e.groupName ?? "",
    系統ID: e.id,
  }));

  const pendingRows = pendingQuestions.map((q) => {
    const rel = state.questionTags.filter((x) => x.questionId === q.id);
    const first = rel[0];
    const tag = first ? tagById.get(first.tagId) : undefined;
    return {
      客戶疑問: q.originalText,
      標籤第一層: tag?.level1 ?? "",
      標籤第二層: tag?.level2 ?? "",
      系統ID: q.id,
      來源: q.source ?? "",
      重複參考題ID: q.duplicateOfId ?? "",
    };
  });

  const sugRows = state.expertSuggestions.map((s) => ({
    問題ID: s.questionId,
    專家ID: s.expertId,
    建議內容: s.content,
    系統ID: s.id,
    更新時間: s.updatedAt,
  }));

  const qtRows = state.questionTags.map((qt) => ({
    問題ID: qt.questionId,
    標籤ID: qt.tagId,
    系統ID: qt.id,
  }));

  const notifRows = state.notifications.map((n) => ({
    系統ID: n.id,
    問題ID: n.questionId,
    專家ID: n.expertId,
    狀態: n.status,
    訊息: n.message ?? "",
    建立時間: n.createdAt,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qaRows), "問題蒐集對應");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peopleRows), "人員");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tagMatrixFromTags(state.tags)), "標籤");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingRows), "新問題Demo");
  if (sugRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sugRows), "專家建議");
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ 問題ID: "", 專家ID: "", 建議內容: "", 系統ID: "", 更新時間: "" }]),
      "專家建議",
    );
  }
  if (qtRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qtRows), "問題標籤");
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ 問題ID: "", 標籤ID: "", 系統ID: "" }]),
      "問題標籤",
    );
  }
  if (notifRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notifRows), "通知紀錄");
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { 系統ID: "", 問題ID: "", 專家ID: "", 狀態: "sent", 訊息: "", 建立時間: "" },
      ]),
      "通知紀錄",
    );
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
