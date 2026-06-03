"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleplayScenarioDetailView } from "@/lib/roleplay/scenario-contract";

export function RoleplayScenariosBrowser() {
  const [list, setList] = useState<
    { scenarioId: string; title: string; productDisplayName: string; competitor: string }[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<RoleplayScenarioDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/roleplay/scenarios");
        const data = (await res.json()) as {
          scenarios?: typeof list;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "載入失敗");
          return;
        }
        setList(data.scenarios ?? []);
        if (data.scenarios?.[0]) setSelectedId(data.scenarios[0].scenarioId);
      } catch {
        setError("無法載入情境");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    const res = await fetch(`/api/roleplay/scenarios/${encodeURIComponent(id)}`);
    const data = (await res.json()) as { scenario?: RoleplayScenarioDetailView; error?: string };
    if (res.ok && data.scenario) setDetail(data.scenario);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  if (loading) return <p className="py-6 text-center text-sm text-emerald-600">載入情境劇本…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <label className="block text-sm text-emerald-900">
        選擇情境
        <select
          className="mt-1 block w-full rounded-lg border border-emerald-200 px-2 py-2.5 text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {list.map((s) => (
            <option key={s.scenarioId} value={s.scenarioId}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      {detail ? (
        <div className="space-y-3 rounded-xl border border-teal-100 bg-white p-4 text-sm">
          <section>
            <p className="font-semibold text-emerald-950">A · 情境設定</p>
            <p className="mt-1 text-emerald-800">
              {detail.productDisplayName} vs {detail.competitor}
            </p>
            <p className="mt-1 text-zinc-700">{detail.coreIssue}</p>
          </section>
          <section>
            <p className="font-semibold text-emerald-950">B · 客戶開場</p>
            <p className="mt-1 text-zinc-700">{detail.sectionB.openingLine}</p>
            <p className="mt-1 text-xs text-emerald-600">
              內建追問 {detail.sectionB.followUpCount} 則
            </p>
          </section>
          <section>
            <p className="font-semibold text-emerald-950">C · 佐證資料</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
              {detail.sectionC.facts.map((f) => (
                <li key={f.label}>
                  <span className="font-medium">{f.label}：</span>
                  {f.value}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="font-semibold text-emerald-950">D · 策略方向</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
              {detail.sectionD.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">
              禁止說法 {detail.sectionD.forbiddenCount} 項（對練時由 AI 評分參考）
            </p>
          </section>
          <section>
            <p className="font-semibold text-emerald-950">E · 對練參數</p>
            <p className="mt-1 text-zinc-700">
              難度 {detail.difficulty} · 最多 {detail.maxTurns} 輪
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
