"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type {
  RoleplayMaterialsResponse,
  RoleplayProductSummary,
} from "@/lib/roleplay/materials-types";
import { RoleplayMaterialCard } from "@/components/roleplay/RoleplayMaterialCard";

const CATEGORY_OPTIONS: { id: MaterialCategory | ""; label: string }[] = [
  { id: "", label: "全部類別" },
  { id: "sales_script", label: "話術" },
  { id: "product_info", label: "本品資訊" },
  { id: "competitor_compare", label: "競品比較" },
];

export function RoleplayMaterialsBrowser() {
  const [productLine, setProductLine] = useState("");
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory | "">("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<RoleplayMaterialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams();
    if (productLine) q.set("productLine", productLine);
    if (materialCategory) q.set("materialCategory", materialCategory);
    try {
      const res = await fetch(`/api/roleplay/materials?${q}`);
      const json = (await res.json()) as RoleplayMaterialsResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "載入失敗");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("無法連線，請稍後再試");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [productLine, materialCategory]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const kw = search.trim().toLowerCase();
    if (!kw) return data.items;
    return data.items.filter(
      (item) =>
        item.question.toLowerCase().includes(kw) ||
        item.scriptPreview.toLowerCase().includes(kw),
    );
  }, [data?.items, search]);

  const activeSummary: RoleplayProductSummary | undefined = useMemo(() => {
    if (!data?.summaries?.length) return undefined;
    if (!productLine) {
      const total = data.summaries.reduce((n, s) => n + s.totalCount, 0);
      return { id: "all", displayName: "全部車款", totalCount: total, categories: [] };
    }
    return data.summaries.find((s) => s.id === productLine);
  }, [data?.summaries, productLine]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-white p-3 space-y-3">
        <label className="block text-sm text-emerald-900">
          車款
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-2 py-2.5 text-sm"
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
          >
            <option value="">全部車款</option>
            {(data?.productLines ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-emerald-900">
          素材類別
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-2 py-2.5 text-sm"
            value={materialCategory}
            onChange={(e) =>
              setMaterialCategory(e.target.value as MaterialCategory | "")
            }
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.id || "all"} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-emerald-900">
          搜尋關鍵字
          <input
            type="search"
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-3 py-2.5 text-sm"
            placeholder="客戶問題或話術關鍵字"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {activeSummary ? (
        <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-950">{activeSummary.displayName}</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            共 {data?.total ?? activeSummary.totalCount} 筆對練素材
            {search.trim() ? ` · 目前顯示 ${filteredItems.length} 筆` : null}
          </p>
          {activeSummary.categories.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeSummary.categories.map((c) => (
                <span
                  key={c.materialCategory}
                  className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-teal-900"
                >
                  {c.label} {c.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-emerald-600">載入素材中…</p>
      ) : error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-4 text-sm text-red-700">
          {error}
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-emerald-700">
          尚無符合條件的素材，請調整篩選或確認 BQ 已匯入話術資料。
        </p>
      ) : (
        <ul className="space-y-3">
          {filteredItems.map((item) => (
            <RoleplayMaterialCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
