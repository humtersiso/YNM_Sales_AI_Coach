/**
 * 對練競品 RAG 就緒判定（單元）
 * npx tsx scripts/test-roleplay-competitor-rag.ts
 */
import { isCompetitorRagReady } from "../src/lib/roleplay/roleplay-competitor-rag";
import type { RoleplayRagBundle } from "../src/lib/roleplay/rag-context";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function bundle(partial: Partial<RoleplayRagBundle>): RoleplayRagBundle {
  return {
    hits: [],
    facts: [],
    keyPoints: [],
    forbidden: [],
    closingActions: [],
    strategyIds: [],
    coverageOk: false,
    validFactCount: 0,
    competitorHitCount: 0,
    competitorCoverageOk: false,
    ...partial,
  };
}

function main() {
  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "RAV4 X-TRAIL VS RAV4改款",
            sourceFileName: "RAV4 X-TRAIL VS RAV4改款_20260327.pdf",
            snippet: "X-TRAIL vs RAV4 持有成本試算",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Toyota RAV4",
    ),
    "RAV4 對戰 PDF 應通過 Toyota RAV4",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "SPORTAGE X-TRAIL 對戰 SPORTAGE 對戰話術策略 _260508",
            sourceFileName: "SPORTAGE X-TRAIL 對戰 SPORTAGE 對戰話術策略 _260508.pdf",
            snippet: "Sportage 與 X-TRAIL 比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "KIA Sportage",
    ),
    "SPORTAGE 對戰 PDF 應通過 KIA Sportage",
  );

  assert(
    !isCompetitorRagReady(
      bundle({
        validFactCount: 5,
        hits: [
          {
            title: "SPORTAGE 對戰",
            snippet: "Sportage 與 X-TRAIL 比較油耗",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Ford Kuga",
    ),
    "僅 Sportage 素材不應通過 Kuga",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "KUGA ALL NEW X-TRAIL對戰KUGA改款正式話術",
            sourceFileName: "KUGA ALL NEW X-TRAIL對戰KUGA改款正式話術.pdf",
            snippet: "Kuga 與 X-TRAIL 動力比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Ford Kuga",
    ),
    "KUGA 對戰 PDF 應通過 Ford Kuga",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "MUFASA NU2媒體試乘簡報 0514_浮水印版",
            sourceFileName: "MUFASA NU2媒體試乘簡報 0514_浮水印版.pdf",
            snippet: "MUFASA 與 X-TRAIL 空間比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Hyundai MUFASA",
    ),
    "MUFASA 對戰 PDF 應通過 Hyundai MUFASA",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "TERRITORY FORD Territory_對戰話術_20260327",
            sourceFileName: "TERRITORY FORD Territory_對戰話術_20260327.pdf",
            snippet: "Territory 與 X-TRAIL 輔助駕駛比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Ford Territory",
    ),
    "TERRITORY 對戰 PDF 應通過 Ford Territory",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "XFORCE競品話術(vs CC)(FMC)v2.pptx",
            sourceFileName: "XFORCE競品話術(vs CC)(FMC)v2.pptx.pdf",
            snippet: "XFORCE 與 X-TRAIL 規格比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Mitsubishi XFORCE",
    ),
    "XFORCE 對戰 PDF 應通過 Mitsubishi XFORCE",
  );

  assert(
    isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "TUCSON L 小改款對應話術_20250410_V4",
            sourceFileName: "TUCSON L 小改款對應話術_20250410_V4.pdf",
            snippet: "Tucson L 與 X-TRAIL 油耗比較",
            materialCategory: "competitor_compare",
            relevance: 90,
          },
        ],
      }),
      "Hyundai Tucson L",
    ),
    "TUCSON L 對戰 PDF 應通過 Hyundai Tucson L",
  );

  assert(
    !isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "T33_ICE_Q&A",
            snippet: "客戶問 CR-V 跟 X-TRAIL 油耗怎麼比",
            materialCategory: "sales_script",
            relevance: 80,
          },
        ],
      }),
      "Honda CR-V",
    ),
    "話術 Q&A 內文提到 CR-V 不應通過（CR-V 已不在候選清單）",
  );

  assert(
    !isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "RAV4 X-TRAIL VS RAV4",
            snippet: "業代錯誤拿 CR-V 來比",
            materialCategory: "competitor_compare",
            relevance: 80,
          },
        ],
      }),
      "Honda CR-V",
    ),
    "RAV4 檔名但僅內文提 CR-V 不應通過 CR-V",
  );

  assert(
    !isCompetitorRagReady(
      bundle({
        validFactCount: 3,
        hits: [
          {
            title: "Q&A",
            snippet: "X-TRAIL ICE 油耗 16km/L",
            relevance: 80,
          },
        ],
      }),
      "Toyota RAV4",
    ),
    "僅本品 Q&A 不應通過 RAV4",
  );

  console.log("test-roleplay-competitor-rag: 12/12 通過");
}

main();
