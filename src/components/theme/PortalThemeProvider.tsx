"use client";

import { useLayoutEffect } from "react";
import { applyPortalThemeToDocument, readPortalTheme } from "@/lib/theme/portal-theme";

/** 避免 hydration 閃爍：client 掛載後同步 html data-portal-theme */
export function PortalThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    applyPortalThemeToDocument(readPortalTheme());
  }, []);

  return children;
}
