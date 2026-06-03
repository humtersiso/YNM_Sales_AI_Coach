import { getGeminiApiKey } from "@/lib/gemini/gemini-client";

const EMBEDDING_MODEL =
  (process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004").trim();

export type EmbeddingVector = number[];

/** Gemini embedContent（text-embedding-004） */
export async function embedText(text: string): Promise<EmbeddingVector | null> {
  const key = getGeminiApiKey();
  const trimmed = text.trim();
  if (!key || !trimmed) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(EMBEDDING_MODEL)}:embedContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: trimmed.slice(0, 2048) }] },
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    embedding?: { values?: number[] };
  };
  const values = json.embedding?.values;
  return values?.length ? values : null;
}

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
