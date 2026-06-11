"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { RoleplayScoreCard } from "@/components/roleplay/RoleplayScoreCard";
import type { RoleplayScoreResult } from "@/lib/roleplay/session-types";

type AgentStats = {
  suggestions: { label: string; reason: string; personaId: string; difficulty: string; competitor: string }[];
};

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [scoreResult, setScoreResult] = useState<RoleplayScoreResult | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError("缺少場次資訊");
      setLoading(false);
      return;
    }

    const cacheKey = `roleplay-result-${sessionId}`;
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as {
          scenarioTitle?: string;
          scoreResult?: RoleplayScoreResult;
        };
        if (cached.scoreResult) {
          setScenarioTitle(cached.scenarioTitle ?? "");
          setScoreResult(cached.scoreResult);
          setLoading(false);
          sessionStorage.removeItem(cacheKey);
          void fetch("/api/roleplay/me/stats")
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => s && setStats(s as AgentStats));
          return;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    void (async () => {
      const [sessRes, statsRes] = await Promise.all([
        fetch(`/api/roleplay/sessions/${encodeURIComponent(sessionId)}`),
        fetch("/api/roleplay/me/stats"),
      ]);
      const data = (await sessRes.json()) as {
        scenarioTitle?: string;
        scoreResult?: RoleplayScoreResult | null;
        error?: string;
      };
      if (!sessRes.ok) {
        if (sessRes.status === 401) {
          router.replace("/login");
          return;
        }
        setError(data.error ?? "無法載入結果");
        setLoading(false);
        return;
      }
      setScenarioTitle(data.scenarioTitle ?? "");
      setScoreResult(data.scoreResult ?? null);
      if (statsRes.ok) {
        setStats((await statsRes.json()) as AgentStats);
      }
      setLoading(false);
    })();
  }, [sessionId, router]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-emerald-600">載入評分結果…</p>;
  }

  if (error || !scoreResult) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error || "尚無評分結果"}</p>
        <Link
          href="/roleplay/setup"
          className="block rounded-xl bg-emerald-700 py-3 text-center text-sm font-medium text-white"
        >
          返回情境設定
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-medium text-emerald-800">演練評分報告</p>
      <RoleplayScoreCard scenarioTitle={scenarioTitle} scoreResult={scoreResult} />

      {stats?.suggestions?.length ? (
        <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 text-sm">
          <p className="font-semibold text-emerald-950">建議下一步練習</p>
          <ul className="mt-2 space-y-2 text-emerald-800">
            {stats.suggestions.map((s) => (
              <li key={`${s.personaId}-${s.difficulty}-${s.competitor}`}>
                {s.label} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        href="/roleplay/setup"
        className="block rounded-xl bg-emerald-700 py-3 text-center text-sm font-medium text-white"
      >
        再練一次
      </Link>
      <Link
        href="/roleplay"
        className="block rounded-xl border border-emerald-200 py-3 text-center text-sm text-emerald-800"
      >
        返回對練助手
      </Link>
    </div>
  );
}

export default function RoleplayResultPage() {
  return (
    <PortalLayout title="對練結果" subtitle="評分與回饋" backHref="/roleplay">
      <Suspense fallback={<p className="text-sm text-emerald-600">載入中…</p>}>
        <ResultContent />
      </Suspense>
    </PortalLayout>
  );
}
