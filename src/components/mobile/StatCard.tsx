export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-emerald-700">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-emerald-950">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-emerald-600">{hint}</p> : null}
    </div>
  );
}
