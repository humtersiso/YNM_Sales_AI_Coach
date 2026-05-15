import { NextRequest, NextResponse } from "next/server";

type SuggestionRow = {
  expertCode: string;
  expertName: string;
  content: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const DEFAULT_GEMINI_API_KEY = "AIzaSyDOja2B-KU8ImTbhJ7ltx2WkVPJ5Ca2P-s";
const PREFERRED_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"] as const;

type GeminiModelListResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

function looksCompleteSentence(text: string) {
  return /[。！？.!?]\s*$/.test(text.trim());
}

async function resolveCandidateModels(key: string, requestedModel?: string) {
  const preferred = [requestedModel?.trim(), ...PREFERRED_MODELS].filter(Boolean) as string[];
  const seen = new Set<string>();
  const orderedPreferred = preferred.filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });

  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
  );
  if (!listRes.ok) {
    return orderedPreferred;
  }
  const listJson = (await listRes.json().catch(() => ({}))) as GeminiModelListResponse;
  const available = (listJson.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => String(m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);

  const flashFirst = available.filter((m) => m.includes("flash"));
  const modern = flashFirst.filter((m) => !m.includes("8b"));
  const merged = [...orderedPreferred, ...modern];
  const deduped: string[] = [];
  for (const m of merged) {
    if (!m || deduped.includes(m)) continue;
    deduped.push(m);
  }
  return deduped.length ? deduped : orderedPreferred;
}

async function generateWithModel(key: string, model: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
        },
      }),
    },
  );
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    suggestions?: SuggestionRow[];
  };
  const question = (body.question ?? "").trim();
  const suggestions = (body.suggestions ?? []).filter((x) => x.content?.trim());
  if (!question || suggestions.length === 0) {
    return NextResponse.json({ error: "缺少整合資料" }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY?.trim() || DEFAULT_GEMINI_API_KEY;
  const prompt = [
    "你是汽車銷售話術整合助理。",
    "請根據同一題目下多位專家的回覆，整合成一段可直接對客戶說明的完整建議。",
    "要求：",
    "1) 必須完整吸收所有專家關鍵點，不要遺漏。",
    "2) 長度請落在 160~260 字，內容完整、語氣自然。",
    "3) 不要使用條列、不要加前綴（例如：MSD整合：）。",
    "4) 結構建議：先同理客戶疑慮，再給整體判斷與理由，最後給下一步建議。",
    `題目：${question}`,
    "專家回覆：",
    ...suggestions.map((s) => `- ${s.expertName}(${s.expertCode})：${s.content}`),
  ].join("\n");

  const requestedModel = process.env.GEMINI_MODEL?.trim();
  const fallbackModels = await resolveCandidateModels(key, requestedModel);

  let json: unknown = {};
  let ok = false;
  let lastError = "LLM 呼叫失敗";
  for (const model of fallbackModels) {
    const call = await generateWithModel(key, model, prompt);
    const res = call.res;
    json = call.json;
    if (res.ok) {
      ok = true;
      break;
    }
    lastError = (json as { error?: { message?: string } }).error?.message ?? lastError;
  }
  if (!ok) {
    return NextResponse.json({ error: lastError }, { status: 500 });
  }

  const gemini = json as GeminiResponse;
  let integrated =
    gemini.candidates?.[0]?.content?.parts?.map((p) => String(p.text ?? "")).join("\n").trim() ?? "";
  if (!integrated) {
    return NextResponse.json({ error: "LLM 未回傳整合內容" }, { status: 500 });
  }

  // 若句尾被截斷，再補一次「完成版」以避免前端看到半句
  if (!looksCompleteSentence(integrated)) {
    let completed = integrated;
    for (const model of fallbackModels) {
      const completionPrompt = [
        "請把以下內容補成完整結尾的一段話，不要改變原意。",
        "只輸出完成版，不要加任何前綴說明。",
        "",
        completed,
      ].join("\n");
      const call = await generateWithModel(key, model, completionPrompt);
      if (!call.res.ok) continue;
      const completion = (call.json as GeminiResponse)?.candidates?.[0]?.content?.parts
        ?.map((p) => String(p.text ?? ""))
        .join("\n")
        .trim();
      if (completion) {
        completed = completion;
        if (looksCompleteSentence(completed)) break;
      }
    }
    integrated = completed;
  }

  return NextResponse.json({ integrated });
}

