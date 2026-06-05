"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/mobile/StatCard";
import { QueryLogCardList } from "@/components/mobile/QueryLogCard";
import { AppIcon } from "@/components/icons/AppIcon";
import type { AgentNameOption, QueryLog } from "@/lib/analytics/types";

const LOG_PAGE_SIZE = 10;

export default function AdminSalesUsagePage() {
  const [branch, setBranch] = useState("all");
  const [agentUserId, setAgentUserId] = useState("all");
  const [logPage, setLogPage] = useState(1);
  const [branches, setBranches] = useState<string[]>([]);
  const [agentNames, setAgentNames] = useState<AgentNameOption[]>([]);
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [kpis, setKpis] = useState({ activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(logs.length / LOG_PAGE_SIZE));
  const pagedLogs = useMemo(() => {
    const start = (logPage - 1) * LOG_PAGE_SIZE;
    return logs.slice(start, start + LOG_PAGE_SIZE);
  }, [logs, logPage]);

  useEffect(() => {
    setLogPage(1);
  }, [logs, branch, agentUserId]);

  useEffect(() => {
    if (logPage > totalPages) setLogPage(totalPages);
  }, [logPage, totalPages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const q = new URLSearchParams({
        branch,
        assistantType: "sales",
        section: "usage",
        agentUserId,
      });
      const res = await fetch(`/api/admin/analytics?${q}`);
      const data = await res.json();
      if (!cancelled) {
        setBranches(data.branches ?? []);
        setAgentNames(data.agentNames ?? []);
        setLogs(data.logs ?? []);
        setKpis(data.kpis ?? { activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [branch, agentUserId]);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/home"
        className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-900"
      >
        <AppIcon name="chevron-right" size={16} className="-rotate-180" />
        返回主頁
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">銷售助手使用統計</h1>
        <p className="mt-1 text-base text-emerald-700">提問紀錄與業代使用狀況</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-100 bg-white p-3">
        <label className="block text-sm text-emerald-800">
          據點
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-3 py-2.5 text-base"
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
        <label className="block text-sm text-emerald-800">
          姓名
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-3 py-2.5 text-base"
            value={agentUserId}
            onChange={(e) => setAgentUserId(e.target.value)}
          >
            <option value="all">全部</option>
            {agentNames.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.displayName}
                {a.branch ? ` · ${a.branch}` : ""}
              </option>
            ))}
          </select>
        </label>
        {loading ? <p className="text-sm text-emerald-600">載入中…</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="業代數量" value={kpis.activeAgents} compact />
        <StatCard label="提問次數" value={kpis.totalQuestions} hint="含題庫與新問題" compact />
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-800">銷售助手 · 問題紀錄</p>
          <p className="mt-0.5 text-sm text-emerald-700">
            共 {logs.length} 筆 · 每頁 {LOG_PAGE_SIZE} 筆
          </p>
        </div>
        <QueryLogCardList logs={pagedLogs} />
        {logs.length > LOG_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100 px-4 py-3">
            <button
              type="button"
              disabled={logPage <= 1}
              onClick={() => setLogPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-800 disabled:opacity-40"
            >
              上一頁
            </button>
            <span className="text-sm text-emerald-700">
              第 {logPage} / {totalPages} 頁
            </span>
            <button
              type="button"
              disabled={logPage >= totalPages}
              onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-800 disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
