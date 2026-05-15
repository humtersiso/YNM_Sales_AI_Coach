"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";

export default function InboxPage() {
  const [error, setError] = useState("");
  const [incoming, setIncoming] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [check, setCheck] = useState<any>(null);
  const [importMessage, setImportMessage] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [checkFilter, setCheckFilter] = useState<"all" | "pending" | "duplicate">("all");

  async function loadQueue() {
    const res = await fetch("/api/workflow/incoming-queue");
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const visible = (json.items ?? []).filter((item: any) => item.status !== "discarded");
      setQueue(visible);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  async function uploadFile(file: File) {
    setError("");
    setQueueMessage("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/workflow/incoming", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "上傳失敗");
      return;
    }
    setIncoming(json);
    setQueueMessage(`已加入待處理清單：${file.name}`);
    await loadQueue();
  }

  async function selectQueue(id: string) {
    const res = await fetch("/api/workflow/incoming-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select", id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "切換失敗");
      return;
    }
    setIncoming(json.preview);
    await loadQueue();
  }

  async function removeQueue(id: string) {
    const res = await fetch("/api/workflow/incoming-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard", id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "刪除失敗");
      return;
    }
    await loadQueue();
  }

  async function runCheck() {
    const res = await fetch("/api/question-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "檢查失敗");
      return;
    }
    setCheck(json);
    setImportMessage("");
  }

  async function importToClarification() {
    const res = await fetch("/api/question-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "匯入失敗");
      return;
    }
    setImportMessage(`已匯入：待釐清 ${json.toClarifyCount ?? 0} 筆`);
  }

  const filteredRows = ((check?.rows ?? []) as any[]).filter((row) => {
    if (checkFilter === "pending") return !row.isDuplicate;
    if (checkFilter === "duplicate") return row.isDuplicate;
    return true;
  });

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-emerald-950">⤴ 匯入與檢查</h2>
        <p className="mt-1 text-sm text-emerald-800">先上傳檔案，再選擇當前處理項目，最後執行重複題比對。</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[3fr_4fr_3fr]">
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-[11px] font-semibold text-emerald-900">1) 上傳資料檔</p>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 text-center">
            <p className="text-[12px] font-medium text-emerald-900">點擊選擇 Excel 檔案</p>
            <p className="mt-1 text-xs text-emerald-700">支援 .xlsx / .xls / .csv</p>
            <input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }} />
          </label>
          <div className="mt-2 min-h-[18px] text-[11px] text-emerald-800">{queueMessage || " "}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold text-emerald-900">2) 匯入待處理清單</p>
          <ul className="space-y-1 text-xs">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 px-3 py-2">
                <span className="truncate">{item.fileName} / {item.status}</span>
                <div className="flex items-center gap-1">
                  <button className="shrink-0 rounded-lg bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-800" onClick={() => void selectQueue(item.id)}>設為目前匯入</button>
                  <button className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100" onClick={() => void removeQueue(item.id)}>刪除</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 text-center shadow-sm">
          <p className="mb-2 text-[11px] font-semibold text-emerald-900">3) 執行問題比對</p>
          <div className="flex min-h-[30px] flex-wrap items-center justify-center gap-2">
            <button className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-[11px] text-white hover:bg-sky-800" onClick={() => void runCheck()}>開始比對</button>
            <button
              className={`rounded-lg px-2.5 py-1.5 text-[11px] text-white ${check ? "bg-emerald-700 hover:bg-emerald-800" : "bg-zinc-300 cursor-not-allowed"}`}
              onClick={() => void importToClarification()}
              disabled={!check}
            >
              匯入至待釐清清單
            </button>
          </div>
          <p className="mt-3 min-h-[18px] text-[11px] text-emerald-900">
            {check ? `比對結果：重複 ${check.duplicateCount} 筆 / 待釐清 ${check.toClarifyCount} 筆` : "尚未執行比對"}
          </p>
          <p className="mt-1 min-h-[16px] text-xs text-emerald-800">{importMessage || " "}</p>
          <p className="mt-1 min-h-[16px] text-xs text-zinc-600">{incoming ? `目前來源：${incoming.workbookPath}` : " "}</p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-emerald-900">比對結果</p>
          {check ? (
            <div className="flex items-center gap-2 text-[11px]">
              <button className={`rounded border px-2 py-1 ${checkFilter === "all" ? "border-emerald-400 bg-emerald-100 text-emerald-900" : "border-emerald-200 bg-white text-emerald-800"}`} onClick={() => setCheckFilter("all")}>全部</button>
              <button className={`rounded border px-2 py-1 ${checkFilter === "pending" ? "border-amber-400 bg-amber-100 text-amber-900" : "border-emerald-200 bg-white text-emerald-800"}`} onClick={() => setCheckFilter("pending")}>待釐清</button>
              <button className={`rounded border px-2 py-1 ${checkFilter === "duplicate" ? "border-sky-400 bg-sky-100 text-sky-900" : "border-emerald-200 bg-white text-emerald-800"}`} onClick={() => setCheckFilter("duplicate")}>重複</button>
            </div>
          ) : null}
        </div>
        {check ? (
          <div className="overflow-auto rounded-lg border border-emerald-100">
            <table className="min-w-[900px] w-full table-fixed text-[11px]">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "40%" }} />
              </colgroup>
              <thead className="bg-emerald-50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">問題</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">判定</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">相似度</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">建議回覆</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-emerald-100">
                    <td className="px-2 py-1.5 align-top">{row.originalText}</td>
                    <td className="px-2 py-1.5 align-top">
                      {row.isDuplicate ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900">重複</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">待釐清</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">{row.duplicateScore ? `${Math.round(row.duplicateScore * 100)}%` : "-"}</td>
                    <td className="px-2 py-1.5 align-top text-zinc-700">{row.suggestedReply}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">尚未執行比對。</p>
        )}
      </div>
    </section>
  );
}

