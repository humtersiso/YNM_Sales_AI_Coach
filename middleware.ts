import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE_NAME = "ynm_session";
const SALES_SESSION_COOKIE_NAME = "ynm_sales_session";

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/roleplay" || pathname.startsWith("/roleplay/")) {
    return true;
  }
  if (pathname === "/sales/change-password") return true;
  if (pathname === "/login" || pathname === "/admin/login" || pathname === "/sales/login") {
    return true;
  }
  if (pathname.startsWith("/legal-review/")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/legal-review/")) {
    return true;
  }
  if (
    pathname.startsWith("/api/sales/auth/login") ||
    pathname.startsWith("/api/sales/auth/logout") ||
    pathname.startsWith("/api/sales/auth/me") ||
    pathname.startsWith("/api/sales/auth/change-password")
  ) {
    return true;
  }
  if (
    pathname.startsWith("/api/portal/auth/login") ||
    pathname.startsWith("/api/portal/auth/me") ||
    pathname.startsWith("/api/portal/auth/logout")
  ) {
    return true;
  }
  if (pathname === "/api/roleplay/materials") return true;
  if (pathname === "/api/roleplay/scenarios" || pathname.startsWith("/api/roleplay/scenarios/")) {
    return true;
  }
  return false;
}

function requiresRoleplaySession(pathname: string) {
  return pathname.startsWith("/api/roleplay/sessions");
}

function requiresAdminSession(pathname: string) {
  if (pathname.startsWith("/api/admin")) return true;
  return pathname.startsWith("/admin") && pathname !== "/admin/login";
}

function requiresSalesSession(pathname: string) {
  if (pathname.startsWith("/api/sales/")) return true;
  return pathname.startsWith("/sales") && pathname !== "/sales/login";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (requiresRoleplaySession(pathname)) {
    const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    const salesSession = req.cookies.get(SALES_SESSION_COOKIE_NAME)?.value;
    if (adminSession || salesSession) return NextResponse.next();
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  if (!requiresAdminSession(pathname)) {
    if (!requiresSalesSession(pathname)) {
      return NextResponse.next();
    }
    const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    if (adminSession) {
      return NextResponse.next();
    }
    const salesSession = req.cookies.get(SALES_SESSION_COOKIE_NAME)?.value;
    if (salesSession) {
      const parts = salesSession.split("|");
      const mustChangePassword = parts.length >= 8 && parts[5] === "1";
      const inChangePasswordPage = pathname === "/sales/change-password";
      const inChangePasswordApi = pathname.startsWith("/api/sales/auth/change-password");
      if (mustChangePassword && !inChangePasswordPage && !inChangePasswordApi) {
        if (pathname.startsWith("/api/sales/")) {
          return NextResponse.json({ error: "請先更新密碼" }, { status: 403 });
        }
        const forceChangeUrl = req.nextUrl.clone();
        forceChangeUrl.pathname = "/sales/change-password";
        forceChangeUrl.search = "";
        return NextResponse.redirect(forceChangeUrl);
      }
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/sales/")) {
      return NextResponse.json({ error: "未登入" }, { status: 401 });
    }
    const salesUrl = req.nextUrl.clone();
    salesUrl.pathname = "/login";
    salesUrl.search = "";
    return NextResponse.redirect(salesUrl);
  }
  const session = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
