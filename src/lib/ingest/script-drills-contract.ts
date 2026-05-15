/**
 * 凍結契約：AI 話術演練格狀表 → BigQuery staging。
 * 若實際 Excel 版面不同，僅需調整 SCRIPT_DRILL_PREFERRED_SHEETS 或別名表。
 */

export const SCRIPT_DRILL_DISPLAY_HEADERS = [
  "客戶疑問",
  "標準話術",
  "ES",
  "UL",
  "YJ",
  "EM",
  "YF",
  "HL",
  "KT",
  "YA",
  "MSD 確認",
] as const;

export type ScriptDrillDisplayKey = (typeof SCRIPT_DRILL_DISPLAY_HEADERS)[number];

/** 表頭儲存格文字可能出現的別名（與 grid-reader 對齊） */
export const SCRIPT_DRILL_HEADER_ALIASES: Record<ScriptDrillDisplayKey, string[]> = {
  客戶疑問: ["客戶疑問", "客戶原話或關鍵考量點"],
  標準話術: ["標準話術", "標準話術思路", "提供給講師參考", "講師平時對應說法"],
  ES: ["ES"],
  UL: ["UL"],
  YJ: ["YJ"],
  EM: ["EM"],
  YF: ["YF"],
  HL: ["HL"],
  KT: ["KT"],
  YA: ["YA"],
  "MSD 確認": ["MSD 確認", "MSD"],
};

/** 中文欄位語意 → BigQuery 欄位名（snake_case） */
export const SCRIPT_DRILL_BQ_FIELDS: Record<ScriptDrillDisplayKey, string> = {
  客戶疑問: "customer_question",
  標準話術: "standard_script",
  ES: "reviewer_es",
  UL: "reviewer_ul",
  YJ: "reviewer_yj",
  EM: "reviewer_em",
  YF: "reviewer_yf",
  HL: "reviewer_hl",
  KT: "reviewer_kt",
  YA: "reviewer_ya",
  "MSD 確認": "msd_confirmation",
};

/** 依優先順序嘗試的工作表名稱（第一個能辨識表頭者採用） */
export const SCRIPT_DRILL_PREFERRED_SHEETS = [
  "問題蒐集對應",
  "「問題蒐集對應」整理版",
  "AI話術演練",
  "話術演練",
] as const;

/** 掃描表頭的最大列數（表頭前可能有說明列） */
export const SCRIPT_DRILL_HEADER_SCAN_MAX_ROWS = 30;
