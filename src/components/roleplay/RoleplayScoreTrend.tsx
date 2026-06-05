"use client";

import type { RoleplayScoreTrendPoint } from "@/lib/roleplay/roleplay-types-api";

export function RoleplayScoreTrend({
  points,
  showTitle = true,
}: {
  points: RoleplayScoreTrendPoint[];
  showTitle?: boolean;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/60 p-4 text-center text-sm text-emerald-700">
        完成第一場對練後會顯示分數走勢
      </div>
    );
  }

  const w = 280;
  const h = 88;
  const padX = 8;
  const padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const maxScore = 100;
  const minScore = Math.min(...points.map((p) => p.score), maxScore - 20);
  const range = Math.max(maxScore - minScore, 20);

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.score - minScore) / range) * innerH;
    return { x, y, score: p.score };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div className="pt-1">
      {showTitle ? (
        <p className="mb-2 text-sm font-semibold text-emerald-950">近 {points.length} 場分數走勢</p>
      ) : null}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
        <line
          x1={padX}
          y1={padY + innerH}
          x2={w - padX}
          y2={padY + innerH}
          stroke="#d1fae5"
          strokeWidth={1}
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="#059669"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={3.5} fill="#059669" />
            <text
              x={c.x}
              y={c.y - 8}
              textAnchor="middle"
              className="fill-emerald-800 text-[9px] tabular-nums"
            >
              {c.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
