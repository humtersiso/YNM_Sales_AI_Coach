"use client";

export type KnowledgeScopeValue = {
  productLine: string;
};

type Props = {
  productLines: { id: string; displayName: string }[];
  value: KnowledgeScopeValue;
  onChange: (next: KnowledgeScopeValue) => void;
  disabled?: boolean;
};

export function KnowledgeScopeBar({ productLines, value, onChange, disabled }: Props) {
  if (productLines.length <= 1) {
    if (productLines.length === 1) {
      return (
        <div className="shrink-0 border-b border-emerald-100 bg-white/90 px-3 py-2.5">
          <p className="text-xs text-emerald-800">
            車款：<span className="font-semibold text-emerald-950">{productLines[0].displayName}</span>
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="shrink-0 border-b border-emerald-100 bg-white/90 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-emerald-900">車款</span>
        <select
          value={value.productLine}
          disabled={disabled}
          onChange={(e) => onChange({ productLine: e.target.value })}
          className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm text-emerald-950"
        >
          {productLines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
