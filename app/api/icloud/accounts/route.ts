import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { connectIcloudAccount } from "@/lib/icloud";
import { listIcloudAccounts } from "@/lib/mail-store";
import { connectIcloudSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ accounts: await listIcloudAccounts() });
}

export async function POST(request: Request) {
  try {
    const input = connectIcloudSchema.parse(await request.json());
    const id = await connectIcloudAccount(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error, "连接 iCloud 失败");
  }
}
