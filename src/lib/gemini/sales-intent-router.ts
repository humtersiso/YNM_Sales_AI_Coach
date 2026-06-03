import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { geminiPlanKnowledgeSearch } from "@/lib/gemini/gemini-client";
import { extractFileHints, extractSearchKeywords } from "@/lib/gemini/knowledge-search";
import {
  inferProductLineFromMessage,
  mergeProfileWithScope,
} from "@/lib/gemini/sales-scope-inference";
import {
  isOffTopicMessage,
  logSalesQuestionProfile,
  mentionsHeroProduct,
  extractMentionedCompetitor,
  profileFromMaterialCategory,
  type SalesQuestionProfile,
} from "@/lib/gemini/sales-question-profile";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";

export type SalesIntent = "knowledge" | "off_topic";

export type KnowledgeSearchPlan = {
  intent: SalesIntent;
  scope: KnowledgeSearchScope;
  /** 強制併入檔名線索（AND 查詢） */
  extraFileHints?: string[];
  limit?: number;
  routedBy: "rules" | "gemini_tool";
};

const COMPETITOR_BATTLE =
  /(territory|福特|ford|tucson|sportage|rav4|cr-?v|kuga|focus)/i;
const BATTLE_WORD = /對戰|比較|競品|勝過|贏過|pk/i;
const YT_NEGATIVE = /YT|負評|youtube|youtu\.be/i;

function mergeScope(
  base: KnowledgeSearchScope,
  patch: Partial<KnowledgeSearchScope>,
): KnowledgeSearchScope {
  const preferred =
    patch.preferredMaterialCategory ??
    patch.materialCategory ??
    base.preferredMaterialCategory ??
    base.materialCategory;
  return {
    productLine: patch.productLine ?? base.productLine,
    preferredMaterialCategory: preferred ?? null,
    materialCategory: patch.materialCategory ?? base.materialCategory,
  };
}

/** 規則路由（<1ms）；category 由 sales-question-profile 決定 */
export function routeByRules(message: string, mergedScope: KnowledgeSearchScope): KnowledgeSearchPlan | null {
  const t = message.trim();
  const scope = mergedScope;
  if (!t) return { intent: "off_topic", scope, routedBy: "rules" };

  if (isOffTopicMessage(t)) {
    return { intent: "off_topic", scope, routedBy: "rules" };
  }

  const hints = extractFileHints(t);

  if (/lv2|lv\s*2|icc|車道置中|為什麼沒有.*lv/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "product_info" as MaterialCategory }),
      extraFileHints: [...new Set([...hints, "LV2", "ICC", "輔助"])],
      limit: 12,
      routedBy: "rules",
    };
  }

  if (/kicks|hr-?v|honda/i.test(t) && /油耗|省油|油電|比較/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, {
        productLine: inferProductLineFromMessage(t) ?? scope.productLine,
        materialCategory: "competitor_compare" as MaterialCategory,
      }),
      extraFileHints: [...new Set([...hints, "KICKS", "HR-V", "油耗"])],
      limit: 14,
      routedBy: "rules",
    };
  }

  if (YT_NEGATIVE.test(t) || hints.some((h) => /YT|負評/i.test(h))) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: hints.length ? hints : ["TERRITORY_YT", "負評"],
      limit: 12,
      routedBy: "rules",
    };
  }

  if (COMPETITOR_BATTLE.test(t) && BATTLE_WORD.test(t)) {
    const extra: string[] = [];
    if (/territory|福特|ford/i.test(t)) extra.push("Territory", "FORD", "對戰");
    if (/sportage/i.test(t) && !/territory|福特|ford/i.test(t)) extra.push("SPORTAGE", "對戰");
    if (/tucson/i.test(t)) extra.push("TUCSON");
    if (/rav4/i.test(t)) extra.push("RAV4");
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: [...new Set([...hints, ...extra])],
      limit: 10,
      routedBy: "rules",
    };
  }

  if (/試乘|試駕|邀約/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "sales_script" as MaterialCategory }),
      extraFileHints: hints,
      limit: 8,
      routedBy: "rules",
    };
  }

  if (/價格|優惠|折扣|議價|殺價/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "sales_script" as MaterialCategory }),
      extraFileHints: hints,
      limit: 8,
      routedBy: "rules",
    };
  }

  if (/持有成本|用車成本|長期成本|詳細數字|試算/i.test(t)) {
    const extra = [...hints, "長期持有成本", "用車成本", "8萬公里", "16萬公里"];
    if (/tucson|途勝/i.test(t)) extra.push("TUCSON");
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: [...new Set(extra)],
      limit: 14,
      routedBy: "rules",
    };
  }

  if (isSpecNumericQuery(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "product_info" as MaterialCategory }),
      extraFileHints: [
        ...new Set([...hints, "對戰", "VS", "SPORTAGE", "TERRITORY", "204", "規格", "最大馬力"]),
      ],
      limit: 12,
      routedBy: "rules",
    };
  }

  const mentionedCompetitor = extractMentionedCompetitor(t);
  if (mentionedCompetitor) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: [...new Set([...hints, mentionedCompetitor])],
      limit: 12,
      routedBy: "rules",
    };
  }

  if (/媒體|報導|評測|u-?car|carture/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "product_info" as MaterialCategory }),
      extraFileHints: hints.length ? hints : ["媒體"],
      limit: 10,
      routedBy: "rules",
    };
  }

  if (/propilot|pfcw|eapm|智行安全/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: [...new Set([...hints, "ProPILOT", "RAV4", "對戰"])],
      limit: 10,
      routedBy: "rules",
    };
  }

  if (/aeb|主動煞|煞車輔助|RR-AEB/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "product_info" as MaterialCategory }),
      extraFileHints: hints,
      limit: 10,
      routedBy: "rules",
    };
  }

  if (/tucson/i.test(t)) {
    return {
      intent: "knowledge",
      scope: mergeScope(scope, { materialCategory: "competitor_compare" as MaterialCategory }),
      extraFileHints: [...new Set([...hints, "TUCSON", "Tucson"])],
      limit: 10,
      routedBy: "rules",
    };
  }

  if (/油耗|省油|稅金|持有成本|保養|電池|輪胎/i.test(t)) {
    const isCompetitor =
      scope.materialCategory === "competitor_compare" ||
      COMPETITOR_BATTLE.test(t) ||
      /比較|對比|vs/i.test(t);
    return {
      intent: "knowledge",
      scope: mergeScope(scope, {
        materialCategory: (isCompetitor ? "competitor_compare" : scope.materialCategory ?? "sales_script") as MaterialCategory,
      }),
      extraFileHints: hints,
      limit: isCompetitor ? 12 : 8,
      routedBy: "rules",
    };
  }

  if (hints.length >= 1) {
    return {
      intent: "knowledge",
      scope,
      extraFileHints: hints,
      limit: 12,
      routedBy: "rules",
    };
  }

  if (extractSearchKeywords(t).length >= 2) {
    return {
      intent: "knowledge",
      scope,
      limit: 8,
      routedBy: "rules",
    };
  }

  return null;
}

