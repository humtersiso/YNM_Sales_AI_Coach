"use client";

import { useState } from "react";
import type { RoleplayMaterialItem } from "@/lib/roleplay/materials-types";

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-900">
      {label}
    </span>
  );
}

export function RoleplayMaterialCard({ item }: { item: RoleplayMaterialItem }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-emerald-700">
          {item.productLineLabel}
        </p>
        <CategoryBadge label={item.materialCategoryLabel} />
      </div>
      <p className="mt-2 text-[15px] font-medium leading-snug text-emerald-950">
        {item.question}
      </p>
      {item.script ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          {open ? "收合參考話術" : "查看參考話術"}
        </button>
      ) : null}
      {open && item.script ? (
        <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm leading-relaxed text-zinc-700 whitespace-pre-line">
          {item.script}
        </p>
      ) : null}
    </li>
  );
}
