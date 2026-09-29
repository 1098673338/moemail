import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { connectIcloudAccount } from "@/lib/icloud";
import { listIcloudAccounts } from "@/lib/mail-store";
import { connectIcloudSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ accounts: await listIcloudAccounts() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const unauthorized = await requireDashboardSession(request);
  if (unauthorized) return unauthorized;
  try {
    const input = connectIcloudSchema.parse(await request.json());
    const id = await connectIcloudAccount(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error, "连接 iCloud 失败");
  }
}
