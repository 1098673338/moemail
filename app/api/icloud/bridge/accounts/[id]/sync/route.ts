import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { authorizeIcloudBridge, bridgeOptionsResponse, withBridgeCors } from "@/lib/icloud-bridge";
import { syncIcloudAccount } from "@/lib/icloud";

export const runtime = "nodejs";
export const maxDuration = 300;

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = authorizeIcloudBridge(request);
  if (unauthorized) return withBridgeCors(unauthorized);
  try {
    const { id } = await params;
    return withBridgeCors(NextResponse.json({ success: true, ...(await syncIcloudAccount(id)) }));
  } catch (error) {
    return withBridgeCors(apiError(error, "同步 iCloud 失败"));
  }
}
