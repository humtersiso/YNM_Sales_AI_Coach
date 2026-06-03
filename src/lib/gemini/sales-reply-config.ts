/** 銷售助手回覆篇幅（約 20 秒可讀完：1 句結論 + 精簡列點） */
export const SALES_REPLY_MAX_BULLETS = 4;
export const SALES_REPLY_BULLET_MIN_CHARS = 28;
export const SALES_REPLY_BULLET_MAX_CHARS = 130;
export const SALES_REPLY_INTRO_MAX_CHARS = 72;

/** Vertex Grounded：防禦話術較長，與 test-rag-grounded log 對齊 */
export const SALES_GROUNDED_INTRO_MAX_CHARS = 120;
export const SALES_GROUNDED_BULLET_MAX_CHARS = 220;

export const SALES_REPLY_LENGTH_HINT = `列點 2～${SALES_REPLY_MAX_BULLETS} 條（夠答題即可，勿重複、勿灌水）；每條約 40～${SALES_REPLY_BULLET_MAX_CHARS} 字、一點一事，精簡可當場複誦`;

export const SALES_GROUNDED_REPLY_LENGTH_HINT = `列點 2～3 條；每條完整句（須有句尾），約 60～${SALES_GROUNDED_BULLET_MAX_CHARS} 字，勿寫到一半截斷`;

/** Data Agent 原文 → Gemini 整理後列點上限（成本／規格題需較多細項） */
export const DATA_AGENT_FORMAT_MAX_BULLETS = 10;
export const DATA_AGENT_FORMAT_BULLET_MAX_CHARS = 280;
/** Data Agent「小結」一句話上限（可含 1～2 組關鍵數字） */
export const DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS = 160;
/** 送入整理模型的 Data Agent 原文上限（字元） */
export const DATA_AGENT_FORMAT_RAW_EXCERPT_CHARS = 20000;
export const DATA_AGENT_FORMAT_INTRO_MAX_CHARS = DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS;

/** @deprecated 請改用 DATA_AGENT_FORMAT_* */
export const DATA_AGENT_REFINE_MAX_BULLETS = DATA_AGENT_FORMAT_MAX_BULLETS;
export const DATA_AGENT_REFINE_BULLET_MAX_CHARS = DATA_AGENT_FORMAT_BULLET_MAX_CHARS;
export const DATA_AGENT_REFINE_INTRO_MAX_CHARS = DATA_AGENT_FORMAT_INTRO_MAX_CHARS;
