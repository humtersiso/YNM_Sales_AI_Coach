import fs from "fs";
import path from "path";
import type { ExpertSuggestion, Notification, Question, QuestionTag } from "./types";

type ClarificationStore = {
  questions: Question[];
  questionTags: QuestionTag[];
  expertSuggestions: ExpertSuggestion[];
  notifications: Notification[];
};

function storePath() {
  return path.join(process.cwd(), ".data", "clarification-store.json");
}

function ensureDir() {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
}

export function loadClarificationStore(): ClarificationStore {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return { questions: [], questionTags: [], expertSuggestions: [], notifications: [] };
  }
  try {
    const row = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<ClarificationStore>;
    return {
      questions: row.questions ?? [],
      questionTags: row.questionTags ?? [],
      expertSuggestions: row.expertSuggestions ?? [],
      notifications: row.notifications ?? [],
    };
  } catch {
    return { questions: [], questionTags: [], expertSuggestions: [], notifications: [] };
  }
}

export function saveClarificationStore(data: ClarificationStore) {
  ensureDir();
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), "utf8");
}
