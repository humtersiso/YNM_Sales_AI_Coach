"use client";

import { useCallback, useState } from "react";
import { readPortalTheme, registerBrandEasterEggTap } from "@/lib/theme/portal-theme";

export function BrandEasterEgg({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [toast, setToast] = useState("");

  const onClick = useCallback(() => {
    const result = registerBrandEasterEggTap();
    if (result === "toggled") {
      setToast(readPortalTheme() === "default" ? "已切換為經典綠色主題" : "已切換為櫻花主題");
      window.setTimeout(() => setToast(""), 1200);
    }
  }, []);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        className={`cursor-default select-none border-0 bg-transparent p-0 font-inherit tracking-wide ${className}`}
        aria-label="裕日汽車"
      >
        {children}
      </button>
      {toast ? (
        <span
          className="pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded-md bg-zinc-900/90 px-2 py-1 text-xs text-white shadow-sm"
          role="status"
        >
          {toast}
        </span>
      ) : null}
    </span>
  );
}
