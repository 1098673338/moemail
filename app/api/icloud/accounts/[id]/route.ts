import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { disconnectIcloudAccount } from "@/lib/icloud";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await disconnectIcloudAccount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "断开 iCloud 失败");
  }
}
