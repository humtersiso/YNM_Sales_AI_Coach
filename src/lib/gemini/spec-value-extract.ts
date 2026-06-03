import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";

export type SpecNumericReply = { intro: string; bullets: string[] };

function blobFrom(citations: ScriptCitation[]): string {
  return citations.map((c) => c.script).join("\n");
}

/** 從對戰表／規格表摘錄抽出 X-TRAIL 數字（RAG 常落在 competitor 語料庫） */
export function tryBuildSpecNumericReply(
  message: string,
  citations: ScriptCitation[],
): SpecNumericReply | null {
  if (!isSpecNumericQuery(message) || citations.length === 0) return null;

  const blob = blobFrom(citations);
  const wantsHp = /馬力|功率|幾匹|\bps\b/i.test(message);
  const wantsTorque = /扭力|kgm|公斤米/i.test(message);
  const wantsFuel = /油耗|km\/l|省油/i.test(message);

  let hp: string | null = null;
  let torque: string | null = null;
  let fuel: string | null = null;

  const compareRow = blob.match(
    /X-?TRAIL(?:\s+ICE)?[^.\n]{0,48}?(\d{2,3})\s*ps\s*\/\s*(\d{2}(?:\.\d+)?)\s*kgm/i,
  );
  if (compareRow) {
    hp = `${compareRow[1]} ps`;
    torque = `${compareRow[2]} kgm`;
  }

  if (!hp && /(?:最大馬力|馬力[:：])\s*204\s*ps/i.test(blob)) {
    hp = "204 ps";
  }
  if (!hp && /204\s*ps\s*\/\s*5500\s*rpm/i.test(blob)) {
    hp = "204 ps";
  }
  if (!torque && /(?:最大扭力|扭力[:：])\s*30\.6\s*kgm/i.test(blob)) {
    torque = "30.6 kgm";
  }
  if (!torque && /30\.6\s*kgm\s*\/\s*4400/i.test(blob)) {
    torque = "30.6 kgm";
  }

  const fuelMatch = blob.match(
    /X-?TRAIL[^.\n]{0,60}?(?:平均油耗|油耗)[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*km\/L/i,
  );
  if (fuelMatch) fuel = `${fuelMatch[1]} km/L`;

  const bullets: string[] = [];
  if (wantsHp && hp) {
    bullets.push(`可告知客戶 X-TRAIL ICE 最大馬力為 ${hp}（知識庫對戰／規格摘錄）。`);
  }
  if (wantsTorque && torque) {
    bullets.push(`最大扭力為 ${torque}，可搭配試乘說明實際加速與載重感受。`);
  }
  if (wantsFuel && fuel) {
    bullets.push(`平均油耗約 ${fuel}，可強調 VC-TURBO 在動力與油耗間的平衡。`);
  }

  if (bullets.length === 0) return null;

  const intro =
    wantsHp && hp
      ? `X-TRAIL ICE 最大馬力為 ${hp}。`
      : wantsTorque && torque
        ? `X-TRAIL 最大扭力為 ${torque}。`
        : wantsFuel && fuel
          ? `X-TRAIL ICE 平均油耗約 ${fuel}。`
          : bullets[0]!;

  return { intro, bullets: bullets.slice(0, SALES_REPLY_MAX) };
}

const SALES_REPLY_MAX = 4;
