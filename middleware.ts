import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "ynm_session";

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/roleplay" || pathname.startsWith("/roleplay/")) {
    return true;
  }
  if (pathname.startsWith("/sales")) {
    return true;
  }
  if (pathname === "/login" || pathname === "/admin/login") {
    return true;
  }
  if (pathname.startsWith("/legal-review/")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/legal-review/")) {
    return true;
  }
  if (pathname.startsWith("/api/sales/")) {
    return true;
  }
  return false;
}

function requiresAdminSession(pathname: string) {
  if (pathname.startsWith("/api/admin")) return true;
  return pathname.startsWith("/admin") && pathname !== "/admin/login";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (!requiresAdminSession(pathname)) {
    return NextResponse.next();
  }
  const session = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
