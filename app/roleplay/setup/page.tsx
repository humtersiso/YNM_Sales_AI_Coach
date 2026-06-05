"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { TenureYearsStepper } from "@/components/mobile/TenureYearsStepper";
import { RoleplayRagProductSheet } from "@/components/roleplay/RoleplayRagProductSheet";
import type { RoleplayAgeRange, RoleplayDrillDifficulty } from "@/lib/roleplay/scenario-contract";

type ConfigOptions = {
  products: { id: string; displayName: string }[];
  personas: { id: string; name: string; style: string }[];
  ageRanges: { id: RoleplayAgeRange; label: string }[];
  competitors: string[];
  difficulties: { id: RoleplayDrillDifficulty; label: string; hint: string }[];
  maxTurns: { min: number; max: number; default: number };
};

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [options, setOptions] = useState<ConfigOptions | null>(null);
  const [ragOpen, setRagOpen] = useState(false);
  const [productLine, setProductLine] = useState("xtrail-ice");
  const [personaId, setPersonaId] = useState("P-01");
  const [ageRange, setAgeRange] = useState<RoleplayAgeRange>("30-40");
  const [competitor, setCompetitor] = useState("");
  const [maxTurns, setMaxTurns] = useState(5);
  const [difficulty, setDifficulty] = useState<RoleplayDrillDifficulty>("advanced");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (!meRes.ok && !salesRes.ok) {
        router.replace("/login");
        return;
      }
      const optRes = await fetch("/api/roleplay/config-options");
      if (!optRes.ok) {
        setError("無法載入情境選項，請重新整理");
        setReady(true);
        return;
      }
      const opt = (await optRes.json()) as ConfigOptions;
      if (!opt.products?.length) {
        setError("尚無 RAG 就緒車型，請確認語料設定或查看支援清單");
        setReady(true);
        return;
      }
      setOptions(opt);
      {
        const qpProduct = searchParams.get("productLine");
        const qpPersona = searchParams.get("personaId");
        const qpAge = searchParams.get("ageRange") as RoleplayAgeRange | null;
        const qpComp = searchParams.get("competitor");
        const qpDiff = searchParams.get("difficulty") as RoleplayDrillDifficulty | null;
        const qpTurns = searchParams.get("maxTurns");

        setProductLine(
          qpProduct && opt.products.some((p) => p.id === qpProduct)
            ? qpProduct
            : (opt.products[0]?.id ?? "xtrail-ice"),
        );
        setPersonaId(
          qpPersona && opt.personas.some((p) => p.id === qpPersona)
            ? qpPersona
            : (opt.personas[0]?.id ?? "P-01"),
        );
        setAgeRange(
          qpAge && opt.ageRanges.some((a) => a.id === qpAge)
            ? qpAge
            : "30-40",
        );
        setCompetitor(
          qpComp && opt.competitors.includes(qpComp)
            ? qpComp
            : (opt.competitors[0] ?? "Toyota RAV4"),
        );
        if (qpDiff && opt.difficulties.some((d) => d.id === qpDiff)) {
          setDifficulty(qpDiff);
        }
        if (qpTurns) {
          const n = Number(qpTurns);
          if (n >= opt.maxTurns.min && n <= opt.maxTurns.max) setMaxTurns(n);
        } else {
          setMaxTurns(opt.maxTurns.default);
        }
      }
      setReady(true);
    })();
  }, [router, searchParams]);

  const canStart =
    Boolean(options?.products?.length) &&
    Boolean(competitor?.trim()) &&
    Boolean(productLine?.trim());

  async function start() {
    if (busy || !canStart) return;
    if (!competitor.trim()) {
      setError("請選擇競品");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/roleplay/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          config: {
            productLine,
            personaId,
            ageRange,
            competitor,
            maxTurns,
            difficulty,
          },
        }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        customerMessage?: string;
        maxTurns?: number;
        turn?: number;
        scenarioTitle?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "無法開始對練");
        return;
      }
      const sid = data.sessionId ?? "";
      if (!sid || !data.customerMessage?.trim()) {
        setError("建立場次失敗，請稍後再試");
        return;
      }
      sessionStorage.setItem(
        `roleplay-boot-${sid}`,
        JSON.stringify({
          customerMessage: data.customerMessage,
          maxTurns: data.maxTurns,
          turn: data.turn,
          scenarioTitle: data.scenarioTitle,
        }),
      );
      router.push(`/roleplay/practice?sessionId=${encodeURIComponent(sid)}`);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-center text-sm text-emerald-600">載入中…</p>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm leading-relaxed text-emerald-900">
          <p>AI 將扮演客戶，依你設定的車型與難度進行多輪對話。</p>
          <p className="mt-2">完賽後取得五維評分（各 20 分）與改善建議；事實與話術由銷售知識庫 RAG 注入。</p>
          <button
            type="button"
            onClick={() => setRagOpen(true)}
            className="mt-2 text-sm font-medium text-teal-700 underline"
          >
            目標車型支援清單
          </button>
        </div>

        <label className="block text-sm font-medium text-emerald-950">
          目標車型
          <select
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
          >
            {(options?.products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-emerald-950">
          客戶類型
          <select
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
          >
            {(options?.personas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} {p.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-emerald-700">
            {(options?.personas ?? []).find((p) => p.id === personaId)?.style}
          </span>
        </label>

        <label className="block text-sm font-medium text-emerald-950">
          客戶年齡
          <select
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={ageRange}
            onChange={(e) => setAgeRange(e.target.value as RoleplayAgeRange)}
          >
            {(options?.ageRanges ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-emerald-950">
          競品
          <select
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
          >
            {(options?.competitors ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="block text-sm font-medium text-emerald-950">
          練習輪數
          <TenureYearsStepper
            value={maxTurns}
            onChange={setMaxTurns}
            min={options?.maxTurns.min ?? 3}
            max={options?.maxTurns.max ?? 10}
            suffix="輪"
            decrementAriaLabel="減少練習輪數"
            incrementAriaLabel="增加練習輪數"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-emerald-950">AI 難度</legend>
          <div className="mt-2 space-y-2">
            {(options?.difficulties ?? []).map((d) => (
              <label
                key={d.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                  difficulty === d.id
                    ? "border-teal-400 bg-teal-50"
                    : "border-emerald-100 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  checked={difficulty === d.id}
                  onChange={() => setDifficulty(d.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-emerald-950">{d.label}</span>
                  <span className="block text-xs text-emerald-700">{d.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          disabled={busy || !canStart}
          onClick={() => void start()}
          className="w-full min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {busy ? "準備情境中，約需 10–30 秒…" : "開始演練"}
        </button>
        {busy ? (
          <p className="text-center text-xs text-emerald-600">正在組合情境並取得客戶開場，請稍候</p>
        ) : null}
      </div>

      <RoleplayRagProductSheet open={ragOpen} onClose={() => setRagOpen(false)} />
    </>
  );
}

export default function RoleplaySetupPage() {
  return (
    <PortalLayout title="情境設定" subtitle="自訂情境後開始演練" backHref="/roleplay">
      <Suspense fallback={<p className="text-center text-sm text-emerald-600">載入中…</p>}>
        <SetupForm />
      </Suspense>
    </PortalLayout>
  );
}
