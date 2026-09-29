import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

function isSecretProtectedBridgePath(pathname: string) {
  return pathname === "/api/icloud/bridge/accounts"
    || /^\/api\/icloud\/accounts\/[^/]+\/aliases\/snapshot$/.test(pathname)
    || /^\/api\/icloud\/bridge\/accounts\/[^/]+\/sync$/.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    pathname === "/login"
    || pathname === "/api/auth/login"
    || pathname === "/api/auth/logout"
    || isSecretProtectedBridgePath(pathname)
  ) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "请先登录", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const next = `${pathname}${search}`;
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
