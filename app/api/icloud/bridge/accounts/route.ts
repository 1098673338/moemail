import { NextResponse } from "next/server";
import {
  authorizeIcloudBridge,
  bridgeOptionsResponse,
  withBridgeCors,
} from "@/lib/icloud-bridge";
import { listIcloudAccounts } from "@/lib/mail-store";

export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const unauthorized = authorizeIcloudBridge(request);
  if (unauthorized) return withBridgeCors(unauthorized);
  const accounts = (await listIcloudAccounts()).map((account) => ({
    id: account.id,
    emailAddress: account.emailAddress,
    aliasesLastSyncAt: account.aliasesLastSyncAt,
    aliasesActiveCount: account.aliasesActiveCount,
    aliasesInactiveCount: account.aliasesInactiveCount,
  }));
  return withBridgeCors(NextResponse.json({ accounts }));
}
