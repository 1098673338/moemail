import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { disconnectIcloudAccount, updateIcloudAppPassword } from "@/lib/icloud";
import { updateIcloudAppPasswordSchema } from "@/lib/validation";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = updateIcloudAppPasswordSchema.parse(await request.json());
    await updateIcloudAppPassword(id, input.appPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "更新 iCloud App 专用密码失败");
  }
}
