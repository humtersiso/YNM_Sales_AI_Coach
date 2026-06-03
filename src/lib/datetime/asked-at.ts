/** BigQuery TIMESTAMP 常為 `{ value: string }`，不可直接用 String()。 */
export function bqTimestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "object") {
    const nested = (value as { value?: unknown }).value;
    if (nested !== undefined && nested !== value) {
      return bqTimestampToIso(nested);
    }
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  if (!s || s === "[object Object]") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatAskedAtZhTw(value: string): string {
  const iso = bqTimestampToIso(value);
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
