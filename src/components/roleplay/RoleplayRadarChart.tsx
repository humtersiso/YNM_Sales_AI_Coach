"use client";

import type { RoleplayDimensionScore } from "@/lib/roleplay/session-types";

const ORDER = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;
const LABELS: Record<string, string> = {
  empathy: "同理",
  structure: "完整",
  factCheck: "事實",
  strategy: "策略",
  advance: "成交",
};

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function viewBoxWidth(view: string): number {
  const parts = view.trim().split(/\s+/);
  const w = Number(parts[2]);
  return Number.isFinite(w) && w > 0 ? w : 240;
}

/** 目標螢幕字級 → SVG user unit（隨 viewBox 等比縮放後仍為指定 px） */
function screenPxToSvgFontSize(screenPx: number, view: string, chartSizePx: number): number {
  const vb = viewBoxWidth(view);
  return Math.round(screenPx * (vb / chartSizePx) * 10) / 10;
}

type Variant = "default" | "compact" | "overview" | "dense" | "mini";

const SIZES: Record<
  Variant,
  {
    cx: number;
    cy: number;
    maxR: number;
    labelR: number;
    /** 螢幕像素字級，不隨 SVG 縮放（圖表縮小時標籤仍清晰） */
    labelFontSizePx: string;
    labelFontSizeWithScorePx: string;
    view: string;
    height: string;
    maxW: string;
    levels: number[];
  }
> = {
  default: {
    cx: 120,
    cy: 120,
    maxR: 72,
    labelR: 26,
    labelFontSizePx: "14px",
    labelFontSizeWithScorePx: "12px",
    view: "0 0 240 240",
    height: "h-44",
    maxW: "max-w-[240px]",
    levels: [0.25, 0.5, 0.75, 1],
  },
  compact: {
    cx: 100,
    cy: 100,
    maxR: 58,
    labelR: 20,
    labelFontSizePx: "13px",
    labelFontSizeWithScorePx: "12px",
    view: "0 0 200 200",
    height: "h-32",
    maxW: "max-w-[200px]",
    levels: [0.25, 0.5, 0.75, 1],
  },
  overview: {
    cx: 110,
    cy: 110,
    maxR: 68,
    labelR: 26,
    labelFontSizePx: "13px",
    labelFontSizeWithScorePx: "12px",
    view: "0 0 220 220",
    height: "aspect-square w-full",
    maxW: "mx-auto max-w-[210px]",
    levels: [0.25, 0.5, 0.75, 1],
  },
  dense: {
    cx: 72,
    cy: 72,
    maxR: 44,
    labelR: 12,
    labelFontSizePx: "10px",
    labelFontSizeWithScorePx: "9px",
    view: "0 0 144 144",
    height: "h-[5.75rem]",
    maxW: "max-w-[148px]",
    levels: [0.5, 1],
  },
  mini: {
    cx: 70,
    cy: 70,
    maxR: 40,
    labelR: 12,
    labelFontSizePx: "10px",
    labelFontSizeWithScorePx: "9px",
    view: "0 0 140 140",
    height: "h-24",
    maxW: "max-w-[120px]",
    levels: [0.25, 0.5, 0.75, 1],
  },
};

