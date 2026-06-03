export type KnowledgeBackend = "rag" | "bq";

/** 知識檢索來源：rag = Vertex AI Search；bq = BigQuery v_sales_knowledge */
export function resolveKnowledgeBackend(): KnowledgeBackend {
  const raw = (process.env.SALES_KNOWLEDGE_BACKEND ?? "rag").trim().toLowerCase();
  if (raw === "bq" || raw === "bigquery") return "bq";
  return "rag";
}

export function isRagKnowledgeBackend(): boolean {
  return resolveKnowledgeBackend() === "rag";
}
