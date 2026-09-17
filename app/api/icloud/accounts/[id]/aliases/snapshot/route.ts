import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  authorizeIcloudBridge,
  bridgeOptionsResponse,
  withBridgeCors,
} from "@/lib/icloud-bridge";
import { syncIcloudAliasSnapshot } from "@/lib/icloud";
import { icloudAliasSnapshotSchema } from "@/lib/validation";

export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = authorizeIcloudBridge(request);
  if (unauthorized) return withBridgeCors(unauthorized);
  try {
    const { id } = await params;
    const input = icloudAliasSnapshotSchema.parse(await request.json());
    const result = await syncIcloudAliasSnapshot(id, input.aliases, input.authoritative, input.scope);
    return withBridgeCors(NextResponse.json(result, { status: 201 }));
  } catch (error) {
    return withBridgeCors(apiError(error, "同步 iCloud+ 地址清单失败"));
  }
}
