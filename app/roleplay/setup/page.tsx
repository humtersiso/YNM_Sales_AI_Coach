"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { TenureYearsStepper } from "@/components/mobile/TenureYearsStepper";
import { RoleplayRagProductSheet } from "@/components/roleplay/RoleplayRagProductSheet";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoleplayAgeRange, RoleplayDrillDifficulty } from "@/lib/roleplay/scenario-contract";

type ConfigOptions = {
  products: { id: string; displayName: string }[];
  personas: { id: string; name: string; style: string; traits?: string[]; decisionMode?: string }[];
  ageRanges: { id: RoleplayAgeRange; label: string }[];
  competitors: string[];
  competitorsByProduct?: Record<string, string[]>;
  difficulties: { id: RoleplayDrillDifficulty; label: string; hint: string }[];
  maxTurns: { min: number; max: number; default: number };
};

function competitorsForProduct(opt: ConfigOptions | null, productLine: string): string[] {
  if (!opt) return [];
  const fromMap = opt.competitorsByProduct?.[productLine];
  if (Array.isArray(fromMap)) return fromMap;
  return [];
}

type SessionResult = {
  sessionId: string;
  customerMessage: string;
  maxTurns: number;
  turn: number;
  scenarioTitle?: string;
  agentSpeaksFirst?: boolean;
  coachMaterials?: {
    facts: { label: string; value: string }[];
    keyPoints: string[];
    forbidden: string[];
    sourceTitles?: string[];
    strategyIds?: string[];
  };
};

