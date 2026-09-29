import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { requireDashboardSession } from "@/lib/auth";
import { syncIcloudAccount } from "@/lib/icloud";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const reconcile = new URL(request.url).searchParams.get("reconcile") === "1";
    return NextResponse.json({ success: true, ...(await syncIcloudAccount(id, { reconcile })) });
  } catch (error) {
    return apiError(error, "同步 iCloud 失败");
  }
}