export function RoleplayRadarChart({
  dimensions,
  variant = "default",
  title,
  highlightIds,
  embedded = false,
  showScores = false,
  chartSizePx,
  labelScreenPx = 15,
  labelScreenPxWithScore = 13,
}: {
  dimensions: RoleplayDimensionScore[];
  variant?: Variant;
  title?: string;
  /** 強調的維度（小結用） */
  highlightIds?: string[];
  /** 嵌入 KPI 卡片時不另包外框 */
  embedded?: boolean;
  /** 軸標籤附分數，如「同理 16」 */
  showScores?: boolean;
  /** 實際渲染邊長（px）；傳入後軸標籤依螢幕字級校正 */
  chartSizePx?: number;
  /** 軸標籤目標螢幕字級（px） */
  labelScreenPx?: number;
  labelScreenPxWithScore?: number;
}) {
  const sorted = ORDER.map((id) => dimensions.find((d) => d.dimensionId === id)).filter(
    Boolean,
  ) as RoleplayDimensionScore[];

  const sz = SIZES[variant];
  const cx = sz.cx;
  const cy = sz.cy;
  const maxR = sz.maxR;
  const levels = sz.levels;
  const highlight = new Set(highlightIds ?? []);

  const angles = sorted.map((_, i) => (360 / sorted.length) * i);
  const dataPoints = sorted.map((d, i) => {
    const ratio = Math.min(1, (d.score ?? 0) / (d.maxScore ?? 20));
    return polarToXY(cx, cy, maxR * ratio, angles[i]);
  });
  const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const resolvedLabelFontSize = chartSizePx
    ? screenPxToSvgFontSize(
        showScores ? labelScreenPxWithScore : labelScreenPx,
        sz.view,
        chartSizePx,
      )
    : null;

  const shell =
    variant === "mini" ? (
      <svg viewBox={sz.view} className={`mx-auto w-full max-w-[120px] ${sz.height}`}>
        {levels.map((lv) => {
          const pts = angles
            .map((a) => polarToXY(cx, cy, maxR * lv, a))
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
          return (
            <polygon key={lv} points={pts} fill="none" stroke="#d1fae5" strokeWidth={1} />
          );
        })}
        {sorted.map((d, i) => {
          const outer = polarToXY(cx, cy, maxR, angles[i]);
          const isHi = highlight.has(d.dimensionId);
          return (
            <g key={d.dimensionId}>
              <line
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke={isHi ? "#34d399" : "#a7f3d0"}
                strokeWidth={isHi ? 1.5 : 1}
              />
            </g>
          );
        })}
        <polygon
          points={polygon}
          fill="rgba(16, 185, 129, 0.3)"
          stroke="#059669"
          strokeWidth={1.5}
        />
      </svg>
    ) : (
      <svg viewBox={sz.view} className={`mx-auto w-full ${sz.maxW} ${sz.height}`}>
        {levels.map((lv) => {
          const pts = angles
            .map((a) => polarToXY(cx, cy, maxR * lv, a))
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
          return (
            <polygon key={lv} points={pts} fill="none" stroke="#d1fae5" strokeWidth={1} />
          );
        })}
        {sorted.map((d, i) => {
          const outer = polarToXY(cx, cy, maxR, angles[i]);
          const label = polarToXY(cx, cy, maxR + sz.labelR, angles[i]);
          return (
            <g key={d.dimensionId}>
              <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#a7f3d0" strokeWidth={1} />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#065f46"
                fontWeight={500}
                {...(resolvedLabelFontSize != null
                  ? { fontSize: resolvedLabelFontSize }
                  : {
                      style: {
                        fill: "#065f46",
                        fontWeight: 500,
                        fontSize: showScores
                          ? sz.labelFontSizeWithScorePx
                          : sz.labelFontSizePx,
                      },
                    })}
              >
                {showScores
                  ? `${LABELS[d.dimensionId] ?? d.label} ${d.score}`
                  : (LABELS[d.dimensionId] ?? d.label)}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygon}
          fill="rgba(16, 185, 129, 0.35)"
          stroke="#059669"
          strokeWidth={variant === "dense" ? 1.5 : variant === "overview" ? 2.5 : 2}
        />
      </svg>
    );

  if (variant === "mini" || embedded) return shell;

  return (
    <div
      className={
        variant === "compact" || variant === "dense" || variant === "overview"
          ? "rounded-xl border border-emerald-100 bg-white p-2 shadow-sm"
          : "rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
      }
    >
      {title ? (
        <p
          className={`text-center font-semibold text-emerald-950 ${
            variant === "dense" ? "mb-0.5 text-[10px]" : variant === "compact" ? "mb-1 text-xs" : "mb-2 text-sm"
          }`}
        >
          {title}
        </p>
      ) : null}
      {shell}
    </div>
  );
}
