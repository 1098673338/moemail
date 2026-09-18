import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  authorizeIcloudBridge,
  bridgeOptionsResponse,
  withBridgeCors,
} from "@/lib/icloud-bridge";
import { syncIcloudAccount } from "@/lib/icloud";

export const runtime = "nodejs";
export const maxDuration = 300;

export function OPTIONS() {
  return bridgeOptionsResponse();
}

function isSameOriginOrServerRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The dashboard remains a same-origin user action. Cross-origin extension
  // calls must authenticate with the existing EXTERNAL_MAIL_SECRET.
  if (!isSameOriginOrServerRequest(request)) {
    const unauthorized = authorizeIcloudBridge(request);
    if (unauthorized) return withBridgeCors(unauthorized);
  }
  try {
    const { id } = await params;
    const reconcile = new URL(request.url).searchParams.get("reconcile") === "1";
    return withBridgeCors(NextResponse.json({ success: true, ...(await syncIcloudAccount(id, { reconcile })) }));
  } catch (error) {
    return withBridgeCors(apiError(error, "同步 iCloud 失败"));
  }
}
