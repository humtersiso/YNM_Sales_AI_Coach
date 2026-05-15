"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";

export default function LegalPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  async function load() {
    const res = await fetch("/api/clarification");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "讀取失敗");
      return;
    }
    setData(json);
  }
  useEffect(() => {
    void load();
  }, []);

  const progressByQuestion = useMemo(() => {
    const rows = (data?.progress ?? []) as Array<{
      questionId: string;
      answeredCount: number;
      total: number;
      status: "none" | "partial" | "complete";
    }>;
    return new Map(rows.map((x) => [x.questionId, x]));
  }, [data]);

  const rows = useMemo(
    () =>
      (data?.questions ?? []).filter((q: any) => {
        const p = progressByQuestion.get(q.id);
        return p?.status === "complete";
      }),
    [data, progressByQuestion],
  );

  async function decide(questionId: string, decision: "approved" | "rejected") {
    await fetch("/api/legal/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, decision }),
    });
    await load();
  }

  async function createShare(questionId: string) {
    const res = await fetch("/api/legal-review/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "建立連結失敗");
      return;
    }
    setLink(`${window.location.origin}${(json as { urlPath?: string }).urlPath ?? ""}`);
  }

  async function saveWorkbook() {
    const res = await fetch("/api/excel/save", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "寫回失敗");
      return;
    }
    setError((json as { message?: string }).message ?? "已寫回");
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-emerald-950">⚖ 法務審核</h2>
          <p className="mt-1 text-sm text-emerald-800">僅顯示「已全回覆」題目，核准後才可寫回主庫。</p>
        </div>
        <button className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] text-white hover:bg-emerald-800" onClick={() => void saveWorkbook()}>
          寫回已核准題目
        </button>
      </div>
      {error ? <p className="text-sm text-emerald-800">{error}</p> : null}
      {link ? <p className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">法務連結：{link}</p> : null}
      <div className="rounded-xl border border-emerald-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-emerald-50/80">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold text-emerald-900">題目</th>
              <th className="px-3 py-1.5 text-left font-semibold text-emerald-900">審核狀態</th>
              <th className="px-3 py-1.5 text-left font-semibold text-emerald-900">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q: any) => (
              <tr key={q.id} className="border-t border-emerald-100">
                <td className="px-3 py-1.5">{q.originalText}</td>
                <td className="px-3 py-1.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">{q.legalStatus ?? "none"}</span>
                </td>
                <td className="px-3 py-1.5 space-x-2 whitespace-nowrap">
                  <button className="rounded-lg bg-sky-700 px-2 py-1 text-[11px] text-white hover:bg-sky-800" onClick={() => void createShare(q.id)}>複製連結</button>
                  <button className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-800" onClick={() => void decide(q.id, "approved")}>核准</button>
                  <button className="rounded-lg bg-red-700 px-2 py-1 text-[11px] text-white hover:bg-red-800" onClick={() => void decide(q.id, "rejected")}>退回</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

