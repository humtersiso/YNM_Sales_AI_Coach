/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

type Expert = {
  id: string;
  code: string | null;
  name: string;
  email: string;
  groupName: string | null;
  isActive: boolean;
};

export default function ExpertsPage() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, { code: string; name: string; email: string }>>({});
  const [newExpert, setNewExpert] = useState({ code: "", name: "", email: "" });

  async function loadExperts() {
    setLoading(true);
    const res = await fetch("/api/experts");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "讀取專家名單失敗");
      setLoading(false);
      return;
    }
    setError("");
    const rows = data.experts ?? [];
    setExperts(rows);
    setDraftById(
      Object.fromEntries(
        rows.map((item: Expert) => [item.id, { code: item.code ?? "", name: item.name, email: item.email }]),
      ),
    );
    setLoading(false);
  }

  useEffect(() => {
    loadExperts();
  }, []);

  const total = experts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCount = useMemo(() => experts.filter((e) => e.isActive).length, [experts]);
  const inactiveCount = total - activeCount;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageExperts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return experts.slice(start, start + PAGE_SIZE);
  }, [experts, page]);

  const rangeLabel =
    total === 0 ? "0 筆" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} 筆`;

  async function toggleActive(id: string, isActive: boolean) {
    setSavingId(id);
    await fetch("/api/experts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    setSavingId(null);
    await loadExperts();
  }

  async function saveExpert(id: string) {
    const draft = draftById[id];
    if (!draft) return;
    setSavingId(id);
    const res = await fetch("/api/experts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, code: draft.code, name: draft.name, email: draft.email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "儲存失敗");
      setSavingId(null);
      return;
    }
    setError("");
    setSavingId(null);
    await loadExperts();
  }

  async function createOne() {
    setSavingId("new");
    const res = await fetch("/api/experts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newExpert),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "新增失敗");
      setSavingId(null);
      return;
    }
    setError("");
    setNewExpert({ code: "", name: "", email: "" });
    setSavingId(null);
    await loadExperts();
  }

  async function deleteOne(id: string) {
    setSavingId(id);
    const res = await fetch("/api/experts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "刪除失敗");
      setSavingId(null);
      return;
    }
    setError("");
    setSavingId(null);
    await loadExperts();
  }

  return (
    <main className="app-shell space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-emerald-900">專家名單</h1>
          <p className="mt-1 max-w-2xl text-sm text-emerald-800">
            可在本頁直接新增、編輯、刪除專家名單。
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-emerald-800">
            <li><strong>可編輯欄位</strong>：代號、姓名、Email。</li>
            <li><strong>要寫回 Excel</strong>：完成後請回首頁按步驟 5「儲存變更」。</li>
          </ul>
        </div>
        <Link href="/" className="shrink-0 text-sm text-emerald-700 underline">
          回主要資料
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">總計 {total} 筆</span>
        <span className="rounded-full border border-emerald-600/30 bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">啟用 {activeCount}</span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">停用 {inactiveCount}</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs text-emerald-800">每頁 {PAGE_SIZE} 筆 · 顯示 {rangeLabel}</span>
      </div>

      <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        {error ? <p className="border-b border-red-100 bg-red-50/80 px-4 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="grid grid-cols-1 gap-2 border-b border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-4">
          <input
            className="rounded border border-emerald-200 px-3 py-2 text-sm"
            placeholder="新代號"
            value={newExpert.code}
            onChange={(e) => setNewExpert((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
          />
          <input
            className="rounded border border-emerald-200 px-3 py-2 text-sm"
            placeholder="新姓名"
            value={newExpert.name}
            onChange={(e) => setNewExpert((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className="rounded border border-emerald-200 px-3 py-2 text-sm"
            placeholder="新Email"
            value={newExpert.email}
            onChange={(e) => setNewExpert((s) => ({ ...s, email: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => void createOne()}
            disabled={savingId === "new"}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            新增專家
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-emerald-100 bg-emerald-50/90 text-emerald-900">
              <tr>
                <th className="px-4 py-3 font-semibold">代號</th>
                <th className="px-4 py-3 font-semibold">姓名</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">狀態</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-emerald-700">
                    專家名單載入中...
                  </td>
                </tr>
              ) : pageExperts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-emerald-700">
                    尚無資料。請先在首頁流程步驟 2 載入待比對資料，或確認主庫內容。
                  </td>
                </tr>
              ) : (
                pageExperts.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-t border-emerald-100 ${idx % 2 === 1 ? "bg-emerald-50/35" : "bg-white"}`}
                  >
                    <td className="px-4 py-3 font-mono text-emerald-900">
                      <input
                        className="w-20 rounded border border-emerald-200 px-2 py-1"
                        value={draftById[item.id]?.code ?? ""}
                        onChange={(e) =>
                          setDraftById((s) => ({
                            ...s,
                            [item.id]: { ...(s[item.id] ?? { code: "", name: "", email: "" }), code: e.target.value.toUpperCase() },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-950">
                      <input
                        className="w-28 rounded border border-emerald-200 px-2 py-1"
                        value={draftById[item.id]?.name ?? ""}
                        onChange={(e) =>
                          setDraftById((s) => ({
                            ...s,
                            [item.id]: { ...(s[item.id] ?? { code: "", name: "", email: "" }), name: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-emerald-800">
                      <input
                        className="w-52 rounded border border-emerald-200 px-2 py-1"
                        value={draftById[item.id]?.email ?? ""}
                        onChange={(e) =>
                          setDraftById((s) => ({
                            ...s,
                            [item.id]: { ...(s[item.id] ?? { code: "", name: "", email: "" }), email: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void toggleActive(item.id, item.isActive)}
                        disabled={savingId === item.id}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition ${item.isActive ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-400 hover:bg-zinc-500"}`}
                      >
                        {item.isActive ? "啟用中" : "已停用"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void saveExpert(item.id)}
                          disabled={savingId === item.id}
                          className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-700 disabled:opacity-60"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteOne(item.id)}
                          disabled={savingId === item.id}
                          className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 bg-emerald-50/40 px-4 py-3">
            <p className="text-xs text-emerald-800">
              第 <span className="font-semibold text-emerald-950">{page}</span> / {totalPages} 頁
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-sm text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-emerald-50"
              >
                上一頁
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-sm text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-emerald-50"
              >
                下一頁
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
