"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

export default function MainDataPage() {
  const [data, setData] = useState<{
    workbookPath: string;
    duplicateCount: number;
    pendingCount: number;
    expertCount: number;
    tagCount: number;
    rowsGR: Array<{ id: string; cols: Record<string, string> }>;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [showAllColumns, setShowAllColumns] = useState(false);

  async function load() {
    const res = await fetch("/api/workflow/main");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "讀取失敗");
      return;
    }
    setData(json);
  }

  async function importMainFile(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/workflow/main", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "匯入失敗");
      return;
    }
    setData(json as typeof data);
    setImportMessage(`已載入：${file.name}`);
    setPage(1);
  }

  useEffect(() => {
    void load();
  }, []);

  const headers = useMemo(() => Object.keys(data?.rowsGR?.[0]?.cols ?? {}), [data]);
  const visibleHeaders = useMemo(() => {
    if (!headers.length) return headers;
    if (!showAllColumns) {
      const base = headers.filter((h) => h === "客戶疑問" || h === "標準話術");
      return base.length ? base : headers;
    }
    return headers;
  }, [headers, showAllColumns]);
  const rows = useMemo(() => {
    const all = data?.rowsGR ?? [];
    const start = (page - 1) * PAGE_SIZE;
    return all.slice(start, start + PAGE_SIZE);
  }, [data, page]);
  const totalRows = data?.rowsGR?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-emerald-950">▦ 資料總覽</h2>
        <p className="mt-1 text-sm text-emerald-800">查看主庫檔案狀態與目前題庫內容。</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-zinc-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span>主庫路徑：{data?.workbookPath ?? "-"}</span>
            <span className="flex items-center text-[11px] text-emerald-900">
              題庫筆數：
              <span className="ml-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-950">
                {data?.duplicateCount ?? 0}
              </span>
            </span>
          </div>
          <label className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-100">
            選擇主檔
            <input
              className="hidden"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importMainFile(f);
              }}
            />
          </label>
        </div>
        {importMessage ? <p className="mt-1 text-[11px] text-emerald-800">{importMessage}</p> : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center justify-between text-[11px] text-zinc-700">
        <span>下方表格預設僅呈現「客戶疑問」與「標準話術」，其餘欄位可視需要展開。</span>
        <button
          type="button"
          onClick={() => setShowAllColumns((v) => !v)}
          className="rounded border border-emerald-200 bg-white px-2 py-1 hover:bg-emerald-50"
        >
          {showAllColumns ? "隱藏其他欄位" : "顯示全部欄位"}
        </button>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-xs">
          {!showAllColumns && visibleHeaders.length === 2 ? (
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "70%" }} />
            </colgroup>
          ) : null}
          <thead className="bg-emerald-50/80">
            <tr>{visibleHeaders.map((h) => (
              <th
                key={h}
                className={`px-3 py-1.5 text-left font-semibold ${
                  h === "客戶疑問"
                    ? "bg-orange-50 text-orange-900"
                    : h === "標準話術"
                      ? "bg-sky-50 text-sky-900"
                      : "text-emerald-900"
                }`}
              >
                {h}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-emerald-100 align-top">
                {visibleHeaders.map((h) => (
                  <td
                    key={`${row.id}-${h}`}
                    className={`px-3 py-1.5 align-top break-words ${
                      h === "客戶疑問"
                        ? "bg-orange-50/70 text-orange-950"
                        : h === "標準話術"
                          ? "bg-sky-50/70 text-sky-950"
                          : "text-zinc-800"
                    }`}
                  >
                    {row.cols[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px]">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border border-emerald-200 bg-white px-2 py-1 disabled:opacity-40"
        >
          上一頁
        </button>
        <span>{page} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="rounded border border-emerald-200 bg-white px-2 py-1 disabled:opacity-40"
        >
          下一頁
        </button>
      </div>
    </section>
  );
}

