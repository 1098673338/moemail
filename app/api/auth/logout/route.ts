import { NextResponse } from "next/server";
import { isSameOriginRequest, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { success: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(request, "", 0),
      },
    },
  );
}
