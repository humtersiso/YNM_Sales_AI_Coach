"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/mobile/StatCard";
import {
  RoleplayAgentSummaryTable,
  RoleplaySessionCardList,
} from "@/components/mobile/RoleplaySessionCard";
import { AppIcon } from "@/components/icons/AppIcon";
import type {
  AgentNameOption,
  RoleplayAdminSession,
  RoleplayAgentSummary,
  RoleplayUsageKpis,
} from "@/lib/analytics/types";

const LOG_PAGE_SIZE = 10;

export default function AdminRoleplayUsagePage() {
  const [branch, setBranch] = useState("all");
  const [agentUserId, setAgentUserId] = useState("all");
  const [logPage, setLogPage] = useState(1);
  const [branches, setBranches] = useState<string[]>([]);
  const [agentNames, setAgentNames] = useState<AgentNameOption[]>([]);
  const [sessions, setSessions] = useState<RoleplayAdminSession[]>([]);
  const [summaries, setSummaries] = useState<RoleplayAgentSummary[]>([]);
  const [kpis, setKpis] = useState<RoleplayUsageKpis>({
    activeAgents: 0,
    completedSessions: 0,
    startedIncomplete: 0,
    avgScore: null,
  });
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(sessions.length / LOG_PAGE_SIZE));
  const pagedSessions = useMemo(() => {
    const start = (logPage - 1) * LOG_PAGE_SIZE;
    return sessions.slice(start, start + LOG_PAGE_SIZE);
  }, [sessions, logPage]);

  useEffect(() => {
    setLogPage(1);
  }, [sessions, branch, agentUserId]);

  useEffect(() => {
    if (logPage > totalPages) setLogPage(totalPages);
  }, [logPage, totalPages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const q = new URLSearchParams({
        branch,
        assistantType: "roleplay",
        section: "usage",
        agentUserId,
      });
      const res = await fetch(`/api/admin/analytics?${q}`);
      const data = await res.json();
      if (!cancelled) {
        setBranches(data.branches ?? []);
        setAgentNames(data.agentNames ?? []);
        setSessions(data.sessions ?? []);
        setSummaries(data.agentSummaries ?? []);
        setKpis(
          data.kpis ?? {
            activeAgents: 0,
            completedSessions: 0,
            startedIncomplete: 0,
            avgScore: null,
          },
        );
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
        <h1 className="text-2xl font-semibold text-emerald-950">對練助手使用統計</h1>
        <p className="mt-1 text-base text-emerald-700">業代平均分與對練歷程</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-100 bg-white p-3">
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
        <label className="block text-xs text-emerald-800">
          姓名
          <select
            className="mt-1 block w-full rounded-lg border border-emerald-200 px-2 py-2 text-sm"
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
        {loading ? <p className="text-xs text-emerald-600">載入中…</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="活躍業代" value={kpis.activeAgents} compact />
        <StatCard label="完賽場次" value={kpis.completedSessions} compact />
        <StatCard
          label="未完賽"
          value={kpis.startedIncomplete}
          hint="已開局未評分"
          compact
        />
        <StatCard
          label="平均分數"
          value={kpis.avgScore ?? "—"}
          hint="僅計完賽"
          compact
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">業代對練概況</p>
          <p className="text-[11px] text-emerald-700">完賽場次與平均分（可點列篩選）</p>
        </div>
        <RoleplayAgentSummaryTable
          summaries={summaries}
          selectedUserId={agentUserId}
          onSelect={setAgentUserId}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">對練歷程</p>
          <p className="text-[11px] text-emerald-700">
            共 {sessions.length} 筆 · 每頁 {LOG_PAGE_SIZE} 筆
          </p>
        </div>
        <RoleplaySessionCardList sessions={pagedSessions} />
        {sessions.length > LOG_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100 px-3 py-2">
            <button
              type="button"
              disabled={logPage <= 1}
              onClick={() => setLogPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 disabled:opacity-40"
            >
              上一頁
            </button>
            <span className="text-xs text-emerald-700">
              第 {logPage} / {totalPages} 頁
            </span>
            <button
              type="button"
              disabled={logPage >= totalPages}
              onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
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
