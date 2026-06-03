/**
 * 車款／產品線登錄表：新增車款時擴充此檔或 data/training-products.json。
 */
import { COMMON_PRODUCT_LINE, normalizeProductLine } from "./training-source-manifest";

export type TrainingProductLine = {
  id: string;
  displayName: string;
  /** 檢索驗收用代表問句 */
  validationQuestions: string[];
  active: boolean;
};

const BUILTIN_PRODUCT_LINES: TrainingProductLine[] = [
  {
    id: "xtrail-ice",
    displayName: "X-TRAIL ICE",
    validationQuestions: [
      "XTRAIL 有什麼配備",
      "客戶擔心油耗",
      "跟競品比較",
      "試乘邀約話術",
      "價格優惠說明",
    ],
    active: true,
  },
  // KICKS 題庫尚未匯入 BQ 時維持 inactive，避免 UI 出現無資料車款
  {
    id: "kicks",
    displayName: "KICKS",
    validationQuestions: [
      "KICKS 跟 HR-V 油耗怎麼比",
      "客戶問為什麼沒有 LV2 怎麼回",
    ],
    active: false,
  },
];

export function listActiveProductLines(): TrainingProductLine[] {
  return BUILTIN_PRODUCT_LINES.filter((p) => p.active);
}

export function getProductLine(id: string): TrainingProductLine | undefined {
  const norm = normalizeProductLine(id);
  return BUILTIN_PRODUCT_LINES.find((p) => p.id === norm);
}

export function isRegisteredProductLine(id: string): boolean {
  const norm = normalizeProductLine(id);
  if (norm === COMMON_PRODUCT_LINE) return true;
  return BUILTIN_PRODUCT_LINES.some((p) => p.id === norm && p.active);
}

/** 合併所有 active 車款的驗收問句 */
export function allValidationQuestions(): { productLine: string; question: string }[] {
  const out: { productLine: string; question: string }[] = [];
  for (const p of listActiveProductLines()) {
    for (const q of p.validationQuestions) {
      out.push({ productLine: p.id, question: q });
    }
  }
  return out;
}