export function planFromGeminiToolArgs(
  args: Record<string, unknown>,
  userScope: KnowledgeSearchScope,
  message = "",
): KnowledgeSearchPlan {
  const intent = String(args.intent ?? "knowledge") === "off_topic" ? "off_topic" : "knowledge";
  const cat = String(args.material_category ?? "").trim() as MaterialCategory;
  const { scope: mergedScope } = mergeProfileWithScope(message, userScope);
  const scope = cat
    ? mergeScope(mergedScope, { materialCategory: cat })
    : mergedScope;
  const extraFileHints = Array.isArray(args.file_hints)
    ? args.file_hints.map((h) => String(h).trim()).filter(Boolean)
    : args.file_hint
      ? [String(args.file_hint).trim()]
      : undefined;
  const limit = typeof args.limit === "number" ? args.limit : Number(args.limit) || undefined;

  return {
    intent,
    scope,
    extraFileHints,
    limit,
    routedBy: "gemini_tool",
  };
}

function scopeHint(scope: KnowledgeSearchScope): string {
  const pref =
    scope.preferredMaterialCategory ?? scope.materialCategory ?? "未指定";
  return `車款=${scope.productLine ?? "未指定"}；偏好素材類別=${pref}`;
}

export async function resolveSearchPlanWithProfile(
  message: string,
  userScope: KnowledgeSearchScope,
): Promise<{ plan: KnowledgeSearchPlan; profile: SalesQuestionProfile }> {
  let { profile, scope: mergedScope } = mergeProfileWithScope(message, userScope);
  logSalesQuestionProfile(message, profile);

  const ruled = routeByRules(message, mergedScope);
  if (ruled) return { plan: ruled, profile };

  try {
    const gemini = await geminiPlanKnowledgeSearch(message, scopeHint(mergedScope));
    if (gemini?.functionCall?.name === "plan_knowledge_search") {
      const plan = planFromGeminiToolArgs(gemini.functionCall.args, mergedScope, message);
      const cat = plan.scope.materialCategory;
      if (cat) {
        profile = profileFromMaterialCategory(cat, message, "gemini_tool");
        logSalesQuestionProfile(message, profile);
      }
      return { plan, profile };
    }
  } catch (e) {
    console.error("Gemini route tool failed, fallback to default knowledge search", e);
  }

  return {
    plan: { intent: "knowledge", scope: mergedScope, routedBy: "rules" },
    profile,
  };
}

/** @deprecated 請改用 resolveSearchPlanWithProfile */
export async function resolveSearchPlan(
  message: string,
  scope: KnowledgeSearchScope,
): Promise<KnowledgeSearchPlan> {
  const { plan } = await resolveSearchPlanWithProfile(message, scope);
  return plan;
}
