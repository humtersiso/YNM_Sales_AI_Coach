"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/mobile/StatCard";
import { QueryLogCardList } from "@/components/mobile/QueryLogCard";
import type { QueryLog } from "@/lib/analytics/types";

const SALES_LOG_PAGE_SIZE = 10;

export default function AdminHomePage() {
  const [branch, setBranch] = useState("all");
  const [salesLogPage, setSalesLogPage] = useState(1);
  const [branches, setBranches] = useState<string[]>([]);
  const [salesLogs, setSalesLogs] = useState<QueryLog[]>([]);
  const [salesKpis, setSalesKpis] = useState({ activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
  const [loading, setLoading] = useState(false);

  const salesLogTotalPages = Math.max(1, Math.ceil(salesLogs.length / SALES_LOG_PAGE_SIZE));

  const pagedSalesLogs = useMemo(() => {
    const start = (salesLogPage - 1) * SALES_LOG_PAGE_SIZE;
    return salesLogs.slice(start, start + SALES_LOG_PAGE_SIZE);
  }, [salesLogs, salesLogPage]);

  useEffect(() => {
    setSalesLogPage(1);
  }, [salesLogs]);

  useEffect(() => {
    if (salesLogPage > salesLogTotalPages) {
      setSalesLogPage(salesLogTotalPages);
    }
  }, [salesLogPage, salesLogTotalPages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const q = new URLSearchParams({ branch, assistantType: "sales", section: "usage" });
      const res = await fetch(`/api/admin/analytics?${q}`);
      const data = await res.json();
      if (!cancelled) {
        setBranches(data.branches ?? []);
        setSalesLogs(data.logs ?? []);
        setSalesKpis(data.kpis ?? { activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">主頁儀表板</h1>
        <p className="mt-1 text-base text-emerald-700">銷售助手使用統計</p>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-white p-3">
        <label className="block text-xs text-emerald-800">
          據點
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-2 py-2 text-sm"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="all">全部</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        {loading ? <p className="mt-2 text-xs text-emerald-600">載入中…</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="活躍業代" value={salesKpis.activeAgents} compact />
        <StatCard label="提問次數" value={salesKpis.totalQuestions} hint="含題庫與新問題" compact />
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">銷售助手 · 問題紀錄</p>
          <p className="text-[11px] text-emerald-700">
            共 {salesLogs.length} 筆 · 含問題與回答 · 每頁 {SALES_LOG_PAGE_SIZE} 筆
          </p>
        </div>
        <QueryLogCardList logs={pagedSalesLogs} />
        {salesLogs.length > SALES_LOG_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100 px-3 py-2">
            <button
              type="button"
              disabled={salesLogPage <= 1}
              onClick={() => setSalesLogPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 disabled:opacity-40"
            >
              上一頁
            </button>
            <span className="text-xs text-emerald-700">
              第 {salesLogPage} / {salesLogTotalPages} 頁
            </span>
            <button
              type="button"
              disabled={salesLogPage >= salesLogTotalPages}
              onClick={() => setSalesLogPage((p) => Math.min(salesLogTotalPages, p + 1))}
              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
