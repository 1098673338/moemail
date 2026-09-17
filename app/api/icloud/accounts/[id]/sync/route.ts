import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { syncIcloudAccount } from "@/lib/icloud";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ success: true, ...(await syncIcloudAccount(id)) });
  } catch (error) {
    return apiError(error, "同步 iCloud 失败");
  }
}
