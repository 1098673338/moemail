import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth";
import { listMessages } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  const addressId = new URL(request.url).searchParams.get("addressId");
  return NextResponse.json({ messages: await listMessages(addressId) }, { headers: { "Cache-Control": "private, no-store" } });
}
