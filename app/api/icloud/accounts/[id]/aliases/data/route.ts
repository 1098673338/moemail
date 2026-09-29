import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { purgeIcloudAliasData } from "@/lib/icloud";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    return NextResponse.json(await purgeIcloudAliasData(id));
  } catch (error) {
    return apiError(error, "清空 iCloud 邮箱数据失败");
  }
}
