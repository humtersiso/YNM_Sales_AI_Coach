"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/mobile/StatCard";
import type { AgentLeaderboardRow, CompetitorTopQuestion, QueryLog } from "@/lib/mock/usage-analytics";

type Tab = "usage" | "leaderboard" | "top10";

export default function AdminHomePage() {
  const [tab, setTab] = useState<Tab>("usage");
  const [branch, setBranch] = useState("all");
  const [assistantType, setAssistantType] = useState("all");
  const [branches, setBranches] = useState<string[]>([]);
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [kpis, setKpis] = useState({ activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
  const [leaderboard, setLeaderboard] = useState<AgentLeaderboardRow[]>([]);
  const [top10, setTop10] = useState<CompetitorTopQuestion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const maxComposite = useMemo(
    () => Math.max(...leaderboard.map((r) => r.compositeScore), 1),
    [leaderboard],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const q = new URLSearchParams({ branch, assistantType });
      if (tab === "usage") {
        const res = await fetch(`/api/admin/analytics?section=usage&${q}`);
        const data = await res.json();
        if (!cancelled) {
          setBranches(data.branches ?? []);
          setLogs(data.logs ?? []);
          setKpis(data.kpis ?? { activeAgents: 0, totalQuestions: 0, avgPerAgent: 0 });
        }
      } else if (tab === "leaderboard") {
        const res = await fetch(`/api/admin/analytics?section=leaderboard&branch=${branch}`);
        const data = await res.json();
        if (!cancelled) {
          setBranches(data.branches ?? []);
          setLeaderboard(data.rows ?? []);
        }
      } else {
        const res = await fetch(`/api/admin/analytics?section=top10&${q}`);
        const data = await res.json();
        if (!cancelled) setTop10(data.items ?? []);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, branch, assistantType]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "usage", label: "使用狀況" },
    { id: "leaderboard", label: "戰力排行" },
    { id: "top10", label: "競品 Top10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-emerald-950">主頁儀表板</h1>
        <p className="mt-1 text-sm text-emerald-700">使用統計 · 可篩選據點與助手類型</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === t.id ? "bg-emerald-700 text-white" : "border border-emerald-200 bg-white text-emerald-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-emerald-100 bg-white p-4">
        <label className="text-xs text-emerald-800">
          據點
          <select
            className="mt-1 block rounded border border-emerald-200 px-2 py-1.5 text-sm"
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
        {tab !== "leaderboard" ? (
          <label className="text-xs text-emerald-800">
            助手類型
            <select
              className="mt-1 block rounded border border-emerald-200 px-2 py-1.5 text-sm"
              value={assistantType}
              onChange={(e) => setAssistantType(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="sales">銷售助手</option>
              <option value="roleplay">對練助手</option>
            </select>
          </label>
        ) : null}
        {loading ? <span className="text-xs text-emerald-600">載入中…</span> : null}
      </div>

      {tab === "usage" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="活躍業代" value={kpis.activeAgents} />
            <StatCard label="提問次數" value={kpis.totalQuestions} />
            <StatCard label="人均提問" value={kpis.avgPerAgent} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="border-b border-emerald-100 bg-emerald-50/50 text-xs text-emerald-800">
                <tr>
                  <th className="px-3 py-2">時間</th>
                  <th className="px-3 py-2">據點</th>
                  <th className="px-3 py-2">業代</th>
                  <th className="px-3 py-2">問題</th>
                  <th className="px-3 py-2">回覆摘要</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-emerald-50 hover:bg-emerald-50/40"
                      onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {new Date(row.askedAt).toLocaleString("zh-TW")}
                      </td>
                      <td className="px-3 py-2">{row.branch}</td>
                      <td className="px-3 py-2">{row.agentName}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{row.question}</td>
                      <td className="px-3 py-2 max-w-[240px] truncate text-emerald-800">{row.replySummary}</td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className="bg-emerald-50/30">
                        <td colSpan={5} className="px-4 py-3 text-sm text-zinc-700">
                          <p className="font-medium text-emerald-900">完整回覆</p>
                          <p className="mt-1">{row.fullReply}</p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "leaderboard" ? (
        <div className="space-y-4">
          {leaderboard.map((row, i) => (
            <div
              key={row.id}
              className={`rounded-xl border bg-white p-4 ${
                i < 3 ? "border-emerald-300 shadow-sm" : "border-emerald-100"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-emerald-950">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}.`} {row.name}
                  <span className="ml-2 text-xs font-normal text-emerald-700">{row.branch}</span>
                </p>
                <span className="text-lg font-bold text-emerald-800">{row.compositeScore}</span>
              </div>
              <div className="bar-chart-row">
                <span>綜合</span>
                <div className="bar-chart-track">
                  <div className="bar-chart-fill" style={{ width: `${(row.compositeScore / maxComposite) * 100}%` }} />
                </div>
                <span>{row.compositeScore}</span>
              </div>
              <p className="mt-2 text-xs text-emerald-700">
                使用 {row.usageScore} · 業績 {row.performanceScore} · 年資 {row.tenureYears} 年
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "top10" ? (
        <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white">
          <table className="min-w-[560px] w-full text-left text-sm">
            <thead className="border-b border-emerald-100 bg-emerald-50/50 text-xs text-emerald-800">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">問題</th>
                <th className="px-3 py-2">次數</th>
                <th className="px-3 py-2">占比</th>
                <th className="px-3 py-2">最近</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((row, i) => (
                <tr key={row.question} className="border-b border-emerald-50">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{row.question}</td>
                  <td className="px-3 py-2">{row.count}</td>
                  <td className="px-3 py-2">{row.sharePct}%</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {new Date(row.lastAskedAt).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
