import { NextResponse } from "next/server";
import { createDashboardSession, isLoginSecretConfigured, isSameOriginRequest, sessionCookie, verifyLoginSecret } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!isLoginSecretConfigured()) {
    return NextResponse.json({ error: "服务尚未配置登录密钥" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "登录信息无效" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const password = typeof body === "object" && body !== null && "password" in body
    ? (body as { password: unknown }).password
    : null;
  if (typeof password !== "string" || !(await verifyLoginSecret(password))) {
    return NextResponse.json({ error: "登录密钥不正确" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const session = await createDashboardSession();
  return NextResponse.json(
    { success: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(request, session),
      },
    },
  );
}
