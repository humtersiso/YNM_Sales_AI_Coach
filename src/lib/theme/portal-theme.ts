/** 主題：nissan＝日產櫻花（預設）；default＝翠綠訓練平台（隱藏版） */
export type PortalTheme = "default" | "nissan";

export const PORTAL_THEME_STORAGE_KEY = "ynm-portal-theme";

/** 對外預設主題（櫻花／日產官網風） */
export const DEFAULT_PORTAL_THEME: PortalTheme = "nissan";

const VALID_THEMES: PortalTheme[] = ["default", "nissan"];

export function isPortalTheme(value: string | null | undefined): value is PortalTheme {
  return value != null && VALID_THEMES.includes(value as PortalTheme);
}

export function readPortalTheme(): PortalTheme {
  if (typeof window === "undefined") return DEFAULT_PORTAL_THEME;
  try {
    const raw = localStorage.getItem(PORTAL_THEME_STORAGE_KEY);
    if (raw === "default") return "default";
    return DEFAULT_PORTAL_THEME;
  } catch {
    return DEFAULT_PORTAL_THEME;
  }
}

export function writePortalTheme(theme: PortalTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PORTAL_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
  applyPortalThemeToDocument(theme);
}

export function applyPortalThemeToDocument(theme: PortalTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "default") {
    document.documentElement.dataset.portalTheme = "default";
  } else {
    delete document.documentElement.dataset.portalTheme;
  }
}

export function togglePortalTheme(): PortalTheme {
  const next: PortalTheme = readPortalTheme() === "default" ? DEFAULT_PORTAL_THEME : "default";
  writePortalTheme(next);
  return next;
}

export const EASTER_EGG_CLICKS = 5;
export const EASTER_EGG_WINDOW_MS = 2000;

export type EasterEggTapResult = "progress" | "toggled";

let tapCount = 0;
let lastTapAt = 0;

export function registerBrandEasterEggTap(): EasterEggTapResult {
  const now = Date.now();
  if (now - lastTapAt > EASTER_EGG_WINDOW_MS) {
    tapCount = 0;
  }
  lastTapAt = now;
  tapCount += 1;

  if (tapCount >= EASTER_EGG_CLICKS) {
    tapCount = 0;
    togglePortalTheme();
    return "toggled";
  }
  return "progress";
}
