"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type LegalChecklistItem = { id: string; label: string; checked: boolean };

type LegalReviewFile = {
  token: string;
  questionId: string;
  questionText: string;
  standardScript: string;
  checklist: LegalChecklistItem[];
  comments: string;
  createdAt: string;
  expiresAt: string;
};

export default function LegalReviewPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [data, setData] = useState<LegalReviewFile | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/legal-review/${encodeURIComponent(token)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "載入失敗");
      setData(null);
      return;
    }
    setData(json as LegalReviewFile);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [token, load]);

  async function save(patch: { checklist?: LegalChecklistItem[]; comments?: string }) {
    if (!token) return;
    setSaving(true);
    setSavedMsg("");
    const res = await fetch(`/api/legal-review/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "儲存失敗");
      return;
    }
    setData(json as LegalReviewFile);
    setSavedMsg("已儲存");
  }

  function toggleItem(id: string, checked: boolean) {
    if (!data) return;
    const checklist = data.checklist.map((c) => (c.id === id ? { ...c, checked } : c));
    setData({ ...data, checklist });
    void save({ checklist });
  }

  if (!token) {
    return <p className="p-6 text-zinc-600">連結無效。</p>;
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-red-800">無法開啟審查頁</h1>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!data) {
    return <p className="p-6 text-zinc-600">載入中…</p>;
  }

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-900">
      <h1 className="text-xl font-semibold text-emerald-900">法務審查</h1>
      <p className="mt-1 text-xs text-zinc-500">
        有效至 {new Date(data.expiresAt).toLocaleString("zh-TW")}（POC：token 連結，請勿轉發至未授權人員）
      </p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-zinc-700">客戶疑問</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">{data.questionText}</p>
      </section>

      <section className="mt-4 rounded-lg border border-sky-200 bg-sky-50/50 p-4">
        <h2 className="text-sm font-medium text-sky-900">標準話術（單段）</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-sky-950">{data.standardScript}</p>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-800">檢核清單</h2>
        <ul className="mt-3 space-y-2">
          {data.checklist.map((item) => (
            <li key={item.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={saving}
                onChange={(e) => toggleItem(item.id, e.target.checked)}
                className="mt-0.5"
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <label htmlFor="legal-comments" className="text-sm font-medium text-zinc-800">
          備註／修法建議
        </label>
        <textarea
          id="legal-comments"
          className="mt-2 w-full rounded border border-zinc-300 p-2 text-sm"
          rows={4}
          value={data.comments}
          disabled={saving}
          onChange={(e) => setData({ ...data, comments: e.target.value })}
          onBlur={() => void save({ comments: data.comments })}
        />
      </section>

      {savedMsg ? <p className="mt-3 text-sm text-emerald-700">{savedMsg}</p> : null}
      {error && data ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
