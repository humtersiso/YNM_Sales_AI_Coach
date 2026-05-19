export type SalesSession = {
  name: string;
  branch?: string;
  loggedInAt: string;
};

const KEY = "ynm_sales_session";

export function readSalesSession(): SalesSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SalesSession;
  } catch {
    return null;
  }
}

export function writeSalesSession(session: SalesSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSalesSession() {
  sessionStorage.removeItem(KEY);
}
