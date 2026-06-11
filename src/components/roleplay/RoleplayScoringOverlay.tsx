"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { title: "讀取對話紀錄", hint: "整理開場、各輪對話與收尾致謝" },
  { title: "AI 五維度評分", hint: "同理、論點、事實、策略、推進成交" },
  { title: "審查待加強說法", hint: "對照教材產出建議話術" },
  { title: "儲存場次紀錄", hint: "寫入成績與歷史（首頁小結背景更新）" },
] as const;

const STEP_MS = 2800;

export function RoleplayScoringOverlay({ active }: { active: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_MS);

    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const step = STEPS[stepIndex]!;
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roleplay-scoring-title"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/30" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-bold text-white">
              AI
            </span>
          </div>
          <div>
            <p id="roleplay-scoring-title" className="text-base font-semibold text-emerald-950">
              正在計算評分…
            </p>
            <p className="text-xs text-emerald-700">通常 10～20 秒，請稍候</p>
          </div>
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div
          key={step.title}
          className="mt-5 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-3 transition-all duration-500"
        >
          <p className="text-sm font-medium text-teal-900">{step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-teal-800">{step.hint}</p>
        </div>

        <ul className="mt-4 space-y-1.5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`flex items-center gap-2 text-xs transition-colors ${
                i === stepIndex ? "font-medium text-emerald-900" : "text-emerald-600/70"
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] transition-all ${
                  i < stepIndex
                    ? "bg-emerald-600 text-white"
                    : i === stepIndex
                      ? "border-2 border-emerald-500 bg-white text-emerald-700 ring-2 ring-emerald-200/80"
                      : "border border-emerald-200 bg-white"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              {s.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
