import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { deleteIcloudAddressAfterAppleDeactivation } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    return NextResponse.json({ address: await deleteIcloudAddressAfterAppleDeactivation(id) });
  } catch (error) {
    return apiError(error, "确认 Apple 邮箱停用失败");
  }
}
