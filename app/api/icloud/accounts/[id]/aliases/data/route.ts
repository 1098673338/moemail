import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { purgeIcloudAliasData } from "@/lib/icloud";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await purgeIcloudAliasData(id));
  } catch (error) {
    return apiError(error, "清空 iCloud 邮箱数据失败");
  }
}
