"use client";

import { useMemo, type CSSProperties } from "react";

const SAKURA_FLOWER_SRC = "/images/sakura-flower.png";

type PetalSpec = {
  id: number;
  left: string;
  size: number;
  delay: string;
  duration: string;
  drift: string;
  sway: string;
  spins: number;
  spinDir: 1 | -1;
  layer: "back" | "mid" | "front";
};

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPetals(count: number): PetalSpec[] {
  const rand = mulberry32(20260608);
  const layers: PetalSpec["layer"][] = ["back", "mid", "front", "mid", "front"];
  return Array.from({ length: count }, (_, i) => {
    const layer = layers[i % layers.length]!;
    const size =
      layer === "back" ? 12 + rand() * 6 : layer === "mid" ? 16 + rand() * 8 : 20 + rand() * 10;
    const duration =
      layer === "back"
        ? 8.5 + rand() * 3.5
        : layer === "mid"
          ? 6.5 + rand() * 2.5
          : 5 + rand() * 2;
    const wind = rand() > 0.35 ? 1 : -1;
    return {
      id: i,
      left: `${rand() * 100}%`,
      size,
      delay: `${(rand() * 5).toFixed(2)}s`,
      duration: `${duration.toFixed(2)}s`,
      drift: `${(wind * (22 + rand() * 38)).toFixed(0)}px`,
      sway: `${(10 + rand() * 16).toFixed(0)}px`,
      spins: 0.9 + rand() * 1.4,
      spinDir: rand() > 0.5 ? 1 : -1,
      layer,
    };
  });
}

export function SakuraHeaderFx({ dense = false }: { dense?: boolean }) {
  const petals = useMemo(() => buildPetals(dense ? 26 : 20), [dense]);
  const sparkles = useMemo(() => buildPetals(8), []);

  return (
    <div className="sakura-header-fx" aria-hidden>
      <div className="sakura-header-glow" />
      {sparkles.map((s, i) => (
        <span
          key={`spark-${s.id}`}
          className="sakura-sparkle"
          style={{
            left: s.left,
            animationDelay: s.delay,
            animationDuration: `${3 + i * 0.4}s`,
          }}
        />
      ))}
      {petals.map((p) => (
        <span
          key={p.id}
          className={`sakura-petal sakura-petal--${p.layer} ${p.spinDir < 0 ? "sakura-petal--ccw" : ""}`}
          style={
            {
              left: p.left,
              "--sakura-size": `${p.size}px`,
              "--sakura-delay": p.delay,
              "--sakura-duration": p.duration,
              "--sakura-drift": p.drift,
              "--sakura-sway": p.sway,
              "--sakura-spins": p.spins,
            } as CSSProperties
          }
        >
          <span className="sakura-petal-spin">
            <img
              src={SAKURA_FLOWER_SRC}
              alt=""
              width={p.size}
              height={p.size}
              className="sakura-petal-img"
              draggable={false}
            />
          </span>
        </span>
      ))}
    </div>
  );
}
