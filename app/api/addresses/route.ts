import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth";
import { listAddresses } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "1";
  return NextResponse.json({ addresses: await listAddresses(includeDeleted) }, { headers: { "Cache-Control": "private, no-store" } });
}
