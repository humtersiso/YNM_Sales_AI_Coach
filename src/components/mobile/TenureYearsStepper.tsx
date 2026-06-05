"use client";

export function TenureYearsStepper({
  value,
  onChange,
  min = 0,
  max = 50,
  suffix = "年",
  decrementAriaLabel = "減少",
  incrementAriaLabel = "增加",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  decrementAriaLabel?: string;
  incrementAriaLabel?: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        aria-label={decrementAriaLabel}
        disabled={safe <= min}
        onClick={() => onChange(Math.max(min, safe - 1))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-lg font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
      >
        −
      </button>
      <span
        className="min-w-[3rem] flex-1 rounded-lg border border-emerald-100 bg-emerald-50/40 py-2 text-center text-base font-semibold tabular-nums text-emerald-950"
        aria-live="polite"
      >
        {safe}
      </span>
      <button
        type="button"
        aria-label={incrementAriaLabel}
        disabled={safe >= max}
        onClick={() => onChange(Math.min(max, safe + 1))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-lg font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
      >
        +
      </button>
      {suffix ? <span className="shrink-0 text-sm text-emerald-700">{suffix}</span> : null}
    </div>
  );
}
