import {
  isKnowledgeGapNoticeText,
  segmentKnowledgeGapText,
} from "../src/lib/gemini/knowledge-gap-display";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const samples = [
  "知識庫中並無 Honda CR-V 的保養與油耗數據可供直接對照。",
  "目前知識庫尚無「KICKS」的建檔話術，無法與其他車款進行配備或規格比較。",
  "目前知識庫沒有「CR-V」的標準話術，無法依建檔資料回答。",
  "X-TRAIL 全車系標配雙層隔音玻璃，靜肅性表現優異。",
];

assert(isKnowledgeGapNoticeText(samples[0]!), "CR-V 缺資料句");
assert(isKnowledgeGapNoticeText(samples[1]!), "KICKS 尚無建檔");
assert(isKnowledgeGapNoticeText(samples[2]!), "沒有標準話術");
assert(!isKnowledgeGapNoticeText(samples[3]!), "一般產品句不應標記");

const mixed =
  "知識庫中並無 Honda CR-V 的保養與油耗數據可供直接對照。可改以 X-TRAIL 已建檔的持有成本資料說明差異。";
const segs = segmentKnowledgeGapText(mixed);
assert(segs.length === 2, "應切成兩句");
assert(segs[0]!.gap && !segs[1]!.gap, "僅第一句為 gap");

console.log("test-knowledge-gap-display: 通過");
