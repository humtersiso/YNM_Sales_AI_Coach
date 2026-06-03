"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { RoleplayScoreCard } from "@/components/roleplay/RoleplayScoreCard";
import type { RoleplayScoreResult } from "@/lib/roleplay/session-types";

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [scoreResult, setScoreResult] = useState<RoleplayScoreResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError("缺少場次資訊");
      setLoading(false);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/roleplay/sessions/${encodeURIComponent(sessionId)}`);
      const data = (await res.json()) as {
        scenarioTitle?: string;
        scoreResult?: RoleplayScoreResult | null;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        setError(data.error ?? "無法載入結果");
        setLoading(false);
        return;
      }
      setScenarioTitle(data.scenarioTitle ?? "");
      setScoreResult(data.scoreResult ?? null);
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
          href="/roleplay/practice"
          className="block rounded-xl bg-emerald-700 py-3 text-center text-sm font-medium text-white"
        >
          返回對練
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RoleplayScoreCard scenarioTitle={scenarioTitle} scoreResult={scoreResult} />
      <Link
        href="/roleplay/practice"
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
    <PortalLayout title="對練結果" subtitle="評分與等級" backHref="/roleplay">
      <Suspense fallback={<p className="text-sm text-emerald-600">載入中…</p>}>
        <ResultContent />
      </Suspense>
    </PortalLayout>
  );
}
