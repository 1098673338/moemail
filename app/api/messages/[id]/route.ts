import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { setMessageRead } from "@/lib/mail-store";
import { deleteIcloudMessage } from "@/lib/icloud";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const isRead = typeof body === "object" && body !== null && "isRead" in body
      ? Boolean((body as { isRead: unknown }).isRead)
      : true;
    return NextResponse.json({ message: await setMessageRead(id, isRead) });
  } catch (error) {
    return apiError(error, "更新邮件失败");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteIcloudMessage(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "删除邮件失败");
  }
}
