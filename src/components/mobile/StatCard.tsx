export function StatCard({
  label,
  value,
  hint,
  compact,
}: {
  label: string;
  value: string | number;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center text-center shadow-sm ${
        compact
          ? "h-full min-h-[5.5rem] rounded-xl border border-emerald-100 bg-white px-3 py-3"
          : "rounded-2xl border border-emerald-100 bg-white px-4 py-3"
      }`}
    >
      <p className={`text-emerald-700 ${compact ? "text-sm" : "text-xs"}`}>{label}</p>
      <p
        className={`font-semibold text-emerald-950 ${
          compact ? "mt-1 text-3xl leading-none" : "mt-1 text-2xl"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className={`text-emerald-600 ${compact ? "mt-1 text-xs leading-tight" : "mt-1 text-[11px]"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
