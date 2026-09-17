import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { deleteIcloudAddressAfterAppleDeactivation } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ address: await deleteIcloudAddressAfterAppleDeactivation(id) });
  } catch (error) {
    return apiError(error, "确认 Apple 邮箱停用失败");
  }
}