/** 人設確認彈窗 */
function PersonaConfirmModal({
  options,
  personaId,
  difficulty,
  competitor,
  productLine,
  maxTurns,
  ageRange,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  options: ConfigOptions;
  personaId: string;
  difficulty: RoleplayDrillDifficulty;
  competitor: string;
  productLine: string;
  maxTurns: number;
  ageRange: RoleplayAgeRange;
  pending: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const persona = options.personas.find((p) => p.id === personaId);
  const diff = options.difficulties.find((d) => d.id === difficulty);
  const product = options.products.find((p) => p.id === productLine);
  const age = options.ageRanges.find((a) => a.id === ageRange);

  const DIFFICULTY_COLOR: Record<string, string> = {
    beginner: "bg-emerald-50 text-emerald-800 border-emerald-200",
    advanced: "bg-amber-50 text-amber-800 border-amber-200",
    challenge: "bg-red-50 text-red-800 border-red-200",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-modal-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-emerald-100 bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 px-4 py-3">
          <h3 id="persona-modal-title" className="text-base font-semibold text-emerald-950">
            確認本場設定
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
            aria-label="取消"
          >
            <AppIcon name="x" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 情境摘要 */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-emerald-950">情境摘要</p>
            <p className="text-sm text-emerald-800">
              <span className="font-medium">{product?.displayName ?? productLine}</span>
              {" vs "}
              <span className="font-medium">{competitor}</span>
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLOR[difficulty] ?? DIFFICULTY_COLOR.advanced}`}>
                {diff?.label ?? difficulty} 難度
              </span>
              <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-xs text-emerald-800">
                {age?.label ?? ageRange}
              </span>
              <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-xs text-emerald-800">
                {maxTurns} 輪
              </span>
            </div>
          </div>

          {/* 客戶人設 */}
          {persona ? (
            <div className="rounded-xl border border-teal-100 bg-white px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-emerald-950">
                客戶人設：{persona.id} {persona.name}
              </p>
              <p className="text-sm text-emerald-700">{persona.style}</p>
              {persona.traits && persona.traits.length > 0 ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {persona.traits.map((t) => (
                    <li
                      key={t}
                      className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-800 border border-teal-100"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              ) : null}
              {persona.decisionMode ? (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-900">業代應對提示</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{persona.decisionMode}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{error}</p>
              {error.includes("銷售助手") ? (
                <Link href="/sales" className="mt-1 inline-block font-medium text-teal-700 underline">
                  前往銷售助手預習
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-emerald-100 px-4 py-4">
          {pending ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <svg className="h-5 w-5 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm text-teal-700">情境組合中，請稍候…</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className="w-full min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-[15px] font-medium text-white"
            >
              進場開始
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState("");
  const pendingSession = useRef<Promise<SessionResult | null>>(Promise.resolve(null));

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store", signal: ac.signal });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store", signal: ac.signal });
      if (!meRes.ok && !salesRes.ok) {
        if (!ac.signal.aborted) router.replace("/login");
        return;
      }
      const optRes = await fetch("/api/roleplay/config-options", { signal: ac.signal });
      if (ac.signal.aborted) return;
      if (!optRes.ok) {
        setError(
          optRes.status === 401
            ? "登入已過期，請重新登入"
            : "無法載入情境選項，請重新整理",
        );
        setReady(true);
        return;
      }
      const opt = (await optRes.json()) as ConfigOptions;
      if (ac.signal.aborted) return;
      setError("");
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

        const initialProduct =
          qpProduct && opt.products.some((p) => p.id === qpProduct)
            ? qpProduct
            : (opt.products[0]?.id ?? "xtrail-ice");
        const initialCompetitors = competitorsForProduct(opt, initialProduct);
        setProductLine(initialProduct);
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
          qpComp && initialCompetitors.includes(qpComp)
            ? qpComp
            : (initialCompetitors[0] ?? ""),
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
    })().catch((e: unknown) => {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort/i.test(msg)) return;
      setError("無法載入情境選項，請重新整理");
      setReady(true);
    });
    return () => ac.abort();
  }, [router, searchParams]);

  useEffect(() => {
    if (!options) return;
    const list = competitorsForProduct(options, productLine);
    if (list.length === 0) {
      if (competitor) setCompetitor("");
      return;
    }
    if (!list.includes(competitor)) {
      setCompetitor(list[0]!);
    }
  }, [productLine, options, competitor]);

  const competitorOptions = competitorsForProduct(options, productLine);

  const canStart =
    Boolean(options?.products?.length) &&
    Boolean(productLine?.trim()) &&
    competitorOptions.length > 0 &&
    Boolean(competitor?.trim()) &&
    competitorOptions.includes(competitor);

  async function fetchSession(): Promise<SessionResult | null> {
    const res = await fetch("/api/roleplay/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "custom",
        config: { productLine, personaId, ageRange, competitor, maxTurns, difficulty },
      }),
    });
    const data = (await res.json()) as SessionResult & { error?: string };
    if (!res.ok) {
      throw new Error(data.error?.trim() || "情境建立失敗，請稍後再試");
    }
    if (!data.sessionId || !data.customerMessage?.trim()) {
      throw new Error("情境建立失敗，請稍後再試");
    }
    return data;
  }

  function openModal() {
    if (!canStart) return;
    if (!competitor.trim()) { setError("請選擇競品"); return; }
    setError("");
    setModalError("");
    setModalPending(true);
    setModalOpen(true);

    // 背景 fetch，彈窗展示期間同步進行
    const p = fetchSession();
    pendingSession.current = p;
    p.then((result) => {
      if (!result) setModalError("情境建立失敗，請關閉後重試");
      setModalPending(false);
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "連線失敗，請關閉後重試";
      setModalError(msg);
      setModalPending(false);
      setError("");
    });
  }

  async function handleConfirm() {
    const data = await pendingSession.current;
    if (!data) {
      setModalError("情境建立失敗，請關閉後重試");
      return;
    }
    sessionStorage.setItem(
      `roleplay-boot-${data.sessionId}`,
      JSON.stringify({
        customerMessage: data.customerMessage,
        plannedCustomerOpening: data.customerMessage,
        maxTurns: data.maxTurns,
        turn: data.turn,
        scenarioTitle: data.scenarioTitle,
        agentSpeaksFirst: data.agentSpeaksFirst ?? true,
        coachMaterials: data.coachMaterials,
      }),
    );
    router.push(`/roleplay/practice?sessionId=${encodeURIComponent(data.sessionId)}`);
  }

  function handleCancel() {
    setModalOpen(false);
    setModalError("");
    setModalPending(false);
  }

  if (!ready) {
    return <p className="text-center text-sm text-emerald-600">載入中…</p>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm leading-relaxed text-emerald-900">
          <p>AI 將扮演客戶，依你設定的車型與競品進行多輪對話。</p>
          <p className="mt-2">
            建議先至{" "}
            <Link href="/sales" className="font-medium text-teal-700 underline">
              銷售助手
            </Link>{" "}
            查詢本場競品相關知識，再開始對練。演練中 AI 會模擬真實客戶提問；評分在背後依知識庫對照，練習畫面不顯示答案。
          </p>
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
            disabled={competitorOptions.length === 0}
          >
            {competitorOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {competitorOptions.length === 0 ? (
            <span className="mt-1 block text-xs text-amber-800">
              此車型尚無 RAG 對戰教材的競品，請先匯入語料或改選其他車型。
            </span>
          ) : (
            <span className="mt-1 block text-xs text-emerald-700">
              僅顯示知識庫已有對戰教材的競品
            </span>
          )}
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
          disabled={!canStart}
          onClick={openModal}
          className="w-full min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-[15px] font-medium text-white disabled:opacity-60"
        >
          開始演練
        </button>
      </div>

      {modalOpen && options ? (
        <PersonaConfirmModal
          options={options}
          personaId={personaId}
          difficulty={difficulty}
          competitor={competitor}
          productLine={productLine}
          maxTurns={maxTurns}
          ageRange={ageRange}
          pending={modalPending}
          error={modalError}
          onConfirm={() => void handleConfirm()}
          onCancel={handleCancel}
        />
      ) : null}

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
