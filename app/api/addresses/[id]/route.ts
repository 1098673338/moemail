import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { updateAddress } from "@/lib/mail-store";
import { updateAddressSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = updateAddressSchema.parse(await request.json());
    return NextResponse.json({ address: await updateAddress(id, input) });
  } catch (error) {
    return apiError(error, "更新邮箱地址失败");
  }
}
